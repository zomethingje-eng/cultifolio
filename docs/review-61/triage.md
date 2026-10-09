# Round 61 self-review: triage and seams

## Opening

The round did what the triage decided, nearly item by item. Where it departed, `docs/REVIEW-ROUND-61.md` mostly says so. The gaps are at the seams:

- **A protocol need that was not applied.** The server's "It tries again shortly" answer is shown on a join, but nothing tries again.
- **A rule the merge changed in one place but not in its copy.** The import still carries a copy of the collection's year rule, and agent G's own test pins the old behaviour.
- **One rule read against two clocks.** Today and the plants list share the photo-due rule but give it different "now"s.
- **Two implementations of one rule.** "The sample was closed in another tab" is handled twice, and the copies disagree.
- **Dead code.** The merge left helpers and constants behind.
- **Overclaims in the round's own account.** It says more than its tests and logs show.

Nothing found here loses data or breaks a privacy promise. The first item is the one a grower can meet in the first weeks.

What I did:

- **The triage.** I checked every bullet of `docs/REVIEW-TRIAGE-60.md` against the code at f4ab4f8.
- **The agents' hand-offs.** I checked every item in the seven agents' "Needs from others" and "Text for the about pages" (`/tmp/r61/*-report.md`) against the merged code and both about pages.
- **The merge.** I diffed the merged tree against the base (`/tmp/r61/base.tar`). I compared the merge's own logs and checksums (`/tmp/r61/merge/e2e{1,2,3}.log`, `final-md5.txt`) with the round's claims.
- **Storage keys.** I enumerated every `localStorage`/`sessionStorage` call and every `cultifolio*` name in `src`.
- **Headers.** I curled 18 routes on 4173 for their security headers.
- **Counts, limits and times.** I checked every one stated on the two about pages against its constant.
- **Tests run.** In my copy I ran `fold-rules`, `r61w-about-seams`, `r61g-import` (with a mutation) and two new tests of my own. One mutation was checked against both the old seam test and my new guard. Every mutation was reverted and checked with md5sum.

## Findings, ranked by what matters before launch

### 1. P2, read. Joining a vault while uploads are landing fails with "It tries again shortly", and nothing tries again

**Where.** `src/lib/server/sync.ts:489` (`RecountCrossed.response`), `src/routes/api/sync/vault/+server.ts:70`, `src/lib/sync/engine.svelte.ts:288-297` (`setup`).

**What happens.**

- A join (`POST /api/sync/vault`, `create:false`) recounts the vault when its last listing is more than an hour old (`vaultBytes(..., open = true)`).
- If uploads from the first device keep crossing both listings, the route answers 503 with `Retry-After: 30` and the sentence "The site could not count this vault just now: other uploads kept landing while it was counted. It tries again shortly."
- `setup()` turns any non-OK answer into a thrown error carrying that sentence. The sync page shows it as the join's failure.
- Nothing is scheduled. The grower is told the site will try again, and it never does.

**Who knew.** Agent S's report (section 4, table row 4) asked the lead: "Open/join (`engine.svelte.ts:262`) throws with the sentence. Better: treat it as a short wait and open again after Retry-After, not as a failure." It was not applied, and REVIEW-ROUND-61 section 11 does not list it. A push gets the same 503 right: it is under 60 s, so it is not kept, and the run is retried in 30 s.

**When it bites.** The case is a second device joining while the first is pushing a large backlog (photographs), more than an hour after the vault was last listed.

**What should happen.** Either `setup` waits out a `Retry-After` under a minute and asks again (twice at most), or the vault route says "Try joining again in half a minute" instead of a promise the client does not keep.

**Repro (by reading).** `r61s-recount.test.ts` already shows the route's 503. In `setup`, the `!r.ok` branch has no retry path for it.

### 2. P2, confirmed. The import keeps its own copy of "which year the collection mints for", and the merge updated only the collection's copy

**Where.** `src/lib/import/commit.ts:60-61` and `:110-112`; `src/lib/db/collection.svelte.ts:15`; `src/lib/import/plan.ts:49`; `tests/unit/r61g-import.test.ts:162`.

**What happens.**

