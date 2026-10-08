// The `search-events` index: what the storefront logs about searching (see the storefront's lib/events.ts), and what the merchandiser
// dashboard (/insights) reads. One flat document per event; `type` says which fields are present.
//   search       q, total, via, ranking, took_ms, sort, category, brands, filters, pids (the products shown), page, did_you_mean
//   click        pid, position (1-based, over the whole result list), q, sx, ranking
//   add_to_cart  pid, value, q, sx
//   order        value, lines, q, sx
// `sx` ties a click / add to cart / order back to the search it came from; `sid` is an anonymous per-tab session id (no cookie).
export const EVENTS_INDEX = "search-events";

export const eventsMapping = {
  mappings: {
    dynamic: "strict",
    properties: {
      ts: { type: "date" },
      type: { type: "keyword" },
      sid: { type: "keyword" },
      sx: { type: "keyword" },
      locale: { type: "keyword" },
      synthetic: { type: "boolean" },
      dow: { type: "byte" }, // 0 = Monday (UTC)
      hour: { type: "byte" }, // 0-23 (UTC)
      q: { type: "keyword", ignore_above: 120 },
      total: { type: "integer" },
      via: { type: "keyword" }, // words | meaning | none
      ranking: { type: "keyword" },
      took_ms: { type: "integer" },
      sort: { type: "keyword" },
      category: { type: "keyword" },
      brands: { type: "keyword" },
      filters: { type: "keyword" }, // "technology:AGM", "voltage:12 V", "price"
      pids: { type: "long" },
      page: { type: "integer" },
      did_you_mean: { type: "keyword", ignore_above: 120 },
      pid: { type: "long" },
      position: { type: "integer" },
      value: { type: "scaled_float", scaling_factor: 100 },
      lines: { type: "integer" },
    },
  },
};
