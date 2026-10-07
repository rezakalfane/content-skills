#!/usr/bin/env python3
"""Is Bloomreach Autosuggest (v2) serving suggestions for OUR catalog yet? Read-only; prints a verdict.

    set -a; . .env.local; set +a; python3 scripts/suggest-check.py

On 7 Oct 2026 the staging dictionary still held the previous (tools) catalog and production returned nothing; re-run after Bloomreach
rebuilds the suggest index. When "ours" has hits the storefront type-ahead merges them with no code change.
"""
import json, os, string, urllib.parse, urllib.request

A, K, D = os.environ["BR_SEARCH_ACCOUNT_ID"], os.environ["BR_SEARCH_AUTH_KEY"], os.environ["BR_SEARCH_DOMAIN_KEY"]

def suggest(host, q, view="default"):
    p = {"account_id": A, "auth_key": K, "request_id": "7546919099987", "url": "www.example.com", "ref_url": "http://www.example.com/",
         "_br_uid_2": "uid=5917073780329:_uid=9737480431795:v=11.8:ts=1459840113832:hc=37", "request_type": "suggest",
         "catalog_views": f"{D}:{view}", "q": q}
    j = json.load(urllib.request.urlopen(f"https://{host}/api/v2/suggest/?" + urllib.parse.urlencode(p), timeout=20))
    return j["suggestionGroups"][0]

def counts(g):
    return [s["query"] for s in g.get("querySuggestions", [])], len(g.get("searchSuggestions", [])), len(g.get("attributeSuggestions", []))

STAGING, PROD = "staging-suggest.dxpapi.com", "suggest.dxpapi.com"
OLD = ["ham", "wren", "klein", "glov"]            # previous tools catalog
OURS = ["exi", "var", "agm", "char", "bat", "yua", "opt"]  # our batteries catalog
print("staging, old vocabulary :", {q: counts(suggest(STAGING, q))[0][:2] for q in OLD})
ours = {q: counts(suggest(STAGING, q)) for q in OURS}
print("staging, our vocabulary :", {q: v[0][:2] for q, v in ours.items()})
print("staging, products/attributes suggested:", {q: v[1:] for q, v in ours.items() if v[1] or v[2]} or "none")
letters = {c for c in string.ascii_lowercase if counts(suggest(PROD, c))[0]}
print("production, letters with suggestions:", sorted(letters) or "none")
hit = [q for q, v in ours.items() if v[0] or v[1] or v[2]]
print("\nVERDICT:", "our catalog IS in Autosuggest (" + ", ".join(hit) + ")" if hit else "Autosuggest still serves the old catalog (or nothing): ask Bloomreach to rebuild the suggest index for demo_glen staging.")
