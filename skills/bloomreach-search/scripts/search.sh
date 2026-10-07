#!/usr/bin/env bash
# Query the Bloomreach staging Search API (read-only). Run from the folder that holds .env.local (or set ENV_FILE).
# Usage: bash <skill>/scripts/search.sh "<query>" [rows]
set -euo pipefail
set -a; . "${ENV_FILE:-./.env.local}"; set +a

curl -s -G "https://staging-core.dxpapi.com/api/v1/core/" \
  --data-urlencode "account_id=$BR_SEARCH_ACCOUNT_ID" \
  --data-urlencode "auth_key=$BR_SEARCH_AUTH_KEY" \
  --data-urlencode "domain_key=$BR_SEARCH_DOMAIN_KEY" \
  --data-urlencode "request_type=search" --data-urlencode "search_type=keyword" \
  --data-urlencode "q=$1" --data-urlencode "rows=${2:-3}" \
  --data-urlencode "fl=pid,title,brand,price,thumb_image,sku,technology,voltage" \
  --data-urlencode "url=https://example.com" --data-urlencode "ref_url=https://example.com" \
  --data-urlencode "request_id=1" --data-urlencode "_br_uid_2=uid=1" |
python3 -I -c "
import json,sys
j=json.load(sys.stdin); r=j['response']
print(repr(sys.argv[1]),'->',r['numFound'],'results')
for d in r['docs']: print('  ',d.get('sku',''),'|',d.get('brand',''),'|',d.get('title','')[:55],'|',d.get('price',''))
if len(sys.argv)>2:
    print('  facets:',[(f['name'],len(f['value'])) for f in j['facet_counts']['facets']])
" "$1" ${3:-}
