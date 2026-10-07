"""Contentful Management API helper for the seeding scripts (stdlib only, secrets never printed).

Credentials come from ../../.env.local: CONTENTFUL_SPACE_ID, CONTENTFUL_ENVIRONMENT, CONTENTFUL_REGION (us|eu), CONTENTFUL_MANAGEMENT_TOKEN.
"""
import json
import mimetypes
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
IMG_DIR = os.environ.get("SEED_IMG_DIR", os.path.join(ROOT, ".seed-images"))
EN, FR = "en", "fr"

HOSTS = {"us": ("api.contentful.com", "upload.contentful.com"), "eu": ("api.eu.contentful.com", "upload.eu.contentful.com")}


def load_env():
    env = {}
    with open(os.path.join(ROOT, ".env.local")) as f:
        for line in f:
            m = re.match(r"^([A-Z0-9_]+)=([^#\s]*)", line.strip())
            if m:
                env[m.group(1)] = m.group(2).strip("\"'")
    return env


ENV = load_env()
SPACE = ENV["CONTENTFUL_SPACE_ID"]
ENVIRONMENT = ENV.get("CONTENTFUL_ENVIRONMENT") or "master"
API_HOST, UPLOAD_HOST = HOSTS[(ENV.get("CONTENTFUL_REGION") or "us").lower()]
TOKEN = ENV["CONTENTFUL_MANAGEMENT_TOKEN"]
SPACE_BASE = f"https://{API_HOST}/spaces/{SPACE}"
BASE = f"{SPACE_BASE}/environments/{ENVIRONMENT}"
CT = "application/vnd.contentful.management.v1+json"


def redact(text):
    for secret in (TOKEN, ENV.get("CONTENTFUL_DELIVERY_TOKEN"), ENV.get("CONTENTFUL_PREVIEW_TOKEN")):
        if secret:
            text = text.replace(secret, "***")
    return text


class NotFound(Exception):
    pass


def _request(method, url, data=None, headers=None, ok404=False):
    for attempt in range(8):
        req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                raw = resp.read()
                time.sleep(0.12)  # stay under the Management API rate limit
                return json.loads(raw) if raw and raw.strip()[:1] in (b"{", b"[") else {}
        except urllib.error.HTTPError as e:
            raw = e.read().decode(errors="replace")
            if e.code == 429 and attempt < 7:
                time.sleep(float(e.headers.get("X-Contentful-RateLimit-Reset") or 1) + attempt * 0.5)
                continue
            if e.code == 404 and ok404:
                raise NotFound(url)
            sys.exit(redact(f"{method} {url.replace(SPACE_BASE, '')} -> HTTP {e.code}: {raw[:1200]}"))
    sys.exit("retries exhausted")


def api(method, path, body=None, version=None, params=None, space_level=False, ok404=False):
    url = (SPACE_BASE if space_level else BASE) + path + ("?" + urllib.parse.urlencode(params) if params else "")
    headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": CT}
    if version is not None:
        headers["X-Contentful-Version"] = str(version)
    data = json.dumps(body).encode() if body is not None else None
    return _request(method, url, data, headers, ok404)


def get_or_none(path):
    try:
        return api("GET", path, ok404=True)
    except NotFound:
        return None


# ---------------------------------------------------------------- content types
def upsert_content_type(ct_id, name, fields, display_field, description=""):
    body = {"name": name, "description": description, "displayField": display_field, "fields": fields}
    existing = get_or_none(f"/content_types/{ct_id}")
    saved = api("PUT", f"/content_types/{ct_id}", body, version=existing["sys"]["version"] if existing else None)
    api("PUT", f"/content_types/{ct_id}/published", version=saved["sys"]["version"])


# ---------------------------------------------------------------- entries
def link(kind, id_):
    return {"sys": {"type": "Link", "linkType": kind, "id": id_}}


def loc(en, fr=None):
    """A localized field value. `fr=None` repeats the English value (untranslated, e.g. proper nouns)."""
    return {EN: en, FR: en if fr is None else fr}


