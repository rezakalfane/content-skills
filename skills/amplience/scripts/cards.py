"""Register content type cards: the thumbnails shown for each content type in Dynamic Content's content browser. Idempotent.

    python3 cards.py [cards_config.py]     # the config does: from cards import card, titled_photo, gallery, loc ; CARDS = {...}

Amplience's built-in card templates (gallery, summary-photo, photo, text) read the item through the virtual staging
environment and take JSON pointers into the content tree. Pointers follow content links (`/image/image` goes through
the linked `image` item to its DAM image) and localized values (`/title/values/0/value` is the first locale).
"""
import importlib.util
import os
import sys
from pathlib import Path

from amp import HUB_ID, paged, rest

NS = os.environ.get("AMPLIENCE_SCHEMA_NS", "https://content.example.com/")

# `src` tells the template where to read the item: virtual staging, by content id, with linked content resolved.
SRC = ("%2F%2F{{vse.domain}}%2Fcms%2Fcontent%2Fquery%3FfullBodyObject%3Dtrue%26query%3D%257B%2522sys.iri%2522%253A%2522http%253A"
       "%252F%252Fcontent.cms.amplience.com%252F{{content.sys.id}}%2522%257D%26scope%3Dtree%26store%3Dstaging")
BASE = "https://bigcontent.io/cms/cards"


def card(kind, **params):
    return f"{BASE}/{kind}/index.html?" + "&".join(f"{k}={v}" for k, v in params.items()) + f"&src={SRC}"


def loc(path):
    """First (default) locale of a localized field."""
    return f"{path}/values/0/value"


def titled_photo(image="/image"):
    """Summary photo: the item's title under its (linked) image."""
    return card("summary-photo", headline=loc("/title"), image=f"{image}/image", imageAlt=loc(f"{image}/altText"))


def gallery(list_field, n=4, headline=None):
    """Gallery: the first images of a list of linked items."""
    params = {"headline": headline or loc("/title")}
    params.update({f"image{i}": f"/{list_field}/{i}/image/image" for i in range(n)})
    return card("gallery", **params)


# CARDS maps a content type name to a card URL built with card(...), titled_photo(...), gallery(...). Put yours in cards_config.py
# (see cards_config.example.py) next to where you run this.

def main():
    cfg = Path(sys.argv[1] if len(sys.argv) > 1 else "cards_config.py").resolve()
    spec = importlib.util.spec_from_file_location("cards_config", cfg)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    CARDS = mod.CARDS
    types = {t["contentTypeUri"]: t for t in paged(f"/hubs/{HUB_ID}/content-types", "content-types")}
    for name, uri in CARDS.items():
        ct = types.get(NS + name)
        if not ct:
            print("skip (no content type)", name)
            continue
        settings = {**ct["settings"], "cards": [{"templatedUri": uri}]}
        rest("PATCH", f"/content-types/{ct['id']}", {"settings": settings})
        print("card set on", name)


if __name__ == "__main__":
    main()