- Agent G's "Needs from others" item 3 asked the lead to change `collection.svelte.ts`'s `yearOf` to `/^\d{4}(?:-|$)/`, so a year-only `acquired` ("2009") mints that year's numbers. The lead did that.
- G's commit code works around the old rule with its own `mintYear` (still `/^\d{4}-/`). Its comment says "a year-only or unread date: the collection mints those for this year". That stopped being true at the merge.
- So a sheet row "Copiapoa cinerea, qty 3, acquired 2009" is still written one plant at a time: three commits where one `addAccessions(3, …)` now mints 2009-0001 to 2009-0003 by itself.
- `/about/formats` says "Each line is its own change, so an import cut off partway keeps the lines before it". For such a row that is false.
- A stop mid-row leaves part of a line. If the row gave its own number, a later run sees the first plant's number held under the same name and skips the whole line as "already imported" by default, so the rest of the row is not added unless the grower presses "Add them anyway".

**A test written against the old behaviour.** G's test pins the workaround: `expect(mem.appends - before).toBe(1 + 1 + 2 + 1 + 1)`, with the comment "the year-only row of two plants written per plant". With `mintYear` corrected, that test fails (5 appends, not 6).

There are three year readers now: `collection.yearOf`, `plan.yearOf` (both fixed) and `commit.mintYear` (stale).

**Repro.** `/tmp/r61rev/out/tests/triage--import-year-seam.test.ts` FAILS on f4ab4f8 ("expected 4 to be 2": the species record plus three plant writes). It passes once `mintYear`'s regex is `/^\d{4}(?:-|$)/`; that mutation was checked and reverted (md5 OK).

**Smallest fix.**

1. Delete `mintYear`, and import the one `yearOf` from `$core` (move it there), or export it from `plan.ts`.
2. Change G's expectation to `1 + 1 + 1 + 1 + 1`.

### 3. P3, read. The "one rule" for photographs due runs on two clocks

**Where.** `src/lib/ui/Today.svelte:47,53` and `src/routes/plants/+page.svelte:112`.

**What happens.**

- Triage 12 ("Today's photo count and its chip agree") was done by moving the rule into `src/lib/ui/photo-due.ts`.
- Today calls `photoDueDays(today)` with `const today = new Date()`, the raw device clock. The list calls `photoDueDays()`, whose default is `new Date(nowMs())`, the corrected clock.
- On a device whose clock is wrong by a day or more and has a server correction in force (the very case corrections exist for), Today and the chip it links to count different plants near the twelve-month and six-month edges.
- The rule's own fallback (`localDate()`) inside `photoDue` already uses the corrected clock, so Today mixes the two clocks within one reading.

**Smallest fix.** In Today, `photoDueDays()` with no argument, or `const today = new Date(nowMs())`.

### 4. P3, read. "The sample was closed in another tab" is handled twice, and the copies disagree; a third copy is dead

**Where.** `src/lib/db/vault.ts:125`, `src/lib/db/demo.ts:28-34,59-66`, `src/lib/ui/stored.ts:56-60`.

**What happens.**

