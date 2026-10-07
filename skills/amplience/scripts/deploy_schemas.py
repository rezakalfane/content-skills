"""Create/update content type schemas, register content types and assign them to repositories. Idempotent.

    python3 deploy_schemas.py --schemas ./schemas.py [--only page,hero-banner]

Your schemas.py must define:  NS (schema id prefix), S (name -> JSON schema dict), SLOT_SCHEMAS (set of names that are slots),
LABELS (name -> content type label). See schema_kit.py for the helpers that make this short.

What it does per schema: POST (new) or PATCH with the current ``version`` (changed), then registers the content type if missing,
syncs it to the latest schema (PATCH .../schema with an EMPTY JSON BODY {}: no body at all returns 400) and assigns it to the content
repository (slot schemas to the slots repository). Re-run after every schema edit.
"""
import argparse
import importlib.util
import json
from pathlib import Path

from amp import CONTENT_REPO, HUB_ID, SLOTS_REPO, paged, rest

ICON = {"size": 256, "url": "https://bigcontent.io/cms/icons/ca-types-article-image.png"}


def load(path):
    spec = importlib.util.spec_from_file_location("project_schemas", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def norm(text):
    return text.replace(" ", "").replace("\n", "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--schemas", default="schemas.py")
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    m = load(Path(args.schemas).resolve())
    only = set(filter(None, args.only.split(",")))

    schemas = {s["schemaId"]: s for s in paged(f"/hubs/{HUB_ID}/content-type-schemas", "content-type-schemas")}
    types = {t["contentTypeUri"]: t for t in paged(f"/hubs/{HUB_ID}/content-types", "content-types")}
    for sid, schema in m.S.items():
        if only and sid not in only:
            continue
        uri = m.NS + sid
        level = "SLOT" if sid in m.SLOT_SCHEMAS else "CONTENT_TYPE"
        text = json.dumps(schema, indent=2, ensure_ascii=False)
        cur = schemas.get(uri)
        if cur is None:
            rest("POST", f"/hubs/{HUB_ID}/content-type-schemas", {"body": text, "schemaId": uri, "validationLevel": level})
            print("created schema", sid)
        elif norm(cur["body"]) != norm(text):
            cur = rest("PATCH", f"/content-type-schemas/{cur['id']}", {"body": text, "version": cur["version"], "validationLevel": level})
            print("updated schema", sid, "-> v", cur["version"])
        else:
            print("unchanged schema", sid)

        ct = types.get(uri)
        if ct is None:
            ct = rest("POST", f"/hubs/{HUB_ID}/content-types", {"contentTypeUri": uri, "settings": {"label": m.LABELS[sid], "icons": [ICON]}})
            print("  registered content type", sid)
        try:
            rest("PATCH", f"/content-types/{ct['id']}/schema", {})
        except RuntimeError as e:
            print("  (schema sync:", str(e)[:160], ")")
        repo = SLOTS_REPO if sid in m.SLOT_SCHEMAS else CONTENT_REPO
        try:
            rest("POST", f"/content-repositories/{repo}/content-types", {"contentTypeId": ct["id"]})
        except RuntimeError as e:
            if "already" not in str(e).lower() and "409" not in str(e):
                print("  assign:", str(e)[:200])


if __name__ == "__main__":
    main()
