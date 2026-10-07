"""Skeleton for seeding a demo: upload images, create localized items leaves-first, publish. Copy and fill in your content.

    python3 seed_skeleton.py            # create/update everything and publish (idempotent: items by label, assets by name)
    python3 seed_skeleton.py --no-publish

Order matters: items that are linked must exist first (images -> authors -> components -> pages), and they are published in that
same order because production only shows linked items that are published.
"""
import json
import sys
from pathlib import Path

from assets import upload
from content import Items, L, clink, ilink

IMG = Path("images")                      # local files to upload
CACHE = Path(".assets-cache.json")        # name -> asset (skips re-uploads); delete to force
items = Items()
assets = json.loads(CACHE.read_text()) if CACHE.exists() else {}


def image(name, file, alt_en, alt_fr=None):
    """Upload a file as DAM asset `name` (the name becomes the URL slug) and create the `image` wrapper item. Returns the item id."""
    if name not in assets:
        a = upload(IMG / file, name)               # createOrUpdateAssetByName + publishAsset
        assets[name] = {"assetId": a["assetId"], "name": a["name"]}
        CACHE.write_text(json.dumps(assets, indent=1))
    return items.upsert("image", f"Image: {name}", {"image": ilink(assets[name]), "altText": L(alt_en, alt_fr or alt_en)})


def main():
    # img = image("demo-hero", "hero.jpg", "A hero", "Un héros")
    # hero = items.upsert("hero-banner", "Hero: home", {"title": L("Hello", "Bonjour"), "image": clink("image", img)})
    # items.upsert("page", "Page: home", {"_meta": {"deliveryKey": "home"}, "title": L("Home", "Accueil"),
    #                                     "components": [clink("hero-banner", hero)]})
    if "--no-publish" not in sys.argv:
        items.publish_all()


if __name__ == "__main__":
    main()
