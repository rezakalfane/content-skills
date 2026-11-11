// Build a Constructor catalog (items.jsonl + item_groups.jsonl) from the BigCommerce catalog of ONE channel. Read-only on BigCommerce, writes files only.
// Usage: node scripts/build-catalog.mjs <bc-env-file> <outDir>
// The env file needs BC_STORE_HASH, BC_ACCESS_TOKEN, BC_CHANNEL_ID (e.g. ../Elasticsearch/.env.local).
// Constructor treats facets as plain metadata, so every BigCommerce custom field becomes a snake_case key under `data`; numeric twins
// (voltage_v, capacity_ah, cca_a, ...) are added so range facets and numeric sorts work.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const [envFile, out] = process.argv.slice(2);
if (!envFile || !out) throw new Error("usage: node build-catalog.mjs <bc-env-file> <outDir>");
for (const l of readFileSync(envFile, "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const { BC_STORE_HASH: HASH, BC_ACCESS_TOKEN: TOKEN, BC_CHANNEL_ID: CHANNEL } = process.env;
if (!HASH || !TOKEN || !CHANNEL) throw new Error("BC_STORE_HASH, BC_ACCESS_TOKEN and BC_CHANNEL_ID must be set");
mkdirSync(out, { recursive: true });

const bc = async (p) => {
  const r = await fetch(`https://api.bigcommerce.com/stores/${HASH}${p}`, { headers: { "X-Auth-Token": TOKEN, Accept: "application/json" } });
  if (!r.ok) throw new Error(`${p} -> ${r.status}`);
  return r.json();
};
const pages = async (path, params = "") => {
  const rows = [];
  for (let page = 1; ; page++) {
    const j = await bc(`${path}?limit=250&page=${page}${params}`);
    rows.push(...j.data);
    if (page >= (j.meta?.pagination?.total_pages ?? 1)) return rows;
  }
};

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const gid = (s) => slug(s).replace(/_/g, "-");
const plain = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const num = (v) => {
  const m = String(v ?? "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : undefined;
};

const products = (await pages("/v3/catalog/products", `&channel_id:in=${CHANNEL}&include=images,custom_fields,variants`)).filter((p) => p.is_visible);
const BRAND_FIXES = { Fiam: "FIAMM" }; // source data typo, same fix as the Elasticsearch loader
const brands = new Map((await pages("/v3/catalog/brands")).map((b) => [b.id, BRAND_FIXES[b.name] ?? b.name]));

// categories of the channel's tree
const treeIds = (await bc(`/v3/catalog/trees?channel_id:in=${CHANNEL}`)).data.map((t) => t.id);
if (!treeIds.length) throw new Error(`channel ${CHANNEL} has no category tree`);
const cats = new Map();
for (const c of await pages("/v3/catalog/trees/categories", `&tree_id:in=${treeIds.join(",")}`)) cats.set(c.category_id, c);
const root = [...cats.values()].find((c) => !c.parent_id || !cats.has(c.parent_id));
const chain = (id) => {
  const names = [];
  for (let c = cats.get(id); c && c.category_id !== root.category_id; c = cats.get(c.parent_id)) names.unshift(c.name);
  return names;
};

// ---- item groups: "all" is the root, the BigCommerce root "Products" is folded into it
const groupId = new Map();
const used = new Set(["all"]);
for (const c of cats.values()) {
  if (c.category_id === root.category_id) { groupId.set(c.category_id, "all"); continue; }
  let id = gid(c.name);
  if (used.has(id)) id = `${gid(chain(c.parent_id).concat(c.name).join(" "))}`;
  if (used.has(id)) throw new Error(`group id clash: ${id}`);
  used.add(id);
  groupId.set(c.category_id, id);
}
const groups = [{ id: "all", name: "All Products", parent_ids: [], data: {} }];
for (const c of cats.values()) {
  if (c.category_id === root.category_id) continue;
  groups.push({
    id: groupId.get(c.category_id),
    name: c.name,
    parent_ids: [groupId.get(c.parent_id) ?? "all"],
    data: { url: c.url?.path ?? "", bc_category_id: c.category_id },
  });
}

// ---- items
// numeric twins of text custom fields, for range facets and numeric sorts
const NUMERIC = { voltage: "voltage_v", capacity_ah: "capacity_ah", cca: "cca_a", capacity_mah: "capacity_mah", capacity_wh: "capacity_wh", cell_count: "cell_count" };
// custom fields that hold a list ("A, B, C"): split into arrays so each value is an exact-match token
const LISTS = new Set(["compatible_formats"]);
const items = products.map((p) => {
  const thumb = p.images.find((i) => i.is_thumbnail) ?? p.images[0];
  const brand = brands.get(p.brand_id) ?? "";
  const catNames = [...new Set(p.categories.flatMap(chain))];
  const top = p.categories.map((id) => chain(id)[0]).filter(Boolean);
  const productType = top.includes("Chargers & Accessories") ? "Charger" : "Battery";
  const data = {
    active: true,
    sku: p.sku || "",
    mpn: p.mpn || "",
    gtin: p.gtin || "",
    brand,
    product_type: productType,
    url: p.custom_url?.url ?? "",
    image_url: thumb?.url_standard ?? "",
    image_urls: p.images.map((i) => i.url_standard),
    description: plain(p.description).slice(0, 2000),
    price: Number(p.price),
    in_stock: (p.inventory_level ?? 0) > 0 || p.inventory_tracking === "none",
    weight_kg: p.weight || undefined,
    categories: catNames,
    category_paths: [...new Set(p.categories.map((id) => chain(id).join(" > ")).filter(Boolean))],
    group_ids: [...new Set(p.categories.map((id) => groupId.get(id)).filter(Boolean))],
    keywords: [...new Set([...(p.search_keywords ?? "").split(",").map((k) => k.trim()).filter(Boolean), brand, productType].filter(Boolean))],
    date_modified: p.date_modified,
  };
  if (Number(p.sale_price) > 0) data.sale_price = Number(p.sale_price);
  for (const f of p.custom_fields) {
    if (!f.value) continue;
    const key = slug(f.name);
    data[key] = LISTS.has(key) ? f.value.split(",").map((x) => x.trim()).filter(Boolean) : f.value;
    if (NUMERIC[key]) { const n = num(f.value); if (n !== undefined) data[NUMERIC[key]] = n; }
  }
  return { id: String(p.id), name: p.name, data };
});

const clash = items.length - new Set(items.map((i) => i.id)).size;
if (clash) throw new Error(`${clash} duplicate item ids`);
const orphan = items.filter((i) => !i.data.group_ids.length);
if (orphan.length) console.warn(`WARNING: ${orphan.length} items without a group: ${orphan.map((i) => i.id).join(",")}`);

writeFileSync(`${out}/items.jsonl`, items.map((i) => JSON.stringify(i)).join("\n") + "\n");
writeFileSync(`${out}/item_groups.jsonl`, groups.map((g) => JSON.stringify(g)).join("\n") + "\n");

const fieldCount = {};
for (const i of items) for (const k of Object.keys(i.data)) fieldCount[k] = (fieldCount[k] ?? 0) + 1;
console.log(`channel ${CHANNEL}: ${items.length} items, ${groups.length} groups (incl. root)`);
console.log("types:", Object.entries(items.reduce((a, i) => ((a[i.data.product_type] = (a[i.data.product_type] ?? 0) + 1), a), {})).map(([k, v]) => `${k} ${v}`).join(", "));
console.log("fields (count):", Object.entries(fieldCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", "));
console.log("sample:", JSON.stringify(items[0]).slice(0, 900));
