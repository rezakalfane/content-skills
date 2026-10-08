// Build the Elasticsearch mapping + documents from the BigCommerce catalog of ONE CHANNEL. Read-only on BigCommerce, writes files only.
// Usage (from the folder with .env.local, or set ENV_FILE):  node build-products.mjs <outDir>
// Writes <outDir>/mapping.json and <outDir>/products.json ([{id, doc}] for lib.bulkIndex).
// Needs BC_STORE_HASH, BC_ACCESS_TOKEN, BC_CHANNEL_ID. ES_SEMANTIC=false drops the semantic_text field.
// French text (name_fr, description_fr, category_paths_fr, specs_text_fr, complete_fr) comes from the Storefront GraphQL API with
// @shopperPreferences(locale: "fr") when BC_STOREFRONT_TOKEN is set; without it those fields are simply left out.
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

// ---- French text from BigCommerce (the Storefront GraphQL API returns translated names, descriptions, custom fields and categories)
const FR = env.BC_STOREFRONT_TOKEN ? "fr" : "";
const frById = new Map();
const frCat = new Map();
if (FR) {
  const EP = `https://store-${BC_STORE_HASH}-${BC_CHANNEL_ID}.mybigcommerce.com/graphql`;
  const gql = async (query) => {
    const q = query.replace("{", ` @shopperPreferences(locale: "${FR}") {`);
    const r = await fetch(EP, { method: "POST", headers: { Authorization: `Bearer ${env.BC_STOREFRONT_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
    const j = await r.json();
    if (j.errors?.length) throw new Error(`storefront graphql: ${j.errors[0].message}`);
    return j.data;
  };
  const ids = products.map((p) => p.id);
  for (let i = 0; i < ids.length; i += 50) {
    const d = await gql(`query { site { products(entityIds: [${ids.slice(i, i + 50).join(",")}], first: 50) { edges { node { entityId name plainTextDescription(characterLimit: 2000) customFields { edges { node { name value } } } } } } } }`);
    for (const { node } of d.site.products.edges) frById.set(node.entityId, node);
  }
  const walk = (ns) => ns.forEach((n) => (frCat.set(n.entityId, n.name), walk(n.children ?? [])));
  walk((await gql(`query { site { categoryTree { entityId name children { entityId name children { entityId name children { entityId name } } } } } }`)).site.categoryTree);
  console.log(`French text for ${frById.size} of ${ids.length} products, ${frCat.size} category names`);
}
const chainFr = (id) => chain(id).length ? chainIds(id).reverse().map((c) => frCat.get(c)).filter(Boolean) : [];

// Completion phrases for the search box: the brand, each category name, and every run of 1 to 3 consecutive words of the product name,
// each weighted by how many products contain it, so common phrases ("agm battery") outrank rare ones (a model code).
const STOP = new Set(["the", "for", "and", "with", "from", "pack", "set", "of", "to", "in"]);
const words = (t) => t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOP.has(w));
const phrasesOf = (name, brand, paths) => {
  const out = new Set();
  if (brand) out.add(brand.toLowerCase());
  for (const c of paths.flat()) out.add(c.toLowerCase());
  const w = words(name);
  for (let i = 0; i < w.length; i++) for (let n = 1; n <= 3 && i + n <= w.length; n++) out.add(w.slice(i, i + n).join(" "));
  return [...out].filter((x) => x.length >= 2);
};
const phrases = products.map((p) => {
  const paths = p.categories.map(chain).filter((c) => c.length).map((c) => c.slice(1));
  return phrasesOf(p.name, brands.get(p.brand_id) ?? "", paths);
});
const df = new Map();
for (const list of phrases) for (const x of list) df.set(x, (df.get(x) ?? 0) + 1);

// the same for French (French stop words; accents kept, the completion field uses the standard analyzer)
const STOP_FR = new Set(["le", "la", "les", "de", "du", "des", "et", "pour", "avec", "en", "un", "une", "au", "aux", "sur", "par"]);
const wordsFr = (t) => t.toLowerCase().split(/[^a-z0-9\u00e0-\u00ff]+/).filter((w) => w.length >= 2 && !STOP_FR.has(w));
const phrasesFr = products.map((p) => {
  const f = frById.get(p.id);
  if (!f) return [];
  const out = new Set();
  const brand = brands.get(p.brand_id) ?? "";
  if (brand) out.add(brand.toLowerCase());
  for (const c of p.categories.flatMap(chainFr)) out.add(c.toLowerCase());
  const w = wordsFr(f.name);
  for (let i = 0; i < w.length; i++) for (let n = 1; n <= 3 && i + n <= w.length; n++) out.add(w.slice(i, i + n).join(" "));
  return [...out].filter((x) => x.length >= 2);
});
const dfFr = new Map();
for (const list of phrasesFr) for (const x of list) dfFr.set(x, (dfFr.get(x) ?? 0) + 1);

// the French fields of one product
const frFields = (p, idx) => {
  const f = frById.get(p.id);
  const paths = [...new Set(p.categories.map((id) => chainFr(id)).filter((c) => c.length).map((c) => c.join(" > ")))]; // chainFr already leaves out the root
  const specs = (f.customFields?.edges ?? []).map((e) => e.node).filter((x) => x.value);
  return {
    name_fr: f.name,
    description_fr: plain(f.plainTextDescription),
    category_paths_fr: paths,
    categories_fr: [...new Set(p.categories.flatMap(chainFr).filter((c, i, a) => a.indexOf(c) === i))],
    specs_text_fr: specs.map((x) => `${x.name} ${x.value}`).join(". "),
    complete_fr: phrasesFr[idx].map((x) => ({ input: x, weight: dfFr.get(x) })),
    // name, categories and specs together, folded and unstemmed: one place to match every word fuzzily (French typos)
    search_fr: [f.name, ...paths, specs.map((x) => `${x.name} ${x.value}`).join(" ")].join(". "),
  };
};

const docs = products.map((p, idx) => {
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
      // completion field: lets the search box finish what is being typed (prefix, typo-tolerant, ranked by weight)
      complete: phrases[idx].map((x) => ({ input: x, weight: df.get(x) })),
      ...(frById.get(p.id) ? frFields(p, idx) : {}),
    },
  };
});

// French analysis (only when French text is loaded): elisions (l'étiquette), stop words, accent folding (electrique = électrique) and a light stemmer.
// Analysis settings can only be given when an index is created, so a change here means a new index (load-index.mjs products_v2 ..., then swap-alias.mjs).
const FRENCH_ANALYSIS = {
  analysis: {
    filter: {
      fr_elision: { type: "elision", articles_case: true, articles: ["l", "m", "t", "qu", "n", "s", "j", "d", "c", "jusqu", "quoiqu", "lorsqu", "puisqu"] },
      fr_stop: { type: "stop", stopwords: "_french_" },
      fr_stem: { type: "stemmer", language: "light_french" },
    },
    analyzer: {
      fr_fold: { tokenizer: "standard", filter: ["lowercase", "fr_elision", "fr_stop", "asciifolding", "fr_stem"] },
      fold: { tokenizer: "standard", filter: ["lowercase", "asciifolding"] },
    },
  },
};

const mapping = {
  ...(FR ? { settings: FRENCH_ANALYSIS } : {}),
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
      // `standard` keeps digits ("12v 60ah"); the default completion analyzer would strip them
      complete: { type: "completion", analyzer: "standard", search_analyzer: "standard", preserve_separators: false },
      // French text (see the header). `fr_fold` stems and folds accents for matching; `raw` keeps the words as written so "did you mean" can suggest
      // real words; suggest and completion use `fold` (no stemming) so partial words match with or without accents.
      ...(FR
        ? {
            name_fr: { type: "text", analyzer: "fr_fold", copy_to: SEMANTIC ? ["semantic"] : undefined, fields: { keyword: { type: "keyword", ignore_above: 256 }, raw: { type: "text", analyzer: "standard" }, suggest: { type: "search_as_you_type", analyzer: "fold" } } },
            description_fr: { type: "text", analyzer: "fr_fold", copy_to: SEMANTIC ? ["semantic"] : undefined },
            category_paths_fr: { type: "text", analyzer: "fr_fold", copy_to: SEMANTIC ? ["semantic"] : undefined, fields: { keyword: { type: "keyword", ignore_above: 256 } } },
            categories_fr: { type: "keyword" },
            specs_text_fr: { type: "text", analyzer: "fr_fold" },
            complete_fr: { type: "completion", analyzer: "fold", search_analyzer: "fold", preserve_separators: false },
            search_fr: { type: "text", analyzer: "fold" },
          }
        : {}),
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
