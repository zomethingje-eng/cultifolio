# Round 82, agent O: operations, security and the service worker

Branch `r82` in `/tmp/claude-0/rev82/O/`, four commits on `r82base` (cc0122a, c16bd4f, 1b93122, 31d42bb). Every change is to the app (the Worker and the service worker), its tests and its docs. **All of it is safe to deliver mid-fill, any day between fill days**, and reaches the site with `npm run deploy`. The fill and section (d) run none of it. `--index` reads only the care-group table, and that change alters no page. Nothing touches `scripts/corpus-plan-full.txt`, `package*.json`, `wrangler.jsonc` or `static/s/`.

## Done

**8, the cache half: what the service worker keeps.** On base, activation already dropped every build cache older than the newest other one. But it kept that one until the next deploy reached the device, which is how the reviewer found a cache from 2026-10-04. Now:
- The previous build is kept only while a tab that was open at the takeover is still open. The worker records those tabs' client ids in its own cache, and the first request after the last of them has gone drops the build (it looks at most every 10 s). With no tab open at activation, it is dropped at once.
- Species pages (`/species/`, `/s/`, page and data) are capped at 200 entries. Corpus answers are capped at 600 entries (256 hash groups live, so sheets plus entries make about 320). In both, the oldest written goes first. A page read again is written again, so it moves to the end.
- A fault in this housekeeping never breaks a fetch.

Files: `src/lib/core/sw-keep.ts` (new, pure), `src/service-worker.ts`. Tests: `tests/unit/r82o-sw-keep.test.ts`, which fails on base because the module is missing. `tests/e2e/r82o-worker.spec.ts`, which runs the real worker with two fake old builds: on base the run failed because `cultifolio-1000000000001` was still there after the reload. I updated `r67p-takeover.test.ts`'s stub to add `clients.matchAll`.

**9: a /24 window.** `limited()` now also counts an IPv4 address's /24, at `NET_FACTOR` (4×), for `index`, `sync` and `syncobj`, using the existing `upstreamNetwork`. Other buckets still count an IPv6 /48 only. File: `src/lib/server/sync.ts` (`windowNetwork`). Test: `r82o-limits.test.ts` 1. On base, 30 of 30 index requests from one /24 passed; now 24 pass.

**30: NUL bytes.** The eight raw NULs in `src/lib/core/log.ts` are now `\0` escapes. I proved the code computes the same thing (`O-s/nulproof.mjs`, output in `O-s/nulproof.out`):
- esbuild's output is byte-identical (9,277 B, no NUL in it);
- all 247 string literal values are identical, 9 of them holding a NUL.

Test: `r82o-source-bytes.test.ts`. On base it failed because log.ts held 8 NULs. I re-recorded `fold-rules.test.ts`'s hash under FOLD_RULES 8, as that test asks for a source change that changes no fold.

**31: the vault GET.** `GET /api/sync/vault` is removed; nothing in src or its history called it. It now gets the framework's 405. The POST answer is `no-store`. `r61s-recount.test.ts` now goes through POST. Test: `r82o-limits` 2. On base the route exported GET.

**32: /compare limited.** Every render of `/compare`, its data included, is counted under `render` (1,200 per 10 min). I chose a limit over a cache, because a cache key would be every combination of slugs. File: `src/hooks.server.ts`. Test: `r82o-limits` 3. On base the 1,201st render passed.

**33: cookies and the CSP.**
- `cultifolio.units` and `cultifolio.hemi` carry `Secure` over HTTPS (`src/lib/ui/cookie.ts`, `units.svelte.ts`, `site.svelte.ts`). They do not on plain HTTP: the local servers use it, and WebKit does not keep Secure cookies there.
- The CSP has `object-src 'none'` (`svelte.config.js`).
- **HSTS `includeSubDomains` is left alone:** it would bind every cultifolio.com subdomain to HTTPS for a year, with no way back, and only the owner knows they all serve HTTPS.
- Tests: `r82o-headers.test.ts` (on base the file fails to load and the CSP check fails) and `tests/e2e/r82o-csp.spec.ts`. The spec loads 16 page kinds on desktop and phone with no refusal, and checks the header and the prerendered meta. On base, csp 2 failed (no object-src).
- I changed `r70p-about-seams.test.ts` to expect `; secure`.

**34: SYNC_OPEN.** The comments are now true in the vault route, `app.d.ts` and the `entitlement` type: SYNC_OPEN decides only what a new vault is made with, and nothing writes `'licensed'`. The false line is in `wrangler.jsonc`, which I may not change; the owner's replacement line is below. Test: `r82o-headers` 4.

**35: Peperomia graveolens.** It moves from `genus.arid` to `species` (arid). I also removed a duplicate Maranta. Test: `r82o-arch-tables.test.ts`: each genus is in one list, once; genus lists hold single words; no `none` genus is listed. On base: 1, 2 and 3 failed. No page changes: Kew's file gives P. graveolens no lifeform, so it had no group before and has none now.

**About pages:**
- /about/how: the cookies are "sent over HTTPS only"; the rate-counter sentence adds the /24 for the index and sync.
- /about/formats: the /24 sentence in the sync limits.

**DEPLOY.md:** I added `### Round eighty-two: operations, security and the service worker (agent O)`.

## Repairs for the live site

None. The app applies all of it.

## Needs

None from other agents.

## For the owner's PC

- In `wrangler.jsonc`, replace line 18 with:
  `// SYNC_OPEN decides what a NEW vault is made with: exactly "1" and it syncs; unset or anything else, and it is made but every request with its token is refused with 402. Vaults made before keep syncing.`
- Run `r82o-worker` and `r82o-csp` in WebKit and Firefox (`node scripts/predeploy.mjs --tier=app --browsers=all`). They make no failing requests, block the worker where pages are read, and use no Chromium timing.
- After the deploy, the three checks in DEPLOY.md: the CSP header shows `object-src 'none'`, the vault GET returns 405, and the units cookie is Secure.

## Measured

- **Live CSP check** (288 of my 300 requests): 6 live pages under the r82 policy with the service worker blocked had 0 refusals (front page, Sempervivum tectorum, Echeveria elegans, Compare, /about, /about/how). The request budget ran out before the other 8. I fetched those as HTML: none holds `<object>`, `<embed>` or `<applet>`.
- **Locally:** the 16 page kinds had 0 refusals. The offline, worker, first-visit, Firefox-path and smoke-2/3 specs: 108 passed, then 14 passed after the last change.
- **Unit suite:** 4,573 passed, 36 failed. 33 of the failures were in `r70b2-follow-42` (32, "no fixture: api.gbif.org") and `short-path` (1, a timeout), and those 33 fail on r82base too. The other 3 were mine and are fixed.
- **Types:** tsc and svelte-check are clean.

## Not done, with why

- The page-weight half of 8 is round 83's.
- Live checks for the collection's pages, Settings and /about/formats were done by HTML only, because the request budget was spent.
