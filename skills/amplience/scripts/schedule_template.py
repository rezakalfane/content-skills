"""Template: a campaign calendar on a slot, built from Events and Editions. Copy, edit the CONFIG block, run. Re-running replaces the event.

The pieces (all learned the hard way, see references/scheduling.md):
  * a SLOT item (schema validation level SLOT, in the slots repository) that your Page links to;
  * one hero (any content) per campaign, published normally;
  * an EVENT with consecutive EDITIONS; each edition holds the slot with `slotContent` = a locked SNAPSHOT of the hero;
  * `campaign` (a plain string on the slot schema) carries the edition's NAME into the delivered content, because the Delivery API
    never exposes edition names; the storefront shows it on the time travel timeline.

    python3 schedule_template.py
"""
import time

from amp import HUB_ID, SLOTS_REPO, CONTENT_REPO, paged, rest
from content import Items, NS, clink

# ----------------------------------------------------------------------------- CONFIG
EVENT = "Home hero: campaign calendar"
SLOT_LABEL = "Home hero slot"                       # label of the slot item in the slots repository
HERO_TYPE = "hero-banner"                           # content type of the slotted content (name relative to AMPLIENCE_SCHEMA_NS)
SLOT_TYPE = "hero-slot"
# (edition name, start, end, label of the hero item, campaign name). Consecutive: the slot must always hold exactly one hero.
EDITIONS = [
    ("Winter check", "2026-11-15T00:00:00.000Z", "2026-11-27T00:00:00.000Z", "Hero: winter", "Winter check"),
    ("Back to standard", "2026-11-27T00:00:00.000Z", "2027-12-31T00:00:00.000Z", "Hero: home", "Standard hero"),
]
# -----------------------------------------------------------------------------


def snapshot_link(label, item_id):
    """Edition slots link to a frozen SNAPSHOT of the item, not to the item: POST /hubs/{id}/snapshots with `contentRoot` (singular)
    and type USER. The link needs `_meta.rootContentItemId` (not rootContentItem) and `locked`."""
    snap = rest("POST", f"/hubs/{HUB_ID}/snapshots", {"name": label, "comment": "scheduled", "createdFrom": "content-item", "type": "USER", "contentRoot": item_id})
    link = clink(HERO_TYPE, snap["id"])
    link["_meta"]["rootContentItemId"] = item_id
    link["_meta"]["locked"] = True
    return link


def main():
    items = Items()
    slot = items.existing[(SLOTS_REPO, SLOT_LABEL)]
    heroes = {e[3]: items.existing[(CONTENT_REPO, e[3])]["id"] for e in EDITIONS}

    for ev in paged(f"/hubs/{HUB_ID}/events", "events"):
        if ev["name"] == EVENT:  # a scheduled event cannot be deleted: unschedule its editions first, then retry (it takes a moment)
            for ed in paged(f"/events/{ev['id']}/editions", "editions"):
                try:
                    rest("DELETE", f"/editions/{ed['id']}/schedule")
                except RuntimeError:
                    pass
            for attempt in range(6):
                try:
                    rest("DELETE", f"/events/{ev['id']}")
                    break
                except RuntimeError:
                    if attempt == 5:
                        raise
                    time.sleep(2)
    event = rest("POST", f"/hubs/{HUB_ID}/events", {"name": EVENT, "comment": "sample", "start": EDITIONS[0][1], "end": EDITIONS[-1][2]})
    for name, start, end, hero_label, campaign in EDITIONS:
        # editions need BOTH start and end
        ed = rest("POST", f"/events/{event['id']}/editions", {"name": name, "start": start, "end": end, "comment": f"Shows '{hero_label}'", "activeEndDate": False})
        rest("POST", f"/editions/{ed['id']}/slots", [{"slot": slot["id"]}])
        # the content endpoint wants the EDITION-slot id (from the list), not the slot's content item id
        edition_slot = next(iter(paged(f"/editions/{ed['id']}/slots", "edition-slots")))
        rest("PUT", f"/editions/{ed['id']}/slots/{edition_slot['id']}/content", {
            "label": SLOT_LABEL,
            "body": {"_meta": {"name": SLOT_LABEL, "schema": NS + SLOT_TYPE}, "campaign": campaign,
                     "slotContent": [snapshot_link(hero_label, heroes[hero_label])]},
        })
        ed = rest("GET", f"/editions/{ed['id']}")
        rest("POST", f"/editions/{ed['id']}/schedule", {"lastModifiedDate": ed["lastModifiedDate"]})
        print(f"scheduled '{name}': {start[:10]} -> {end[:10]}")


if __name__ == "__main__":
    main()
