# Triage of the reviews of round sixty-one

What round sixty-two takes from three reviews of round sixty-one, and the work brought forward from round sixty-one's own triage (generation-addressed photo objects).

- **Self:** `docs/REVIEW-SELF-61.md`, nine reviews, reports and tests in `docs/review-61/`. Its numbers are the reports' own ("records 1", "clock 4").
- **A:** the "round forty-four" outside review, `docs/review-61/outside-a.md`. Numbers are A1 to A44.
- **B:** the independent outside review, run on Windows with Chrome and against the live site, `docs/review-61/outside-b.md`. Numbers are B1 to B14.

A finding the self-review did not have was checked by reading the code it names before it was taken; each is reproduced by a test that fails before its fix in round sixty-two, and a finding that does not reproduce is said so in the round's account, not fixed.

## Where the reviews agree

Found by two or three reviews independently, so the most solid:

- **Clock-only parks leave memory** (clock 1 and 2, records 7, A14, A16, B7). Through the engine's re-fetch filter and through the backup, a verdict of this device's clock alone becomes a stored verdict.
- **The correction lapses on a clock that is still right** (clock 4 and 5, A17, B9). Ordinary elapsed time lapses a valid slow-clock correction; a sleep that pauses `performance.now` lapses a large one; each lapse refolds more than once.
- **Rule 2 on Today** (grower 1, a11y 2, A6, B "unavailable sheets"). Failed species sheets are read as "no plant is resting", and the failed slugs are not asked again.
- **The import's restart** (records 1, grower 2 and 3, A18, B6). It adds duplicates for unnumbered or renamed lines, and skips real plants (a partly written Qty row, a restarted numbering).
- **Choices after "Check names" are ignored** (records 6, grower 5, A19).
- **Partial dates in the photo rule** (records 9, visitor-words 6, A20, B5), and **Today and the list on two clocks** (triage 3, B4).
- **The picker says "did not answer" when it was refused** (server 1 and 7, visitor-words 12, A8).
- **The picker's names and keys** (corpus 2 and 3, A7, B3). It lowercases, sends the qualifier, files a typo match over a cultivar, and gives an unknown variety its parent's key.
- **Search reads a name word as an author** (corpus 4 and 5, A7, B2): after a hybrid sign, before a trailing full stop, and in a capitalised common name ("Black eyed Susan").
- **The phone's first screen has no catalogue row** (A10, B1), though the round said it would.
- **The about pages are behind the code** (visitor-words 1, 2, records 8, A5, B12): the counter width, the restore rule, the edge caches, the requests, the waiting counts.
- **The common-name rule as stated is not the rule the live corpus can apply** (corpus 7 to 10, visitor-words 5, A33, B "common names"): the stored dossiers carry no preferred flag or source count.
- **Server counting is not crash-consistent** (A24, B10), and a reclaimed or legacy vault is admitted on weak evidence (server 2, A24, B11).
- **The e2e seed helpers race the first snapshot** (harness 2, A44, B13), and **the bundle test guards no deploy** (harness 3, A43, B).
- **Archive's Undo is two commits** (harness 6, A25, B decision 12).

## Found by one outside review only, and checked

These were not in the self-review. Each was read in the code before it was taken.

