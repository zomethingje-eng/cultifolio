# Round seventy, W: the server and sync

Commit `caa317d` in `(scratch)`. Chromium only, port 4307. The machine was heavily loaded (load average up to 54 on two cores; builds killed for memory), so some browser runs used a server built and started by hand (`PW_REUSE=1`).

## Done

**W1. A configured sync page that never runs (S-E1).** `readInit`'s configured branch now ends with `this.schedule(1500)`, so whoever configures the engine also starts its first run. The layout's own `schedule(1500)` after `init` only moves the same timer. File: `src/lib/sync/engine.svelte.ts`.
- `tests/unit/r70w-sync.test.ts`, "W1": tab A's engine inits with no record, tab B's sets a vault up, tab A's `init` alone (the page's) must leave a timer and make one run. Base: `expected +0 to be 1` (no run) and no timer.
- `tests/e2e/r70w-sync.spec.ts`: the reviewer's scenario (tab A open before tab B set sync up, then the top bar's Sync link). Base build: `Expected substring: "Synced"`, `Received string: "StatusNot checked yetlast synced just now; checking now"`, `data-runs="0"`. Fixed build: passes (run four times, once with the whole sync set).

**W2. Sync's words, and the day's allowance (S-E2).** Files: `src/lib/sync/engine.svelte.ts`, `src/lib/sync/limits.ts`, `src/lib/server/sync.ts` (one import), `src/lib/ui/sync-words.ts`, `src/routes/sync/+page.svelte`.
- A 429 keeps the server's reason (`reasonOf`, without its "; wait and try again"). On a listing or a fetch it reads "The server refused sync from this device for now: too many requests from this address. It syncs again in 2 minutes; your changes are kept here." A 429 with no reason reads "The server refused sync from this device for now and asked this device to wait 60 seconds…". "Busy" is gone.
- A 429 on an upload asking a minute or more is kept as the refusal of the vault's uploads (`uploadLimited`), as `refusedBy` keeps a 503's, in the server's words: "The server refused uploads from this device for now: the upload allowance for this address is used up for today."
- The day's allowance (the 429 that carries `limit`, which only `DayQuota` sends) is kept to the time the server gives, capped at a day (written back, as the hour's cap is). Until then no photograph, and no batch over 16 KB sealed, is sent by any run, tab or reload. A record's small batch, which the day does not count (`SMALL_BATCH_BYTES`, now in `limits.ts` so both ends read one figure), still goes, and its taking does not lift the refusal. A request window's 429 on an upload is kept an hour at most, as before.
- The second push of a run is skipped after a wait or refusal, so nothing is sent in the same run to be refused again.
- A bare 5xx (not 503) reads "did not answer": "The server did not answer when this device sent its changes (502). They are kept here and tried again at the next sync.", and likewise for a photograph and a listing. A 4xx is still "refused".
- "received N batches; <reason>" fell through to "Sync stopped on something it could not finish" whenever the reason was a sentence (a 503 refusal already, and now every upload refusal). It now reads the reason and adds "Changes from your other devices still came in (N sync bundles)."
- The sync page's refusal notice says "when the server said to" for the day's allowance, and "when the server said to or within the hour" otherwise.

Tests, `tests/unit/r70w-sync.test.ts` (each failing on the base):
- a photograph refused for the day is not sent again by a second run or after a reload, and a small batch still goes. Base: `expected 600000 to be 36000000`, and the second run sent the photograph again;
- the wait is capped at a day. Base: `expected 600000 to be 86400000`;
- a batch over 16 KB waits too. Base: `expected 2 to be 1` POSTs;
- a listing's 429 is a refusal with its reason. Base: `'The server is busy and asked this dev…'`;
- "received 1 batch; …" reads as the refusal plus what came in. Base: "The server is busy…";
- a bare 502 is "did not answer". Base: `'The server refused a change from this…'`;
- a guard: a 503's refusal is still capped at an hour.

**W3. DELETE takes the hold only with the proof (S-E3).** In `deleteCounted` (`src/lib/server/sync.ts`), when nothing is there to remove, an unreadable pointer is answered `PhotoBusy` at once, and anything else without the receipt's own proof is answered "nothing there" (404) before `withHold`. A removal cut off after its receipt is still finished by its own device, which carries the proof. Unnamed generations are still swept by the vault's alarm.
- `tests/unit/r70w-server.test.ts`, "W3": a stranger's DELETE, wrong proof and none, holds nothing and answers at once, and the owner's revival is stored. Base: `expected [ { ok: true, … }, … ] to have a length of +0 but got 2`.
- The same file: an unreadable pointer is a wait with no hold. Base: `got 1`.
- A guard: the owner's own repeat still takes the hold.

