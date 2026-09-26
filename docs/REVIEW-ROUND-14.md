# Review round fourteen: two reviews of `52ac115`, triaged

Both reviewers checked round thirteen's fixes on the live site. The first found that two of them did not hold (the retry of set-aside batches, and the import reorder, which dropped the sowing number from the ledger), one new blocker on the labels page that showed up live on first load, and two smaller things; the second found the last reason the sync tests were red on their machine and nothing else. Seven items, all real, all done; two of them are mine to own, since they are round-thirteen fixes that were wrong. "A-n" is the first review's numbering, "B-1" the second's.

## Lost data

1. **A set-aside batch still disappeared if its retry hit one transient error** (A-1). Round thirteen removed the entry from the quarantine before fetching the batch by key; a 429, a 5xx or a dropped connection threw, the next write of the meta (a push writes it after every batch) saved the list without the entry, and the key stayed in `have`, so nothing would ever fetch it. Fixed in `src/lib/sync/engine.svelte.ts`: the entry stays exactly as it was through a throw, leaves only when the batch has folded, and is re-noted under this build only when bytes read whole still cannot be opened. The retry also now runs after the listing rather than before it (the first reviewer's design note), so new changes arrive even while an old batch keeps failing. Engine test: the retry answers 503, the run ends with that error, the entry is still on the page and on disk after a push has written the meta, and the next run folds the batch.
2. **Imported sowings no longer put their number on the ledger** (A-2). Round thirteen moved the plant's number to the last field and forgot to put the batch's back at all, undoing round twelve's item 6 for batches: after a replace from an older backup the next sowing could be numbered S2025-001 again. `no` is the sowing's last field. Import test asserts it, as the plant's test should have from the start.

## Blocked

3. **The labels page could not print when any picked plant's species had no climate** (A-3; the first reviewer's one thing to fix, seen live: Haworthia truncata and Lithops aucampiae). Round thirteen marked "asked" with an empty care line and "answered" with the line; a species with no climate answers with an empty line, so it was never marked answered, and Print stayed on "Reading the reference…" for about a quarter of the catalogue. Pending plants are their own set now; any answer, empty included, is an answer. e2e with Welwitschia (a fixture species with no climate): Print reads "Print 2 labels" and is enabled.
4. **A hung reference request disabled Print with no timeout** (A-4). The sheet, entry and corpus requests give up after ten seconds (`AbortSignal.timeout`), which lands the plant in the "not checked" path the page now handles.
5. **"Care line not checked" was printed on the label** (the first reviewer's design note). On paper the line is blank; the notice and its count stay on the screen, where they belong.

## Corrected claim

6. **Import stamps are not stable across builds for records that share a millisecond** (A-5). Round thirteen's fix keeps a record's own stamps only when the record has its own modification time; records without one all share the file's base time and one counter, so a field added to one record still shifts every record after it. The harm is equal values under two stamps (log growth, not a wrong field); the claim is withdrawn in `REVIEW-ROUND-13.md` and the test asserts only what is true (the number is the record's last field).

## The test suite

7. **The two sync tests left the plant page before Record had finished** (B-1). `click()` returns before an async handler resolves; the tests now wait for the recorded row before navigating, as the round-eleven test for event forms already did. The hover test listens for requests on the context, since a preload the worker answers may not reach a page listener (the flaky run the first reviewer saw). A `console.log` left in the round-thirteen store test is gone.

## After the fixes

`npx svelte-check --threshold warning` clean; `npx vitest run` 32 files, 298 tests; `npx playwright test tests/e2e/smoke.spec.ts --workers=1` 62 tests, no retries. Nothing for the deployer beyond the deploy.
