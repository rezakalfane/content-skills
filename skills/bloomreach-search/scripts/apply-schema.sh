#!/usr/bin/env bash
# Apply the generated schema (system + custom attributes) to the guarded collection ONLY (default demo_rez). Keeps existing destinations.
# Run from the folder that holds .env.local (or set ENV_FILE). Writes go only to the collection named in BR_GUARD_COLLECTION (default demo_rez).
# Usage: bash <skill>/scripts/apply-schema.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
set -a; . "${ENV_FILE:-./.env.local}"; set +a
GUARD="${BR_GUARD_COLLECTION:-demo_rez}"

if [ "${BR_COLLECTION:-}" != "$GUARD" ]; then
  echo "Refusing: BR_COLLECTION is '${BR_COLLECTION:-}', expected '$GUARD'." >&2
  exit 1
fi

OUT="${OUT:-build}"
node "$HERE/build.mjs" "$OUT" >/dev/null
U="$BR_TARGET/api/cde/v1/workspaces/$BR_WORKSPACE_ID/item-collections/$GUARD/item-types/$BR_PRODUCT_TYPE/configurations/latest"
AUTH="$BR_KEY_ID:$BR_KEY_SECRET"

curl -sS -u "$AUTH" "$U" -o "$OUT/cur.json"
ETAG=$(python3 -I - <<EOF
import json
c=json.load(open("$OUT/cur.json"))["data"]
a=json.load(open("$OUT/attributes.json"))
json.dump({"schema":{"identifiers":c["schema"].get("identifiers",[]),"attributes":a},"destinations":c["destinations"]},open("$OUT/put.json","w"))
print(c["etag"])
EOF
)
curl -sS -X PUT -u "$AUTH" -H "Content-Type: application/json" -H "If-Match: $ETAG" \
  --data @"$OUT/put.json" "$U" -o "$OUT/put-result.json" -w "PUT schema -> http %{http_code}\n"
python3 -I -c "import json,collections;d=json.load(open('$OUT/put-result.json')).get('data');print(collections.Counter(a['family'] for a in d['schema']['attributes']), 'destinations:', d['destinations']) if d else print(open('$OUT/put-result.json').read()[:600])"
