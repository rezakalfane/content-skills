// Build the Elasticsearch mapping + documents for the Amplience content (FAQ, buying guides, blog posts) in all locales.
// Reads the storefront's /api/content/export route (it needs the Amplience loaders, which run inside Next.js); writes files only.
// Usage (from the folder with .env.local, or set ENV_FILE):  node build-content.mjs <outDir> [en,fr]
// Writes <outDir>/content-mapping.json and <outDir>/content.json ([{id, doc}] for load-index.mjs).
// Needs CONTENT_EXPORT_URL (default http://localhost:3300) and CONTENT_EXPORT_TOKEN; the storefront must be running.
// ES_SEMANTIC=false drops the semantic_text field.
import { writeFileSync, mkdirSync } from "node:fs";
import { env } from "./lib.mjs";

const out = process.argv[2];
if (!out) throw new Error("usage: node build-content.mjs <outDir> [en,fr]");
mkdirSync(out, { recursive: true });
const locales = (process.argv[3] ?? "en,fr").split(",");
const SEMANTIC = env.ES_SEMANTIC !== "false";
const base = env.CONTENT_EXPORT_URL || "http://localhost:3300";
if (!env.CONTENT_EXPORT_TOKEN) throw new Error("CONTENT_EXPORT_TOKEN is not set");

const documents = [];
for (const locale of locales) {
  const res = await fetch(`${base}/api/content/export?locale=${locale}`, { headers: { "x-export-token": env.CONTENT_EXPORT_TOKEN } });
  if (!res.ok) throw new Error(`export ${locale} -> ${res.status} (is the storefront running at ${base} with CONTENT_EXPORT_TOKEN?)`);
  documents.push(...(await res.json()).documents);
}

// one flat document per item; fields that only some types have are simply absent on the others
const docs = documents.map((d) => ({ id: d.id, doc: { content_type: d.type, ...d.fields } }));
if (new Set(docs.map((d) => d.id)).size !== docs.length) throw new Error("duplicate document ids");

const sem = SEMANTIC ? { copy_to: ["semantic"] } : {};
const mapping = {
  mappings: {
    properties: {
      content_type: { type: "keyword" },
      locale: { type: "keyword" },
      title: { type: "text", ...sem, fields: { suggest: { type: "search_as_you_type" } } },
      description: { type: "text", ...sem },
      text: { type: "text", ...sem },
      url: { type: "keyword", index: false },
      image: { type: "keyword", index: false },
      topic: { type: "keyword" },
      sort_order: { type: "integer" },
      featured: { type: "boolean" },
      audience: { type: "keyword" },
      read_minutes: { type: "integer" },
      read_time: { type: "integer" },
      steps: { type: "text" },
      checklist: { type: "text" },
      recommended_skus: { type: "keyword" },
      date: { type: "date", ignore_malformed: true },
      authors: { type: "keyword" },
      ...(SEMANTIC ? { semantic: { type: "semantic_text" } } : {}),
    },
  },
};

writeFileSync(`${out}/content-mapping.json`, JSON.stringify(mapping, null, 2));
writeFileSync(`${out}/content.json`, JSON.stringify(docs));
const counts = {};
for (const d of docs) counts[`${d.doc.locale}/${d.doc.content_type}`] = (counts[`${d.doc.locale}/${d.doc.content_type}`] ?? 0) + 1;
console.log(`${docs.length} documents`, counts);
