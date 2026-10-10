# Triage of the reviews of rounds sixty-two to sixty-six

Three reviews of commit `8f2d56c`:

| Short name | What it is | Findings | How it was run |
|---|---|---|---|
| **S** | `REVIEW-SELF-66.md`, six internal reviewers | 69 | Real corpus read locally |
| **R45** | Outside review "round forty-five" | 29 | Linux sandbox; 70 reverts of these rounds' fixes |
| **IND** | Independent review | 9 | Windows; WebKit and Firefox run; live site checked |

Each finding is cited by its review and number, so S-A1 is the self-review's A1 and R45-14 is R45's 14.

The owner's instruction is to fix everything worth fixing. Where the reviews offer a choice, the decision is the one the self-review recommended (its section 5), unless it is stated otherwise below. Each item is owned by one agent of round sixty-seven:

| Agent | Area |
|---|---|
| V | The visitor and the example collection |
| R | Records, the clock, the import and the vault |
| S | The server |
| N | Names, search and the corpus builder |
| P | Pages, words, privacy, the service worker and accessibility |
| H | The harness |

## Before the launch (all three reviews agree, or one review shows data loss)

**V1. A visitor's first plant goes into the example.** S-A1, R45-1.
- Inside the example, the top bar's "+", "Add one to my plants" and the add forms (a plant, a batch, a place) all lead out of the example first.
- Where something is already typed, the form says in one line that the plant joins the example and is deleted with it, and offers "Keep it as my own". That button leaves with what was typed in the address, which the form already reads.
- The bar's words change to say nothing added here is kept.

**V2. Closing an example tab deletes what the visitor added there, without a question.** R45-2.
- `dropLeftoverSample` runs the `sampleEdits` count first.
- With edits, it keeps the database and offers it back once: "You left an example with N records you added. Open it, or delete it."

**V3. A page's collection is decided once, when the page loads.** S-A3, A4, A10; IND-1; R45-17. This is IND's first finding.
- **The flag.** "Which collection does this page show" is read once at load, as the vault already does, and every scope reads that. That covers settings, GrowLayer, the persist ask, sync, labels and the hint.
- **The closed state.** A peer's close, or a database deletion, puts the page into a closed state. Writes are refused with a sentence, and the typed draft is kept on screen to copy. The tab's flag and the example's settings are cleared only when the navigation really commits.
- **The closed database.** A closed example database is never reopened by that page.
- **Leave.** A Leave cancelled where the browser does not say so can no longer write as the grower's own.

**V4. "Empty" means the grower's own log folds to nothing and no frost site is set.** S-A2, R45-20, IND-3.
- `ownEmpty` reads the whole state (removed records, species notes and settings count) and the frost site.
- The bar's own-plants wording comes from the same test (S-A11).

**V5. The seed is one atomic thing.** S-A7, IND-6, R45-16, S-E1.
- **The commit.** The seed's commit writes its seeded mark and its boundary in the same transaction. The boundary is the seed's own last arrival number, not the highest stamp at some later moment.
- **The leftover state.** An example whose mark or boundary is missing has them repaired from the seed-tagged changes.
- **The no-Web-Locks path.** A failed seed stays retryable there.
- **The snapshot.** The fold snapshot is written after the seed.

**R1. A Replace that runs out of space** (S-C1).
- A pending switch blocks writes, and the page says the replacement finishes when there is room, then reloads.
- `openStaging` never deletes a staging copy that a pending switch needs.
- A resumed copy that fails leaves the collection openable, with the reason said.

**R2. A device whose slow clock is fixed while the tab is closed parks its own new plants everywhere** (R45-14). While the correction is unconfirmed, a positive offset applies only up to the trusted bound; above it, the device stamps by its raw clock until the next reading.

**S1. A bearer token can replace a live photograph through an unreadable pointer** (S-D1, R45-21). The upload waits as the removal does, and GET and HEAD answer 503 with Retry-After, never 404.

**S2. Workers Logs keeps every URL** (S-F1). Observability is turned off in `wrangler.jsonc`, and a seam test fails while it is on. Errors the server wants to know about stay as counts in the counter object.

**N1. Older names past the sixth cannot be searched** (S-B1). Every species-rank older name the dossier holds goes into the postings; the entry still shows six.

**N2. Common-name search pools words across names and places** (S-B2). A query is first read whole against each common name, as `/about/how` says. A hit's common-name words must come from one name.

**N3. The headline rule** (S-B3, S-B11).
- Distinct sources rank first, and "preferred" breaks ties only.
- A single generic noun and a species' own binomial are set back.
- About 280 headlines change, and the audit shows them before the deploy.

