# Round 81, agent B: the build and the pipeline

Copy `/tmp/claude-0/rev81/B/`, branch `r81`, six commits on `r81base` (head `73a431b`). Scratch `/tmp/claude-0/rev81/B-s/`. A worktree of `r81base` is at `B-s/base`; each new test was run there too. Nothing touches `scripts/corpus-plan-full.txt`, `package.json`, `package-lock.json`, `wrangler.jsonc` or `static/s/`.

**Every change below is safe to deliver between two fill days.** None changes the plan file, the dossiers' form or `corpus-step.json`, so the next daily command goes on at step 11 where the last stopped. B1 to B3 must be on the PC before DEPLOY's (d), and should arrive before the fill's last day so that the fill and step 12 use them too.

## Done

**B1. Wikidata names on keyless pages kept through `--offline`.**
- `carryWdNames` (`src/lib/dossier/rederive.ts`) is called in the builder's rederive block, right after `carryRederivedRows` (`scripts/build-dossiers.ts` about l. 2388). It carries the previous build's Wikidata rows only when the page's `wikidata.names` record is the carried one and this build gave none. So no name goes without its record, and none is carried twice.
- Test: `tests/unit/r81b-rebuild-carry.test.ts` runs the real builder: `--keys rebuild-shapes.txt --offline --bulk bulk` on Hesperocyparis lusitanica (`k457911`, keyless), with Kew's own rows in Kew's form and no network.
- On r81base: `vernacular` is `[]` under "2 English names taken", the reviewer's fault reproduced. Now both names stay.
- Safe mid-fill: only builds run it.

**B2. A fill that loses its network.**
- `fetch.ts`: an error before any answer is marked `unreached`. `day-budget.ts` gives such a request back to the day; timeouts and any answered status stay counted.
- `fillPhotos` (build-dossiers.ts l. 721–975):
  - A page whose request got no answer is left exactly as it was, never written `error` and never counted done.
  - Five such pages in a row (`CULTIFOLIO_NO_ANSWER_RUN`) stop the day: "iNaturalist did not answer 5 pages in a row (…): the connection may be down …; run --fill inat again once the connection is back".
  - Any page left unanswered makes the run exit 3 with "N not answered …". `corpus-step` reads that as "a source did not answer", so step 11 is never passed with pages unasked.
  - An error the host itself answered (a 500) is recorded. The next run that meets it again takes it as the page's answer, so one bad page cannot hold the plan for ever.
  - "Every dossier has been asked for its photographs." is printed only when every page was answered.
- The review stop (`facts()` in `corpus-step.mjs`) counts the rows left `error`, by source, naming a few pages. It says nothing when there are none, so older output is unchanged.
- Tests: `r81b-fill-network.test.ts` (5) runs the real fill with no network, a cut at 2, and a 500 met twice. On r81base all 5 fail: rows written `error`, exit 0, "Every dossier has been asked", one request charged per call.
- Safe mid-fill: the fill reads the rows on disk as before, and any row day 1 left `error` is asked again, as it was.

**B3. A rebuild that skips iNaturalist keeps filled sets settled.**
- In `carry()` (l. 2262), an `ok` iNaturalist set keeps its own row: the rule's words, its `at`, "filled <day>" and Kew's mark, followed by "; kept by the build of <day> (this build: …)" (`keptInatSetRow`, `keepsInatSet`). Kept again, only the latest build that kept it is named, once.
- Test: the real builder rebuilds Copiapoa cinerea `--offline`. On r81base `cultivatedSettled` is false and Kew's mark is gone; now settled, with its day and mark, and photographs and id kept (guard).
- Builds only; safe.

**Queued item: no index written again for nothing.**
- New `src/lib/dossier/index-stamp.ts`. Each index written leaves `cache/index-stamp.json`, a fingerprint of every dossier, genus record, `index.json` and `manifest.json` (name, size, mtime), plus the builder's own code and data by content (`src/lib/**`, top-level `scripts/*`, `package-lock.json`, read from the builder's checkout).
- `writeIndexFromDisk` (l. 1847) returns at once when nothing changed. It still prints `  index: N species`, so `classify`'s shrink check works, and then says it was not written again.
- Any change (a dossier, a delivered code file) writes it as before. So the brief's "fix at index time" still reaches the index.
- This covers a fill day that stops at once at the allowance, and step 12's `--index` after the fill's last run.
- Test `r81b-index-stamp.test.ts`: `--index` twice, a fill that changed nothing, then a dossier changed; and the code's content in the fingerprint. Fails on r81base.
- Safe mid-fill: the first index after delivery is written as before.