- **A13, data loss:** the species page's notes editor keeps its draft across a related-species link, and Save writes it over the other species' notes. Read: `species/[slug]` has no layout, no `{#key}` and no leave guard; `editingMy` and `myDraft` survive the slug change. This is the round's first fix.
- **A1, rule 4:** the italic font is declared in an inline `<style>` through `{@html}` in `+layout.svelte`, and the reviewer saw its request carry the plant page's path as Referer.
- **B8, mixed versions:** a round-sixty reader parks a marked far stamp that a round-sixty-one reader applies, and the batch is still `v: 1`. Read: round sixty's engine throws on any `v` other than 1 and sets the batch aside for a later build, so a new batch version is enough to make old readers wait rather than disagree.
- **A15:** stored-parked changes are pushed again into a new vault, where they are no longer far ahead.
- **A22:** a removal from before round sixty-one has no arrival order, and restore then says something false and makes the restored plant the keeper.
- **A26:** Apply takes a parked removal whenever one is parked, even when a later restore is parked too.
- **A21:** cf., aff. and sp. plants are shown and noted as a species they are not.
- **A23:** a re-sealed Undo of a removed photograph records no claim; a token holder can store a removed photograph again for good.
- **A24, B11:** recount windows double count and double subtract; round-fifty-eight vaults are counted again; an unanswered touch admits a reclaimed vault.
- **A30:** one busy photograph stops the whole vault's uploads for a minute.
- **A2, A3, A4:** the title says "cactus, succulent and bulb" for a wider list; the link preview says "in the wild" for a modelled cell; terrestrial orchids are still in the orchid group; the share card says "not written".
- **A9:** the sample's Leave strands a tab with an unsaved form and deletes the grower's added records without asking.
- **A11, A12:** the tab bar splits words at 320 px with 200% text; the phone's hero credit loses its licence to an ellipsis.
- **A27:** a fractional rhythm writes `INTERVAL=7.5` and the whole calendar file is refused.
- **A36:** the 5167 sheet sits a third of a millimetre left; the QR name keeps invisible and combining characters, and a lone surrogate loses the code.
- **A41, A42:** eight fixes can be reverted with every test green; the fold guard misses five functions that decide an own batch's judgement.
- **B14:** two font-preference tests fail in the bundled browser and pass in Chrome; the photo flow waits for an outside image.

## Decisions for round sixty-two

### 1. Records keep what the grower typed (first)

- **The species page** gets `species/[slug]/+layout.svelte` with `{#key page.params.slug}`, and the plant page's leave guard for an open notes draft (A13). An e2e test types a draft on one species, follows a related tile, and asserts the other species' notes unchanged.
- **Sample collection, Leave** navigates first and lets the next page's `dropLeftoverSample` delete it, so a "Leave site?" answer of Cancel leaves a working tab. When the grower added or changed records in the sample, Leave says how many and asks. A blocked delete is said, not taken as done. The compare tray chosen in the sample stays in the sample (A9).
- **Archive's Undo** is one commit: one `putWith` that puts back the status and removes only the archived plants' own "Archived" lines, and a failure is said (A25, harness 6, B).

### 2. Rule 2, everywhere a grower reads it

- **Today when the sheets do not answer.** A failed or timed-out `sheetsFor` sets `sheetsFailed`, and leaves the slugs unasked so "Check again" asks again. Each stop shows one `NotChecked` line, "Resting months not checked: the species sheets did not answer. Every plant past its rhythm is listed", drawn after the first-read hold so the page does not shift. A request still running after five seconds says "Still reading the species sheets…" (grower 1, a11y 2, A6).
- **The plant page** says "Name not in the reference" for `none`, and "not checked" for `unreachable` (grower 9).
- **The picker:**
  - it sends the species part as typed (case kept): the qualifier, rank tail, cultivar and any token with a digit are left out of the request and kept in the field (corpus 2, A8, B3);
  - a 400 is "The name service was not asked: what is typed is not a name it can look up";
  - any 429 or held 503 is said after "was not asked:", with the server's own reason, never "did not answer" (server 1 and 7, A8).
- **The species 404** says "was not asked" for a held call (visitor-words 12).
- **The share card** carries `extremesStatus` and gives the glance row's reason when it has no floor. Its footer names the band only when it draws one (visitor-words 11).
- **Photo sources** on the species page say "refused" and "skipped" for what was refused and skipped, not "did not answer" (A35).
- **Provenance** reads "climate: not asked", without an "asked" date, and its footer says "not asked" too (A35).

### 3. Search and the picker

