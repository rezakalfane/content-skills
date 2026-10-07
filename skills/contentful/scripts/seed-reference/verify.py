#!/usr/bin/env python3
"""Verify the seeded content through the Delivery (published) and Preview (draft) APIs, in English and French.
Usage: python3 scripts/seed/verify.py   (exit code 1 on any mismatch)
"""
import json
import os
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
import cf  # noqa: E402

EXPECTED = {"author": 6, "faq": 15, "blogPost": 36, "blogListingPage": 1, "buyingGuide": 6, "productSpotlight": 6, "announcementBar": 2,
            "siteNavigation": 1, "page": 3, "heroBanner": 4, "featureBlock": 3}
HOSTS = {"cda": "cdn", "cpa": "preview"}
TOKENS = {"cda": "CONTENTFUL_DELIVERY_TOKEN", "cpa": "CONTENTFUL_PREVIEW_TOKEN"}
failures = 0


def get(api, path, **params):
    host = HOSTS[api] + (".eu" if cf.API_HOST.startswith("api.eu") else "") + ".contentful.com"
    url = f"https://{host}/spaces/{cf.SPACE}/environments/{cf.ENVIRONMENT}{path}?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {cf.ENV[TOKENS[api]]}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def check(ok, msg):
    global failures
    print(("  ok   " if ok else "  FAIL ") + msg)
    failures += 0 if ok else 1


for api in ("cda", "cpa"):
    print(f"== {api}")
    for ct, n in EXPECTED.items():
        total = get(api, "/entries", content_type=ct, limit=1)["total"]
        check(total == n, f"{ct}: {total} (expected {n})")
    check(get(api, "/assets", limit=1)["total"] == 62, f"assets: {get(api, '/assets', limit=1)['total']} (expected 62)")
    locales = [l["code"] for l in get(api, "/locales")["items"]]
    check(locales == ["en", "fr"] or sorted(locales) == ["en", "fr"], f"locales {locales}")
    for lang in ("en", "fr"):
        post = get(api, "/entries", content_type="blogPost", locale=lang, include=2, limit=1, order="fields.slug")["items"][0]
        check(bool(post["fields"].get("title")) and bool(post["fields"].get("body")), f"[{lang}] post '{post['fields']['title'][:45]}'")
        home = get(api, "/entries", content_type="page", locale=lang, include=3, **{"fields.slug": "home"})
        f = home["items"][0]["fields"]
        check("includes" in home and f.get("blocks"), f"[{lang}] home: '{f['description'][:50]}'")
fr = get("cda", "/entries", content_type="blogPost", locale="fr", **{"fields.slug": "migrating-to-a-composable-storefront-step-by-step"})
en = get("cda", "/entries", content_type="blogPost", locale="en", **{"fields.slug": "migrating-to-a-composable-storefront-step-by-step"})
check(fr["items"][0]["fields"]["title"] != en["items"][0]["fields"]["title"], "French title differs from English")
sys.exit(1 if failures else 0)
