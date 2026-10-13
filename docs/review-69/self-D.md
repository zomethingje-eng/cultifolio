# Round sixty-nine self-review, reviewer D: the example collection and the grower's records

Working copy `/tmp/claude-0/rev69/D` at the deployed code, server on port 4204 (`npm run build`, `fresh-state`, `wrangler dev`, then `PW_REUSE=1`). My tests are left in the copy, untracked: `tests/e2e/zzd-example.spec.ts` and `tests/unit/zzd-{slow,seed,clock-tabs,import,malformed,sheet}.test.ts`. Every one of them fails on the deployed code where a finding says so. Source is unchanged (`git status` shows only the new tests).

## Findings

### 1. An example tab that is only reloading is offered to another tab as "left", and "Delete it" deletes the visitor's records from under it (confirmed)

`src/lib/db/demo.ts:555-579` (`dropLeftoverSample`) and `:587-591` (`deleteLeftoverSample`) take "the open lock is free" (`ifAvailable: true`) to mean "no example tab is open". But an example tab holds that lock only from `keepSampleOpen()`, called in DemoBar's `onMount` (`DemoBar.svelte:51`). From the moment the tab's old page unloads until its new page has hydrated, it holds nothing. On a slow phone that gap is the 1 to 4.5 s the shell comment in `app.html` describes. Any page outside the example that loads in that gap reads the example as a leftover:

- With records of the visitor's in it, the page shows "You left an example collection with 1 record you added or changed there", while the visitor is in it in the other tab. "Delete it" then deletes it, because the lock is still free.
- With nothing of the visitor's in it, the page deletes it silently, and the reloading tab sets out a second seed.

Reproduction: `zzd-example.spec.ts` "D1", run with `PW_REUSE=1 PW_CHROMIUM=/opt/pw-browsers/chromium PW_PORT=4204 npx playwright test tests/e2e/zzd-example.spec.ts --project chromium --retries=0`:

1. Enter the example and add a place, "Visitor shelf".
2. Open `/` in a second tab: no offer, correctly.
3. Reload the example tab with `/_app/immutable/**` delayed 8 s (a slow phone).
4. Reload the second tab. It shows the offer above. Its "Delete it" toasts "The example collection you left is deleted."
5. The example tab finishes loading and says "The example collection was closed in another tab. This is your own collection." The visitor's place is gone.

"D1b" shows the silent delete: `indexedDB.databases()` loses `cultifolio-demo` while the example tab is loading.

Smallest fix: take the shared lock before the page is drawn. In app.html's first script, when `d.demo` is set, request `navigator.locks.request('cultifolio-sample-open', {mode:'shared'}, () => new Promise(r => { window.__exampleHold = r }))`, have `keepSampleOpen` release that hold once it holds its own, and record the new CSP hash. Failing that, `dropLeftoverSample` and `deleteLeftoverSample` should find the lock free twice, several seconds apart, before they offer or delete.

### 2. The slow clock's step 2 covers only the same field: a removal made while the correction waits is undone, and an edit is hidden by a held removal (confirmed)

`src/lib/db/collection.svelte.ts:1593-1604` (`stampPast`) places an edit past a held stamp of the same field only (`k\0held\0<field>`). Whether a record is removed is decided across fields (`log.ts` `apply`: removed when the latest `_deleted` is later than the latest edit to any field). While a three-day correction waits at a load (R2), every peer change of the last three days is held. So:

- **(a) A removal is undone.** The grower removes a plant whose move by a peer is held. The removal is stamped by the raw clock, three days back. Once the reading comes, the peer's move folds and the plant comes back, here and on every peer.
- **(b) An edit disappears with its plant.** The grower edits a plant whose removal by a peer is held. Once the reading comes, the plant is removed, the edit with it.

Reproduction: `npx vitest run tests/unit/zzd-slow.test.ts`, built on `r69r-clock-slow`'s `slowLog`.

