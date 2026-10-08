// Create an index from mapping.json and bulk-index docs.json into it. Writes ONLY to an index listed in ES_GUARD_INDEX.
// Usage (from the folder with .env.local, or set ENV_FILE):
//   node load-index.mjs <index> <mapping.json> <docs.json> [--recreate]
// docs.json is [{id, doc}]. Without --recreate an existing index is kept and documents are upserted by id.
// --update-mapping adds the mapping's new fields to an existing index first (PUT _mapping; existing fields cannot change), so a new
// field (for example the completion field) can be added and filled without deleting the index.
import { readFileSync } from "node:fs";
import { es, guard, ensureIndex, bulkIndex } from "./lib.mjs";

const [index, mappingFile, docsFile] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!index || !mappingFile || !docsFile) throw new Error("usage: node load-index.mjs <index> <mapping.json> <docs.json> [--recreate]");
guard(index);

const mapping = JSON.parse(readFileSync(mappingFile, "utf8"));
const docs = JSON.parse(readFileSync(docsFile, "utf8"));
console.log(`index ${index}:`, await ensureIndex(index, mapping, process.argv.includes("--recreate")));
if (process.argv.includes("--update-mapping")) {
  // only the fields the index does not have yet (the existing ones cannot change)
  const cur = (await es("GET", `/${index}/_mapping`)).json?.[index]?.mappings?.properties ?? {};
  const added = Object.fromEntries(Object.entries(mapping.mappings.properties).filter(([k]) => !(k in cur)));
  if (!Object.keys(added).length) console.log("update mapping: nothing new");
  else {
    const put = await es("PUT", `/${index}/_mapping`, { properties: added });
    console.log(`update mapping (${Object.keys(added).join(", ")}): ${put.status}`, put.status === 200 ? "ok" : JSON.stringify(put.json).slice(0, 300));
    if (put.status !== 200) process.exit(1);
  }
}

const r = await bulkIndex(index, docs);
console.log(`ok ${r.ok}, failed ${r.failed}`);
for (const e of r.errors.slice(0, 5)) console.log("  ", e.id, e.status, e.error);

await es("POST", `/${index}/_refresh`);
const c = await es("GET", `/${index}/_count`);
console.log(`count in ${index}: ${c.json.count} (expected ${docs.length})`);
if (r.failed || c.json.count !== docs.length) process.exit(1);
