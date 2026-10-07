// Load the site's FAQ, buying guides and blog posts (English and French) into the guarded Data Hub collection (BR_GUARD_COLLECTION, default demo_rez), once.
// Reads the documents from the storefront's export route (it needs the Amplience loaders, which run inside Next.js), then for each of
// the item types faq, buying_guide, blog_post: sets the schema and replaces the records (update_mode=full).
// Never touches the `product` type or any other collection.
//
// Run from the folder with .env.local (or set ENV_FILE); the storefront must be running at CONTENT_EXPORT_URL with CONTENT_EXPORT_TOKEN.
//   node load-content.mjs --dry     # fetch and count only
//   node load-content.mjs           # write the schema and the records
import { readFileSync } from "node:fs";

for (const l of readFileSync(process.env.ENV_FILE ?? ".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const { BR_TARGET, BR_WORKSPACE_ID, BR_KEY_ID, BR_KEY_SECRET, BR_COLLECTION, CONTENT_EXPORT_TOKEN } = process.env;
const EXPORT_URL = process.env.CONTENT_EXPORT_URL ?? "http://localhost:3300";
const DRY = process.argv.includes("--dry");
// --only faq,blog_post limits the run to some types
const ONLY = (process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? "").split(",").filter(Boolean);

const GUARD = process.env.BR_GUARD_COLLECTION ?? "demo_rez";
if (BR_COLLECTION !== GUARD) throw new Error(`Refusing: BR_COLLECTION is '${BR_COLLECTION}', expected '${GUARD}'`);
if (!CONTENT_EXPORT_TOKEN) throw new Error("CONTENT_EXPORT_TOKEN is not set");

const COMMON = [["title", "String"], ["description", "String"], ["text", "String"], ["url", "String"], ["image", "String"], ["locale", "String"]];
const TYPES = {
  faq: [...COMMON, ["topic", "String"], ["sort_order", "Integer"], ["featured", "Boolean"]],
  buying_guide: [...COMMON, ["audience", "String"], ["read_minutes", "Integer"], ["steps", "List.String"], ["checklist", "List.String"], ["recommended_skus", "List.String"]],
  blog_post: [...COMMON, ["date", "String"], ["read_time", "Integer"], ["authors", "List.String"]],
};

const auth = "Basic " + Buffer.from(`${BR_KEY_ID}:${BR_KEY_SECRET}`).toString("base64");
const W = `${BR_TARGET}/api/cde/v1/workspaces/${BR_WORKSPACE_ID}`;
const C = `${W}/item-collections/${GUARD}/item-types`;
const dh = async (url, init = {}) => {
  const res = await fetch(url, { ...init, headers: { Authorization: auth, ...init.headers } });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, json };
};

// 1. the documents, both languages
const docs = [];
for (const locale of ["en", "fr"]) {
  const res = await fetch(`${EXPORT_URL}/api/content/export?locale=${locale}`, { headers: { "x-export-token": CONTENT_EXPORT_TOKEN } });
  if (!res.ok) throw new Error(`export ${locale} -> ${res.status} (is the storefront running at ${EXPORT_URL} with CONTENT_EXPORT_TOKEN?)`);
  docs.push(...(await res.json()).documents);
}
const byType = Object.fromEntries(Object.keys(TYPES).map((t) => [t, docs.filter((d) => d.type === t)]));
console.log("documents:", Object.fromEntries(Object.entries(byType).map(([t, d]) => [t, d.length])));
const ids = new Set(docs.map((d) => d.type + d.id));
if (ids.size !== docs.length) throw new Error("duplicate document ids");
if (DRY) {
  console.log("sample:", JSON.stringify(byType.faq[0], null, 1).slice(0, 600));
  process.exit(0);
}

// 2. schema and records, type by type
for (const [type, attrs] of Object.entries(TYPES)) {
  if (ONLY.length && !ONLY.includes(type)) continue;
  const cur = await dh(`${C}/${type}/configurations/latest`);
  if (cur.status !== 200) throw new Error(`${type}: cannot read the configuration (${cur.status}) ${JSON.stringify(cur.json).slice(0, 200)}`);
  const body = {
    schema: {
      identifiers: cur.json.data.schema.identifiers ?? [],
      attributes: attrs.map(([name, data_type]) => ({
        name, item_type: type, family: "main", level: "parent", data_type,
        source_mapping: { mapping_type: "json_field", source_value: name },
      })),
    },
    destinations: cur.json.data.destinations,
  };
  const put = await dh(`${C}/${type}/configurations/latest`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "If-Match": cur.json.data.etag },
    body: JSON.stringify(body),
  });
  console.log(`${type}: schema ${put.status}`, put.status === 200 ? `(${attrs.length} attributes)` : JSON.stringify(put.json).slice(0, 400));
  if (put.status !== 200) process.exit(1);

  const lines = byType[type].map((d) => JSON.stringify({ op: "add", path: `/${d.id}`, value: { fields: d.fields } })).join("\n") + "\n";
  // Data Hub limits record updates per job type: wait as long as it asks and try again.
  let post;
  for (let attempt = 0; attempt < 5; attempt++) {
    post = await dh(`${C}/${type}/records?update_mode=full&on_success_trigger=update-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json-patch+jsonlines" },
      body: lines,
    });
    if (post.status !== 429) break;
    const wait = (post.json.context?.retry_after_seconds ?? 30) + 2;
    console.log(`${type}: rate limited, waiting ${wait}s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  const job = post.json.data?.id ?? post.json.id;
  console.log(`${type}: records ${post.status}, job ${job ?? JSON.stringify(post.json).slice(0, 300)}`);
  if (!job) process.exit(1);
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const j = await dh(`${W}/jobs/${job}`);
    const state = j.json.data?.state;
    if (["success", "fail", "failed"].includes(String(state).toLowerCase())) { console.log(`${type}: job ${state}`); break; }
  }
}
