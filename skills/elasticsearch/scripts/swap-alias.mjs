// Point an alias at a new index in ONE atomic step (zero downtime): the new index becomes what `<alias>` reads and writes.
// If `<alias>` is currently a real index (the first time), that index is removed in the same step, so the name keeps working for readers.
// Later reloads: build a new index (products_v3), then swap again; the previous index is removed unless --keep.
// Usage (from the folder with .env.local):  node swap-alias.mjs <alias> <newIndex> [--keep] [--dry]
import { es, guard } from "./lib.mjs";

const [alias, next] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!alias || !next) throw new Error("usage: node swap-alias.mjs <alias> <newIndex> [--keep] [--dry]");
guard(alias);
guard(next);

const keep = process.argv.includes("--keep");
const head = await es("HEAD", `/${alias}`);
if (head.status !== 200) throw new Error(`'${alias}' does not exist (${head.status})`);
const info = (await es("GET", `/_alias/${alias}`)).json;
const isAlias = info && !info.error && Object.values(info).some((v) => v.aliases?.[alias]);
const actions = [];
if (isAlias) {
  for (const idx of Object.keys(info)) if (idx !== next) actions.push(keep ? { remove: { index: idx, alias } } : { remove_index: { index: idx } });
} else actions.push({ remove_index: { index: alias } }); // `alias` is a real index today
actions.push({ add: { index: next, alias } });
console.log("actions:", JSON.stringify(actions));
const n = await es("GET", `/${next}/_count`);
console.log(`new index ${next}: ${n.json.count} documents`);
if (process.argv.includes("--dry")) process.exit(0);
const r = await es("POST", "/_aliases", { actions });
console.log("swap:", r.status, JSON.stringify(r.json).slice(0, 200));
if (r.status !== 200) process.exit(1);
console.log(`${alias} now reads ${next}: ${(await es("GET", `/${alias}/_count`)).json.count} documents`);