- Case (a): after `remove('accession','p1')` and the reading, `accession('p1')` is `{ _deleted: false, locationId: 'bench B', … }`. The test expects undefined.
- Case (b): after `put('accession','p3',{notes})` and the reading, `accession('p3')` is undefined.

Fix: in `apply`, note for each held change also `k\0held\0*` (an ordinary field) or `k\0held\0_deleted`. In `stampPast`, a `_deleted` change then follows `held\0*` and an ordinary edit follows `held\0_deleted`, under the same `FOLLOW_HELD_MS` bound.

### 3. A sheet saved again with a zero-padded two-digit year imports every line twice (confirmed)

`src/lib/import/rows.ts:65-78` (`dateKey`) keys a date `readDate` refuses by its text. `csv.ts:278-280` refuses a zero-padded `dd/mm/yy` or `mm/dd/yy` whose first part could be a past two-digit year ("could be written year first or year last"). That form is LibreOffice's default short date: 05/01/24, 15/04/24, 03/09/24. So a sheet first imported with 2024-05-01, then opened in LibreOffice and saved, keys "05/01/24", finds nothing, and every line is offered again. The same happens whichever date order the grower picks.

R's test covers `5/1/24` (no padding), which is read. A price the spreadsheet re-saves with its currency format (12.50 to £12.50) also keys anew ("12.5 £" against "12.5").

Reproduction: `npx vitest run tests/unit/zzd-import.test.ts`. 12 date cases (4 forms by 3 orders) and the currency case fail. `01.05.2024`, `2024-05-01 00:00:00`, `1-May-2024`, `01-May-24`, CRLF notes and a dropped trailing space pass.

Fix: for a cell refused only as "year first or year last", add to `others` its year-last readings (`20yy-mm-dd` both ways) and the `~` key, as an ambiguous cell has. For a price with a currency, add the bare amount as an alternative key.

### 4. A freshly loaded tab takes a confirmed correction out of force in another tab after a short sleep (confirmed)

