// Configure the Constructor index for the Batteries & Chargers B2B demo: facets, searchabilities, sort options, synonyms.
// Idempotent: facets and sort options are replaced as a whole, searchabilities are upserted, synonym groups are recreated.
// Usage: node scripts/configure-index.mjs [--dry-run]     (reads CONSTRUCTOR_API_TOKEN and CONSTRUCTOR_INDEX_KEY from .env.local / env)
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
  if (DRY) { console.log(method, path, body ? JSON.stringify(body).slice(0, 200) : ""); return { status: 0, json: {} }; }
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${TOKEN}:`).toString("base64")}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: r.status, json };
};
const must = (label, r) => {
  const ok = r.status >= 200 && r.status < 300;
  console.log(`${ok ? "ok  " : "FAIL"} ${label} (${r.status})${ok ? "" : " " + JSON.stringify(r.json).slice(0, 400)}`);
  if (!ok && !DRY) process.exitCode = 1;
  return ok;
};

// ---------------------------------------------------------------- facets (metadata fields users filter by)
const multiple = (name, display_name, extra = {}) => ({ name, path_in_metadata: name, type: "multiple", display_name, sort_order: "num_matches", sort_descending: true, ...extra });
const range = (name, display_name, limits, extra = {}) => ({ name, path_in_metadata: name, type: "range", display_name, range_type: "static", range_format: "boundaries", range_limits: limits, range_inclusive: "above", ...extra });
const facets = [
  // groups = the item-group tree (Browse categories)
  { name: "groups", path_in_metadata: "groups", type: "hierarchical", display_name: "Category", sort_order: "relevance" },
  multiple("product_type", "Product Type"),
  multiple("brand", "Brand", { sort_order: "value", sort_descending: false }),
  multiple("technology", "Technology"),
  multiple("voltage", "Voltage"),
  range("capacity_ah", "Capacity (Ah)", [10, 30, 50, 70, 100, 150, 200]),
  range("cca_a", "Cold Cranking Amps (A)", [300, 500, 700, 900]),
  range("capacity_mah", "Capacity (mAh)", [500, 1000, 2000, 3000, 5000]),
  range("price", "Price", [10, 25, 50, 100, 250, 500, 1000]),
  multiple("start_stop", "Start-Stop"),
  multiple("polarity", "Polarity"),
  multiple("terminal_type", "Terminal Type"),
  multiple("hold_down", "Hold-Down"),
  multiple("layout", "Layout"),
  multiple("case_size", "Case Size"),
  multiple("format", "Cell Format"),
  multiple("warranty", "Warranty"),
  multiple("oem_battery", "OEM Battery"),
  // hidden: usable for rules and filters, not shown as a filter
  multiple("un_code", "UN Code", { hidden: true }),
  multiple("categories", "Categories", { hidden: true }),
];

// ---------------------------------------------------------------- searchabilities (how metadata takes part in search)
const S = (name, o = {}) => ({ name, fuzzy_searchable: false, exact_searchable: false, displayable: true, hidden: false, ...o });
const searchabilities = [
  // matched loosely (typos, plurals)
  S("brand", { fuzzy_searchable: true }),
  S("keywords", { fuzzy_searchable: true, displayable: false }),
  S("technology", { fuzzy_searchable: true }),
  S("product_type", { fuzzy_searchable: true }),
  S("categories", { fuzzy_searchable: true }),
  S("category_paths", { displayable: true }),
  S("applications", { fuzzy_searchable: true }),
  S("compatible_with", { fuzzy_searchable: true }),
  S("format", { fuzzy_searchable: true }),
  S("start_stop", { fuzzy_searchable: true }),
  S("voltage", { fuzzy_searchable: true }),
  S("description", { fuzzy_searchable: true }),
  // identifiers: must match exactly (SKU, MPN, EAN, model and cross-reference codes)
  S("sku", { exact_searchable: true }),
  S("mpn", { exact_searchable: true }),
  S("gtin", { exact_searchable: true }),
  S("model", { exact_searchable: true }),
  S("etn", { exact_searchable: true, hidden: true }),
  S("compatible_formats", { exact_searchable: true }),
  S("case_size", { exact_searchable: true }),
  // returned with each result (specs shown on the card / PDP)
  ...["url", "image_url", "image_urls", "price", "sale_price", "in_stock", "weight_kg", "dimensions", "warranty", "polarity", "terminal_type", "hold_down", "layout",
    "capacity_ah", "capacity_mah", "capacity_wh", "capacity_range_ah", "capacity_range_mah", "capacity_detail", "voltage_v", "voltage_detail", "cca", "cca_a",
    "cell_count", "oem_battery", "diameter", "thickness", "group_ids"].map((n) => S(n)),
  // kept in the index but not returned by default
  S("un_code", { hidden: true }),
  S("date_modified", { hidden: true }),
];

// ---------------------------------------------------------------- sort options
const sort_options = [
  { display_name: "Price: Low to High", path_in_metadata: "price", sort_by: "price", sort_order: "ascending", position: 1 },
  { display_name: "Price: High to Low", path_in_metadata: "price", sort_by: "price", sort_order: "descending", position: 2 },
  { display_name: "Name: A to Z", path_in_metadata: "name", sort_by: "name", sort_order: "ascending", position: 3 },
  { display_name: "Name: Z to A", path_in_metadata: "name", sort_by: "name", sort_order: "descending", position: 4 },
  { display_name: "Capacity: High to Low", path_in_metadata: "capacity_ah", sort_by: "capacity_ah", sort_order: "descending", position: 5 },
  { display_name: "Cold Cranking Amps: High to Low", path_in_metadata: "cca_a", sort_by: "cca_a", sort_order: "descending", position: 6 },
];

// ---------------------------------------------------------------- synonyms (two-way groups of equivalent search terms)
const synonyms = [
  ["cca", "cold cranking amps", "cold cranking amp"],
  ["ah", "amp hour", "amp hours", "ampere hour"],
  ["agm", "absorbent glass mat"],
  ["efb", "enhanced flooded battery"],
  ["lifepo4", "lfp", "lithium iron phosphate"],
  ["li-ion", "lithium ion", "lithium-ion"],
  ["nimh", "ni-mh", "nickel metal hydride"],
  ["sla", "vrla", "sealed lead acid"],
  ["start-stop", "start stop", "stop start"],
  ["deep cycle", "deep-cycle", "traction"],
  ["button cell", "coin cell", "watch battery"],
  ["charger", "battery charger", "maintainer", "trickle charger"],
  ["jump starter", "booster", "jump pack", "jump start"],
  ["car battery", "automotive battery", "starter battery", "starting battery"],
  ["motorcycle battery", "powersports battery", "scooter battery"],
  ["power tool battery", "cordless tool battery", "drill battery"],
];

must(`facets (${facets.length})`, await call("PUT", "/v2/facets", { facets }));
must(`searchabilities (${searchabilities.length})`, await call("PATCH", "/v2/searchabilities", { searchabilities }));
must(`sort options (${sort_options.length})`, await call("PUT", "/v1/sort_options", { sort_options }));

// recreate synonym groups: drop what exists, then create ours
const existing = await call("GET", "/v1/synonym_groups?num_results_per_page=100");
for (const g of existing.json.synonym_groups ?? []) await call("DELETE", `/v1/synonym_groups/${g.id}`);
let n = 0;
for (const group of synonyms) if ((await call("POST", "/v1/synonym_groups", { synonyms: group })).status < 300) n++;
console.log(`${n === synonyms.length ? "ok  " : "FAIL"} synonym groups (${n}/${synonyms.length})`);
if (n !== synonyms.length && !DRY) process.exitCode = 1;
