// Facet rule campaigns: which facets appear (and in what order) on specific search terms and browse pages.
// Idempotent: campaigns with the same name are deleted and recreated.
// Usage: node scripts/configure-facet-campaigns.mjs [--dry-run]
import { readFileSync } from "node:fs";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
}
const TOKEN = process.env.CONSTRUCTOR_API_TOKEN;
const KEY = process.env.CONSTRUCTOR_INDEX_KEY ?? "key_fWBvGxve8KzBSkXm";
const DRY = process.argv.includes("--dry-run");
if (!TOKEN) throw new Error("CONSTRUCTOR_API_TOKEN must be set");

const call = async (method, path, body) => {
  const url = `https://ac.cnstrc.com${path}${path.includes("?") ? "&" : "?"}key=${KEY}&section=Products`;
  if (DRY && method !== "GET") { console.log(method, path, JSON.stringify(body)); return { status: 0, json: {} }; }
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${TOKEN}:`).toString("base64")}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: r.status, json };
};

const hide = (name) => ({ target: "facet_group", rule: { name } });
const slot = (name, position) => ({ target: "facet_group", rule: { name, position } });

const campaigns = [
  {
    // chargers have no cranking amps, Ah capacity, polarity, terminals or hold-down: don't show those filters
    name: "Chargers: hide battery-only facets",
    refined_queries: [{ query: "charger" }],
    refined_filters: [{ filter_name: "group_id", filter_value: "battery-chargers" }],
    blacklist_rules: ["cca_a", "capacity_ah", "polarity", "terminal_type", "hold_down", "layout", "case_size"].map(hide),
  },
  {
    // buying a car battery: fitment facets first
    name: "Car batteries: fitment facets first",
    refined_filters: [{ filter_name: "group_id", filter_value: "car-batteries" }],
    slot_rules: [slot("start_stop", 1), slot("cca_a", 2), slot("capacity_ah", 3)],
  },
];

const existing = await call("GET", "/v1/facet_rule_campaigns?num_results_per_page=100");
const have = existing.json.facet_rule_campaigns ?? existing.json.campaigns ?? [];
for (const c of campaigns) {
  for (const old of have.filter((x) => x.name === c.name)) await call("DELETE", `/v1/facet_rule_campaigns/${old.id}`);
  const r = await call("POST", "/v1/facet_rule_campaigns", c);
  const ok = DRY || (r.status >= 200 && r.status < 300);
  console.log(`${ok ? "ok  " : "FAIL"} ${c.name} (${r.status})${ok ? "" : " " + JSON.stringify(r.json).slice(0, 400)}`);
  if (!ok) process.exitCode = 1;
}