`src/lib/core/hlc.ts:114` and `:134`. A load sets `awaiting` (R2 step 3's "from a load"). When that tab then follows any clock move, `store()` writes `out: true`. Every other tab reads the record in `adoptStored` and takes `awaiting = v.out`. So tab B, holding a confirmed three-day correction in force, is put out of force by a two-hour sleep. That is what step 3 forbids ("a sleep shorter than the correction leaves it in force").

Reproduction: `npx vitest run tests/unit/zzd-clock-tabs.test.ts`, on `r62bl-clock-tabs`'s two-tab harness. Tab B is confirmed three days slow, tab A loads, the device sleeps two hours. B ends with `clockOffsetMs() = 0`, in both orders of the tabs' follows. Until a reading arrives (offline, never), B stamps three days back, and its edits lose to any peer edit of the same field it has not yet seen.

Fix: write `out` only when `awaiting` was set by a move in `follow`, not by the load. A tab adopting a record should keep the tab's own in-force state when the writer's wait came from its load.

### 5. Replace from an older file wipes the device's unreadable changes without a word (confirmed)

`src/lib/backup/io.ts:90-101` (`openBackup`) builds the Replace warning (`onlyHere`, `changedHere`) from `exportChanges()`, which leaves out unreadable changes (R3). If the device holds such a change and the file does not:

- the confirm says "every plant here is in the file too";
- `replaceFromStaging` clears the log;
- the change is gone.

R3 refuses Replace when the *file* holds an unreadable change, because it "would be lost for good". The device's own unreadable change is lost the same way, unmentioned.

Reproduction: `npx vitest run tests/unit/zzd-malformed.test.ts` gives `onlyHere [] changedHere 0`, and after `restoreBackup(opened,'replace')` the `harvest` change is gone.

Fix: count `exportLog().unreadable` in `openBackup`. Refuse, or say, as for the file: "N changes on this device cannot be read by this version and are not in the file; replacing loses them".

### 6. Without Web Locks, the seed lands over a plant the visitor added in another tab (confirmed)

`src/lib/ui/grow/demo-seed.ts:169`. The commit requires only "no seed's mark" and "the claim is mine". The log being empty is read before the claim's minute starts (`seedState`), not in the transaction.

The scenario: tab A claims and is suspended (the case X6 exists for). Tab B's seed is refused, since A holds the claim. The visitor adds a plant in B. A wakes within its minute and commits the seed. Then:

- the visitor's plant and a seed seedling share 2026-0001 (the seed numbers from its own `taken` set);
- `SEED_MARK` is the seed's last arrival, so the visitor's plant counts as the seed's;
- `sampleEdits()` is 0, and Leave deletes the plant without asking.

Reproduction: `npx vitest run tests/unit/zzd-seed.test.ts` prints `seeded true plants 13 number 2026-0001 held by [ 'Visitor plant', 'Astrophytum asterias' ] edits counted 0`.

Fix: a further condition in `storeIn`, checked in the same transaction: the `order` store is empty (`requireEmpty`), or `requireMeta`'s equivalent on the last arrival.

### 7. Smaller

- **(a) The plant and batch forms' Keep drops the containing place.** It carries a picked or new place by name and kind only, not the place it sits inside. `draftOf` (plants/new:66, propagation/new:115) and the picker's `typed` (`LocationPicker.svelte:14`) have no parent. The grower's "New…" opens "Bench 1" at the top level even when the grower has a "Greenhouse". Places carries its parent (places/+page.svelte:71). No test checks either (see MX20, MX21). Read.
- **(b) An add link that does not lead out (X7).** `ForeignLabel.svelte:28`, "add one to my plants", leads into the example's add form from a scanned label opened in an example tab. Read.
- **(c) A Keep test that is fragile.** `tests/e2e/r69x-example.spec.ts:55` checks that no address contains "42". On port 4204 the address always does, so the test fails twice on every run: `Received string: "http://127.0.0.1:4204/plants/new?kept=1&left=gs5qetf3mv5cu5cw"`. On 4173 it fails at random, about 0.5% of runs, whenever Leave's base-36 token contains "42". Fix: check only `new URL(a).search` without `left`, and type values no token can hold.
- **(d) The unsettled bar note is untested.** `example.svelte.ts:165`: `noteOwn`'s branch for an unsettled collection is reached only when `whenSettled` gives up after 10 s, and no test reaches it (MX25).

## Mutation tests

I applied each mutation to the copy and ran the related unit files (X 21 files, clock 21, R3 12, R1 20, R4/R5 6; all pass unmutated), then restored the file. `fold-rules.test.ts` was left out, since its source hash kills any edit to the files it hashes.

**Killed (48):**

- **X1:**
  - token compare (MX1);
  - token removed on read (MX2);
  - the address's foreign token still taking the tab out (MX37);
  - `finishLeaving`'s LEFT check (MX38).
- **X2:**
  - the generation compare in app.html (MX3);
  - Leave's generation at `pagehide` (MX4);
  - `finishLeaving`'s generation (MX5, by `r69x-keep` only);
  - typed input (MX7);
  - `freshOnRestore` (MX8);
  - the storage listener (MX9);
  - the leftover's age (MX10);
  - its generation (MX11);
  - "noted when shown" restored (MX12);
  - `enterDemo`'s note (MX13).
- **X3:**
  - `hold` (MX14);
  - the `kept` check (MX15);
  - read once (MX16);
  - the form check (MX17);
  - `lastWatered` dropped from `draftOf` (MX19);
  - a declined Leave's release (MX39).
- **X4, X5:** `replaceWaiting` (MX22), `hadOwn`'s null (MX24), the settled wait (MX26).
- **X6:**
  - the seed-mark condition (MX27, by a call-shape spy only; the vault's `absent` is caught by `r69r-vault`, MX30b);
  - the claim (MX28);
  - clearing only one's own claim (MX29).
- **X7:** "Sow seed" (MX34).
- **R2:** all ten clock mutations:
  - `checkedNow` in force (MC1);
  - `latestNowMs` to `nowMs` (MC2);
  - a disagreeing reading taking the correction out (MC3);
  - any forward move taking it out (MC4);
  - the snapshot keyed by the clock in force (MC5);
  - `latestNowMs` without the stored offset (MC6);
  - `out` not read (MC7) or not written (MC8);
  - no wait at load (MC9);
  - no following of held stamps (MC10).
- **R3:**
  - the outbox fill (MR3a);
  - the push (MR3b);
  - `unreadable.json` (MR3d);
  - `foldable` (MR3e);
  - Replace refused (MR3g);
  - `Opening` (MX33).
- **R1:**
  - exact-day swaps (MR1a);
  - ambiguous readings (MR1b);
  - the price (MR1c);
  - the notes (MR1d);
  - the old key's date check (MR1f);
  - number alone (MR1g).
- **R4** (MR4) and **R5** (MR5).

**Survived (10):**

- **MX6:** "Delete it" writes no new generation, so a tab away in that example is not sent home.
- **MX18:** the price is not applied from a draft. Only the e2e test catches it, and that test is broken at port 42xx (7c).
- **MX20** and **MX21:** the batch form's place and Places' parent are not applied from a draft.
- **MX23:** an unreadable change no longer makes the collection "not empty" (X4's second half).
- **MX25:** the hint read as "no" after the time-out.
- **MX30:** the vault's `absent` always holds. The X files miss it; R's own file catches it.
- **MX35:** `kept` not taken off the address. Only the e2e test catches it.
- **MR3c:** `exportLog` not setting unreadable rows apart. Backups survive (`buildBackup` filters again), but My plants' "Download as a spreadsheet" then throws `"id" is a reserved record field` on a log holding such a change. `tests/unit/zzd-sheet.test.ts` kills it.
- **MR1e:** `onlyIfUnique` dropped. Nothing tests a sheet that gains a column telling apart two lines it lacked before.

## Checked and sound

- **X1, by test.** Leave writes a one-use token, the first page marks the delete only on a match, and a plain or foreign `?left=` takes the tab out and deletes nothing. A Leave called off keeps its token in the tab only: no address carries it, and a replay of the stripped history entry matches nothing. The existing `r69x-example.spec.ts` X1 and X2 cases pass here.
- **X2, by reading every writer of `cultifolio.sampleGen`.** `pagehide`, `finishLeaving`, "Delete it" and an over-age leftover are the only writers, and none fires on a Leave called off. A Leave whose 10 s fallback ran while the navigation still landed still closes the other tabs, through the storage listener. A tab with typed input stays, closed, by the channel, storage and vault paths (`sampleClosedHere`).
- **X3 is complete.** Every field the plant and batch forms bind is in `draftOf`. Nothing typed reaches an address, as `framenavigated` addresses show. A draft is read only with `kept`, only by its own form, and once. A declined or called-off Leave drops it. No draft reaches the grower's log except through the grower's own Save.
- **X6 holds for its own case.** With claims, a stale claimant writes nothing and clears only its own claim (`r69x-seed`). Finding 6 is a different window.
- **Rule 6.** I found no write to the log from a reading: load, Opening, `exportLog`, `previewMerge`, the import's marking, applying a Keep draft. `seedState`'s repair writes meta in the example only.
- **R3.** No path loses an unreadable change from export, the outbox, the push or a backup made here. A Merge preview names a file's unreadable rows.
- **R1.** `5/1/24`, `01.05.2024`, a time after the date, named months, CRLF inside notes and a trailing space dropped all find their plant. Two identical lines that gain a "done" column stay found.

## Not done

- WebKit and Firefox, and Safari's own back-forward cache: everything here ran in Chromium.
- The R46-28 race (out of scope).
- R6's renumber notes beyond its own test.
- The engine's pull and park against a real server with a slow clock.
- A full-suite run with my tests in place.
