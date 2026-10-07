"""Helpers for writing Amplience content type schemas in Python (import this from your own schemas.py).

    from schema_kit import *
    NS = "https://content.<yourco>.com/"
    S = {}
    S["hero-banner"] = base("hero-banner", "Hero banner", "A page hero", {
        "title": lstr("Title", maxLength=120),            # localizable string
        "image": link(["image"], "Image"),                # link to ONE item of these content types (names relative to NS)
        "cta": cta(),
    }, ["title", "image", "cta"], ["title"])
    SLOT_SCHEMAS = {"hero-slot"}                          # validation level SLOT (goes to the slots repository)
    LABELS = {sid: s["title"] for sid, s in S.items()}    # content type labels

Text fields are field-level localizable: {"_meta":{"schema":...localized-value}, "values":[{"locale","value"}]}.
"""
import json

NS = "https://content.example.com/"          # override in your schemas.py (the schema ids are NS + name)
CORE = "http://bigcontent.io/cms/schema/v1/core"
SCHEMA = "http://json-schema.org/draft-07/schema#"


def set_namespace(ns):
    global NS
    NS = ns


# ---------------------------------------------------------------- building blocks
def lstr(title, desc="", markdown=False, **c):
    """Localizable string (or markdown) property."""
    value = {"title": title, "type": "string", **c}
    if markdown:
        value["format"] = "markdown"
    return {
        "title": title,
        "description": desc,
        "allOf": [{"$ref": f"{CORE}#/definitions/localized-value"}],
        "properties": {"values": {"items": {"properties": {"value": value}}}},
    }


def link(types, title, desc=""):
    """Link to one content item of the given content types (schema ids relative to NS)."""
    return {
        "title": title,
        "description": desc,
        "allOf": [
            {"$ref": f"{CORE}#/definitions/content-link"},
            {"properties": {"contentType": {"enum": [NS + t for t in types]}}},
        ],
    }


def links(types, title, desc="", min_items=0, max_items=50):
    return {
        "title": title,
        "description": desc,
        "type": "array",
        "minItems": min_items,
        "maxItems": max_items,
        "items": link(types, title)["allOf"] and {"allOf": link(types, title)["allOf"]},
    }


def cta(title="Call to action"):
    return {
        "title": title,
        "type": "object",
        "properties": {
            "label": lstr("Label", maxLength=60),
            "href": {
                "title": "Link",
                "description": "Site path without language prefix (e.g. /guides) or a full https:// URL",
                "type": "string",
                "maxLength": 300,
            },
        },
        "propertyOrder": ["label", "href"],
    }


def meta_key(desc):
    return {
        "type": "object",
        "properties": {"deliveryKey": {"type": "string", "title": "Delivery key", "description": desc}},
    }


def base(sid, title, description, props, order, required=(), extra=None):
    body = {
        "$schema": SCHEMA,
        "$id": NS + sid,
        "title": title,
        "description": description,
        "allOf": [{"$ref": f"{CORE}#/definitions/content"}],
        "type": "object",
        "properties": props,
        "propertyOrder": order,
        "required": list(required),
    }
    body.update(extra or {})
    return body




def body(schemas, sid):
    return json.dumps(schemas[sid], indent=2, ensure_ascii=False)
