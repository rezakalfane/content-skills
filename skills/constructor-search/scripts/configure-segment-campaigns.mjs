// Segment-targeted rules: a campaign applies only to visitors in a Constructor user segment (the `us` parameter the storefront sends).
// Idempotent: campaigns whose name starts with "seg:" are deleted and recreated.
// Usage: node scripts/constructor/configure-segment-campaigns.mjs [--dry-run]
import { readFileSync } from "node:fs";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
}
const TOKEN = process.env.CONSTRUCTOR_API_TOKEN;
const KEY = process.env.CONSTRUCTOR_INDEX_KEY;
const DRY = process.argv.includes("--dry-run");
if (!TOKEN || !KEY) throw new Error("CONSTRUCTOR_API_TOKEN and CONSTRUCTOR_INDEX_KEY must be set");

const call = async (method, path, body) => {
  if (DRY && method !== "GET") { console.log(method, path, JSON.stringify(body ?? "")); return { status: 0, json: {} }; }
  const r = await fetch(`https://ac.cnstrc.com${path}${path.includes("?") ? "&" : "?"}section=Products&key=${KEY}&c=cio-demo-loader`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${TOKEN}:`).toString("base64")}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: r.status, json };
};

// boost is capped at 10 by the API
const campaigns = [
  { name: "seg: garage battery start-stop", segment: "garage", queries: ["battery", "car battery"], boost: { start_stop: ["Yes"] } },
  { name: "seg: leisure battery AGM and gel", segment: "leisure", queries: ["battery"], boost: { technology: ["AGM", "Gel"] } },
];

const old = (await call("GET", "/v1/campaigns?num_results_per_page=100")).json.campaigns ?? [];
for (const c of old.filter((c) => c.name.startsWith("seg: "))) await call("DELETE", `/v1/campaigns/${c.id}`);
for (const c of campaigns) {
  const r = await call("POST", "/v1/campaigns", {
    name: c.name,
    refined_queries: c.queries.map((query) => ({ query })),
    request_tag_name: "user_segment",
    request_tag_value: c.segment,
    boost_rules: [{ request_tag_name: "user_segment", request_tag_value: c.segment, rule: { filters: c.boost, boost: 10 } }],
  });
  const ok = DRY || r.status === 201;
  console.log(`${ok ? "ok  " : "FAIL"} ${c.name} (${r.status}) ${ok ? "id " + (r.json.id ?? "") : JSON.stringify(r.json).slice(0, 300)}`);
  if (!ok) process.exitCode = 1;
}
