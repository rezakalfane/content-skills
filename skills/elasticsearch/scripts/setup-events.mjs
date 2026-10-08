// Create the `search-events` index (guarded: it must be in ES_GUARD_INDEX). Keeps an existing index unless --recreate (which DELETES its events).
// Usage (from the folder with .env.local):  node setup-events.mjs [--recreate]
import { ensureIndex } from "./lib.mjs";
import { EVENTS_INDEX, eventsMapping } from "./events-mapping.mjs";

console.log(`index ${EVENTS_INDEX}:`, await ensureIndex(EVENTS_INDEX, eventsMapping, process.argv.includes("--recreate")));
