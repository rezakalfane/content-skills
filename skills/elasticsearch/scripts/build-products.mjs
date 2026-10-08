// Build the Elasticsearch mapping + documents from the BigCommerce catalog of ONE CHANNEL. Read-only on BigCommerce, writes files only.
// Usage (from the folder with .env.local, or set ENV_FILE):  node build-products.mjs <outDir>
// Writes <outDir>/mapping.json and <outDir>/products.json ([{id, doc}] for lib.bulkIndex).
// Needs BC_STORE_HASH, BC_ACCESS_TOKEN, BC_CHANNEL_ID. ES_SEMANTIC=false drops the semantic_text field.
// Project-specific parts to adapt for another store: BRAND_FIXES, the custom-field handling (specs), the stock field.
import { writeFileSync, mkdirSync } from "node:fs";
import { env } from "./lib.mjs";

const out = process.argv[2];
if (!out) throw new Error("usage: node build-products.mjs <outDir>");
mkdirSync(out, { recursive: true });
const { BC_STORE_HASH, BC_ACCESS_TOKEN, BC_CHANNEL_ID } = env;
if (!BC_STORE_HASH || !BC_ACCESS_TOKEN || !BC_CHANNEL_ID) throw new Error("BC_STORE_HASH, BC_ACCESS_TOKEN and BC_CHANNEL_ID must be set");
const SEMANTIC = env.ES_SEMANTIC !== "false";

const bc = async (p) => {
  const r = await fetch(`https://api.bigcommerce.com/stores/${BC_STORE_HASH}${p}`, { headers: { "X-Auth-Token": BC_ACCESS_TOKEN, Accept: "application/json" } });
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

// products assigned to the channel (the channel filter also drops products that are not sold there)
const products = (await pages("/v3/catalog/products", `&channel_id:in=${BC_CHANNEL_ID}&include=images,custom_fields,variants`)).filter((p) => p.is_visible);

// brands
const BRAND_FIXES = { Fiam: "FIAMM" }; // source data typo
const brands = new Map((await pages("/v3/catalog/brands")).map((b) => [b.id, BRAND_FIXES[b.name] ?? b.name]));

// categories: the channel's tree(s)
const treeIds = (await bc(`/v3/catalog/trees?channel_id:in=${BC_CHANNEL_ID}`)).data.map((t) => t.id);
if (!treeIds.length) throw new Error(`channel ${BC_CHANNEL_ID} has no category tree`);
const cats = new Map();
for (const c of await pages("/v3/catalog/trees/categories", `&tree_id:in=${treeIds.join(",")}`)) cats.set(c.category_id, c);
const chain = (id) => {
  const names = [];
  for (let c = cats.get(id); c; c = cats.get(c.parent_id)) names.unshift(c.name);
  return names;
};

// ids of a category and its ancestors (without the root), so a category page also lists the products of its subcategories
const chainIds = (id) => {
  const ids = [];
  for (let c = cats.get(id); c?.parent_id; c = cats.get(c.parent_id)) ids.push(c.category_id);
  return ids;
};

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const plain = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const docs = products.map((p) => {
  const thumb = p.images.find((i) => i.is_thumbnail) ?? p.images[0];
  const paths = p.categories.map(chain).filter((c) => c.length).map((c) => c.slice(1)); // drop the root "Products"
  const specs = Object.fromEntries(p.custom_fields.map((f) => [slug(f.name), f.value]));
  const brand = brands.get(p.brand_id) ?? "";
  return {
    id: String(p.id),
    doc: {
      id: p.id,
      sku: p.sku || "",
      name: p.name,
      brand,
      description: plain(p.description),
      price: Number(p.price),
      sale_price: p.sale_price ? Number(p.sale_price) : null,
      in_stock: (p.inventory_level ?? 0) > 0 || p.inventory_tracking === "none",
      stock_level: p.inventory_level ?? 0,
      url: p.custom_url?.url ?? "",
      thumb_image: thumb?.url_standard ?? "",
      image_urls: p.images.map((i) => i.url_standard),
      category_ids: [...new Set(p.categories.flatMap(chainIds))],
      category_paths: paths.map((c) => c.join(" > ")),
      categories: [...new Set(paths.flat())],
      specs,
      date_modified: p.date_modified,
    },
  };
});

const mapping = {
  mappings: {
    dynamic_templates: [{ specs_as_keyword: { path_match: "specs.*", mapping: { type: "keyword", ignore_above: 256 } } }],
    properties: {
      id: { type: "long" },
      sku: { type: "keyword", fields: { text: { type: "text", analyzer: "standard" } } },
      name: { type: "text", copy_to: SEMANTIC ? ["semantic"] : undefined, fields: { keyword: { type: "keyword", ignore_above: 256 }, suggest: { type: "search_as_you_type" } } },
      brand: { type: "keyword", copy_to: SEMANTIC ? ["semantic"] : undefined, fields: { text: { type: "text" } } },
      description: { type: "text", copy_to: SEMANTIC ? ["semantic"] : undefined },
      price: { type: "scaled_float", scaling_factor: 100 },
      sale_price: { type: "scaled_float", scaling_factor: 100 },
      in_stock: { type: "boolean" },
      stock_level: { type: "integer" },
      url: { type: "keyword", index: false },
      thumb_image: { type: "keyword", index: false },
      image_urls: { type: "keyword", index: false },
      category_ids: { type: "integer" },
      category_paths: { type: "keyword", copy_to: SEMANTIC ? ["semantic"] : undefined },
      categories: { type: "keyword" },
      specs: { type: "object" },
      date_modified: { type: "date" },
      ...(SEMANTIC ? { semantic: { type: "semantic_text" } } : {}),
    },
  },
};

writeFileSync(`${out}/mapping.json`, JSON.stringify(mapping, null, 2));
writeFileSync(`${out}/products.json`, JSON.stringify(docs));
const specNames = new Set(docs.flatMap((d) => Object.keys(d.doc.specs)));
console.log(`channel ${BC_CHANNEL_ID}: tree(s) ${treeIds.join(",")}, ${products.length} visible products, ${docs.length} documents`);
console.log(`brands ${new Set(docs.map((d) => d.doc.brand)).size}, categories ${new Set(docs.flatMap((d) => d.doc.category_paths)).size} paths, spec fields ${specNames.size}: ${[...specNames].join(", ")}`);
console.log("sample:", JSON.stringify(docs[0].doc).slice(0, 500));