- **Order of readings.** A query is first tried as a whole against the common-name postings; only if that finds nothing is it read as a botanical name with authors stripped; then as a genus followed by capitalised words, an unquoted cultivar, which answers the genus. Whenever words were dropped, the answer carries `X-Search-Relaxed` naming the words used (B2, A7).
- **Hybrids.** The token after "x" or "×" starts a name again and is never an author; the retry stops at a hybrid sign with a name word on both sides (corpus 4, A7).
- **Dotted words.** A dotted word, or a capitalised abbreviation of four characters or fewer, starts a citation only after an epithet or a rank. A trailing full stop on a common name is punctuation (corpus 5, A7).
- **Quotes.** A quoted text is a cultivar only after a name word; quotes around the whole query search the text inside (corpus 1).
- **Label qualifiers.** "cf" and "aff" are skipped like "x"; "sp", "spp" and "nov" end the name like a rank (corpus 6).
- **Characters.** Queries and the names route are NFKC-normalised and lose `\p{Cf}`, so a zero-width space, soft hyphen or full-width letter does not break a word (A7). The names route accepts curly apostrophes and ampersands from a pasted name.
- **The picker files only what it knows:**
  - a suggestion found by a similar spelling says so ("similar spelling"), and is never the first suggestion for a genus followed by capitalised words, where the genus is offered with the rest kept as a cultivar (A7, B2);
  - a key is filed only when the filed scientific name equals the picked taxon's; a kept qualifier, an unmatched variety or a synonym's variety is filed with no key, and the row says "compared species is in the reference; no key filed" (B3, A7, corpus 3);
  - `pickedName` keeps the typed rest only when it is a rank marker with a complete epithet and the picked binomial equals the typed one (corpus 3).
- **Common names:**
  - `gbif.vernacular` keeps each exact spelling with its own sources under its lower-case group, and pages until `endOfRecords`, or records "truncated";
  - `englishNames` counts distinct sources;
  - a name is set back for another genus only when that genus word is written with a capital in a spelling whose other words are lower case, or when the whole name is the other genus's binomial shape. Growers' own English nouns ("Lace aloe", "Arum lily", "Autumn crocus", "Zebra haworthia") are kept (A34). The corpus reviewer's syn-genus rule is not taken: it would still set back "Lace aloe" under Aristaloe;
  - `firstUp` passes a leading ʻokina or apostrophe;
  - the page lists the other names separated by semicolons, so a name that is itself a comma list stays whole (A33);
  - `/about/how` drops the dead tie-breaks, says the first four names are shown and every one is searched, and says the preferred flag and source counts apply only to names fetched since the `--names` step (corpus 7 to 10, visitor-words 5, A33).
- **A `--names` step for the build** re-asks GBIF's `vernacularNames` for every species, paced, so the preferred flags and source counts exist. It runs once after this round's deploy, and the index is rebuilt after it (corpus 7, A33, B).
- **The audit script** takes `--sample N` anywhere in its arguments.

### 4. The import keeps its promises

- **Numbers.** The commit gives every planned number explicitly, so the collection never mints inside an import, and the review's numbers are the numbers given (grower 2).
- **Restarts.** Each imported plant carries `importKey`: a hash of the sheet's normalised row cells, with the plant's place in its row (`#1`, `#2`, `#3` for a Qty of 3). A row is done when every one of its keys is on a live plant; a row partly done offers the plants still missing. The old number-and-name match stays only as the "looks already imported" warning with its override (records 1, grower 3, A18, B6).
- **One year rule.** `yearOf` moves to `$core` and reads "2024" as well as "2024-05"; `commit.mintYear` and `plan.yearOf` are deleted (triage 2, B6).
- **Sheets over 2,000 lines** are taken in passes: already-imported lines first, then the next 2,000 (records 5). The per-row cost that grows from about 37 to 10 rows a second is found and removed (A, decision 3).
- **Choices after the review.** Changing the date order, the notes box or the mapping after "Check names" re-reads the sheet at once and says so (records 6, grower 5, A19).
- **"Use it"** replaces the species part only and keeps the qualifier, rank tail, cultivar and aside; the sheet's text goes to `nameAsReceived` whenever the filed name differs (records 2). With the filter on, focus moves to the next row, and each button is named "Use Copiapoa cinerea on line 1" (A37).
- **Names:** "nr.", "near", "cfr." and "vel aff." are qualifiers; a qualifier first ("cf. Mammillaria bombycina") is read as a qualifier, not a genus; a dropped second word goes to `nameAsReceived`; a quoted provisional name after "sp." stays in the name (records 3, grower 7, A21).
- **cf., aff. and sp. plants are not shown as a species** (A21):
  - the review row says "filed with no reference key";
  - the plant page's link reads "Compare: Copiapoa cinerea", and its habitat comparison is headed the same way;
  - the species page lists cf. and aff. plants apart, as "compared with this species", not among yours;
  - the label's care line for a cf. or aff. plant names the compared species;
  - notes on an "sp." plant are kept by its full name, not shared by every bare-genus plant.