def upsert_entry(entry_id, content_type, fields, publish=True):
    """Creates or updates the entry with this id and publishes it. Skips the write when nothing changed. Returns the entry."""
    existing = get_or_none(f"/entries/{entry_id}")
    if existing:
        sys_ = existing["sys"]
        if existing["fields"] == fields and sys_.get("publishedVersion") == sys_["version"] - 1:
            return existing
        saved = api("PUT", f"/entries/{entry_id}", {"fields": fields}, version=sys_["version"])
    else:
        saved = _create_entry(entry_id, content_type, fields)
    if publish:
        saved = api("PUT", f"/entries/{entry_id}/published", version=saved["sys"]["version"])
    return saved


def _create_entry(entry_id, content_type, fields):
    url = f"{BASE}/entries/{entry_id}"
    headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": CT, "X-Contentful-Content-Type": content_type}
    return _request("PUT", url, json.dumps({"fields": fields}).encode(), headers)


# ---------------------------------------------------------------- assets
def asset_id(path):
    return "img-" + re.sub(r"[^A-Za-z0-9_-]+", "-", os.path.splitext(os.path.basename(path))[0])[:58]


def upload_asset(path, title=""):
    """Uploads a local image (idempotent by file name) and returns a Link to the published asset."""
    aid, name = asset_id(path), os.path.basename(path)
    existing = get_or_none(f"/assets/{aid}")
    if existing and existing["sys"].get("publishedVersion"):
        return link("Asset", aid)
    if not existing:
        with open(path, "rb") as f:
            content = f.read()
        up = _request("POST", f"https://{UPLOAD_HOST}/spaces/{SPACE}/uploads", content,
                      {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/octet-stream"})
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        existing = _request("PUT", f"{BASE}/assets/{aid}", json.dumps({"fields": {
            "title": {EN: title or name},
            "file": {EN: {"contentType": ctype, "fileName": name, "uploadFrom": link("Upload", up["sys"]["id"])}}}}).encode(),
            {"Authorization": f"Bearer {TOKEN}", "Content-Type": CT})
    if "uploadFrom" in existing["fields"]["file"][EN]:
        api("PUT", f"/assets/{aid}/files/{EN}/process", version=existing["sys"]["version"])
        for _ in range(60):
            existing = api("GET", f"/assets/{aid}")
            if "url" in existing["fields"]["file"][EN]:
                break
            time.sleep(1)
        else:
            sys.exit(f"asset {aid} was not processed in time")
    api("PUT", f"/assets/{aid}/published", version=existing["sys"]["version"])
    return link("Asset", aid)


# ---------------------------------------------------------------- rich text
def _inline(text):
    out, pos = [], 0
    for m in re.finditer(r'<a href="([^"]+)">(.*?)</a>', text):
        if m.start() > pos:
            out.append(_text(text[pos:m.start()]))
        out.append({"nodeType": "hyperlink", "data": {"uri": m.group(1)}, "content": [_text(m.group(2))]})
        pos = m.end()
    if pos < len(text):
        out.append(_text(text[pos:]))
    return out


def _text(value):
    return {"nodeType": "text", "value": value, "marks": [], "data": {}}


def _para(text):
    return {"nodeType": "paragraph", "data": {}, "content": _inline(text)}


def richtext(spec):
    """Contentful rich text document from [("p", text) | ("h2", text) | ("ul", [items])]; text may contain <a href> links."""
    content = []
    for kind, val in spec:
        if kind == "p":
            content.append(_para(val))
        elif kind == "h2":
            content.append({"nodeType": "heading-2", "data": {}, "content": _inline(val)})
        elif kind == "ul":
            content.append({"nodeType": "unordered-list", "data": {}, "content": [
                {"nodeType": "list-item", "data": {}, "content": [_para(i)]} for i in val]})
    return {"nodeType": "document", "data": {}, "content": content}


def html_paragraphs(html):
    """Splits simple '<p>…</p><p>…</p>' HTML into rich text paragraphs."""
    return richtext([("p", p) for p in re.findall(r"<p>(.*?)</p>", html, flags=re.S)])


def slugify(s):
    s = s.lower().replace("&", "and")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")
