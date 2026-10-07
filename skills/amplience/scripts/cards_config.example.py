"""Example card mapping (from the Commerce B2B demo). Copy to cards_config.py and adapt."""
import sys
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__import__("cards").__file__)))
from cards import card, gallery, loc, titled_photo

CARDS = {
    # pages and page components
    "page": titled_photo(),
    "hero-banner": titled_photo(),
    "hero-slot": card("summary-photo", headline="/campaign", image="/slotContent/0/image/image", imageAlt=loc("/slotContent/0/image/altText")),
    "feature-block": titled_photo(),
    "category-tiles": card("text", headline=loc("/title")),
    "spotlight-row": gallery("spotlights", 3),
    "guide-row": gallery("guides", 3),
    "guide-listing": card("text", headline=loc("/title")),
    "post-grid": gallery("posts", 3),
    "post-listing": card("text", headline=loc("/title")),
    "faq-section": card("text", headline=loc("/faqs/0/question")),
    # content
    "blogpost": titled_photo(),
    "buying-guide": titled_photo(),
    "product-spotlight": titled_photo(),
    "author": card("summary-photo", headline="/name", image="/avatar/image", imageAlt=loc("/avatar/altText")),
    "faq": card("text", headline=loc("/question")),
    "announcement-bar": card("text", headline=loc("/message")),
    "site-navigation": card("text", headline=loc("/legalText")),
    # shared building blocks
    "image": card("photo", image="/image", imageAlt=loc("/altText")),
    "text": card("text", headline=loc("/text")),
    "video": card("text", headline=loc("/videotitle")),
}


