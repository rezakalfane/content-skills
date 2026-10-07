"""Amplience Management API + GraphQL asset API client (stdlib only) that finds every id by NAME.

Configuration comes from the environment or a gitignored ``.env.local`` in the current directory (or a parent):

    AMPLIENCE_PAT=...                       personal access token (never commit, never put it in Vercel)
    AMPLIENCE_HUB_NAME=commercedemo         the hub name (the <name> in <name>.cdn.content.amplience.net)
    AMPLIENCE_CONTENT_REPO=content          optional, default "content"
    AMPLIENCE_SLOTS_REPO=slots              optional, default "slots"
    AMPLIENCE_CONTENT_FOLDER=C/Commerce B2B optional: folder path (by names) that receives the items
    AMPLIENCE_ASSET_REPO=Assets             optional, default "Assets"
    AMPLIENCE_ASSET_FOLDER=C/Commerce B2B   optional: asset folder path for uploads

Other scripts do ``from amp import rest, gql, paged, HUB_ID, CONTENT_REPO, FOLDER, ASSET_REPO, ASSET_FOLDER ...``;
the ids are resolved lazily on first use and cached in ``.amplience-ids.json`` (delete it if the hub changes).
Run ``python3 amp.py`` to print what was resolved.
"""
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

CM = "https://api.amplience.net/v2/content"
GQL = "https://api.amplience.net/graphql"


def _env():
    env = dict(os.environ)
    here = Path.cwd()
    for d in [here, *here.parents]:
        p = d / ".env.local"
        if p.exists():
            for line in p.read_text().splitlines():
                if "=" in line and not line.lstrip().startswith("#"):
                    k, v = line.split("=", 1)
                    env.setdefault(k.strip(), v.split(" #")[0].strip().strip('"'))
            break
    return env


ENV = _env()
PAT = ENV.get("AMPLIENCE_PAT", "")


def call(method, url, body=None, headers=None, raw=None, retries=4):
    """HTTP call with the PAT as bearer token. Returns parsed JSON (None for empty bodies). Retries 429/5xx.

    Notes: PATCH/POST need a JSON body even when empty (send {}); the temporary upload URL must NOT get the bearer token."""
    h = {"Authorization": f"Bearer {PAT}", **(headers or {})}
    data = raw
    if body is not None:
        data = json.dumps(body).encode()
        h.setdefault("Content-Type", "application/json")
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                txt = r.read().decode()
                return json.loads(txt) if txt.strip() else None
        except urllib.error.HTTPError as e:
            txt = e.read().decode()
            if e.code in (429, 500, 502, 503) and attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
                continue
            raise RuntimeError(f"{method} {url} -> {e.code}: {txt[:1500]}") from None


def rest(method, path, body=None, **kw):
    return call(method, path if path.startswith("http") else f"{CM}{path}", body, **kw)


def gql(query, variables=None):
    res = call("POST", GQL, {"query": query, "variables": variables or {}})
    if res.get("errors"):
        raise RuntimeError(json.dumps(res["errors"])[:1500])
    return res["data"]


def paged(path, embedded_key, size=100):
    """Iterate all pages of a HAL collection."""
    page = 0
    while True:
        sep = "&" if "?" in path else "?"
        res = rest("GET", f"{path}{sep}page={page}&size={size}")
        yield from (res.get("_embedded") or {}).get(embedded_key, [])
        if page + 1 >= res["page"]["totalPages"]:
            return
        page += 1


# ---------------------------------------------------------------- discovery by name
_CACHE = Path.cwd() / ".amplience-ids.json"


def _folder_path(repo_id, path):
    """Management API folder id for a path like 'C/Commerce B2B' ('' = repository root, returns None)."""
    parts = [p for p in path.split("/") if p]
    parent = None
    for name in parts:
        url = f"/content-repositories/{repo_id}/folders" if parent is None else f"/folders/{parent}/folders"
        match = next((f for f in paged(url, "folders") if f["name"] == name), None)
        if not match:
            raise SystemExit(f"content folder '{name}' not found in path '{path}'")
        parent = match["id"]
    return parent


def _asset_ids(hub_id, repo_label, path):
    """GraphQL *global* ids (base64 'Type:uuid') of an asset repository and a folder path. The asset API wants these, not raw uuids."""
    q = """query($id: ID!){ mediaHub(id:$id){ assetRepositories(first:20){ edges{ node{ id label
      assetFolders(first:50){ edges{ node{ id label children{ id label children{ id label children{ id label }}}}}}}}}}}"""
    repos = [e["node"] for e in gql(q, {"id": hub_id})["mediaHub"]["assetRepositories"]["edges"]]
    repo = next((r for r in repos if r["label"] == repo_label), None)
    if not repo:
        raise SystemExit(f"asset repository '{repo_label}' not found; have {[r['label'] for r in repos]}")
    level = [e["node"] for e in repo["assetFolders"]["edges"]]
    folder = None
    for name in [p for p in path.split("/") if p]:
        folder = next((f for f in level if f["label"] == name), None)
        if not folder:
            raise SystemExit(f"asset folder '{name}' not found in path '{path}'")
        level = folder.get("children", [])
    return repo["id"], folder["id"] if folder else None


def resolve(refresh=False):
    if _CACHE.exists() and not refresh:
        return json.loads(_CACHE.read_text())
    if not PAT:
        raise SystemExit("AMPLIENCE_PAT is not set (put it in .env.local)")
    hub = next((h for h in paged("/hubs", "hubs") if h["name"] == ENV.get("AMPLIENCE_HUB_NAME")), None)
    if not hub:
        raise SystemExit("hub not found: set AMPLIENCE_HUB_NAME to the hub name")
    repos = {r["name"]: r for r in paged(f"/hubs/{hub['id']}/content-repositories", "content-repositories")}
    content = repos.get(ENV.get("AMPLIENCE_CONTENT_REPO", "content"))
    slots = repos.get(ENV.get("AMPLIENCE_SLOTS_REPO", "slots"))
    if not content:
        raise SystemExit(f"content repository not found; have {list(repos)}")
    ids = {
        "HUB_ID": hub["id"],
        "HUB_NAME": hub["name"],
        "VSE_HOST": hub["settings"]["virtualStagingEnvironment"]["hostname"],
        "LOCALES": hub["settings"].get("localization", {}).get("locales", []),
        "CONTENT_REPO": content["id"],
        "SLOTS_REPO": slots["id"] if slots else None,
        "FOLDER": _folder_path(content["id"], ENV.get("AMPLIENCE_CONTENT_FOLDER", "")),
    }
    ids["ASSET_REPO"], ids["ASSET_FOLDER"] = _asset_ids(hub["id"], ENV.get("AMPLIENCE_ASSET_REPO", "Assets"), ENV.get("AMPLIENCE_ASSET_FOLDER", ""))
    _CACHE.write_text(json.dumps(ids, indent=1))
    return ids


def __getattr__(name):  # PEP 562: ``from amp import HUB_ID`` resolves lazily
    ids = resolve()
    if name in ids:
        return ids[name]
    raise AttributeError(name)


if __name__ == "__main__":
    print(json.dumps(resolve(refresh=True), indent=1))
