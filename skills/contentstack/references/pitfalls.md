# Pitfalls (each of these happened)

| Symptom | Cause | Fix |
|---|---|---|
| `api_key is not valid` | wrong region host | derive hosts from region (EU: `eu-api.contentstack.com`) |
| `insufficient permissions` creating delivery token | management token cannot | user creates it in the app |
| `Environment was not found` | token bound to another environment | use the matching token |
| Content change not visible on the live site | published only to `preview` | publish to `production` (approved) |
| Localized publish fails | missing top-level `locale` | add `"locale"` to the body |
| PUT on a localized entry fails | asset objects sent instead of UIDs | normalize file fields to UIDs |
| Field UID rejected | reserved name | rename (`recommended_bc_products`) |
| Cannot create content type | plan cap (10 on free) | agree with the user which to drop |
| Publish refused: publish rule | entry not Approved (per locale) | set stage, publish again |
| Rule creation 404/422 | endpoint `publishing_rules`; `$all` invalid; user approver not a member | explicit content types, role UID |
| `_workflow` missing | not requested | `include_workflow=true` |
| Moving an entry out of Approved denied | stage ACL Admin-only | do it in the app as Admin |
| Updated image not shown | seeder reused asset by filename | replace asset in place |
| Duplicate React keys in preview | published + draft both returned | de-duplicate by uid |
| Server→Client function prop error | functions cannot cross the boundary | pass a string template/data |
| `.env.example` not committed | `.env*` in gitignore | add `!.env.example` |
| Staging not rebuilding | same SHA already built | empty commit in the sync Action |
| Staging asks for login | Vercel SSO protection on | disable for previews |
| Live Preview 404 | base URL missing for a locale | set per-locale base URLs |
