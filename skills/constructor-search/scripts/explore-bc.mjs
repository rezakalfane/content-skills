// Read-only: summarize the BigCommerce channel catalog (fields, custom fields, categories, variants).
import { readFileSync } from "node:fs";
const envFile = process.argv[2];
for (const l of readFileSync(envFile, "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim(); }
const { BC_STORE_HASH: H, BC_ACCESS_TOKEN: T, BC_CHANNEL_ID: C } = process.env;
const bc = async (p) => { const r = await fetch(`https://api.bigcommerce.com/stores/${H}${p}`, { headers: { "X-Auth-Token": T, Accept: "application/json" } }); if (!r.ok) throw new Error(`${p} ${r.status}`); return r.json(); };
const rows = [];
for (let page = 1; ; page++) { const j = await bc(`/v3/catalog/products?limit=250&page=${page}&channel_id:in=${C}&include=images,custom_fields,variants`); rows.push(...j.data); if (page >= j.meta.pagination.total_pages) break; }
const vis = rows.filter((p) => p.is_visible);
console.log("products", rows.length, "visible", vis.length);
console.log("keys", Object.keys(vis[0]).join(","));
const cf = {}; for (const p of vis) for (const f of p.custom_fields) (cf[f.name] ??= new Set()).add(f.value);
for (const [k, v] of Object.entries(cf)) console.log("CF", k, v.size, [...v].slice(0, 6).join(" | "));
console.log("variants>1:", vis.filter((p) => p.variants.length > 1).length);
const trees = (await bc(`/v3/catalog/trees?channel_id:in=${C}`)).data; console.log("trees", trees.map((t) => t.id));
const cats = []; for (let page = 1; ; page++) { const j = await bc(`/v3/catalog/trees/categories?limit=250&page=${page}&tree_id:in=${trees.map((t) => t.id).join(",")}`); cats.push(...j.data); if (page >= j.meta.pagination.total_pages) break; }
console.log("categories", cats.length); for (const c of cats) console.log(" ", c.category_id, c.parent_id, c.name, c.url?.path);
const brands = new Set(); const bl = (await bc("/v3/catalog/brands?limit=250")).data; const bm = new Map(bl.map((b) => [b.id, b.name])); for (const p of vis) brands.add(bm.get(p.brand_id)); console.log("brands", [...brands].join(", "));
const p = vis[0]; console.log(JSON.stringify({ ...p, description: p.description?.slice(0, 120), images: p.images.slice(0, 1).map((i) => i.url_standard), variants: p.variants.slice(0, 1) }, null, 1).slice(0, 2500));
console.log("price range", Math.min(...vis.map((p) => +p.price)), Math.max(...vis.map((p) => +p.price)), "with sale", vis.filter((p) => +p.sale_price > 0).length, "inv tracked", vis.filter((p) => p.inventory_tracking !== "none").length);