- **Unread fields.** An unread Status or Kind goes to the notes as Provenance does (records 4).
- **Paths.** When place cells contain ">" or "/" between words, the review asks once for the sheet, "Read > and / as a path", defaulting to yes when the first part names a place here (grower 6).
- **Dates** (A20 and the self-review):
  - a two-digit year is read only when 20YY has not yet come; otherwise it is left unread with its text;
  - "24/03/09" and "24.03.09" are held as ambiguous like the dashed form;
  - a 0 day or month is refused, not offered as "0 January";
  - "2019.5" is left unread;
  - a trailing time is ignored before the three-number rule; Qty accepts "3.0".
- **Spending** (grower 8, A39, B):
  - one currency is totalled once: $ with USD and US$, £ with GBP, € with EUR, ¥ with JPY; R$, A$, NZ$, C$, Rs and lower-case codes are read;
  - a thousands separator is read when exactly three digits follow it;
  - "free" and "gift" count as nothing spent, not "could not be read";
  - a Qty row's price is kept on its first plant, and the others note "bought with <number>".

### 5. The clock

- **Stored verdicts only.** `collection.storedParks` is what `hold()` gives `takeBatch` and `judgeOwn`, what the engine's re-fetch filters on, and what the backup exports. A clock-only park never becomes a stored verdict, through the engine or a file (clock 1 and 2, records 7, A14, A16, B7). Merge and replace restores each get a guard test.
- **A new vault** is not sent changes this device has stored as parked; the Sync page counts them with Apply, which sends them under a new stamp (A15).
- **Batches with marked stamps are `v: 2`.** A batch is written as version 2 when any of its changes carries the mark; readers accept 1 and 2. A round-sixty reader sets a version-2 batch aside and a later build reads it, so no two builds fold it differently (B8). The backup's format version is raised the same way when it holds a marked stamp, after checking what a round-sixty restore does with a newer version.
- **The correction** (clock 4 and 5, A17, B9). No amount of elapsed time lapses a correction. Within a tab, a backward drift of the wall clock against the monotonic reference is a real clock change, so the offset follows it; a forward drift is either a sleep that paused `performance.now` or the clock being set forward, so the offset is kept, the reference re-anchored, and a reading asked for at once. Across a reload the stored correction is kept, unconfirmed, and a reading is asked for at load. A reading that agrees confirms without a refold; one that disagrees replaces the offset with one refold. `overtaken` goes. Tests: six minutes slow across midnight, an hour slow for 61 minutes, a two-minute sleep with a paused monotonic clock, the clock set right while offline, and one refold per changed offset.
- **Incomplete records.** A record whose missing fields all have a parked change is not counted as incomplete, and its page shows the Parked notice with Apply (clock 3).
- **Apply** takes the latest parked removal or restore by stamp (A26). **"Apply all from this device"** goes on the Sync page's parked list.
- **Restore with no arrival order** (removals from before round sixty-one) says the order is not known and keeps the live plant as the keeper, so "Renumber now" never takes a number from a plant whose label is likely printed (A22).
- **Marks:**
  - a stored park of a marked stamp is ignored (clock 8);
  - "Renumber now" stamps its repair past the record's stamp with the mark, and dates its note from the latest unmarked stamp (clock 7);
  - `takeBatch` refolds when a park it stores is already in this tab's fold (clock 9);
  - a removal's time is `min(wall, now)` for a marked stamp (clock 15);
  - an unmarked counter never steps onto the mark: `observe` and `hlcAfter` clamp an unmarked remote counter below it and move to the next millisecond (harness 7, A32).
- **The fold guard** hashes `get device`, `isOwnStamp`, `heldWalls`, `pull`, `pushBatch` and `listOwnOnce` too, and gains a behavioural guard: a fixed set of logs, clocks and arrivals folded, and the result hashed (A42, clock 13).
- **The fuzz** adopts the faithful monotonic clock and gains a backup-merge op and an engine that judges each batch once (clock 10, A14).
- **The ordering the mark brings** (clock 6) and a key holder's marked stamps (clock 14, A32, B9) are stated on `/about/formats`. A writer's own last days after a month offline at a wrong clock (A28) are stated there too.

### 6. The server

- **Counting is crash-consistent** (A24, B10):
  - the sweep deletes each page's places and lowers `all` in one storage transaction, with its cursor; an expired lease's deletion and the stale mark do the same;
  - a recount's generation is bumped before an upload's R2 put and before a removal's R2 delete, so a recount crossing either is retried, not believed.