**W4. The listing budget over any sixty minutes (S-E7).** `listAsk` and `listed` in `src/lib/server/counters.ts` count by the minute a listing is asked. Key `l` is now `{ m: [[minute, pages], …] }`, kept 61 minutes, which is the ask's own minute and the sixty before it. Any sixty minutes therefore hold at most the budget plus one walk less one (1,249 pages). A refusal's Retry-After runs to when enough of the oldest minutes have left the count (61 minutes at most). A walk is settled in the minute it was asked. Round sixty-nine's stored `{ h, n }` is read as asked in the last minute of its hour not past now, so no pages are forgotten at the deploy. `sync.ts` passes `minute` back in place of `hour`.
- `tests/unit/r70w-server.test.ts`, "W4", each failing on the base:
  - the reviewer's 30 + 30 asks across the turn now start 24 walks. Base: `expected 2400 to be less than 1250`;
  - a three-hour sliding check. Base: `expected 2400 to be less than 1250`;
  - Retry-After to 13:11:00 for listings at 12:10. Base: `expected 570 to be 1230`;
  - the stored hour's count survives the turn. Base: `expected true to be false`.
- A guard: a small vault is still listed 1,000 times in an hour.

**W5. The harness (S-E4 to E6).**
- **S-E4.** `tests/e2e/r62s-server.spec.ts` and `r62bs-server.spec.ts` build `from = { 'cf-connecting-ip': docAddress() }` once and spread it into every request, the first upload's (where the place is taken) included. Six repeats of both on one server: 12 of 12 passed. The base specs on the same server: 10 passed, then 2 failed `Expected: 200, Received: 503` (127.0.0.0/24's ten places).
- **S-E5.** The limit spec is smoke's test "five new vaults a day from one address…" in `tests/e2e/smoke.spec.ts` (line 885). It now moves `limitAddress()`'s /48 by eight per attempt (`repeatEachIndex * 4 + retry`). The first attempt keeps the helper's address. `--repeat-each 6 --retries 0`: 6 of 6 passed. Base: 1 passed and 5 failed `a new vault from 2001:db8:7412::1 … Received: 429`. `address.ts` is unchanged.
- **S-E6.** `tests/unit/r70w-harness.test.ts`, two parts:
  - **Section 11's guard.** It draws 2,000 `docAddress()` values and requires each to be counted, by the server's own `upstreamNetwork` and `networkKey`, on a 3fff::/20 /48, with no /48 met more than twice. It passes on the base. With the helper set back to `198.51.100.${randomInt(256)}` (temporarily, then restored) it fails `expected '198.51.100.0/24' to match …`, while `r62bh-vault-addresses` and `r69p-harness` stay green.
  - **The widened guard.** Every test that stores to `/api/sync/(log|photo)` through `request` must send an address on each of its sync requests, directly or through a spread headers object. Base: both server specs fail (the `put`, `get`, `head` and `del` calls without one).

**Tests that pinned the old behaviour, updated (unit tests of my area that no row names):**
- `tests/unit/r69w-server.test.ts` reads the new `l` shape, and its fourth case now says a walk asked at 12:59:59 is settled in its own minute.
- `tests/unit/r67s-server.test.ts`: Retry-After is `61 * 60`, not to the hour, and the vault lists again at 61 minutes, not at 13:15.
- `tests/unit/r62s-review.test.ts`, two guards:
  - A no-proof DELETE racing a first upload is now `false` (404), not `'noproof'` (403). It still removes nothing, which is what the guard is for.
  - "An upload stalled past its hold, a removal meanwhile": the first DELETE no longer takes the hold, so the late upload keeps its claim and the next DELETE is `'newer'` (409), as for any first upload landing after a removal. The photograph goes once the claim is swept, which the test now shows.

`src/lib/ui/sync-words.ts` is named by no row of the table, and it is W2's subject. I changed it, and nobody else should have.

## Needs

