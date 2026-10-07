# Scheduling: slots, events, editions, snapshots

Template: `scripts/schedule_template.py` (edit the CONFIG block). Goal: change what a slot shows at given dates with no deploy.

## Model
Slot item (slots repository, schema level SLOT) → linked by the Page. **Event** → consecutive **Editions** (each needs `start` AND `end`) → each edition holds the slot with
`slotContent` = a **locked snapshot** of the content to show. Consecutive editions with no gap keep exactly one item live; after the last edition's end nothing reverts by itself.

## Calls
| Step | Call |
|---|---|
| event | `POST /hubs/{hub}/events {name, comment, start, end}` |
| edition | `POST /events/{ev}/editions {name, start, end, comment, activeEndDate:false}` |
| add the slot | `POST /editions/{ed}/slots [{"slot": <slot item id>}]` then list `/editions/{ed}/slots` for the **edition-slot id** |
| set its content | `PUT /editions/{ed}/slots/{editionSlotId}/content {label, body:{_meta:{name,schema}, slotContent:[link]}}` |
| snapshot | `POST /hubs/{hub}/snapshots {name, comment, createdFrom:"content-item", type:"USER", contentRoot:<item id>}` (`contentRoot` singular; type `USER`) |
| link in slotContent | content-link with `id: <snapshot id>`, `contentType`, `_meta.rootContentItemId: <item id>`, `_meta.locked: true` (plain item ids are rejected: "Invalid Snapshot Id") |
| schedule | `GET /editions/{ed}` then `POST /editions/{ed}/schedule {lastModifiedDate}` |
| undo | `DELETE /editions/{ed}/schedule`, then (after a few seconds) `DELETE /events/{ev}`; a scheduled event cannot be deleted |
Errors seen: `EDITION_SLOT_NOT_FOUND` (used the slot id instead of the edition-slot id), `EDITION_SLOT_LIVE_LINK_MISSING_PROPERTIES` (wrong `rootContentItem*` name),
`EVENT_UNABLE_TO_DELETE` (still scheduled / not yet propagated), "may not be null: end" (edition without end).

## Edition names reach the storefront through content
The Delivery API does not expose event/edition names. Put a `campaign` string on the slot schema and set it per edition in the slot body; the app reads it from the
delivered slot (`slotContent` + `campaign`) and shows it (time travel timeline).

## Previewing a date
Scheduling → edition → Preview → *Date/time preview* + a **preview application** (see preview.md) opens the site with a virtual staging domain frozen at that date.
