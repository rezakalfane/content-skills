"""Register Preview and Real-time preview visualizations on content types. Idempotent; keeps visualizations it did not create.

    python3 visualizations.py --types page,blogpost,hero-banner https://my-staging.vercel.app http://localhost:3000

Each site URL becomes two visualizations per type: "Preview – <host>" (saved content, from virtual staging) and
"Real-time preview – <host>" (&realtime=true: follows the unsaved form via dc-visualization-sdk). The page the URL points to is
``<site>/preview?id={{content.sys.id}}&vse={{vse.domain}}&locales={{locales}}`` (see references/preview.md for that route).
"""
import argparse
import os
from urllib.parse import urlparse

from amp import HUB_ID, paged, rest

NS = os.environ.get("AMPLIENCE_SCHEMA_NS", "https://content.example.com/")
MARK = " – "  # our labels look like "Preview – host"; used to recognise and replace them


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--types", required=True, help="comma separated content type names (relative to AMPLIENCE_SCHEMA_NS)")
    ap.add_argument("sites", nargs="+")
    a = ap.parse_args()
    sites = [s.rstrip("/") for s in a.sites]
    types = {t["contentTypeUri"]: t for t in paged(f"/hubs/{HUB_ID}/content-types", "content-types")}
    for name in a.types.split(","):
        ct = types.get(NS + name)
        if not ct:
            print("skip (no content type)", name)
            continue
        settings = ct["settings"]
        keep = [v for v in settings.get("visualizations", []) if MARK not in v["label"]]
        ours = []
        for site in sites:
            base = f"{site}/preview?id={{{{content.sys.id}}}}&vse={{{{vse.domain}}}}&locales={{{{locales}}}}"
            host = urlparse(site).netloc
            ours.append({"label": f"Preview{MARK}{host}", "templatedUri": base, "default": False})
            ours.append({"label": f"Real-time preview{MARK}{host}", "templatedUri": base + "&realtime=true", "default": False})
        viz = ours + keep
        for v in viz:
            v["default"] = False
        viz[0]["default"] = True
        rest("PATCH", f"/content-types/{ct['id']}", {"settings": {**settings, "visualizations": viz}})
        print("visualizations set on", name)


if __name__ == "__main__":
    main()
