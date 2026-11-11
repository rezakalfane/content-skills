// Search / Autosuggest rules for the Batteries & Chargers demo: keyword redirects + a few query-level searchandising rules.
// Idempotent: rules it owns are deleted and recreated (redirects are tagged metadata.source = "cio-demo-loader").
// Constructor's public API has no "applies to every query" global rule and no Autosuggest-only rule; redirects apply to both Search and Autosuggest.
// Usage: node scripts/configure-rules.mjs [--dry-run]
import { readFileSync } from "node:fs";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
}
const TOKEN = process.env.CONSTRUCTOR_API_TOKEN;
const KEY = process.env.CONSTRUCTOR_INDEX_KEY ?? "key_fWBvGxve8KzBSkXm";
const DRY = process.argv.includes("--dry-run");
if (!TOKEN) throw new Error("CONSTRUCTOR_API_TOKEN must be set");
const SOURCE = "cio-demo-loader";

const call = async (method, path, body) => {
  const url = `https://ac.cnstrc.com${path}${path.includes("?") ? "&" : "?"}key=${KEY}&c=${SOURCE}`;
  if (DRY && method !== "GET") { console.log(method, path, body ? JSON.stringify(body) : ""); return { status: 0, json: {} }; }
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${TOKEN}:`).toString("base64")}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: r.status, json };
};
const report = (label, r) => {
  const ok = DRY || (r.status >= 200 && r.status < 300);
  console.log(`${ok ? "ok  " : "FAIL"} ${label} (${r.status})${ok ? "" : " " + JSON.stringify(r.json).slice(0, 300)}`);
  if (!ok) process.exitCode = 1;
};

// ---------------------------------------------------------------- redirects: a shopper typing the category name goes to the category page
// No redirect for "charger": that search has its own query rule and facet campaign, a redirect would hide the results page.
const redirects = [
  { url: "/products/chargers-accessories/jump-starters-boosters/", terms: ["jump starter", "jump starters", "booster", "boosters"] },
  { url: "/products/leisure-deep-cycle/lithium-lifepo4-batteries/", terms: ["lithium", "lifepo4", "lithium battery", "lithium batteries"] },
];
const old = await call("GET", "/v1/redirect_rules?num_results_per_page=100");
for (const r of old.json.redirect_rules ?? []) if (r.metadata?.source === SOURCE) await call("DELETE", `/v1/redirect_rules/${r.id}`);
for (const { url, terms } of redirects) {
  report(`redirect ${terms[0]} -> ${url}`, await call("POST", "/v1/redirect_rules", {
    url,
    matches: terms.map((pattern) => ({ pattern, match_type: "EXACT" })),
    metadata: { source: SOURCE },
  }));
}

// ---------------------------------------------------------------- query rules (Search; Autosuggest products follow the same ranking)
const rules = [
  // "battery": batteries before chargers and accessories
  { query: "battery", boost_rules: [{ rule: { filters: { product_type: ["Battery"] }, boost: 5 } }] },
  // "charger": only chargers (battery descriptions mention chargers too)
  { query: "charger", whitelist_rule: { rule: { filters: { product_type: ["Charger"] } } } },
  // "start stop": push start-stop batteries up
  { query: "start stop", boost_rules: [{ rule: { filters: { start_stop: ["Yes"] }, boost: 5 } }] },
];
// refined queries are addressed by numeric id: look the id up by query text, replace it (PUT) or create it (POST)
const have = (await call("GET", "/v1/refined_queries?section=Products&num_results_per_page=100")).json.refined_queries ?? [];
for (const q of rules) {
  const id = have.find((r) => r.query === q.query)?.id;
  report(`query rule "${q.query}" (${id ? "replace " + id : "create"})`,
    id ? await call("PUT", `/v1/refined_queries/${id}?section=Products`, q) : await call("POST", "/v1/refined_queries?section=Products", q));
}