- **The channel path** (`keepSampleOpen`, G) runs `clearFlag()`. That removes the flag and every `cultifolio.demo.*` copy. It then sets `cultifolio.sampleClosed` and goes to `/`, where DemoBar's toast says why.
- **The vault path** (G's "Needs from others" item 2, applied at the merge) runs when `versionchange` arrives first, or where there is no BroadcastChannel. It:
  - removes only `cultifolio.demo` and leaves the tab's `cultifolio.demo.units`, `.labels` and other copies in session storage;
  - sets no `cultifolio.sampleClosed`;
  - calls `notify(...)`, then navigates at once with `location.href = '/'`, so the notice is lost with the page.
- `/about/formats#sample` says the other tabs "go to your own collection and say why". The vault path does not say why.
- `stored.ts` exports `clearSampleSettings()`, a third copy of the clearing rule that nothing calls.
- `vault.ts` also reads the flag with its own literal `'cultifolio.demo'` (lines 35 and 125) instead of `inDemo()` and `KEY` in `demo.ts`.

**Smallest fix.** Export one `sampleClosedHere()` from `demo.ts` (clear the flag and copies, set `CLOSED_NOTE`, go to `/`). Call it from both places, and delete `clearSampleSettings`.

### 5. P3, confirmed. The permanent seam test does not check the store a key is in, keys without the `cultifolio.` prefix, or a second writer around stored.ts

**Where.** `tests/unit/r61w-about-seams.test.ts`.

**What it checks.** Only that each `'cultifolio.*'` literal appears somewhere on `/about/how`.

**Mutation run.** I moved `storage-notice-hidden` from `sessionStorage` to `localStorage` in `plants/+page.svelte`. All 9 seam tests still pass. The page would then list the key under the wrong store.

**Today the list is right.** Every one of the 25 keys is under the right store, and each key's `stored.ts` scope matches what `/about/formats#sample` says.

**Guard.** `/tmp/r61rev/out/tests/triage--storage-keys-by-store.test.ts` PASSES on f4ab4f8 and FAILS under that mutation. It checks:

- local keys against the local part of the list, and session keys against the session part;
- constants resolved within each file;
- that no key routed through `readSetting`/`writeSetting` is also written directly with `localStorage.setItem` or `removeItem`.

Still unchecked by any test: cookie names, IndexedDB and cache names, and the Web Lock and BroadcastChannel names (`cultifolio-sample-open`, `cultifolio-sample`). All are on the pages today.

### 6. P3, read. The round's account claims more than its tests and logs show

**Where.** `docs/REVIEW-ROUND-61.md`, the opening and section 8.

**"Each agent showed its new tests failing on the base first" (section 8).** The agents' own reports say otherwise:

- **L:** `r61l-clock-devices` (7 of 10) and `r61l-clock-fuzz-classify` pass on the base, "because their harness itself now does what the engine does". L did not build the base for `r61l-records.spec.ts`.
- **W:** did not rebuild the base for the two adopted e2e tests.
- **Q:** did not run its e2e test on the base.
- **H:** the 13 adopted guards pass on the base by design.

**"Two earlier full runs found five failures and three flaky tests" (the opening).** `/tmp/r61/merge/e2e1.log` has 3 failed and 1 flaky; `e2e2.log` has 1 failed and 1 flaky. That is 4 and 2.

**"All 179 passing on the last full run."** That run (`e2e3.log`, 00:23:58) predates:

- the last edit to `tests/e2e/smoke.spec.ts` (00:24:55, recorded in `final-md5.txt`);
- the section 12 changes (`index-entry.ts`, `/about/how`, `r61g-layout-bundle`).

None of these is likely to change an e2e result, but the claim is about an earlier tree.

**"Fixed waits before negative assertions wait for the operation instead" (section 8).** H changed four and left eight commented short pauses in `smoke.spec.ts` (1509, 1545, 1550, 1986, 2628, 2641, 2767, 3173). Two new tests of this round add fixed waits before a negative CLS assertion:

- `r61a-a11y.spec.ts:135` (`waitForTimeout(2000)`);
- `r61g-import-labels.spec.ts:142` (`waitForTimeout(1000)`).

That is the pattern triage 13 retired.

**Smallest fix.** Reword the three sentences to what the logs show. In the two CLS tests, wait for the last held section to render (Today's `#firsts` or `#frost`) before reading CLS.

### 7. P3, read. Not done and not listed in section 9 ("Not done")

- **The plant page "Source" link contrast** (a11y review 12; 2.03:1 in dark, not underlined; `plants/[acc]/+page.svelte:812`). A handed it to L ("Items from my review list that sit in other agents' files"). L's report does not mention it, and the plant page's styles are unchanged from the base. It is part of triage 11's P3 list ("contrast").
- **Imported partial dates on the edit form** (G's optional need 8). `type="date"` shows an imported `2009` or `2017-08` as empty. The stored value survives only while the field is untouched, and nothing on the form says what it holds.
- **The rest:**
  - **Corpus 8's third retry step** (Q, optional): not applied.
  - **The labels page's convention sentence** (W, optional): not added.
  - **One-commit Archive Undo** (A, optional: `putWith` returning event ids): not done.
  - **The engine's `init` guard in the sample** (G's need 1): applied as `setup` throws plus `run` and `runNow` return instead. That is harmless, since the sample database has no sync record. It is a departure, unsaid.

### 8. P3, read. About-page sentences the code keeps only loosely

- **The 409 retry.** `/about/formats` says "it asks again at a later sync, at most once an hour", and `/about/how` says "at most hourly". The hour lives in a per-tab `Map` (`engine.svelte.ts:403`, `asked409`), so every reload or new tab asks at once. L's report said "in a tab". Say "at most once an hour in an open page", or keep the time in the sync record.
- **"Anything shaped like a plant number"** is never sent (`/about/formats`). The test is `/^\d{2,4}-?\d/` (`+page.svelte:374`), so a prefix-scheme number such as "ACC-0013" with no local hit goes to `/api/search`. Still open from 60 (corpus 14). Q offered `isAccessionNumber` as the fix, and it was not taken.
- **Common-name tiebreakers.** `/about/how` lists "then GBIF's own order, the shorter name and alphabetical order". In `englishNames` (`index-entry.ts:105`), `a.at` (GBIF's order) is unique per name group, so the length and alphabetical steps can never decide. The stated rule is kept, but two of its steps are dead. Either drop them from the page, or drop `a.at` if the order of a build's fetch should not decide (the triage's "so the choice never depends on the order of the build").
- **The phone front page.** Section 6.4 says "the cards are not drawn on a phone". They are rendered on the server and hidden by CSS (`+page.svelte:810`, `@media (max-width: 899px) { .feature { display: none } }`). Two test comments still say a phone "gets the link" or "the feature is the pitch's link, as in round sixty" (`smoke.spec.ts:3754`, `r61w-pages.spec.ts:70`), though W removed that link.
- **Stale comments.** Four code comments say parking is "more than a day past arrival" (`sync/+page.svelte:204`, `Parked.svelte:3`, `engine.svelte.ts:931`, `collection.svelte.ts:90`). `PARK_MS` is two days (`log.ts:200`), as both about pages say.

### 9. P3, read. Dead code and duplicated constants left by the merge

- **`src/lib/ui/grow/index.ts`.** The barrel has no importer left. A future `import { X } from '$lib/ui/grow'` would quietly undo the 157.7 to 136.5 KB win, and `r61g-layout-bundle` guards only the layout chunk. Delete it.
- **`clearSampleSettings`** (`stored.ts`): unused (finding 4).
- **`UPSTREAM_ADDRESS_PART`** is defined twice, in `sync.ts:1287` and `counters.ts:484` ("which this module cannot import"). `names-api.test.ts:93` uses a third literal `0.1`. `NET_FACTOR` (counters.ts) and `NET_RATE_FACTOR` (sync.ts) are the same 4. Move them to a shared constants module both can import.
- **`upstreamAllowed`** is kept "for the callers that have not moved". `synonyms.ts:69` is the only one.
- **`commit.mintYear`** duplicates `yearOf` (finding 2).

### 10. P3, still open from 60 (not taken by the triage). The round-60 triage review's merge leftovers are unchanged

`docs/review-60/triage.md` section 14 listed these. The triage did not take them, and all are still there:

- two plural helpers (`core/words.ts`, `ui/words.ts`) plus 163 inline `=== 1 ?` ternaries;
- inline `readerLat` copies (`compare/+page.svelte:26`, `species/[slug]/+page.svelte:187`);
- `photoCredit` used only by a test;
- `generatedNote` used only by tests;
- `PHOTO_REMOVED_AT_HEADER` exported while the engine sends the literal `'x-photo-removed-at'`;
- the unused exports `getIndexWithCorpus`, `creationDay`, `corpusId`, `hlcBefore`, `isAccessionNumber`, `r2GridSource` and `httpGridSource`;
- `dbg-proxy.mjs` (a logging proxy to 4173) still in the repository root and not in `.gitignore`, so it ships in the public repository at launch.

## The triage, decision by decision

"Done" means done as decided, with the evidence named.

### 1. The clock

- **Own changes judged by arrival.** Done: `ownToJudge` and `judgeOwn` in `engine.svelte.ts`, with `r61l-engine.test.ts` failing on the base.
- **Rebase removed.** Done: `staleOwn`, `saveParked` and `flushParked` are gone.
- **Stamp past.** Done differently, and said (section 1.3): a marked counter bit (0x800000), not "parked unless made after the clock was put right".
- **Apply on a parked restore.** Done.
- **Correction lapse.** Done, narrowed to corrections over five minutes. Said (section 1.5), and formats states it.
- **Rule 5.** Done.
- **FOLD_RULES 6, hash inputs, fuzz bound zero.** Done. `fold-rules.test.ts` passes; the hash covers `stampPast`, `commit`, `clockChanged`, `ownToJudge` and `judgeOwn`.
- **The five-round test.** Adopted. Its collection-level form passes on the base (finding 6); the engine-level one is in `r61l-engine`.

### 2. Records

Done: the `{#key}` layouts for `plants/[acc]`, `propagation/[id]` and `places/[id]`; `removedAccession` by id; chips by `plantHref`; Enter on a shared number opens the chooser; `?parent=` by id.

### 3. The import

Done, with one stale copy of the year rule (finding 2):

- unmapped columns listed and added to the notes;
- Qty (1 to 200), Genus joined, a bracketed part kept as the name as received;
- cf./aff./sp./nov. kept, the reference asked with the species part;
- dates at their precision, one choice for the sheet, "leave them" the default;
- the plan frozen while adding, the running maximum, the leave guard, "already imported", a failure before the first plant said;
- the unclosed quote, the repeated header, " › " only, notes as written;
- "only lines that need me" and "Last watered".

### 4. Labels

Done: the stored choice is read first and the saving effect skips its first run; the print padding is zero; the QR name is cut by code point and one bad code fails only itself. The demo bar, backup nudge, iPhone card and held notice each have a `@media print` hide.

### 5. Photographs

Done: removal decided by claims alone; a claim only with the matching proof; the proof checked first; a 409 asked again; hold fencing (`renew` and a second head); B10 as `it.fails` (`r61s-photo-removal.test.ts:156`); the residual race stated on formats.

### 6. The server

Done:

- recount generation check plus a 503 with `Retry-After: 30`;
- `unadmit` and `inFlight`, `filled` at the first landing, the KV key per vault;
- the 90-day reclaim (`RECLAIM_DAYS = 90`, in DEPLOY.md and on formats);
- the refusal kept in the sync record, and "or within the hour" on the sync page and formats;
- the cap in the counter object, with 600 per service, a tenth per address and four tenths per /48, the NWS counted, and "not asked" in the forecast, the frost line, the picker and the 404;
- lease expiry marks the count stale;
- the sweep pages through its keys;
- the redirects carry their headers (curl confirmed).

The "busy" photo answer has a fixed `Retry-After: 10`. The client side of the recount 503 on a join is not done (finding 1).

### 7. Search

Done:

- the author rule and the dotted word;
- hybrids, cultivars and hyphenated epithets;
- the picker (no relaxed hits, keeps the rank);
- code-point cuts;
- `preferred` and `sources` kept;
- the species page computes its names on the server with the corpus's genera (Q's need, applied).

Done differently, and said (section 12): hyphen capitals and the fewest-capitals spelling were dropped after the first build. Two of the stated tiebreakers can never act (finding 8).

### 8. Words

Done: the figure labels on the glance row, compare and the card; CHELSA in the caption; the hero credit; refused or pending said as such; ties on every surface including the plant page (W's need, applied at `plants/[acc]/+page.svelte:136,161`); the card's hemisphere; "convention, no source"; the title; every about-page item the triage listed; the seam test permanent (but thin, finding 5); the wording.

### 9. The front page

- **Desktop:** done.
- **Phones:** done differently, and said (section 6.4: no feature at all).
- **`feature` only for the plain front page:** done.
- **The sample first in the welcome line:** done.
- **The season card:** W also took it off the front page (V19, inside W's brief). The round's account does not mention this.

### 10. The sample collection

- **Settings locked:** done, with h1s kept.
- **Units and site:** done differently. They are kept per tab rather than locked; section 3.6 says so in effect.
- **Flag before paint and one commit:** done.
- **Leftover deleted:** done where Web Locks exist.
- **The second tab told:** done, but one of its two paths says nothing (finding 4).
- **Code guards** (setup, run, restore, staging, the per-collection staging name): done.
- **`stored.ts`:** done for every setting. The non-setting keys read directly are device-wide by nature and listed correctly.

### 11. Accessibility

Done: the toast (`HOLD_MAX_MS = 30_000`); `aria-disabled`; the grow layer by path (no barrel importer remains, but the barrel file is left: finding 9); Today's hold; forced colours; reflow; bars under 480 px; Move with no place chosen ("New…" dropped, said); Archive Undo; the locked h1s; the P3s. One exception: the Source link's contrast is half done (finding 7).

### 12. The grower

Done: the place filter and "Select these" (`/plants?place=<id>&select=1`, both ends agree); the sync page's words; one photo rule (but two clocks, finding 3); spending per currency; "A plant label"; the calendar (VALARM `TRIGGER:PT9H`, `UNTIL` runs, `DRY_HORIZON_DAYS = 730`, an all-dry place left out, "delete the old events"); the second hiding rule deleted; the persistence toast after navigation.

### 13. The harness

Done: the year (clockshift helper, `r61h-year`); the adopted guards (the arch-table guard is now a plain `it` after Oxalis left `genus.geophyte`; `archFor` checks `none` first, so no page changes, as section 7.4 says); the vacuous tests (H's three hand-offs to L landed); the timeouts; `PW_PORT`. The negative waits are half done (finding 6).

### Deferred items

As stated. The about pages carry no `lastmod` (`sitemap.ts:53`).

## The seams: every hand-off

### Applied correctly

- **L:**
  - DemoBar spares `.phead` (`DemoBar.svelte:70-71`);
  - S's protocol (recount `Retry-After` 30 < 60, so not kept; 409 asked again; 403 said once);
  - "Select these" URL;
  - the hash re-recorded.
- **S:**
  - the engine's 409;
  - the names route on `upstreamCall` and `heldBack`;
  - `synonymOf` returns `'held'`, and the 404's sentence;
  - the picker's held sentence;
  - `forecastRefusal(r)` in Today and the place page;
  - the H upstream-cap test now expects 503;
  - `names-api` expects 60 calls.
- **Q:**
  - the species page's server-side `commonNames`;
  - corpus 17 (`heavy`, one count per request).
- **W:** the plant page's ties.
- **G:**
  - vault staging per collection, refused in the sample, and the blocking notice (but see finding 4);
  - `yearOf` (but see finding 2);
  - the front page's `hasMine` guard (and the layout's);
  - the propagation pages through `stored.ts`;
  - grow imports by path in `plants/+page`, `plants/[acc]` and `today/+page`;
  - H's backup-numbers test inverted.
- **A:** the R14 diff, exactly as given (`collection.svelte.ts:1605-1628`).
- **H:**
  - the fuzz bound (L's zero bound replaces the suggested 26);
  - the refusal's upper bound (`r60-review-server-engine.test.ts:303`);
  - the notes-review title;
  - the arch-table guard.
- **Every e2e expectation each agent listed** is in the specs by text: L's "A plant label"; W's six; A's two; G's five, with `${y}` years.

### Not applied, or applied differently

- **S:** treat the recount 503 on a join as a short wait (finding 1).
- **G:** item 1, the `init` guard (applied differently); item 8, the optional date hint (finding 7).
- **A:** the Source contrast (finding 7).
- **Optional items not applied:** Q's corpus 8 and corpus 14 (finding 8); W's labels-page convention and the dossier builder's clauses (the latter is said in section 9).

### Text for the about pages

All of L's five formats texts and one how text, S's ten, Q's four, G's five and A's three are on the pages, merged by hand. Each one checked against code is true, except:

- the 409 "hourly" (finding 8);
- "each line is its own change" for multi-plant year-only rows (finding 2);
- "say why" on the sample's vault path (finding 4).

Q's "a capital straight after a hyphen is lowered" was correctly left out after section 12.

## Consistency sweep

### Storage keys

Every key in `src` is on `/about/how`, under the right store:

- **local:** 17 keys;
- **session:** `cultifolio.forecast`, `.demo`, `.demo.*`, `.sampleClosed`, `.freshKey`, `.backupNudgeHidden`, `.iosFirstHidden` and `storage-notice-hidden`.

Every `stored.ts` scope matches `/about/formats#sample`:

- **device scope:** units, labels, prefs, theme, `countMode`, `persistAfterFirst`;
- **collection scope:** `frost.site`, `lastLocation`, `lastSowLocation`.

`persistAfterFirst` is never written in the sample, because GrowLayer returns on `inDemo()`.

Keys read directly rather than through the helper:

- `hasMine` (layout and front page, both guarded in the sample);
- `welcomed`, `compare`, `corpus`, the install keys and the clock keys: device-wide by nature;
- `cultifolio.theme` in `app.html` before paint: harmless, because Settings, the only theme writer, is locked in the sample;
- the units cookie, read by `backup/device.ts:24` separately from the units store: two readers, consistent today.

### Headers

I curled `/`, a species page, both about pages, `/offline`, `/benches/x`, `/sowings`, `/plants`, five API routes, `/sitemap.xml`, `/robots.txt`, `/service-worker.js`, `/manifest.webmanifest` and a 404:

- all 18 carry nosniff, Permissions-Policy, HSTS, Referrer-Policy and XFO;
- the dynamic pages carry a CSP header;
- the prerendered about pages carry the CSP as a meta tag;
- `noindex` is on `/plants` and `/offline`.

`hooks.server.ts:77` still says `static/_headers`. The file is at the root (`_headers`), as its own comment says.

### Counts, limits and times on the pages against the constants

Each matches:

| Stated | Constant |
|---|---|
| 600 a minute per service | `RATE.upstream.limit` |
| a tenth per address | `UPSTREAM_ADDRESS_PART` |
| four tenths per /48 | `NET_FACTOR` 4 |
| 90 days | `RECLAIM_DAYS` |
| two days (parking) | `PARK_MS` |
| five minutes ahead | `MAX_AHEAD_MS` |
| five minutes of slack | `age > -5 * 60_000` |
| half a minute | `TRUST_SERVER_PAST_MS` |
| 30 s recount wait | `RECOUNT_RETRY_S` |
| an hour (refusal cap) | `3600_000` in `readRefusal` |
| at most once an hour (recount on open) | `RECOUNT_MS` |
| hourly (409) | `ASK_409_MS` (per tab, finding 8) |
| ten minutes (drop) | `DROP_AFTER_MS` |
| ten minutes (leases) | `LEASE_MS` |
| a minute (hold) | `HOLD_MS` |
| half an hour (forecast) | `FORECAST_TTL_MS` |
| ten seconds (forecast timeout) | `AbortSignal.timeout(10_000)` |
| an hour (forecast at the edge) | `max-age=3600` |
| a day (search at the edge) | `CACHE_S` |
| a day (backbone at the edge) | `max-age=86400` |
| two minutes (KV fallback) | `2 * windowMs` |
| 60 characters (QR name) | `QR_NAME_MAX` |
| 09:00 | `TRIGGER:PT9H` |
| two years | `DRY_HORIZON_DAYS` 730 |
| six and twelve months | `photo-due.ts` |
| 50 chips | Today |
| 200 (Qty, not on the page) | `QTY_MAX` |
| 2 GB, 200 and 2,000 places, 5 new vaults a day, 600 and 3,000 requests per ten minutes | as before |

## Checked and sound

- **FOLD_RULES and the hash.** `fold-rules.test.ts` passes. The merge's re-recorded hash covers the whole of `vault.ts`, as its comment says.
- **Section 7.4 (Oxalis).** `archFor` checks `none` before the genus table, so no Oxalis page changes. No other code reads `genus.geophyte`.
- **The species picker, the 404 and the forecast** all distinguish a held call (503, or 429 with `held: true`) from a silence.
- **Common names.** No page reads `d.name.vernacular` outside the species server load. Compare and the cards use the index's names, so the page and the tile agree.
- **Imported partial dates.** `acquired` as `YYYY` or `YYYY-MM` is read safely by:
  - `daysBetween` (month and day default to 1);
  - `photoDue` (string comparison);
  - the spending year (`startsWith`);
  - the calendar (`madeOn` comes first);
  - the log validator (`acquired` and event `d` are plain strings).
- **Counts.** 130 unit test files; 2 `it.fails` (`r61q-refusal-walk:111`, corpus 13 open by choice, and `r61s-photo-removal:156`, B10); 1 skip (`INDEX`). These match the stated 1,097 + 2 + 1. There are 179 e2e tests in 9 spec files.
- **Sitemap.** About pages and `/` carry no `lastmod`.
- **Dead symbols.** No `staleOwn`, `dryDates`, `EXDATE`, `saveParked` or `flushParked` is left in `src`, and no stray `playwright.r61w.config.ts`.

## Tests written

- `/tmp/r61rev/out/tests/triage--import-year-seam.test.ts`: FAILS on f4ab4f8 (finding 2). Run with `npx vitest run tests/unit/triage--import-year-seam.test.ts`.
- `/tmp/r61rev/out/tests/triage--storage-keys-by-store.test.ts`: PASSES; a guard to adopt beside `r61w-about-seams` (finding 5). It fails when a key moves store, which the existing seam test misses.