1. **`tests/unit/fold-rules.test.ts` (whoever holds it at the merge).** The guard hashes `pull`, `pushBatch`, `takeBatch`, `judgeOwn` and `listOwnOnce`. My change touches them only in their 429 handling (`await this.limited(…)`, `uploadLimited`) and `pushBatch`'s small-batch hold, not the fold. Record the merged tree's hash under `FOLD_RULES` 7. On my tree alone it is `118a0a73fce94cf692150fad8196fd83`. This is the one unit failure in my full run: 2,778 passed, 1 failed, 1 skipped.
2. **P, `/about/formats`, three sentences now untrue:**
   - "…past any of these the answer is 429 with `Retry-After` in seconds (for the new vaults and the bytes of a day, to midnight UTC), and the device simply tries again later." Replace the clause after the parenthesis with: "and the sync page says the server refused, with the reason it gives. Any 429 is waited out until its `Retry-After`, ten minutes at most on a listing or a fetch. A 429 to an upload asking a minute or more is kept with the vault's sync state, so a reload or another tab waits too: until its `Retry-After` or within the hour, whichever comes first, and for the bytes of a day until the time the server gives, a day at most. Meanwhile no photograph and no log batch over 16 KB is sent; a smaller log batch, which the day does not count, still is, and receiving goes on."
   - "…a listing past the vault's hour of listings (1,200 pages of a thousand log batches an hour, counted in the vault's counter object, where each listing's most pages, 50, are counted when it is asked and what it did not use is given back, so listings under way at once count too), with `Retry-After` to the end of the hour and "Receiving is refused for now: …"; the device receives again then, and its uploads go on meanwhile." Replace with: "…a listing past the vault's hour of listings (1,200 pages of a thousand log batches in any sixty minutes, counted in the vault's counter object by the minute each listing is asked, where each listing's most pages, 50, are counted when it is asked and what it did not use is given back, so listings under way at once count too; no sixty minutes hold more than 1,249), with `Retry-After` to when enough of the oldest pages have left the count, 61 minutes at most, and "Receiving is refused for now: …"; the device receives again then, and its uploads go on meanwhile."
   - "…at the next touch of that photograph (its next removal, its next storing, or an upload that finds it already there)…" Replace "its next removal" with "its next removal by a device holding its proof". Optionally add after the DELETE's 403 sentence: "A DELETE of a photograph already removed is answered 404 at once, holding nothing, unless it carries the removal's proof."
3. **P, `/about/how`:** nothing there is made untrue. Rule 2's sentence now holds of sync too.

## Measured

- Listing budget: in a three-hour run of an ask every 20 s, the busiest sixty minutes held between 1,200 and 1,249 pages.
- Sync browser set on the fixed build (`r70w-sync`, `r62s`, `r62bs`, `r69p-disclosure`, `r61l-records` and smoke's sync, vault and offline tests): 32 passed, none flaky.
- svelte-check: 1,058 files, 0 errors. `tsc --noEmit`: nothing outside the review's `docs/` files.

## Not done, and the decisions I departed from

- **W5's "take their vault's place from `limitAddress()`".** I used `docAddress()` on every request instead, as S-E4's fix says. `limitAddress()` is the limit test's own address, and `r62bh-vault-addresses` requires that only smoke use it. Two vaults a run from it would spend two of that address's five, and smoke's test would then be refused its fourth vault.
- **S-E5's fix in `address.ts`** (folding the retry into `limitAddress`) is P's file. I did it in the limit test instead, with the same effect. P may move it into the helper.
- **W2 in two respects the triage did not spell out:**
  - The allowance's refusal holds photographs and batches over 16 KB, not small batches. Holding every upload until midnight would have stopped record sync all day, which round sixty-seven's S9 exempted small batches to prevent.
  - The day's allowance is recognised by the `limit` its 429 carries, not by the wait's length, so an allowance met at 23:50 is still read as the day's.
- **Found, not fixed:** the vault's writes an hour (`w`, 3,600 objects) is the same fixed clock hour that W4 replaced for listings, so 7,200 objects can land across a turn. The same minute count would fit it if the triage wants it.
- **Load-related:**
  - `r63s-concurrent-deletes` ("one of ten removals", KV fallback) failed once under load with two `true`s. It passed 3 of 3 on both trees afterwards. My change adds no await on that path (the photograph is live), so the race it shows is the base's.
  - Engine unit tests that reboot and then call `run()` by hand can meet the init's own scheduled run on a machine slower than 1.5 s between the two; one timeout at load average 54, passing on reruns.

## Second pass (triage-69 section 7: W6; R47-11, R47-18)

**Done.**
- **R47-11, sync's minute.** `runNow` now schedules a run 60 s later when a run did not reach the server (`unreached === 'server'`). This is the minute the card names ("it will check again in a minute"). Offline, the `online` event still asks. File: `src/lib/sync/engine.svelte.ts`. Test `r70w-sync`, "W6 … tried again a minute on". Base and first pass: `expected [] to include 60000`.
- **R47-18, writes counted apart.** The vault's object keeps `w` for log batches and `wp` for photographs, each 3,600 an hour (`take`'s new `of` argument, read from the key in `storeCountedNow`).
  - `WritesSpent` names what is spent and carries `what`. For photographs it says: "Uploading photographs is refused for now: this vault stored as many photographs as the site takes in an hour (3,600). Nothing is lost: they stay on this device, which sends them again within the hour, and changes to your records still go." The batches' sentence now says "sync bundles of changes" where it said "objects".
  - The engine keeps a refusal with `what: 'photo'` as `photos: true`. Like the day's allowance, it holds photographs alone, so this device's record batches still go, and a batch taken does not lift it.
  - Files: `server/counters.ts`, `server/sync.ts`, `sync/engine.svelte.ts`.
  - Tests in `r70w-server`: photographs spent, a batch still stored (base: `this vault's writes for the hour are used up`), and the reverse (base: `expected true to be an instance of WritesSpent`). Test in `r70w-sync`: the records still go and no photograph is resent (base: `expected undefined to be true`).
