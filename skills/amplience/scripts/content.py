"""Content item helpers: localized values, links, and an idempotent upsert + dependency-ordered publish.

    from content import L, clink, ilink, Items
    items = Items()                                           # reads the folder + slots repo once
    img_id = items.upsert("image", "Image: hero", {"image": ilink(asset), "altText": L("Alt", "Texte alt")})
    items.upsert("page", "Page: home", {"_meta": {"deliveryKey": "home"}, "title": L("Home", "Accueil"), ...})
    items.publish_all()                                       # publishes in creation order (leaves first)

Items are matched by label (unique per folder); every item needs _meta.name (set from the label) and, when addressed by URL,
_meta.deliveryKey. Create referenced items before the items that link to them.
"""
import os

from amp import CONTENT_REPO, FOLDER, HUB_NAME, SLOTS_REPO, paged, rest

NS = os.environ.get("AMPLIENCE_SCHEMA_NS", "https://content.example.com/")  # schema id prefix, same as your schemas.py
# ---------------------------------------------------------------- content items
LINK = "http://bigcontent.io/cms/schema/v1/core#/definitions/content-link"
IMAGE_LINK = "http://bigcontent.io/cms/schema/v1/core#/definitions/image-link"
EN, FR = "en-US", "fr-FR"  # change for your hub's locales


def L(en, fr=None):
    """Localized value: {'values': [{'locale', 'value'}]}."""
    vals = [{"locale": EN, "value": en}]
    if fr is not None:
        vals.append({"locale": FR, "value": fr})
    return {"_meta": {"schema": "http://bigcontent.io/cms/schema/v1/core#/definitions/localized-value"}, "values": vals}


def clink(ctype, item_id):
    return {"_meta": {"schema": LINK}, "contentType": NS + ctype, "id": item_id}


def ilink(asset):
    return {"_meta": {"schema": IMAGE_LINK}, "id": asset["assetId"], "name": asset["name"],
            "endpoint": HUB_NAME, "defaultHost": "cdn.media.amplience.net"}


class Items:
    """Upsert content items by label, remembering creation order for publishing."""

    def __init__(self):
        self.existing = {}
        for repo, folder in ((CONTENT_REPO, FOLDER), (SLOTS_REPO, None)):
            q = f"?folderId={folder}&status=ACTIVE" if folder else "?status=ACTIVE"
            for it in paged(f"/content-repositories/{repo}/content-items{q}", "content-items"):
                self.existing[(repo, it["label"])] = it
        self.order = []

    def upsert(self, ctype, label, body, repo=CONTENT_REPO):
        body = {"_meta": {"name": label, **body.pop("_meta", {}), "schema": NS + ctype}, **body}
        cur = self.existing.get((repo, label))
        if cur is None:
            payload = {"label": label, "body": body}
            if repo == CONTENT_REPO:
                payload["folderId"] = FOLDER
            cur = rest("POST", f"/content-repositories/{repo}/content-items", payload)
        else:
            cur = rest("PATCH", f"/content-items/{cur['id']}", {"label": label, "body": body, "version": cur["version"]})
        self.existing[(repo, label)] = cur
        if cur["id"] not in [i for i, _ in self.order]:
            self.order.append((cur["id"], label))
        return cur["id"]

    def publish_all(self):
        for iid, label in self.order:
            it = rest("GET", f"/content-items/{iid}")
            if it.get("lastPublishedVersion") == it["version"]:
                continue
            try:
                rest("POST", f"/content-items/{iid}/publish", {})
            except RuntimeError as e:
                print("  publish failed:", label, str(e)[:300])
