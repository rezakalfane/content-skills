// Create an index from mapping.json and bulk-index docs.json into it. Writes ONLY to an index listed in ES_GUARD_INDEX.
// Usage (from the folder with .env.local, or set ENV_FILE):
//   node load-index.mjs <index> <mapping.json> <docs.json> [--recreate]
// docs.json is [{id, doc}]. Without --recreate an existing index is kept and documents are upserted by id.
import { readFileSync } from "node:fs";
import { es, guard, ensureIndex, bulkIndex } from "./lib.mjs";

const [index, mappingFile, docsFile] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!index || !mappingFile || !docsFile) throw new Error("usage: node load-index.mjs <index> <mapping.json> <docs.json> [--recreate]");
guard(index);

const mapping = JSON.parse(readFileSync(mappingFile, "utf8"));
const docs = JSON.parse(readFileSync(docsFile, "utf8"));
console.log(`index ${index}:`, await ensureIndex(index, mapping, process.argv.includes("--recreate")));

const r = await bulkIndex(index, docs);
console.log(`ok ${r.ok}, failed ${r.failed}`);
for (const e of r.errors.slice(0, 5)) console.log("  ", e.id, e.status, e.error);

await es("POST", `/${index}/_refresh`);
const c = await es("GET", `/${index}/_count`);
console.log(`count in ${index}: ${c.json.count} (expected ${docs.length})`);
if (r.failed || c.json.count !== docs.length) process.exit(1);
