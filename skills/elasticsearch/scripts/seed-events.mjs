// Seed the `search-events` index with SYNTHETIC demo traffic so the merchandiser dashboard (/insights) has something to show.
// Every event carries synthetic: true; re-running first deletes the previous synthetic events (real ones are never touched).
// What is real: each query is run against the real `products` index (the storefront's lexical query, filters, semantic fallback, "did you mean"),
// so totals, result lists, `via` and corrections are true to the catalog. What is simulated: who searched, when, who clicked, added to cart, ordered.
// Deliberate stories for the dashboard to find: queries that only match by meaning, typos, queries with a poor click-through, a promo spike,
// filter combinations that return nothing, hybrid and rerank traffic with different latency and click-through.
//
// Usage (from the folder with .env.local):  node seed-events.mjs [days=45] [--dry]
import { es, guard, bulkIndex } from "./lib.mjs";
import { EVENTS_INDEX } from "./events-mapping.mjs";

const DAYS = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 45);
const DRY = process.argv.includes("--dry");
guard(EVENTS_INDEX);

// deterministic randomness
let seed = 20261008;
const rnd = () => ((seed = (seed + 0x6d2b79f5) | 0), (((t) => ((t = Math.imul(t ^ (t >>> 15), t | 1)), (t ^= t + Math.imul(t ^ (t >>> 7), t | 61)), ((t ^ (t >>> 14)) >>> 0) / 4294967296))(seed)));
const pick = (arr) => (arr.length ? arr[Math.floor(rnd() * arr.length)] : undefined);
const between = (a, b) => a + rnd() * (b - a);
const weighted = (items) => {
  const total = items.reduce((n, i) => n + i.w, 0);
  let r = rnd() * total;
  for (const i of items) if ((r -= i.w) <= 0) return i;
  return items[items.length - 1];
};
const hex = (n) => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join("");

