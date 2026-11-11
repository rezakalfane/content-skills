// Browse rules (refined filters, one per category or facet page) and facet rules (facet option position, label, visibility)
// for the Batteries & Chargers demo. Idempotent: PUT replaces a browse rule, PATCH upserts facet options.
// Usage: node scripts/configure-browse-facet-rules.mjs [--dry-run]
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
  const url = `https://ac.cnstrc.com${path}${path.includes("?") ? "&" : "?"}key=${KEY}&section=Products&c=cio-demo-loader`;
  if (DRY) { console.log(method, path, JSON.stringify(body)); return { status: 0, json: {} }; }
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${TOKEN}:`).toString("base64")}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

// ---------------------------------------------------------------- Browse rules: filter_name/filter_value is the browse page ("group_id" = a category)
const browse = [
  // Car batteries: modern cars need AGM, show those first
  { name: "group_id", value: "car-batteries", rules: { boost_rules: [{ rule: { filters: { technology: ["AGM"] }, boost: 3 } }] } },
  // Battery chargers: the CTEK smart charger (the premium pick) always first
  { name: "group_id", value: "battery-chargers", rules: { slot_rules: [{ rule: { item_id: "507", position: 1 } }] } },
  // Lithium / LiFePO4: the longer 24-month warranty first (no lithium product has more)
  { name: "group_id", value: "lithium-lifepo4-batteries", rules: { boost_rules: [{ rule: { filters: { warranty: ["24 months"] }, boost: 3 } }] } },
  // a facet browse page works the same way: /browse/brand/Exide pins the flagship product first
  { name: "brand", value: "Exide", rules: { slot_rules: [{ rule: { item_id: "377", position: 1 } }] } },
];
for (const b of browse) {
  report(`browse ${b.name}=${b.value}`, await call("PUT", `/v1/refined_filters/${encodeURIComponent(b.name)}/${encodeURIComponent(b.value)}`, b.rules));
}

// ---------------------------------------------------------------- Facet rules: how each facet's values are ordered, labelled and shown
const facetRules = [
  // Voltage: 12 V (cars, the bulk of B2B demand) first, then 6 V and 24 V
  { facet: "voltage", options: [{ value: "12 V", position: 1 }, { value: "24 V", position: 2 }, { value: "6 V", position: 3 }] },
  // Brand: the three best-known brands on top of the list
  { facet: "brand", options: [{ value: "Exide", position: 1 }, { value: "Varta", position: 2 }, { value: "Bosch", position: 3 }] },
  // Start-Stop: a readable label, and hide the "No" value (only "Start-Stop compatible" is a useful filter)
  { facet: "start_stop", options: [{ value: "Yes", display_name: "Start-Stop compatible" }, { value: "No", hidden: true }] },
];
for (const f of facetRules) report(`facet options ${f.facet}`, await call("PATCH", `/v1/facets/${f.facet}/options`, f.options));