**B4. A copy before (d).**
- `node scripts/corpus-step.mjs --backup filled` copies `static/s/v3` to `backups/v3-<id>-filled`, via `.tmp` then a rename. It keeps an existing copy and never touches the plan's record.
- `--compare <folder>` prints the review's facts against that copy, including the `error` rows. It is read-only and takes no lock.
- These are commands in (d), not plan lines. Test in `r81b-corpus-step.test.ts`; on r81base the plan runs instead.

**B5. `--status` is read-only.**
- A separate `status()` reads the record, the kept runs and the plan, and writes nothing: no rename, no hash, no log line.
- Where a run would start the plan again, or switch records, it says so in a "Note: … --status changed nothing."
- The plan choice is factored into `choosePlan()`, shared by `run` and `status`, with the same logic.
- Test: changed step line, then put back; and a comment-only change (guard). On r81base the record is renamed.

**B6. One run at a time.**
- New `scripts/run-lock.mjs`: `corpus-step.lock` holds the pid, what runs, the start time, the boot time and the host.
  - `corpus-step.mjs` takes it for every run but `--status` and `--compare`, and releases it in `finally` and on `exit`.
  - The builder takes it for any step typed by hand (`main()`, l. 1895; not for `--fixtures`). The corpus step's own builder steps are its children (`parent: process.ppid`) and run under its lock.
  - A lock is free again when its process has died or the machine has rebooted since; the next run takes it and says so.
  - A refused run gives exit 2, names the holder, and says how to clear a wrong lock (delete it).
- `.gitignore` gets `/corpus-step.lock`.
- Tests: two runs at once (the second refuses, the fill runs once); a dead lock taken; a builder typed beside a live run refuses with exit 2, while the run's child goes through. On r81base both runs run the fill.

**B7. The upload's half-new window, said plainly.**
- The upload now says, as it starts, that dossiers go first and the manifest last.
- A failed upload's stop sentence says the site serves the new dossiers under the old index and search until it finishes, and to run the same command again now.
- Shortening the window would need the Worker to read dossiers by corpus. Not done.
- Test: rclone failing. On r81base the sentence is the generic one.

**B8. (d)'s times, and one read of the download fewer.**
- `--keys a.txt,b.txt` builds both files' pages in one run (l. 2003). A missing file in the list is said and skipped; `--list-wikidata-retry` writes no file for 0 pages. Test in `r81b-rebuild-carry.test.ts`; on r81base: "file not there", exit 2.
- With the stamp, the typed `--index` after `--prune-followed` takes seconds.
- DEPLOY's (d) now has a per-line time table. Its new total: about 4.5 h before the upload and 5 to 6 h with it on the DWCA; about 4 h with SQL. Before: 6 to 7 h by review B's sum.

**D1. `/about/how` true until the repair runs.** Two sentences added, each "until …" so they stay true after the repair:
- after "…no sheet from them." (records paragraph): the shapes and default points reach live pages with the upload after the cultivated fill, and until a page has been through it, it may still take such records and say no test;
- after "…not sent to the page." (search paragraph): Kew's older names reach the search with that upload, and until then a search by a Kew-only name finds nothing.
- Test `r81b-pages-true.test.ts`. Deploy any day.

**D4. The names line over a name not shown.**
- `namesSource(d, shown)` (`src/lib/ui/ref/upstream.ts`) returns `hidden` when none of the page's shown names is a Wikidata name.
- The species page passes `common` (`+page.svelte` l. 84) and says: "Wikidata's item Q… gives "Cactus", read …, (CC0), which the search finds and this page does not show as the species' English name." (l. 457, a new first branch).
- Unit test; fails on r81base.

**C3. The seven search-route tests now run.**
- `r67n-search-route.test.ts` finds its corpus from `CULTIFOLIO_TEST_CORPUS`, else `/tmp/rev66/corpus/v2`, else `static/s/v2`, the PC's round seventy-seven corpus, which the rekey reads and never changes.
- When it is skipped, it says why.
- Here, with `CULTIFOLIO_TEST_CORPUS=/tmp/claude-0/rev78/real-s/v2`: 7 passed in 36 s. On r81base the same: 7 skipped.