**N4. The builder** (S-B4, S-B5).
- The offline fetcher writes `skipped`, never `refused`.
- A rebuild never carries "already have them" without the photographs.
- The audit fails when a species drops to zero photographs or turns refused.
- A `--keys` option rebuilds a list of species online, and the 164 affected species are rebuilt that way on the PC.

**P1. "Keep data" asked on every load** (S-E4, S-F2, R45-6, IND-2).
- One gate for every ask, written before the browser is called.
- "Asked" and "answer shown" are kept apart.
- A test covers the monthly rule.

**P2. Text lost to the post-deploy reload** (R45-5, S-E6, S-E7).
- A page reloads early only when nothing has been typed and no vault write is in flight; otherwise it reloads at the next navigation.
- A tab that did not send `skip` still sets `reloadOnNext` when it runs an older build.
- A null build answer does nothing.
- The worker reads every cache it keeps.

## Medium

**The example (V):**
- **V6.** `?left=sample` deletes only under the open lock, and is honoured only for a tab that was leaving (S-A5).
- **V7.** The example offers no calendar file and no spreadsheet download, and shows no backup state; it says "deleted when you leave" instead (R45-3, S-F9).
- **V8.** Today's frost line in the example says the example has no site of its own, and how to set the visitor's own after leaving. A real place is not faked as the example's.
- **V9.** On a phone, the welcome's lead says what the site is: "Grow cacti, succulents or bulbs? …" (R45-4).
- **V10.** The welcome's own line is drawn from the server for a returning visitor, so the rows do not move (R45-8).

**Records and the vault (R):**
- **R3. Import duplicates** (S-C3, R45-15).
  - The import key is taken from the mapped fields as read, not the raw cells.
  - A line whose number and name match a plant here starts dropped.
  - Unnumbered lines that match a plant's name, date and source are said as "looks already imported, changed".
  - Removed plants' keys count.
  - Numbering stops at an unsafe integer.
- **R4.** Dropped lines stay dropped in later passes of a long sheet (S-C4).
- **R5.** A partly added line keeps the sheet's pattern (S-C5).
- **R6.** A round-sixty-one backup's parks are read as parks (S-C2).
- **R7.** The death Undo is one commit (S-C6).
- **R8.** Renumber chooses from every number ever issued, and a sibling note whose "to" is not current is hidden (R45-19).
- **R9.** `w` is accepted only within sane bounds (R45-22).
- **R10.** A malformed change is skipped and counted. A refused database is a failed state that Today and the offer can show (S-E15, R45-23).
- **R11.** Move, the plant Edit's Save and the batch Edit's Save are guarded against a double press (S-E3, IND-4, R45-18).
- **R12. `settlePlaces`** (S-E12, S-E13, S-E14, IND-5, R45-18).
  - It settles only the pressing form's own picker.
  - The import's picker is settled at "Check names".
  - A failed place shows its error in the picker, and no rejection goes unhandled.
- **R13. The cost of each change** (S-E1, S-E5, IND, R45-D).
  - The load's tail is read with one bounded range read, not one `get` per change.
  - `claimNow` advances the frontier.
  - A snapshot is written after an import and a restore.
  - The example writes no outbox rows.
  - One row per commit (a database version change) waits for a device measurement.
- **R14.** A price written "1 200 €" is read (R45-25).

**The server (S):**
- **S3.** A revival's pointer write is fenced, and the sweep re-puts the pointer conditionally before deleting (S-D2, R45-21).
- **S4.** The generation listing is paged, and a mark stays until a complete listing is clean; the R2 stand-in reports `truncated` (IND-8, R45-21).
- **S5. New vault places** (S-D3).
  - The day's places are also counted per /24 and per /48.
  - The counter object records when half the day's ceiling is spent, which the operator can read.
  - DEPLOY says what to do about an attack.
- **S6.** A per-vault budget on whole-log listings bounds the R2 list cost (S-D4).
- **S7.** The client's requests to the adapter-cached routes carry the build, so a deploy is not answered from the old build's cache. `/about/how` lists every copy Cloudflare keeps (S-D5).
- **S8. Refusals said as refusals** (S-D6, IND-7, R45-11).
  - The sheets and entries clients carry the status, reason and Retry-After.
  - "Check again" waits out the Retry-After.
  - MET Norway's and GBIF's 429 and 403 are worded "refused this site".
  - The NWS and build-time timeouts are not recorded as refusals.
  - NASA POWER's wording matches its status.
- **S9. Limits and their words** (S-D7, S-D8, S-D9, R45-24).
  - The /48 limit is worded "this network", with Retry-After until midnight.
  - The share figures say what a visitor sees under pressure.
  - Small log batches do not count against the daily upload totals.
