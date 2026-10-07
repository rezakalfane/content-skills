#!/usr/bin/env python3
"""Configure Contentful's content preview (Settings > Content preview), idempotent: one preview platform per site origin,
with a URL template per content type. Usage: python3 scripts/seed/editor.py

The editor fills `{locale}` with the language being edited (`en` / `fr`), so French opens `/fr/...` natively (English `/en/...`
redirects to the clean URL). Entries without a page of their own point at the page that shows them. Every URL carries
`cf_preview=<CONTENTFUL_PREVIEW_SECRET>`: the storefront only serves drafts when it matches. The secret is read from .env.local
and never printed. Add the production and staging origins to ORIGINS once the sites exist.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import cf  # noqa: E402

ORIGINS = {
    "storefront-local": ("Local (npm run dev:https)", "https://localhost:3000"),
    **({"storefront-production": ("Production", os.environ["PREVIEW_PRODUCTION"])} if os.environ.get("PREVIEW_PRODUCTION") else {}),
    **({"storefront-staging": ("Staging", os.environ["PREVIEW_STAGING"])} if os.environ.get("PREVIEW_STAGING") else {}),
}

# content type -> path template (tokens are filled in by the editor)
PATHS = {
    "page": "/{locale}/{entry_field.slug}",
    "blogPost": "/{locale}/blog/{entry_field.slug}",
    "blogListingPage": "/{locale}/blog",
    "buyingGuide": "/{locale}/guides/{entry_field.slug}",
    "faq": "/{locale}/faq",
    "author": "/{locale}/blog",
    "productSpotlight": "/{locale}/home",
    "announcementBar": "/{locale}/home",
    "siteNavigation": "/{locale}/home",
    "heroBanner": "/{locale}/home",
    "featureBlock": "/{locale}/home",
}


def main():
    secret = cf.ENV.get("CONTENTFUL_PREVIEW_SECRET")
    if not secret:
        sys.exit("CONTENTFUL_PREVIEW_SECRET is missing from .env.local")
    for id_, (name, origin) in ORIGINS.items():
        body = {"name": name, "description": "Storefront preview (drafts via the Preview API)", "configurations": [
            {"contentType": ct, "enabled": True, "example": False, "url": f"{origin.rstrip('/')}{path}?cf_preview={secret}"} for ct, path in PATHS.items()]}
        try:
            current = cf._request("GET", f"{cf.SPACE_BASE}/preview_environments/{id_}", None, {"Authorization": f"Bearer {cf.TOKEN}"}, ok404=True)
        except cf.NotFound:
            current = None
        headers = {"Authorization": f"Bearer {cf.TOKEN}", "Content-Type": cf.CT}
        if current:
            headers["X-Contentful-Version"] = str(current["sys"]["version"])
        cf._request("PUT", f"{cf.SPACE_BASE}/preview_environments/{id_}", __import__("json").dumps(body).encode(), headers)
        print(f"  {'updated' if current else 'created'} preview platform: {name} ({origin})")


if __name__ == "__main__":
    main()