- **R47-18, the reservation lapses.**
  - `l` now holds open reservations apart (`r`: id, time, pages, minute). Each counts until its walk settles, or for a minute if it never does (a pull cancelled mid-walk, its `finally` never reached).
  - A walk that settles late is still counted in the minute it was asked. `listAsk` returns an `id`, which `listBatches` passes back.
  - Tests in `r70w-server`:
    - 24 unsettled walks refuse listings for 30 s, not the hour. Base: `expected 2970 to be 30`.
    - A late settle is still counted.
  - Bound: any sixty minutes hold at most 1,249 pages of walks that settle. A walk that never settles stops counting after a minute, so its uncounted pages are bounded only by the address's request windows.
- **R47-18's W1 note.** The upstream object now clears its minute's in-memory counts, addresses included, by a timer at the minute's end, not at its next call. Test in `r70w-server`. Base: `expected 3 to be +0`.

**Runs.**
- Unit, full suite: 2,785 passed, 1 skipped, 1 failed. The failure is `fold-rules`; its hash is now `e53970e04104a1d347f5ce9aa35375e6` on my tree, still a merge need.
- `tsc`: clean.
- Browser (under the lock): `r70w-sync`, `r62s`, `r62bs`, `r69p-disclosure` and smoke's sync tests, 25 passed.

**`smoke.spec.ts`, to merge by hand (P's file).** In the test "five new vaults a day from one address…", base line 892, `const ip = limitAddress();`, becomes lines 892 to 897 of my copy:
```
  // A /48 of its own for each attempt (round seventy; triage-69 W5, S-E5): `limitAddress` depends only on the run and the
  // project, so a retry or a repeat was handed the address whose five the first attempt had spent, and failed at once with
  // 429 on its first vault. Each attempt moves eight /48s on, past the five projects' own; the first keeps the helper's.
  const { retry, repeatEachIndex } = test.info();
  const [, , g] = limitAddress().split(':');
  const ip = `2001:db8:${((parseInt(g, 16) + 8 * (repeatEachIndex * 4 + retry)) & 0xffff).toString(16)}::1`;
```
If P's `limitAddress` mixes in the retry and repeat (P3), drop these lines and keep `const ip = limitAddress();`. Both together are harmless: still a /48 per attempt.

**Needs for P, `/about/formats`, added by this pass:**
- "A vault that has stored 3,600 log batches and photographs in an hour (counted in its counter object) has its next upload answered 503 with `Retry-After` to the end of the hour and "Uploading is refused for now: …"; the device keeps every change, sends it then, and keeps receiving meanwhile." Replace with: "A vault may take 3,600 log batches and 3,600 photographs in an hour, each counted apart in its counter object as the upload is taken (an upload that then fails still counts). Past either, the next upload of that kind is answered 503 with `Retry-After` to the end of the hour and "Uploading is refused for now: …" or "Uploading photographs is refused for now: …". The device keeps every change and sends it then, keeps receiving meanwhile, and past the photographs' hour still sends its record changes."
- To my first-pass listing sentence, add after "so listings under way at once count too": "; a listing's reservation that is not settled within a minute, such as a pull cancelled partway, lapses".
- `/about/how`: no sentence changes. The minute the sync card names is now true.