**DEPLOY.md.** A new section, `### Round eighty-one: the build`, just before "Round eighty: the owner's walk". It lists the ten changes, each with its mid-fill safety and its words; walk (c); and walk (d) as commands with a time table. One pointer is added in round eighty's (c) saying that this section replaces (c) and (d). Its (a), (b) and (e) stand, so the owner still reads one ordered walk.

**Checks.**
- `tsc --noEmit -p .`: 0 errors. `svelte-check --threshold error`: 0.
- The 23 new tests fail on r81base except 2 marked guards.
- The full suite: see Measured.

## Repairs for the live site

None of its own. B1 and B3 change what (d)'s rebuilds write, D1 and D4 come with the app deploy, and the stamp makes step 12 and the typed `--index` faster. With this round's code on the PC, round 80's (d) no longer needs review B's extra `--fill wikidata-names` line. Without it, it does.

**(d) as DEPLOY now gives it**, at step 13's stop:

```
node scripts\corpus-step.mjs --backup filled
npm run dossier -- --list-default-points
npm run dossier -- --list-range-shapes
npm run dossier -- --list-wikidata-retry
npm run dossier -- --keys scripts/r80-repair-keys.txt,rebuild-wd-retry.txt --grid climate --bulk bulk --skip inat
npm run dossier -- --keys rebuild-shapes.txt --offline --grid climate --bulk bulk
npm run dossier -- --prune-followed
npm run dossier -- --index
node scripts\corpus-step.mjs --compare backups\v3-<id>-filled
node scripts\corpus-step.mjs --plan scripts\corpus-plan-full.txt --go-on
```

- Pages: the 13 repair pages, the Wikidata retry's pages and about 12,000 of `rebuild-shapes.txt`.
- Sources: GBIF, Wikidata, Wikipedia and Commons for the online pages only; NASA POWER for new cells.
- Time: about 4.5 h before the upload.
- A's and H's (d) lines go into this list (coordinator).

## Needs

- **Coordinator: shared files.** Edits in `build-dossiers.ts`, each a small block:
  - imports, l. 122 and 178–192;
  - `fillPhotos`, l. 721–727, 856–869, 903–941, 958, 969–981;
  - `writeIndexFromDisk`, l. 1847–1855 and 1890;
  - the lock in `main()`, l. 1895–1903;
  - `--keys a,b`, l. 2003–2038;
  - `carry()`, l. 2303;
  - the rederive block, l. 2388.

  Elsewhere:
  - `/about/how`: two appended sentences, at the anchors above.
  - The species page: l. 84 and l. 457.
  - DEPLOY: the new section, and the pointer in round eighty's (c).
- **A.**
  - D4's new line shows whenever none of Wikidata's names is among the names the page shows. A's vague-names rule ("Cycad", …) sends more pages into it, and the words ("which the search finds and this page does not show") must stay true under A's rule.
  - If A says whose Wikidata typos are, it is the same `#names-source` line.
- **S.** `r67n-search-route` now runs: `CULTIFOLIO_TEST_CORPUS=/tmp/claude-0/rev78/real-s/v2 npx vitest run tests/unit/r67n-search-route.test.ts`. S's ranking changes must keep its 7 tests passing, or update them.
- **H.** Any (d) rebuild for hybrids should be a `--keys` file joined into the online line (`a,b,c`), not a second read of the download.

## For the owner's PC

1. Deliver this round's zip, without `scripts\corpus-plan-full.txt`, on an evening between two fill days, before the fill's last day. Then `node scripts\corpus-step.mjs --plan scripts\corpus-plan-full.txt --status` should show 1 to 10 `done` and 11 `unfinished`, with no "Note:".
2. `dir static\s\v2\index.json`: if it is there, `r67n-search-route` runs in predeploy. If not, `set CULTIFOLIO_TEST_CORPUS=<a v2 corpus folder>`, though a `backups\v2-*` of another round may not give the test's expected answers (not checked).
3. Keep the PC from sleeping on fill days.
4. Optional and read-only: review B's `pc-count.mjs`. It says how many rows day 1 left `error`, which the review stop now counts anyway.

## Measured