- **Admission on evidence** (server 2, A24, B11). A vault is reclaimed only when its meta says so (`reclaimedAt`), not because its place entry is missing. A round-fifty-eight vault (`filled` and no place entry) is adopted once with a place entry and no second count; a legacy vault is written `filled: true` on adoption. A write to a reclaimed vault needs a checked place, and an unanswered touch refuses it with VaultUnchecked; reads are never refused. The reclaim sentence says that the data stays, other devices can still read it, reading keeps no place, and when it is asked again.
- **The old-name check** passes the reader's address to `upstreamCall(['gbif'], ip)`, and `upstreamAllowed` goes (server 3, A29).
- **A busy photograph** is answered with a fixed 10 s, as removals are, so one photograph never stops a vault's uploads (A30).
- **Photographs:** a claim is recorded whenever the proof matches, whatever the store result; a removed name keeps its removal receipt, and a first store of a removed name needs the removal's proof (A23).
- **Origin `null`** from browsers without `Sec-Fetch-Site` (A31, suspected): the server's check is read, and if the reviewer's case holds, sync requests carry a custom header that a cross-site page cannot send without a preflight, which the server accepts in place of the origin. The Referer stays off.
- **Joining** after a crossed recount waits out a `Retry-After` under a minute and asks again, at most twice (triage 1, server 9).
- **Smaller fixes:** `release` bumps the generation and marks the row stale when a lapsed lease's upload lands (server 4); `readRefusal` writes back the capped `until` (server 5); the place page re-asks a held forecast after its `retryAfter` (server 6); `fence()` moves after the re-read `head` (server 8); the 409's hour is kept in the sync record (server 10, A5); `touch` wakes the vaults object (server 11); a US forecast whose NWS share alone is spent still asks MET Norway and marks the alerts "not asked".

### 7. Generation-addressed photo objects

Brought forward from round sixty-one's triage. A photograph's bytes are stored under `photo/<id>.<generation>` with a fenced pointer, so a removal can only delete the generation it saw. This closes the stalled-DELETE race, the `it.fails` test becomes a plain test, and the residual-race sentence leaves `/about/formats`. The removal receipt of decision 6 lives with the pointer.

### 8. The interface

- **The front page's first screen** (A10, B1). On a phone the introduction is one sentence and the strip's height is capped so the search, every grouping control and one whole catalogue row are above the tab bar at 390×844, measured with a real-corpus response and real strip sizes. On a desktop the feature moves above the search, so the grouping chips stay with the rows they govern and a chip click no longer moves the rows 700 px.
- **The tab bar** at 320 px with 200% text shows icons with the label as the accessible name when a label would break inside a word; labels never break inside a word (A11).
- **The hero credit** on a phone takes two lines, licence first (A12).
- **Select mode:** "Select these" opens select mode on an in-app navigation (grower 4); the select bar carries `data-cover="bottom"` and the short-screen rule is `max-height: 30em`, so a focused tick box is never hidden (a11y 1); the toast clears the select bar on phones (a11y 3); a Move that empties a filtered list keeps select mode and its focus (grower 10); Escape closes the Move panel and the Archive question (A40).
- **Today:** "Show N more" focuses the first new chip (a11y 5, A37); the done-row chips wrap at 200% text; a pruned done row moves focus to its stop's heading, not the page (A40); the empty space above "By place" on a phone goes (A40).
- **The toast:** a repeated sentence is announced (cleared, then set a frame later); `show()` clears the earlier cap and holds again when focus is inside; the forced-colours fold is opaque throughout (A38, A40).
- **The front page skeleton** has `min-height: 100vh`, and the visitor's head is hidden under `html[data-grower]` until hydration (a11y 4).
- **P3s:** label in name on the photo grid and strip; `--tab-h` is 0 on a desktop; the hold cap applies to the pointer only; `/plants` loads the sheet download by dynamic import; the plant page's Source link contrast; a Related tile with no photo draws no empty square (A35).
- **The grower's smaller items:** the edit form's hint for a partial date, "As imported: …"; a removed plant's label keeps its cultivar; "every day" for a one-day rhythm; the sample's frost line offers "use my location"; the labels page remembers the plants picked; the add form's "already used by" names every sharer and never links `/plants/undefined` (A35).
- **Labels:** the 5167 side margin is 7.62 mm (A36); a stranger's label and the QR name strip `\p{Cf}`, `\p{Zl}`, `\p{Zp}` and runs of combining marks, cut by grapheme with `Intl.Segmenter`, and replace a lone surrogate (A36); an "sp." name carries no species slug.
- **The calendar:** a rhythm that is not a whole number from 1 to 365 is replaced by the default before export; each event has a `SEQUENCE`; UIDs carry the collection's id; a later run's UID is the same however the file is downloaded; the last event says to download it again (A27).

