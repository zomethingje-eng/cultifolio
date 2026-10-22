# Round eighty, agent O: operations and the about pages' general sentences

Branch `r80f` in `/tmp/claude-0/rev80f/O/`, 8 commits on tag `r80f` (`5fb1740` to the DEPLOY commit, the last). Scratch `/tmp/claude-0/rev80f/O-s/` (notes, timings, the simulation `sim/sim.mjs`, GBIF's answers in `gbif/`). Whole unit suite once at the end: 471 files passed and 1 skipped; 4,332 tests passed and 10 skipped, in 776 s with the machine's load average near 7. `tsc --noEmit -p .`: 0 errors. `svelte-check --threshold error`: 1,299 files, 0 errors, 0 warnings. Browser specs `r63c-fallbacks`, `r67h-offline` and `r62s-server` on Chromium and phone: 11 passed, strict.

## Done

**1. The build copies the corpus (review C, the owner's PC).** The app's own files moved with `git mv` from `static/` to `static/app/`: the icons, the maps, `og.png`, `manifest.webmanifest` and `.assetsignore`. `svelte.config.js` sets `kit.files.assets: 'static/app'`. The corpus stays in `static/s/v3`, where every script writes it, outside the copied folder. The build still answers `/og.png`, `/favicon.svg`, `/maps/…` and `/manifest.webmanifest` at the same addresses (checked on the e2e server). `.assetsignore` is still copied and still keeps `s/` out of the deploy.

`vite dev` no longer served the corpus, so two small additions bring it back:
- `vite.config.ts` gets `corpusOnDisk()`, a dev-only middleware (`apply: 'serve'`) that serves `static/s/` at `/s/`. It is read-only and refuses traversal (403 or next). The watcher now ignores `static/s/**`.
- `src/hooks.server.ts`'s `handleFetch` sends the server's own `/s/` requests to the network under `import.meta.env.DEV` only. Without this, SvelteKit would route them to the app as 404s.

Checked under `vite dev` with the corpus on disk: `/s/v3/manifest.json` 200, `/s/v3/index.json` 200 (5.8 MB), `/s/../package.json` 403, and `/api/corpus` read the files on disk.

Paths updated in `scripts/dev/og.mjs` and `og.html`, `src/lib/ui/ref/head.ts`, `tests/unit/r74-growers` and `r70p-about-seams`.

Test: `tests/unit/r80o-build-corpus.test.ts`. All 4 tests fail on `r80f`: `files.assets` is unset, `static/app` is missing, `corpusOnDisk` is not exported, and `/s/` goes to the app's own fetch.

Safe mid-fill: no fill code is touched. Pull between two runs.

**2. The sitemap index (review C 2).**
- `/sitemap.xml` is now kept `public, max-age=300`, where it was a day.
- It names its files `/sitemap-<corpus id>-<n>.xml`. These are new addresses with every corpus, and they are kept a day.
- A bare `/sitemap-<n>.xml`, or another corpus's id, gets the current corpus's file, kept five minutes.
- The fixture's corpus id is not fit for an address, so it keeps the bare names (the e2e test of `/sitemap-1.xml` passes).
- `scripts/live-check.mjs` reads whichever first file the index names, so it works with either Worker.

Files: `src/lib/server/sitemap.ts`, both sitemap routes. Test: `tests/unit/r80o-sitemap.test.ts`, all 4 fail on `r80f`.

Safe mid-fill (Worker only). One caution: the PC's plan step `live-check` uses the PC's `live-check.mjs`. If the PC kept the old one under the new Worker, its `/sitemap-1\.xml/` check would fail. The deploy is made from the PC's checkout, so pull and deploy together.

**3. About-page sentences (review C 3, 4, 5; review D).**
- **Hash groups.** Both pages and the README now give the rule, not a count. The count is a power of two from 32, the smallest that keeps a bucket at 320 or fewer. Past 5,120 species, no bucket holds fewer than about 160. `/api/corpus` announces the count. The numbers are held to `BUCKETS`, `PER_BUCKET` and `bucketsFor` in `formats-doc.test.ts` (rewritten) and `r80o-about.test.ts`. `bucketsFor(48,361)` is 256, about 189 a group.
- **404 and old-name redirect.** The edge keeps neither. The adapter's worker caches only statuses below 400, and its worktop helper keeps 200, 203, 204, 300, 301, 404, 405, 410, 414 and 501. Both caching passages of `/about/how` now say these answers are made anew each time, from the server's day-old old-name check, and that the browser keeps the 404 five minutes and the 302 a day. The sitemap's lifetimes there are updated. `r69p-about-seams.test.ts` asserted the old sentence; it now asserts the new ones and the adapter's two rules. DEPLOY lines 115 and 768 are corrected.
- **NEL.** This is a Cloudflare zone setting. The headers are added after the Worker answers, so the code cannot remove them. `/about/how` now names `Report-To`/`NEL` and `a.nel.cloudflare.com`, says what a Chromium browser reports, and says the setting is the owner's to turn off. Cloudflare's docs: dashboard toggle, or `PATCH /zones/{zone_id}/settings/nel`, available on all plans. The live check now prints a note saying whether the NEL header is present. The test checks that no code or `_headers` sets either header.
- **Keyless counts.** The live index (one `/api/index` request) has 2,335 pages without a GBIF key: 920 `pending`, 1,145 `ok` and 270 `none`. `src/lib/core/no-gbif.ts` now gives them beside its dated 2026-10-19 figures. I left `REVIEW-ROUND-79.md` and the round-79 walk sections as their round's record. My DEPLOY section says the counts since. No about page states the count.

Test: `tests/unit/r80o-about.test.ts`, 6 tests; the five about the pages fail on `r80f`. Deploy only; safe.

**4. The sync fallback race (review C 6).** Without the counter object, removal A wrote its receipt. Removal B then read the receipt, found the bytes still there, took them for a removal cut off, and also took them off. Now every receipt records when it was written (`w`). Unheld, a receipt younger than `RECEIPT_HELD_MS` (60 s, equal to the counter's `HOLD_MS`, tested) is left to its writer, and the second removal answers `PhotoBusy`. An older receipt is a cut-off removal and is finished as before. The held path is unchanged. Files: `src/lib/server/sync.ts` (`withHold` passes `held`), `src/lib/server/photogen.ts`.

Test: `tests/unit/r80o-fallback-removal.test.ts` stages the order, stopping A at its delete. On `r80f` the second removal answers `true` and the total is short. `r63s-concurrent-deletes` passed 12 of 12 runs under a CPU hog, and passed in the loaded full suite. Deploy only; safe.

**5. Plan-file restart (review C 1, V's fix).** I re-ran review C's simulation (`O-s/sim/sim.mjs`) with the PC's state: the 24918e4 plan, steps 1 to 10 done.

| Code | Plan | Result |
| --- | --- | --- |
| 24918e4 | this round's | starts again at step 1 (backup) |
| this round's | this round's, with an appended comment, or the PC's | carries on at step 11, `--fill inat` |

V's fix holds, provided code and plan arrive together. A run reads the plan once, at its start, and judges it with the code on disk.

I also found and fixed a second restart. Running any other plan (a repair plan between fill days) renamed the full plan's record, and the next full run started at step 1. Now:
- An unfinished run of another plan is kept as `corpus-step.plan-<name>.json` (gitignored) and taken up again where it stopped when that plan next runs.
- With no `--plan`, a kept unfinished run is carried on, never the default plan.
- A plan path with backslashes is the same plan.

`scripts/corpus-step.mjs`; `tests/unit/r80o-plan-switch.test.ts` (2 of its 3 fail on `r80f`; the backslash case passes there and guards against a regression). The existing corpus-step tests pass (57). Safe mid-fill: with the same plan file the new branch does nothing.

**6. GBIF's SQL (owner's item).** `taxonFilter()` in `scripts/gbif-request-lib.ts` writes `EXISTS(occurrence.gbif_classification.taxonkeys, taxonkey -> taxonkey IN ('…'))`, and `sqlQuery` uses it. `bulk-fetch.ts` needed no change (it calls `sqlRequest`). GBIF's validate endpoint, which needs no account, accepted it on 2026-10-22: HTTP 201 for 2 keys, and HTTP 201 in 2.5 s for 46,007 keys (508,094 characters). It is recorded in `scripts/dev/scale/results/r80o-gbif-validate.txt`. Tests: `r79d-gbif-requests` updated; `r80o-gbif-sql.test.ts` added (fails on `r80f`). DEPLOY's SQL block is updated. Safe: no step of the plan runs it.

**7. The bucket.** This is in DEPLOY, "Round eighty: operations".
- **The prune** clears only `s/v3/p/` files named by none of the live manifest, the folder's `manifest.json` and `manifest.prev.json` (and their search directories), and uploaded more than a day ago. It never touches dossiers, genus records, `s/v2/` or vaults. It runs before the plan's record is read.
- **When to prune:** after the plan's last step and a day after the fill's upload. Before then, round 78's products are still named by `manifest.prev.json`, so a prune clears little.
- **The 11 unlisted dossiers** are answered 404 and are never pruned. They take about 0.4 MB. DEPLOY gives an optional `rclone delete --files-from-raw` from `bucket-unlisted.txt`, dry run first. By GBIF key, 7 of round 77's 8,947 pages are no live page.
- **The `s/v2` purge,** on or after 26 October, is safe: the Worker reads `s/v2/manifest.json` only to refuse when there is no v3 corpus.
- **Storage from file sizes:**

| Part | Size | Basis |
| --- | --- | --- |
| `s/v2` | 0.65 GB, 24,187 files | measured on round 77's corpus |
| round 78's products | about 0.35 GB | round 77's `p/`: 13,915 files, 0.354 GB |
| full corpus | 4.4 GB | Z's build to the list's size; live `index.json` 37.4 MB |
| fill's new products | about 0.25 GB | Z's sizes |
| **Before prune and purge** | **about 5.7 GB** | |
| **After both** | **about 4.7 GB** | plus vaults and the dossiers' growth |

All of it is inside the free 10 GB-month. The fill's upload is about 50,000 Class A operations.

## Repairs for the live site

None. No change of mine alters a species page's content. The about pages change by deploy.

## Needs

- **A (or whoever writes the repair plan):** with the PC's current code, running `--plan scripts/corpus-plan-r80-repair.txt` mid-fill restarts the full plan from step 1. Repairs must run only after this round's `corpus-step.mjs` is on the PC (by `git pull`), or after the full plan's last step. Your DEPLOY lines should say so.
- **U and anyone adding app static files:** they now go in `static/app/`, not `static/`.
- **Whoever merges `/about/how`:** my edits are in the long privacy `<li>`/`<p>` at lines 92 and 97: the hash-group parenthesis, two caching passages and one NEL sentence after "Those pages ask no outside host…". In formats, only the `#privacy` paragraph.

## For the owner's PC

1. **Delivery mid-fill.** After a day's run has stopped, and never while `corpus-step` runs:
   - `git pull`;
   - `node scripts\corpus-step.mjs --plan scripts\corpus-plan-full.txt --status`. Lines 1 to 10 should say `done` and line 11 `unfinished` or `to do`. If every line says `to do`, copy the newest `corpus-step.<date>.<n>.json` back over `corpus-step.json` and paste the output back;
   - then the usual command.

   Do not copy files one by one.
2. The first build after the pull clears the old 9 GB output once, slowly. After that, builds are fast.
3. If wanted, turn off Network Error Logging in Cloudflare (DEPLOY gives the path and the API call). The live check then says so, and `/about/how`'s sentence is removed next round.
4. Prune after the plan's last step plus a day. Purge `s/v2` on or after 26 October. Deleting the 11 unlisted dossiers is optional.

## Measured

- **Browser suite's server, this round's code:** `npm run build`, fresh state and `wrangler dev`, timed to the front page's 200. With 145,122 corpus files on disk (round 77's real corpus hard-linked 6 times) it took 28.6 s. The output is 629 files (`.svelte-kit/cloudflare` 2.9 MB).
- **Base, same command:**
  - with 72,561 files (2 GB), 82.6 s and 77.0 s;
  - with 48,374 files, 62 s;
  - the build alone with 24,187 files, 74 s;
  - with none, 23.6 s.

  That is about 18 s per 24,000 files, so about 140 s at the PC's size on this Linux disk. A full base run at 6× would have written about 9 GB, which the shared disk could not take, so that figure is extrapolated.
- **`vite dev` start:** 8.2 s with the corpus on disk.
- **The browser run of 11 tests:** 95 s, including the server start.
- **GBIF validation:** above.

## Not done, with why

- A measured base run at the full 4.5 GB: it needs about 9 GB of output on a disk shared by five agents. The base was measured at ⅓, ⅔ and full scale by file count, and the full-size figure extrapolated.
- Caching 404s and old-name redirects at the edge: not done. They are cheap to render, the old-name answer is already held a day, and the honest sentence was the fix review C proposed.
- Proving that a NEL report carries the query string: Cloudflare's docs do not say, and Chromium ignores NEL through this proxy. The page says "naming the address that failed".
- The exact list of the 11 unlisted dossiers: it needs a bucket listing, which I cannot make from here.
- The KV fallback's lost updates between removals of *different* photographs: KV has no conditional write. Only the double take-off of one photograph is fixed; the daily recount still puts the rest right.