- **S10.** New photographs get random ids (S-D10).

**Names and search (N):**
- **N5.** Spellings pool across apostrophes, closed compounds, accents and a trailing full stop, for display and for counting sources (S-B6, R45-9).
- **N6.** The capitals rule looks across hyphenations, and small words count as lower case (S-B7, R45-9).
- **N7.** A comma inside brackets does not split, and a one-word part no source gives alone is a bare word (R45-9).
- **N8. Search order** (S-B9, S-B10, S-B12).
  - Within a reading, a whole-word match and the headline come first.
  - Near hits are ordered by distance.
  - A common name is not retried on its first two words when the second is a small word.
- **N9.** Fragments, trailing dots and unmatched brackets are flagged by the audit (S-B11, IND's Cestrum example). Sourced spellings are not rewritten.
- **N10.** A status carried from a previous build is left out of the sitemap fingerprint (S-B13).
- **N11. Rain words** (S-B8, S-F3, R45-10).
  - Every sentence giving the median year's total says "in the median year".
  - The Glance and share card's "months of 25 mm" line says it too.
- **N12.** `/about/how` says Ceropegia is taken whole, with the stapeliads and Brachystelma under it (S-F4).
- **N13.** Tile credits keep the licence at 200% text (R45-12).

**Pages and words (P):**
- **P3.** Hover preloading is off on private pages everywhere, the tray included (S-F6, R45-7).
- **P4. `/about/how` and `/about/formats` drift** (S-F7, S-F8, R45-13).
  - The framework's session keys, the browser's cache of searches, `labelsPicked`, the `reg.update` request, Natural Earth and Wikidata, and the seed's words are added or corrected.
  - The seam tests check whole sentences, not substrings.
- **P5.** The missing spaces, the doubled full stop, and the genus summary's refusal wording (S-F5, S-F10, S-F11).
- **P6. Accessibility** (R45-25, S-F12, S-F13).
  - Today's place headings are read with a separator.
  - Chip names match their text.
  - The menu has `aria-current` and 44 px items.
  - The add form's bars sit static on a short screen.
  - Italic names are not clipped.
  - "Check names" says why it is waiting.
- **P7.** A species page's photo strip keeps a placeholder when a photograph fails, and no credit lies over a failed photograph (R45-8, S-A).
- **P8.** The picker drops an answer in flight for the previous name after "Add another" (R45-25).
- **P9.** Labels restores its picks on a `back_forward` load too (S-E8).
- **P10.** The add form reserves the name check's line, so Add and "Use my own number" do not move (S-E2; decision D5).

## The harness (H)

- **H1.** Request-budget tests in Chromium: the seed, an imported plant, a load after a write, and one Water (S-E9, R45-D).
- **H2.** Offline in WebKit: a test that goes offline from the worker's side where WebKit allows it, and the unfounded "by hand on an iPhone" message removed (S-E10).
- **H3. Chromium-only tests**, run in WebKit where a portable form exists: `ariaSnapshot`, `emulateMedia`, `slowOpen` for the CPU race, a root font size for 200% text, and element positions per frame for layout shift (S-E11, R45-28).
- **H4.** A test for each of the seven reverts that stayed green (R45-26).
- **H5.** A single-click check on the disclosures. The helper records each second press (R45-27, IND).
- **H6.** The bundle gate bans by module path, not chunk name (R45-13).
- **H7.** The two raw database writes in smoke go through `inject.ts` (R45-29).
- **H8.** The fold guard's behaviour hash covers `fileParks`, `stillWaiting`, `applyParked` and `parkedFor` (R45-29).
- **H9.** The two server specs use `docAddress()`, and their exemptions go (IND-9).
- **H10.** A plain `npx playwright test` is strict too, so a retry-only pass fails (R45-29).

## Declined or deferred

- **One outbox row and one order row per commit** (a database version change): waits for a measurement on a real iPhone.
- **A real place given to the example as its frost site:** declined. The example would show a forecast for a place nobody chose. V8 says what the frost watch does instead.
- **The service-worker takeover in WebKit through a second build served by the test server:** deferred. R45-28 asks for it, and P2's unit tests cover the logic.
- **The "77 networks" design:** kept. The reserve stops one network spending a share, and S9 makes the words exact. A cache-miss budget per species is noted for after the launch.

## The owner's steps after this round

1. Commit, predeploy, deploy.
2. `npm run dossier -- --keys <file> …` for the 164 species (N4).
3. `npm run dossier -- --index` (N1, N3, N5 to N7), then the audit against the index before it, read before the upload.
4. The iPhone checks still open from round sixty-six, plus: a plant page in airplane mode, and the example's timing.