### 9. Words

**Rule 4 first.** The italic `@font-face` moves out of the inline `{@html}` style into `theme.css`, and an e2e test asserts that no request from a plant page carries a Referer (A1).

**What the site is.** The title, `og:title`, the home meta, the image alt and the first bullet say "cactus, succulent and bulb species, and the plants most grown alongside them" (A2). The home meta adds that synced records are sealed before they leave the device (A35).

**The species page and its previews** (A3, A4, visitor-words 3 and 4):

- the link preview says "Copiapoa cinerea habitat: cold floor 6.5 °C, 1 night in 100 at a typical spot (NASA POWER)", never "in the wild";
- compare and the share card say "typical spot";
- the printed label says "floor 6.5 °C (1 in 100, NASA POWER)" and "open sky";
- the sheet's one-line form names the floor as the glance card does;
- "Warmest month, mean daily high" and "Coldest month, mean nightly low", with a glossary line;
- "Rain a year (sum of monthly medians)" until the build stores a median of annual totals;
- the lapse sentence is chosen by whether both elevations exist, so a 0 m correction is said as one;
- the Climograph's description judges coldest-night ties at one decimal, as the glance card does;
- a photograph credit with disagreeing licences says they disagree;
- a Commons photograph with no thumbnail is not shown, rather than loading its original.

**The groups.** Paphiopedilum, Ludisia, Phaius, Phragmipedium, Cynorkis and Cymbidium leave the orchid group; Alcantarea and Billbergia leave the epiphyte group and Selaginella the tropical group, for none (A4). The why text says "listed under the genus X in the archetype table". The share card's footer says "Figures derived by rule".

**`/about/formats`:**

- the counter is four digits, or six past 65,535 changes or with the mark (visitor-words 1, clock 11, B12);
- this device's own changes are never held, and are judged once their batch is listed (visitor-words 2);
- the restore rule by arrival on this device, and what happens when the order is not known (records 8, B12, A22);
- version-2 batches and what an older build does with them;
- the correction kept unconfirmed, and what confirms or replaces it;
- `plants.csv`: the id is the last column, and the import reads it back (A5);
- a 503 without `Retry-After` is kept as a five-minute refusal (A5);
- the 409's hour, kept in the sync record;
- the import does not read a future date or one before 1900, and keeps the text (A5);
- the QR name is cut at "60 code points"; the `="…"` rule says "these shapes";
- the mark's ordering, a key holder's marks and the month-offline writer (decision 5).

**`/about/how`:**

- the edge caches, all of them: the public answers, each name typed into the picker for a day, rendered pages for 60 s, and the sheet buckets for a day (A5);
- the requests, all of them: the picker's `/api/search` as well as `/api/names`, and SvelteKit's `version.json` after a failed navigation (A5);
- "Every page that lists records says how many are waiting" becomes the pages that do, `/plants` and `/today` (A5);
- the sample without Web Locks keeps an orphan rather than risk deleting an open one (B);
- the front page's feature rule, and "a species page with a habitat climate shows" (A4);
- the common-name rule as above;
- "173" collector genera, "three public answers", "One care line says", the description under 160 characters.

**Small text:** `/compare` gets a description; compare says when it left a species out; the fixture's cell counts and credits are made true; the README's `SYNC_OPEN` sentence and its map of the review files; the offline page; the phone search placeholder fits; the private pages' clock line.

**The seam test** checks, both ways, local versus session storage, keys the pages name that no longer exist, the template-built `cultifolio.demo.*` keys, IndexedDB, cache, lock and channel names, the browser's own `/api/*` requests, the edge caches, every figure the pages state (600, a tenth, 90 days, 30 s, an hour), and semantic fixtures for a marked change, a plant received after the removal, and a record with no order history. No assertion sits behind an `if` that passes once the code changes (A5, B12).

