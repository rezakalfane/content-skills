#!/usr/bin/env python3
"""Create/update the Contentful locales and content types (the content model). Idempotent.
Usage: python3 scripts/seed/schemas.py

Conventions: field-level localization (human-readable fields are `localized`), enums are Symbol fields with a validation list that
store English values, lists of strings are Array of Symbol, references to other entries are Link fields, and the reusable pieces
(hero banner, feature block, guide step, use case, nav link, footer column) are separate entries linked from their page.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import cf  # noqa: E402


# ------------------------------------------------------------ field builders
def _f(id_, name, type_, localized=False, required=False, **kw):
    return {"id": id_, "name": name, "type": type_, "localized": localized, "required": required, "disabled": False, "omitted": False, **kw}


def symbol(id_, name, t=True, required=False, **kw):
    return _f(id_, name, "Symbol", t, required, **kw)


def text(id_, name, t=True, required=False):
    return _f(id_, name, "Text", t, required)


def rich(id_, name, t=True, required=False):
    return _f(id_, name, "RichText", t, required, validations=[
        {"enabledMarks": ["bold", "italic"]},
        {"enabledNodeTypes": ["heading-2", "heading-3", "unordered-list", "ordered-list", "hyperlink"]}])


def integer(id_, name):
    return _f(id_, name, "Integer")


def boolean(id_, name):
    return _f(id_, name, "Boolean")


def date(id_, name):
    return _f(id_, name, "Date")


def slug(id_="slug"):
    return symbol(id_, "Slug", t=False, required=True, validations=[{"unique": True}, {"regexp": {"pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$"}}])


def image(id_, name, required=False):
    return _f(id_, name, "Link", False, required, linkType="Asset", validations=[{"linkMimetypeGroup": ["image"]}])


def enum(id_, name, choices):
    return symbol(id_, name, t=False, validations=[{"in": choices}])


def ref(id_, name, to, required=False):
    return _f(id_, name, "Link", False, required, linkType="Entry", validations=[{"linkContentType": [to]}])


def refs(id_, name, to):
    return _f(id_, name, "Array", False, False, items={"type": "Link", "linkType": "Entry", "validations": [{"linkContentType": [to]}]})


def symbols(id_, name, t=False):
    return _f(id_, name, "Array", t, False, items={"type": "Symbol", "validations": []})


def seo():
    return [symbol("seoTitle", "SEO title"), text("seoDescription", "SEO description")]


# ------------------------------------------------------------ content types
TOPICS = ["Ordering", "Pricing & Credit", "Delivery & Returns", "Account & Users", "Products & Fitment"]
AUDIENCES = ["Workshops", "Fleet managers", "Leisure & marine", "Everyone"]
BADGES = ["None", "Best seller", "Trade favourite", "New in", "Heavy duty"]

# id: (name, display field, fields)
TYPES = {
    # reusable pieces
    "heroBanner": ("Hero banner", "title", [
        symbol("title", "Title", required=True), text("description", "Description"), image("image", "Image"),
        symbol("ctaLabel", "CTA label"), symbol("ctaHref", "CTA path", t=False), boolean("fullWidth", "Full width")]),
    "featureBlock": ("Feature block", "title", [
        symbol("title", "Title", required=True), rich("copy", "Copy"), image("image", "Image"), enum("layout", "Layout", ["image_left", "image_right"])]),
    "guideStep": ("Guide step", "stepTitle", [
        symbol("stepTitle", "Step title", required=True), text("stepBody", "Step body", required=True), text("proTip", "Pro tip")]),
    "useCase": ("Use case", "useCase", [symbol("useCase", "Use case", required=True), text("description", "Description")]),
    "navLink": ("Navigation link", "label", [
        symbol("label", "Label", required=True), symbol("href", "Path", t=False, required=True), boolean("highlight", "Highlight")]),
    "footerColumn": ("Footer column", "heading", [symbol("heading", "Heading", required=True), refs("links", "Links", "navLink")]),
    # root types
    "page": ("Page", "title", [
        symbol("title", "Title", required=True), slug(), text("description", "Description"), ref("hero", "Hero", "heroBanner"), image("image", "Image"),
        rich("intro", "Intro"), refs("blocks", "Feature blocks", "featureBlock"), *seo()]),
    "blogListingPage": ("Blog listing page", "title", [
        symbol("title", "Title", required=True), ref("hero", "Hero", "heroBanner"),
        symbol("searchPlaceholder", "Search placeholder"), symbol("searchButtonLabel", "Search button label"),
        symbol("featuredTitle", "Featured title"), refs("featuredPosts", "Featured posts", "blogPost"), symbol("viewAllLabel", "View all label"),
        symbol("relatedTitle", "Related title"), refs("relatedPosts", "Related posts", "blogPost"), *seo()]),
    "author": ("Author", "name", [
        symbol("name", "Name", t=False, required=True), slug(), image("picture", "Picture", required=True), text("bio", "Bio")]),
    "blogPost": ("Blog post", "title", [
        symbol("title", "Title", required=True), slug(), ref("author", "Author", "author"), date("date", "Date"),
        image("featuredImage", "Featured image", required=True), rich("body", "Body"), ref("relatedPost", "Related post", "blogPost"),
        boolean("isArchived", "Archived"), *seo(), symbol("seoKeywords", "SEO keywords")]),
    "faq": ("FAQ", "question", [
        symbol("question", "Question", required=True), slug(), rich("answer", "Answer", required=True), enum("topic", "Topic", TOPICS),
        integer("sortOrder", "Sort order"), boolean("isFeatured", "Featured")]),
    "buyingGuide": ("Buying guide", "title", [
        symbol("title", "Title", required=True), slug(), text("summary", "Summary", required=True), image("heroImage", "Hero image"),
        enum("audience", "Audience", AUDIENCES), integer("readMinutes", "Read minutes"), refs("steps", "Steps", "guideStep"),
        symbols("checklist", "Checklist (one 'before you order' check per item)", t=True),
        symbols("recommendedBcProducts", "Recommended BigCommerce product IDs"), symbols("recommendedSkus", "Recommended SKUs"),
        refs("relatedFaqs", "Related FAQs", "faq"), ref("author", "Author", "author")]),
    "productSpotlight": ("Product spotlight", "title", [
        symbol("title", "Title", required=True), slug(), integer("bcProductId", "BigCommerce product ID"), symbol("bcSku", "BigCommerce SKU", t=False),
        symbol("tagline", "Tagline", required=True), rich("editorialSummary", "Editorial summary"),
        symbols("keyFeatures", "Key features", t=True), refs("useCases", "Use cases", "useCase"), symbols("pairsWellWithSkus", "Pairs well with (SKUs)"),
        enum("badge", "Badge", BADGES), image("editorialImage", "Editorial image"), boolean("isFeatured", "Featured")]),
    "announcementBar": ("Announcement bar", "title", [
        symbol("title", "Internal name", t=False, required=True), symbol("message", "Message", required=True),
        symbol("ctaLabel", "CTA label"), symbol("ctaHref", "CTA path", t=False),
        enum("style", "Style", ["info", "promo", "warning"]), enum("audience", "Audience", ["everyone", "logged_in", "guests"]),
        date("startsAt", "Starts at"), date("endsAt", "Ends at"), boolean("isActive", "Active")]),
    "siteNavigation": ("Site navigation", "title", [
        symbol("title", "Internal name", t=False, required=True), refs("headerLinks", "Header links", "navLink"),
        refs("footerColumns", "Footer columns", "footerColumn"), symbol("salesEmail", "Sales email", t=False),
        symbol("supportPhone", "Support phone", t=False), symbol("openingHours", "Opening hours"), symbol("legalText", "Legal text")]),
}


def locales():
    existing = {l["code"]: l for l in cf.api("GET", "/locales")["items"]}
    if cf.EN not in existing:
        old = next(l for l in existing.values() if l["default"])
        cf.api("PUT", f"/locales/{old['sys']['id']}", {"name": "English", "code": cf.EN, "fallbackCode": None, "optional": False,
                                                        "contentDeliveryApi": True, "contentManagementApi": True}, version=old["sys"]["version"])
        print(f"  default locale {old['code']} -> {cf.EN}")
    if cf.FR not in existing:
        cf.api("POST", "/locales", {"name": "French", "code": cf.FR, "fallbackCode": cf.EN, "optional": False,
                                    "contentDeliveryApi": True, "contentManagementApi": True})
        print(f"  added locale {cf.FR} (falls back to {cf.EN})")


def main():
    locales()
    for id_, (name, display, fields) in TYPES.items():
        cf.upsert_content_type(id_, name, fields, display)
        print(f"  content type {id_}")


if __name__ == "__main__":
    main()