// ---- the catalog
const all = await es("POST", "/products/_search", { size: 200, _source: ["id", "sku", "name", "brand", "price", "specs.technology", "specs.voltage"], query: { match_all: {} } });
const products = all.json.hits.hits.map((h) => h._source);
const byId = new Map(products.map((p) => [p.id, p]));
const brandCount = new Map();
for (const p of products) brandCount.set(p.brand, (brandCount.get(p.brand) ?? 0) + 1);
const vocab = new Set(products.flatMap((p) => `${p.brand ?? ""} ${p.name ?? ""}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3)));
const topBrands = [...brandCount].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([b]) => b);

// ---- the demo queries (weight = share of traffic). `ctr` is the click-through that story needs; `via` is discovered, not set.
const Q = [];
const add = (q, w, ctr, locale = "en") => Q.push({ q, w, ctr, locale });
for (const b of topBrands) add(b.toLowerCase(), 5 + (brandCount.get(b) ?? 1), between(0.5, 0.72));
for (const [q, w, ctr] of [
  ["car battery", 30, 0.62], ["agm battery", 22, 0.58], ["start stop", 18, 0.55], ["motorcycle battery", 16, 0.6], ["leisure battery", 12, 0.5],
  ["deep cycle", 11, 0.46], ["truck battery", 9, 0.52], ["marine battery", 9, 0.49], ["9v battery", 10, 0.66], ["aa batteries", 14, 0.57],
  ["button cell", 8, 0.5], ["charger", 12, 0.44], ["12v 60ah", 15, 0.14], ["lithium", 10, 0.13], ["gel battery", 8, 0.12], ["efb", 7, 0.4],
  ["12v", 13, 0.35], ["battery", 20, 0.28], ["batteries", 8, 0.3],
]) add(q, w, ctr);
for (const p of products.slice(0, 160).filter((_, i) => i % 11 === 0)) if (p.sku) add(p.sku.toLowerCase(), 2.5, 0.82); // exact SKU searches convert
for (const [q, w, ctr] of [
  ["battery for my boat", 5, 0.4], ["long lasting battery for a camper van", 4, 0.36], ["battery that will not leak", 3, 0.33], ["something for my motorbike", 3, 0.38],
  ["exdie", 5, 0.5], ["vatra", 3, 0.5], ["yuasaa", 3, 0.5], ["duracel", 3, 0.5],
  ["alternator", 6, 0], ["tyre", 4, 0], ["solar panel", 5, 0], ["jump leads", 4, 0], ["car mats", 3, 0], ["inverter", 3, 0],
]) add(q, w, ctr);
for (const [q, w, ctr] of [["batterie voiture", 8, 0.58], ["batterie moto", 6, 0.56], ["pile bouton", 4, 0.48], ["batterie bateau", 4, 0.4], ["chargeur", 3, 0.4], ["batterie gel", 2, 0.15]]) add(q, w, ctr, "fr");

// ---- run each query for real (the storefront's lexical query, then the semantic fallback)
const lexical = (q) => ({ bool: { should: [
  { multi_match: { query: q, fields: ["name^3", "brand^2", "sku.text^4", "category_paths", "description"], fuzziness: /\d/.test(q) ? "0" : "AUTO", operator: "and" } },
  { multi_match: { query: q, type: "bool_prefix", operator: "and", fields: ["name.suggest", "name.suggest._2gram", "name.suggest._3gram"] } },
  { term: { sku: { value: q, boost: 10 } } },
], minimum_should_match: 1 } });
async function run(q, filter = []) {
  const withF = (must) => ({ bool: { filter, must: [must] } });
  let r = await es("POST", "/products/_search", {
    size: 24, _source: ["id", "brand", "specs.technology", "specs.voltage"], track_total_hits: true, query: withF(lexical(q)),
    suggest: { text: q, did_you_mean: { term: { field: "name", suggest_mode: "missing", size: 1 } } },
  });
  let via = "words";
  let hits = r.json.hits.hits;
  let total = r.json.hits.total.value;
  const entries = r.json.suggest?.did_you_mean ?? [];
  // same rule as the storefront: only words the whole catalog lacks are corrected (the suggester judges "missing" per shard)
  const known = (w) => vocab.has(w.toLowerCase()) || /\d/.test(w);
  const fixed = entries.some((e) => e.options?.length) ? entries.map((e) => (e.options?.[0] && !known(e.text) ? e.options[0].text : e.text)).join(" ") : "";
  if (!total) {
    const near = await es("POST", "/products/_search", { size: 20, _source: false, query: withF({ semantic: { field: "semantic", query: q } }) });
    const ids = (near.json.hits?.hits ?? []).map((h) => h._id);
    if (ids.length) {
      r = await es("POST", "/products/_search", { size: 24, _source: ["id", "brand", "specs.technology", "specs.voltage"], track_total_hits: true, query: { bool: { filter, must: [{ pinned: { ids, organic: { match_none: {} } } }] } } });
      hits = r.json.hits.hits;
      total = r.json.hits.total.value;
      via = "meaning";
    } else via = "none";
  }
  return { total, via, pids: hits.map((h) => Number(h._source.id)), didYouMean: via === "words" && fixed && fixed.toLowerCase() !== q ? fixed : undefined, hits: hits.map((h) => h._source) };
}

const variants = new Map(); // key query -> [{label, filters[], brands[], total, via, pids, weight}]
for (const item of Q) {
  const base = await run(item.q);
  const list = [{ w: 62, filters: [], brands: [], ...base }];
  if (base.hits.length > 1) {
    const brand = pick(base.hits)?.brand;
    const tech = pick(base.hits.filter((h) => h.specs?.technology))?.specs?.technology;
    const volt = pick(base.hits.filter((h) => h.specs?.voltage))?.specs?.voltage;
    if (brand) list.push({ w: 14, filters: [], brands: [brand], ...(await run(item.q, [{ terms: { brand: [brand] } }])) });
    if (tech) list.push({ w: 12, filters: [`technology:${tech}`], brands: [], ...(await run(item.q, [{ terms: { "specs.technology": [tech] } }])) });
    if (volt) list.push({ w: 8, filters: [`voltage:${volt}`], brands: [], ...(await run(item.q, [{ terms: { "specs.voltage": [volt] } }])) });
    // an over-filtered search (a brand with a technology it does not sell): the "no results" story
    if (brand) {
      const odd = await run(item.q, [{ terms: { brand: [brand] } }, { term: { "specs.technology": "Lithium-Ion" } }]);
      list.push({ w: 3, filters: ["technology:Lithium-Ion"], brands: [brand], ...odd });
    }
  }
  variants.set(item.q, list.filter((v) => v.total >= 0));
}
const summary = Q.map((i) => ({ q: i.q, via: variants.get(i.q)[0].via, total: variants.get(i.q)[0].total }));
console.log(`queries: ${Q.length}; matched by words ${summary.filter((s) => s.via === "words").length}, by meaning ${summary.filter((s) => s.via === "meaning").length}, none ${summary.filter((s) => s.via === "none").length}`);
console.log("no word match:", summary.filter((s) => s.via !== "words").map((s) => s.q).join(", "));

// ---- simulate the traffic
const RANKING = [{ v: "lexical", w: 70, ms: [35, 95], ctr: 1 }, { v: "hybrid", w: 20, ms: [110, 230], ctr: 1.1 }, { v: "rerank", w: 10, ms: [330, 720], ctr: 1.2 }];
const SORTS = [{ v: "featured", w: 80 }, { v: "price_asc", w: 9 }, { v: "price_desc", w: 6 }, { v: "name_asc", w: 5 }];
const HOURS = [0, 0, 0, 0, 0, 0, 0.3, 1.2, 3, 4.5, 5, 4.3, 3.2, 3.6, 4.4, 4.8, 3.8, 2.5, 1.2, 0.7, 0.5, 0.4, 0.2, 0.1];
const events = [];
const now = Date.now();
const startDay = new Date(now - DAYS * 86400_000);
startDay.setUTCHours(0, 0, 0, 0);
const mk = (type, ts, extra) => ({ ts: new Date(ts).toISOString(), type, synthetic: true, dow: (new Date(ts).getUTCDay() + 6) % 7, hour: new Date(ts).getUTCHours(), ...extra });

for (let d = 0; d <= DAYS; d++) {
  const day = new Date(startDay.getTime() + d * 86400_000);
  const dow = (day.getUTCDay() + 6) % 7;
  let n = 250 * (dow < 5 ? 1 : dow === 5 ? 0.5 : 0.4) * (1 + (d / DAYS) * 0.3) * between(0.85, 1.15);
  if (d === Math.floor(DAYS * 0.62)) n *= 2.4; // a promotion
  if (d === Math.floor(DAYS * 0.35)) n *= 0.45; // a bad day
  const sessions = Math.round(n / 1.9);
  for (let s = 0; s < sessions; s++) {
    const hour = weighted(HOURS.map((w, i) => ({ w, i }))).i;
    let ts = day.getTime() + hour * 3600_000 + rnd() * 3600_000;
    if (ts > now) continue;
    const sid = hex(12);
    const nSearch = weighted([{ n: 1, w: 55 }, { n: 2, w: 28 }, { n: 3, w: 12 }, { n: 4, w: 5 }]).n;
    for (let k = 0; k < nSearch; k++) {
      const item = weighted(Q);
      const variant = weighted(variants.get(item.q));
      const rank = weighted(RANKING);
      const sx = hex(10);
      ts += between(8, 70) * 1000;
      if (ts > now) break;
      const took = Math.round(between(...rank.ms));
      events.push(mk("search", ts, {
        sid, sx, locale: item.locale, q: item.q, total: variant.total, via: variant.via, ranking: rank.v, took_ms: took, sort: weighted(SORTS).v,
        brands: variant.brands, filters: variant.filters, pids: variant.pids, page: 0, ...(variant.didYouMean ? { did_you_mean: variant.didYouMean } : {}),
      }));
      if (!variant.pids.length) continue;
      // click-through: the story's ctr, lower when results are only a meaning match, higher for better rankings, lower for filtered-down lists
      let p = item.ctr * rank.ctr * (variant.via === "meaning" ? 0.75 : 1) * (variant.filters.length || variant.brands.length ? 1.1 : 1);
      p = Math.min(p, 0.93);
      let t2 = ts;
      for (let c = 0; c < 3 && rnd() < p * (c ? 0.35 : 1); c++) {
        const pos = Math.min(variant.pids.length, 1 + Math.floor(-Math.log(1 - rnd() * 0.98) / 0.28));
        const pid = variant.pids[pos - 1];
        t2 += between(4, 40) * 1000;
        events.push(mk("click", t2, { sid, sx, locale: item.locale, q: item.q, ranking: rank.v, pid, position: pos }));
        const price = Number(byId.get(pid)?.price ?? 50);
        if (rnd() < Math.max(0.06, 0.34 - price / 900)) {
          t2 += between(10, 90) * 1000;
          const qty = weighted([{ n: 1, w: 45 }, { n: 2, w: 25 }, { n: 4, w: 20 }, { n: 10, w: 10 }]).n;
          events.push(mk("add_to_cart", t2, { sid, sx, locale: item.locale, q: item.q, pid, value: Math.round(price * qty * 100) / 100 }));
          if (rnd() < 0.42) {
            t2 += between(60, 600) * 1000;
            events.push(mk("order", t2, { sid, sx, locale: item.locale, q: item.q, value: Math.round(price * qty * 100) / 100, lines: 1 + Math.floor(rnd() * 2) }));
          }
        }
      }
    }
  }
}
const counts = events.reduce((m, e) => ((m[e.type] = (m[e.type] ?? 0) + 1), m), {});
console.log(`${events.length} synthetic events over ${DAYS} days:`, counts);
if (DRY) process.exit(0);

// ---- replace the previous synthetic events, then write
const del = await es("POST", `/${EVENTS_INDEX}/_delete_by_query?refresh=true&conflicts=proceed`, { query: { term: { synthetic: true } } });
console.log(`removed ${del.json.deleted ?? 0} earlier synthetic events (status ${del.status})`);
const docs = events.map((doc, i) => ({ id: `syn-${doc.sx ?? doc.sid}-${doc.type}-${i}`, doc }));
const r = await bulkIndex(EVENTS_INDEX, docs, 2000);
console.log(`ok ${r.ok}, failed ${r.failed}`);
for (const e of r.errors.slice(0, 3)) console.log("  ", e.id, e.status, e.error);
await es("POST", `/${EVENTS_INDEX}/_refresh`);
const c = await es("GET", `/${EVENTS_INDEX}/_count`);
console.log(`count in ${EVENTS_INDEX}: ${c.json.count}`);