### 10. The harness

- **Adopt the reviewers' tests:** the twelve harness guards; the `KNOWN` replacements for both `it.fails` tests; the guards from every area; the reproductions, inverted as each fix lands; `triage--storage-keys-by-store`; a test for `propagation/[id]`'s key; and A41's eight smallest tests for fixes that can be reverted green (the clock-only snapshot reload, rebuild's resets, the engine's 409, the hourly throttle, the collection's year rule, the Web Lock, `hasMine` in the sample, Move Undo's lines).
- **One shared e2e `inject` helper** writes the arrival order and bumps the fold generation in the same transaction. Every spec uses it, and r61a's pause goes (harness 2, A44, B13).
- **The bundle gate:** `scripts/check-bundle.mjs` runs as `postbuild`, so every build, Playwright's included, checks its layout chunk. It fails when the manifest is missing or was built from other sources (the manifest records a hash of `src/`). The unit test keeps only its source assertion (harness 3, A43, B).
- **Browsers:** the two font-preference tests run on the installed Chrome channel when it is there, and otherwise check that the preference took before judging the layout, saying "preference not applied by this browser" (B14). The own-photo flow starts from "Add a photo" and does not wait for the reference's photograph; the failed-photograph sentence keeps its own test (B14). The two specs that make a Chrome profile in `/tmp` remove it (A).
- **Smoke tests:** smoke 3018 gets `test.setTimeout(90_000)`; smoke 2781 waits for `html[data-ready]`; `failOnFlakyTests` is set under `CI_STRICT`, and a strict run comes before each deploy (harness 4).
- **Wall-clock bounds** in unit tests become fixed inputs (harness 8); the two CLS tests wait for the last held section (triage 6); "a11y-perf 1" is renamed.

### 11. Cleanup

- **Delete:** the grow barrel `grow/index.ts`; `clearSampleSettings`; `upstreamAllowed`; `dbg-proxy.mjs`.
- **Merge into one:** "the sample was closed in another tab" in `demo.ts`; the cap constants in one module.
- **Fix stale comments:** "a day past arrival" and `static/_headers`.
- **Round sixty's merge leftovers:** the plural helpers, the `readerLat` copies and the unused exports.

### 12. The round's account

`docs/REVIEW-ROUND-61.md` is corrected where it says more than its logs: the base-failure claim, the run counts, the last full run, and the first-screen claim of its section 6.4 (triage 6, A10, B1). Round sixty-two's account names the run each count comes from.

## Deferred, with reasons

- **A median of annual rain totals:** the climate build has to store it; until then the figure is labelled as a sum of monthly medians.
- **LibreOffice's reading of `12.50` as 12.5** (A35): that is the spreadsheet's reading of a number, and quoting prices as text would break other readers. It is said on `/about/formats`.
- **A distributed attack on the outside-call shares** (B): ten addresses can still spend a share. The shares are finite by design and the cap is stated.
- **A separate record of real time beside the stamp** (B9): a larger change to the log than this round should make. The mark's limits are stated instead.
- **Physical printers, Firefox and Safari print, and a screen reader's spoken output:** not available to any of the three reviews.
- **Per-dossier sitemap dates and author credits on tiles:** they need fields the build does not keep yet.
- **The large-collection tail read and the shells' inline CSS:** measured as acceptable at 3,000 plants.
- **Frost-only web push:** a feature, which needs a disclosure design.
- **The import's own numbering scheme for renumbered lines:** still open, and still said.

## Round sixty-two order

1. **Records keep what was typed** (decision 1) and **rule 2** (decision 2).
2. **Search and the picker** (decision 3), **the import** (decision 4) and **the front page's first screen** (decision 8's first item).
3. **The clock** (decision 5), then **the server** (decision 6) and **generation-addressed photos** (decision 7).
4. **The rest of the interface** (decision 8) and **the words** (decision 9).
5. **The harness** (decision 10) and **cleanup** (decision 11).
6. **After the deploy:**
   - the `--names` step, then an index rebuild;
   - the live commands in `docs/review-61/corpus.md` and the outside reviews' live probes (B1's first screen, B2's queries);
   - a live check with no skips.
