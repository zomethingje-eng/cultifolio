# Round 59 review: harness (mutation testing of rounds 58 and 59)

Saved from the agent's returned report (its own write was refused). Work was done in a copy; raw results, one row per mutation, are in the sandbox at `/tmp/review59/harness/table.md`.

## What ran

- 104 unit mutations (58 server, 46 client), one at a time, each with the relevant unit files; when nothing failed, `fold-rules.test.ts` alone, so "caught by the hash only" is separate. All 35 compatible survivors applied together and the whole suite run once: only the fold-rules hash failed, so they are uncaught by the whole suite.
- 11 end-to-end mutations, each with a fresh build and `playwright test -g <guarding test>`.
- Full e2e once: 103 passed, 0 flaky, 7.1 min (Linux, Chromium 1194, Node 22.22.2).
- Unit suite at the end: 533 of 533 on Node 22.22.2 and on Node 24.21.0, no flake.
- 31 proposed unit tests, each passing on the real code and failing under its mutation.

## Score

| | mutations | caught by a test | caught by the hash only | not caught |
|---|---|---|---|---|
| server | 58 | 39 | 0 | 19 |
| client | 46 | 27 | 5 | 14 |
| end to end | 11 | 3 (+1 by accident) | n/a | 7 |

The self-review-58 list (round 59, 5.2) holds: every repeated item was caught. The round's own new fixes do not: five named tests do not test what they are named for.

## Findings

1. **P1. `locals.corpus` (round 59, 1.7) is untested; five mutations survive** (the key reads a fresh `corpusNow`; `homeQuery` drops it; the species page ignores it; the home page ignores it; `resolveSlug` ignores `held`). `page-corpus.test.ts:44-50` renders `e.locals.corpus` in its own `resolve` and never calls a real `load`.
2. **P1. `manifest-refused.test.ts`'s second test is vacuous.** Removing the species-count check, or `rejectedManifest = mEtag`, passes: the fake etag is `"${k}:${length}"` and both manifests are 7,621 bytes, so the refused one is never fetched.
3. **P1. Byte counters half guarded.** Uncaught: a caller's listing overriding today's row (the named fix itself), `take` dropping pending from a day's first listing, `release` past pending, a give token of the key alone (the fake R2's `etag: String(size)` and fixed `uploaded` cannot test uniqueness), `sweep` keeping `g:` keys for ever, `readBody` allocating before any byte.
4. **P1. `admitVault`: two of nine survive.** An `unavailable` answer marking the vault filled (never counted after); the KV fallback ceiling removed.
5. **P1. The clock's engine side and expiry are unguarded.** The engine's `hold()` with `clockChecked: true` survives; `clockChecked()` never expiring is caught by the hash only.
6. **P1. "Notes replaced" is tested in `notes.ts`, not where it is wired.** Uncaught: `collection.replacedNotes` without held or parked stamps; no `myNotesBase` written; `cutBefore` ignoring `myNotesBase`; a base not consumed after pairing.
7. **P2. The lock and reload:** a 300 s retry instead of 5 s survives (the test checks only that a timer exists); the reload merging instead of replacing; the page's `vaultFull` and `quarantined` copies not refreshed; `scanClock` not saving the held list.
8. **P2. The snapshot heartbeat and "a future-dated snapshot is not kept" are guarded by the hash only** (four mutations).
9. **P2. Round-58 items still unguarded:** the clock warning never cleared; a replace not taking the file's parked set (only merge is tested); the engine's arrival parking skipped.
10. **P2. Smaller server items untested:** `short.json` positions not validated; `/api/dossier` public whatever `?c=` says; the "not checked" 404's `no-store` header (only `synonymOf` is tested); `clip()` cutting mid-word passes `text-clip.test.ts`. Side issue: under the fixture corpus the first `/api/dossier` on a cold isolate is a 404 (`getDossier` reads `cached?.corpus` before the parallel `getCorpusId` sets it).
11. **P2. Four end-to-end claims have no test** (each mutation passed its area's tests): Today worded by the rain rule for a temperature-rule resting row; "0 d" for today; the species hero using `hero.url` rather than `shownAt` (no fixture has an unnamed host); the service worker keeping a queried navigation as the plain page. The place form's floor refusal also survives. Caught: the focus handler, a non-number written as empty, the description fallback.
12. **P2. `html[data-ready]` does not guard the settings race, and the race is in the app.** Settings' `onMount` awaits `collection.load()` and then resets `mode`, `prefix` and `width` from the stored scheme (`settings/+page.svelte:27-35`), so a choice made before the load finishes is lost and the Prefix input is removed under the user. Under CPU throttling, waiting for `data-ready` then choosing Prefix failed 4 of 8 runs; waiting for "Save numbering" to be enabled passed 4 of 4. Putting the marker statically in `app.html` leaves all four settings tests green. The Windows failure blamed on hydration may well be this.
13. **P2. E2E steps that still navigate or sync with a write in flight:** 2857 → 2859 (a place added, then a navigation); 730 and 734 (notes saved on two devices with no wait); 1107 → 1111 ("Record count" never awaited, and not asserted after, so a lost write passes); the round-52 test's `syncNow` helper (clicks, waits for `toBeEnabled`, which can be true before the run starts, then 300 ms) where the file's own `syncRun` exists.
14. **P3. Fixed waits that encode a race:** negative checks a slow machine passes without testing (1256, 1258, 1484, 1520, 1950, 2586, 2599, 2729, 3127); waits timed against a stub's delay (1452, 2197); layout settling (2101, 2710, 2748, 2822); a debounce whose assertion accepts either outcome (1314).

## Proposed tests (in the sandbox copy `/tmp/cf-r59-mut`)

`tests/unit/zz-proposed-server.test.ts` (S05, S07, S13 to S16, S18, S27), `zz-proposed-corpus.test.ts` (S37 to S41, S46, S50, S52, S53, S57, S58), `zz-proposed-client.test.ts` (C05, C15 to C19, C29 to C32, C44), `zz-proposed-engine.test.ts` (C03, C21, C22/C23, C27, C41, C46; a block appended to `sync-engine.test.ts`), `tests/e2e/zz-proposed.spec.ts` (E03, E08, and the settings race).