- **`--index` on round 77's real corpus** (8,947 pages, v3, `B-s/m1`): 105 s the first time, 0.63 s the second ("not written again"). On the PC it was about 12 min a fill day and about 15 min at step 12; now, when unchanged, the cost is a stat of about 48,000 files plus hashing about 12 MB of code, an estimated few seconds.
- **B1 on the real builder**: base `[]`, now 2 names.
- **B2**: 3 pages with no network; base charged one request per call and wrote 3 `error` rows; now 0 charged and 0 written.
- **B3**: base not settled; now settled.
- **The full unit suite**, alone under `nohup`, with `CULTIFOLIO_TEST_CORPUS` set, at a load of 10 to 15 from the other agents: 4,483 passed, 5 failed, 3 skipped (4,491 tests in 497 files, 29 minutes).
  - Three of the failures were older guards that my changes broke, and are now fixed:
    - `r78i-build`: its second `--index` is now skipped by the stamp; the test deletes the stamp first, so it still checks that rewriting the index changes nothing.
    - `r63c-sitemap`: a regex on the opening of `writeIndexFromDisk`, now widened to allow the stamp's early return.
    - `r70b2-wikidata-fill`: the text of the missing-file check, now kept word for word.
  - These three, with the related `r72d` and `r81b` files, pass on a rerun: 45 of 45.
  - The other two (`r73p-sync-listing`, `r62h-own-latest-flag`) are sync tests that timed out at 50 s and 33 s under that load. Both pass when run alone. My changes touch nothing of sync.
  - The whole suite was not run a second time, because of the load.

## Dependencies for the later delivery (C4)

Read from `package-lock.json`, `npm audit` (review C's `C-s/deps/audit.json`) and the registry, 2026-10-23.

| Package | In the lock | Brought by | Needs | Version to take |
|---|---|---|---|---|
| devalue | 5.9.2 | `@sveltejs/kit` ^5.8.1, `svelte` ^5.8.1 | > 5.9.2 (7 advisories, GHSA-mcm9-63f2-9j32 high) | 5.9.4 (2026-09-18), within both ranges |
| vite | 8.3.0 | devDependency ^8.3.0 | ≥ 8.3.3 | 8.3.3 (2026-10-06) or 8.3.5 (2026-10-21) |
| vitest, @vitest/mocker | 5.0.0 | devDependency ^5.0.0 | ≥ 5.0.3 | 5.0.5 (2026-10-15) |
| wrangler, which carries miniflare 5.20260926.0-alpha, pinning undici 7.29.0 and sharp 0.35.4 | 4.143.0 | devDependency ^4.143.0 | wrangler ≥ 4.149.0 (miniflare 5.20261006.1-alpha pins undici 7.29.1 and sharp 0.35.5) | 4.149.0 (2026-10-08) |
| source-map-js | 1.2.1 | postcss ^1.2.1 | ≥ 1.2.2 | 1.2.2 (2026-09-30) |
| cookie | 0.6.0 | `@sveltejs/kit` 2.x ^0.6.0 | ≥ 0.7.0 (low) | needs Kit 3.x (3.1.0, cookie ^2.0.1): a major, not in that delivery |

- So: **a Wrangler bump is needed** (4.143.0 to 4.149.0). It is within `package.json`'s caret, so only the lock changes, and undici and sharp can only move with it, because miniflare pins them exactly.
- **No SvelteKit bump is needed** for devalue. Only `cookie` (low) needs Kit 3.
- One command, with no `package.json` change: `npm update devalue vite vitest @vitest/mocker wrangler source-map-js`. Then check that the lock says devalue 5.9.4, vite ≥ 8.3.3, vitest 5.0.5, wrangler ≥ 4.149.0, undici 7.29.1, sharp 0.35.5 and source-map-js 1.2.2, and run predeploy in every engine.

## Not done, with why

- **Shortening B7's window.** It needs the Worker to read dossiers under a corpus-named path: a change to the bucket layout and the Worker, too big between fill days. Said plainly instead.
- **`carriedOrigin`'s "earlier of the read's day and the build".** It still names the wrong day on other carried rows, such as `inat.taxon` after an offline rebuild. Changing it moves every carried row's day across the corpus and its tests, so it was left. B3's sets no longer go through it.
- **`drops.txt` flagging a lost common name.** It is not lost now (B1). Adding a new drop kind could stop (d)'s offline line on expected changes.
- **A fill run against the reviewer's 30-page copy at the PC's step 11.** Covered by the real-builder tests instead.
