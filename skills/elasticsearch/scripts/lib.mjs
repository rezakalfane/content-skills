// Shared by the scripts: load .env.local, call Elasticsearch, guard writes, bulk in batches. Never prints ES_ADMIN_API_KEY.
import { readFileSync } from "node:fs";

for (const l of readFileSync(process.env.ENV_FILE ?? ".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !(m[1] in process.env && process.env[m[1]] !== "")) process.env[m[1]] = m[2].trim();
}
export const env = process.env;
export const ES_URL = (env.ES_URL ?? "").replace(/\/$/, "");
if (!ES_URL || !env.ES_ADMIN_API_KEY) throw new Error("ES_URL and ES_ADMIN_API_KEY must be set in .env.local");

/** Call Elasticsearch. `body` is an object (JSON) or a string (NDJSON). Returns {status, json}. */
export async function es(method, path, body) {
  const nd = typeof body === "string";
  const res = await fetch(`${ES_URL}${path}`, {
    method,
    headers: {
      Authorization: `ApiKey ${env.ES_ADMIN_API_KEY}`,
      ...(body === undefined ? {} : { "Content-Type": nd ? "application/x-ndjson" : "application/json" }),
    },
    body: body === undefined ? undefined : nd ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, json };
}

/** Writing scripts only touch the indices listed in ES_GUARD_INDEX (comma-separated; a trailing * matches a prefix, e.g. products_v*). */
export function guard(index) {
  const allowed = (env.ES_GUARD_INDEX ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = allowed.some((a) => a === index || (a.endsWith("*") && index.startsWith(a.slice(0, -1))));
  if (!ok) throw new Error(`Refusing: '${index}' is not in ES_GUARD_INDEX (${allowed.join(", ") || "empty"})`);
}

/** Index `docs` ([{id, doc}]) into `index` in batches. Returns {ok, failed, errors[]}. */
export async function bulkIndex(index, docs, batch = 50) {
  let ok = 0;
  const errors = [];
  for (let i = 0; i < docs.length; i += batch) {
    const part = docs.slice(i, i + batch);
    const nd = part.map((d) => JSON.stringify({ index: { _index: index, _id: d.id } }) + "\n" + JSON.stringify(d.doc)).join("\n") + "\n";
    let r;
    for (let attempt = 0; attempt < 5; attempt++) {
      r = await es("POST", "/_bulk", nd);
      if (r.status !== 429 && r.status !== 503) break;
      await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
    }
    if (r.status !== 200) throw new Error(`bulk ${r.status}: ${JSON.stringify(r.json).slice(0, 300)}`);
    for (const it of r.json.items) {
      const x = it.index;
      if (x.error) errors.push({ id: x._id, status: x.status, error: JSON.stringify(x.error).slice(0, 300) });
      else ok++;
    }
    process.stdout.write(`\r  indexed ${Math.min(i + batch, docs.length)}/${docs.length}`);
  }
  process.stdout.write("\n");
  return { ok, failed: errors.length, errors };
}

/** Create `index` with `mapping` ({mappings, settings?}). With recreate, deletes it first. */
export async function ensureIndex(index, mapping, recreate = false) {
  guard(index);
  const head = await es("HEAD", `/${index}`);
  if (head.status === 200 && recreate) {
    const del = await es("DELETE", `/${index}`);
    if (del.status !== 200) throw new Error(`delete ${index}: ${del.status}`);
  } else if (head.status === 200) {
    return "exists";
  }
  const put = await es("PUT", `/${index}`, mapping);
  if (put.status !== 200) throw new Error(`create ${index}: ${put.status} ${JSON.stringify(put.json).slice(0, 400)}`);
  return "created";
}
