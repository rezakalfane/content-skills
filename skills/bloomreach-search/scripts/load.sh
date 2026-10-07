#!/usr/bin/env bash
# Load the BigCommerce catalog into the Bloomreach Data Hub collection demo_rez ONLY (item type $BR_PRODUCT_TYPE, update_mode=full).
# Run from the folder that holds .env.local (or set ENV_FILE). Writes go only to the collection named in BR_GUARD_COLLECTION (default demo_rez).
# Usage: bash <skill>/scripts/load.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
set -a; . "${ENV_FILE:-./.env.local}"; set +a
GUARD="${BR_GUARD_COLLECTION:-demo_rez}"

# Safety guard: never write to anything but the guarded collection (e.g. never demo_glen_products).
if [ "${BR_COLLECTION:-}" != "$GUARD" ]; then
  echo "Refusing: BR_COLLECTION is '${BR_COLLECTION:-}', expected '$GUARD'." >&2
  exit 1
fi

OUT="${OUT:-build}"
node "$HERE/build.mjs" "$OUT"

W="$BR_TARGET/api/cde/v1/workspaces/$BR_WORKSPACE_ID"
C="$W/item-collections/$GUARD/item-types/$BR_PRODUCT_TYPE"
AUTH="$BR_KEY_ID:$BR_KEY_SECRET"

echo "Loading $(wc -l < $OUT/records.jsonl | tr -d ' ') records into $GUARD (update_mode=full)..."
curl -sS -X POST -u "$AUTH" -H "Content-Type: application/json-patch+jsonlines" \
  --data-binary @"$OUT/records.jsonl" \
  "$C/records?update_mode=full&on_success_trigger=update-items&on_success_trigger=update-destination-items" -o "$OUT/ingest.json"

JOB=$(python3 -I -c "import json;j=json.load(open('$OUT/ingest.json'));d=j.get('data',j);print(d.get('id') or d.get('job_id') or '')")
if [ -z "$JOB" ]; then echo "No job id returned:"; head -c 600 "$OUT/ingest.json"; exit 1; fi
echo "Job: $JOB"

for _ in $(seq 1 24); do
  sleep 5
  curl -sS -u "$AUTH" "$W/jobs/$JOB" -o "$OUT/job.json"
  STATE=$(python3 -I -c "import json;print(json.load(open('$OUT/job.json')).get('data',{}).get('state',''))")
  echo "state: $STATE"
  case "$STATE" in success|SUCCESS|fail|FAILED|failed) break;; esac
done
head -c 1200 "$OUT/job.json"; echo
