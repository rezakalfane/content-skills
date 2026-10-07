// Build the Bloomreach schema + records from BigCommerce. Usage: node build.mjs <outDir>   (run from the folder with .env.local, or set ENV_FILE)
// Project-specific parts to adapt: BRAND_FIXES, stockFor() (demo stock levels), BC_TREE_ID (the catalog tree that holds the categories), the custom-field slugging.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const out = process.argv[2];
mkdirSync(out, { recursive: true });

for (const l of readFileSync(process.env.ENV_FILE ?? ".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const { BC_STORE_HASH, BC_ACCESS_TOKEN } = process.env;
const bc = async (p) => {
  const r = await fetch(`https://api.bigcommerce.com/stores/${BC_STORE_HASH}${p}`, {
    headers: { "X-Auth-Token": BC_ACCESS_TOKEN, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`${p} -> ${r.status}`);
  return r.json();
};

// products (all pages)
const products = [];
for (let page = 1; ; page++) {
  const j = await bc(`/v3/catalog/products?limit=150&page=${page}&include=images,custom_fields`);
  products.push(...j.data);
  if (page >= j.meta.pagination.total_pages) break;
}
const sellable = products.filter((p) => p.type === "physical");

// brands
const brands = new Map();
for (let page = 1; ; page++) {
  const j = await bc(`/v3/catalog/brands?limit=250&page=${page}`);
  j.data.forEach((b) => brands.set(b.id, b.name));
  if (page >= j.meta.pagination.total_pages) break;
}

// Fix known typos in BigCommerce brand names (applies to the brand field and keywords).
const BRAND_FIXES = { Fiam: "FIAMM" };
for (const [id, name] of brands) if (BRAND_FIXES[name]) brands.set(id, BRAND_FIXES[name]);

// Demo stock levels: deterministic per product id (stable across reloads), ~10% out of stock, else 5-250.
const stockFor = (id) => {
  let x = (id * 2654435761) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  return x % 10 === 0 ? 0 : 5 + (x % 246);
};

// categories (tree 7 holds all used categories)
const cats = new Map();
for (let page = 1; ; page++) {
  const j = await bc(`/v3/catalog/trees/categories?limit=250&page=${page}&tree_id:in=${process.env.BC_TREE_ID ?? 7}`);
  j.data.forEach((c) => cats.set(c.category_id, c));
  if (page >= j.meta.pagination.total_pages) break;
}
const pathOf = (id) => {
  const chain = [];
  for (let c = cats.get(id); c; c = cats.get(c.parent_id)) chain.unshift({ id: String(c.category_id), name: c.name });
  return chain;
};

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const cfNames = new Map(); // attribute name -> original BC name
for (const p of sellable) for (const f of p.custom_fields) cfNames.set(slug(f.name), f.name);

// Keywords: BC search_keywords is empty, so derive them from brand, categories, ids and key specs.
const KW_SPECS = ["technology", "voltage", "format", "case_size", "model", "applications", "compatible_with", "compatible_formats"];
function makeKeywords(p) {
  const kw = new Set();
  const add = (s) => {
    const v = String(s ?? "").trim().toLowerCase();
    if (v.length >= 2 && v.length <= 40) kw.add(v);
    if (/^\d+(\.\d+)?\s+(v|ah|mah|a)$/.test(v)) kw.add(v.replace(/\s+/g, "")); // "12 v" -> "12v"
  };
  (p.search_keywords || "").split(",").forEach(add);
  add(brands.get(p.brand_id));
  add(p.sku);
  for (const id of p.categories) pathOf(id).slice(1).forEach((c) => add(c.name)); // skip root "Products"
  const spec = Object.fromEntries(p.custom_fields.map((f) => [slug(f.name), f.value]));
  for (const k of KW_SPECS) String(spec[k] ?? "").split(/[,;/]/).slice(0, 6).forEach(add);
  return [...kw];
}

const records = sellable.map((p) => {
  const thumb = p.images.find((i) => i.is_thumbnail) ?? p.images[0];
  const fields = {
    title: p.name,
    description: p.description || "",
    brand: brands.get(p.brand_id) ?? "",
    price: Number(p.price),
    stock_level: stockFor(p.id),
    active: !!p.is_visible,
    url: p.custom_url?.url ?? "",
    keywords: makeKeywords(p),
    thumb_image: thumb?.url_standard ?? "",
    category_paths: p.categories.map(pathOf).filter((x) => x.length),
    sku: p.sku || "",
    image_urls: p.images.map((i) => i.url_standard),
  };
  for (const f of p.custom_fields) fields[slug(f.name)] = f.value;
  return { op: "add", path: `/${p.id}`, value: { fields } };
});

const base = [
  ["brand", "String"], ["category_paths", "CategoryPaths"], ["stock_level", "Integer"], ["title", "String"],
  ["description", "String"], ["keywords", "List.String"], ["active", "Boolean"], ["price", "Float"],
  ["url", "String"], ["thumb_image", "String"],
];
const extra = [["sku", "String", "sku"], ["image_urls", "List.String", "image_urls"]];
// System attributes MUST stay in family "system" (Discovery reads title/price from there); custom ones use "main".
const attr = (name, data_type, src, family = "main") => ({
  name, item_type: process.env.BR_PRODUCT_TYPE, family, level: "parent", data_type,
  source_mapping: { mapping_type: "json_field", source_value: src ?? name },
});
const attributes = [
  ...base.map(([n, t]) => attr(n, t, n, "system")),
  ...extra.map(([n, t, s]) => attr(n, t, s)),
  ...[...cfNames].map(([n, orig]) => ({ ...attr(n, "String"), display_name: orig })),
];

writeFileSync(`${out}/records.jsonl`, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
writeFileSync(`${out}/attributes.json`, JSON.stringify(attributes, null, 2));
console.log(`fetched ${products.length}, sellable ${sellable.length}, records ${records.length}`);
console.log(`custom attributes (${cfNames.size}):`, [...cfNames.keys()].join(", "));
console.log("sample category_paths:", JSON.stringify(records[0].value.fields.category_paths));
