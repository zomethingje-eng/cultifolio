# Review round twenty-two: two reviews of `2bcb27c`, triaged

The second reviewer's thirteenth pass (one finding) and the first reviewer's round twenty-one (twenty-one findings, with a new reader who walked the product as a grower would: first visit, ten plants across three places, propagation, labels, backup and restore, sync between two devices). Every finding was checked in the source or reproduced; all twenty-two are real and all are done, the grower's flow traps included. "R1-1" is the second reviewer's one finding; "R2-n" the first reviewer's.

## The build

1. **A successful build warned that the Durable Object class was missing** (R1-1; the reviewer's one thing to fix). The adapter's dev proxy validates the worker during `vite build`, before `attach-do.mjs` has appended the class. The proxy now reads `wrangler.dev.jsonc`, the same bindings without the object, so the build is clean and `npm run dev` (where no object can run) uses the KV counters, which also closes R2-2 (`vite dev` could not create a vault at all, every creation being 503 against a binding with nothing behind it). The append stays, since the adapter offers no other export, but it is now a release assertion as well: it checks the export line landed, that the class file exports `Counters extends DurableObject`, and that `wrangler.jsonc` binds that class, and fails the build otherwise. `docs/DEPLOY.md` says all this.

## The vault counters

2. **A creation counted and then not made used up the slot** (R2-1; the reviewer's one thing to fix). If the vault's R2 write threw, the count stood, and five R2 blips locked an address out for the day with a message blaming the grower. The route now refunds the object when `ensureVault` throws (a join is neither counted nor refunded). Route test: create with R2 failing → counted then refunded; create again → counted; rejoin → neither.
3. **The object kept addresses longer than the site said, never dropped day keys, started its total at zero, and the deploy doc watched keys nothing wrote** (R2-6). A daily alarm now deletes every `ip:` and `day:` key older than two days; the object's total is seeded once from KV's `vaults:all`, so the ceiling in all counts every vault; `/about/how` names the object and says what it keeps; `docs/DEPLOY.md` points at `totals()`. Server test: the seed is counted into the total.
4. **The KV fallback refused honest users as over their limit** (R2-9). A per-address write that fails (KV's one write a second per key) is `unavailable` with a minute's wait, not "too many today". Server test.

## Sync, the worker, the tooling

5. **A stop from another tab still ran the number repair** (R2-8). Round twenty-one's guard checked the engine's meta, which the other tab had not changed; the stop from the vault's key check is a `StoppedError`, and the retry loop now rethrows by type as well.
6. **A trailing or doubled slash on a current private path sent its id to the server** (R2-7). The worker normalises every navigation once (doubled slashes collapsed, a trailing one stripped) before the redirect map and the shell match, and redirects whenever the path changed. e2e: `/benches//x` → `/places/x`, `/plants/r1/` → `/plants/r1`, the stand-in server never reached.
7. **The e2e state reset did not run when a server was already up** (R2-10). `reuseExistingServer` is on only with `PW_REUSE=1`.
8. **The live check's forecast rotation was shorter than the cache** (R2-11). Sixty cells, more than the hour.

## What a page says

9. **"night of" put a pre-dawn frost on the wrong day** (R2-12). The bracketed date is now "(2026-10-14 in the table, MET Norway)": the row it points at, said as what it is.
10. **Samoa and Kiribati never got clock time** (R2-13). The offsets are compared around the clock, so Apia's solar -11 and zone +13 are one hour apart. Unit test at Apia.
11. **Frost without a site contradicted itself** (R2-14). Settings now says what the stand-in place does (the hemisphere for the months) and what it does not (the site's own watch); the frost page says the watched places have their own forecasts on their pages, and its "no site" box says so too.

## The formats page

12. **Two errors on the page, and the test's remaining blind spots** (R2-15). The example writer is now twelve hex digits plus a tag; the legacy export example carries `"v": 1`, which the loader requires. The test parses and asserts the batch-name layout from the page's own template, every endpoint path and header and method against the route files, the manifest keys against the schema, the 413, 429 and 503, the pairing prefix against the parser, "16 characters in all", and the record-id reading rule against `madeOn` on the page's example id.

## The grower's walk

13. **A new place was filed inside the wrong parent** (R2-3). The parent choice is cleared after each add. e2e.
14. **Refused-climate lines printed** (R2-4). They carry the same `unchecked` class the unreached lines do, so paper is blank for both, as round sixteen decided.
15. **A restore dropped the settings** (R2-5). A backup now carries `device.json` (the site, the units, the label choices, the preferences), and a restore applies each only where the device has none of its own, so a restore never overwrites a site set here; the report says what was applied, and the backup page and the formats page say the file holds them. e2e: a site set before the export, cleared with the wipe, back after the merge.
16. **Two ways to record a death, one silent Archive** (R2-16). "Died…" is in the card menu, opening the log form on the death entry with its date and cause; Archive and Mark growing write a line and say so.
17. **"Note" and "Notes" were different things** (R2-17). The verb is "Log"; the section keeps its name.
18. **Pot-up defaulted to every seedling** (R2-18). It defaults to one.
19. **Units in the log** (R2-19). Measurements print their unit ("Diameter 45 mm"); the rest of that finding (the species page's mixed rain units, the place form) waits for a units pass after the post.
20. **Vocabulary** (R2-20). The first-visit prompt reads "Bring in a collection (a backup file, or an export from the old Herbarium app)". The propagation verbs stay: "Sow seed" is the act, "batch" the record.
21. **Small things** (R2-21). The Frost tab has a snowflake, not the site's asterisk; the offer's link-button and inline links in small text have a 24-pixel tap height; the toasts say "Watering recorded", "Measurement recorded", and Move has one; the restore result counts records the way the preview did; a syncing device is no longer told it is "kept in this browser only".
22. **The sync page says what sync is before the buttons** (R1, the walk): one sentence on the encrypted copy, the key as the only way in, and what a lost key does and does not lose.

## The placeholders

Light-mode saturation is 48% (tints 20° apart now tell apart; the caption stays at 4.6:1 at the worst hue), a nothogenus hashes without its "×", and the initial has a fixed size where container units are not supported.

## After the fixes

`npx svelte-check --threshold warning` clean; `npx vitest run` 35 files, 344 tests; `npx playwright test tests/e2e/smoke.spec.ts --workers=1` 68 tests, no retries; the build no longer warns. For the deployer: nothing beyond `npm run deploy`; the counter object's alarm sets itself on the first creation after this deploy, and its total takes KV's count on that same creation.
