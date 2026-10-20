# Round seventy-nine, agent F: what round seventy-eight left behind

Branch `r79` in `/tmp/claude-0/rev79/F/`, seven commits on `r79base` (`03170e0` to `5352e86`).

## Done

### 1. The review's `shared` lists, and the day the index stamped

**What happened, proved from the code.** `rekey()` (`src/lib/dossier/rekey.ts`) mapped each photograph's `shared` list to ids in the order version 2 held it, GBIF key order. The next `--index` runs `markSharedPhotos`, whose `sharedPhotos` sorts each list by id (`byId`), and `markShared` compared the lists as joined strings, so a list of the same pages in another order was "changed" and the dossier rewritten. The order was part of the substance fingerprint (`substanceOf` in `src/lib/dossier/changed.ts`), so `scanDossiers(true)` then restamped the page `changed.on = today`. The review's `withoutIds` in fact left `shared` out entirely; what it saw differ was the day, which it keeps. So the cause of "differ apart from their ids" was the restamp, and the restamp was caused by the order.

**What remains a hypothesis.** Why the order changed on the owner's corpus. On round seventy-seven's copy here the three pages that hold those ten photographs (Eucalyptus robusta k73814, Melia azedarach k2505106, Brachychiton discolor k2681196) sort by Kew id exactly as by GBIF key, which is why round seventy-eight's dry run here said 0 differ. Only an id order unlike the key order on the owner's disk (for example Brachychiton's page under another id there) gives exactly Melia and Eucalyptus reordered and Brachychiton not. The owner's files are not here to check.

**The fix, so the order can never move a day again:**
- `changed.ts`: the fingerprint reads each photograph's `shared` as a set, sorted as the index sorts it (`byId`; numbers by value in a version 2 dossier). A list already in that order hashes exactly as on the base, so no stored fingerprint moves (the test pins three base hashes).
- `rekey.ts`: the mapped list is written in `byId` order.
- `photo-kind.ts` `markShared`: the same pages in another order are no rewrite.
- `scripts/corpus-step.mjs` review: `withoutIds(d, gbifOf)` no longer drops `shared` and `distribution.via.page`: it reads them as GBIF keys (a `k…` id through the corpus's own ids, `g<n>` as n) and `shared` as a set (`withSets`). The same pages in another order are the same page; a photograph shared with a page more, or fewer, is now a difference it names. A same-version comparison reads `shared` as a set too.
- `/about/formats`: the `changed` sentence now ends "with each photograph's `shared` read as a set, so the same pages in another order are no change", and `shared` is "the ids of the other species' pages that hold it (Kew's ids before GBIF's, each by number)". Both checked against the code above.

Test `tests/unit/r79f-shared-sets.test.ts` (7): the builder's `--rekey` on the two cases as version 2 dossiers (with Brachychiton's entry made the smallest so the ids sort as on the owner's run), then the review; the fingerprint and `restamp`; `markShared`; the review with a page more or fewer. On the base 5 failed: "2 dossiers marked anew" and both stamped 2026-10-20; another hash; `markShared` true; and the review said "0 differ" of a page more (it ignored `shared`). The two passing on the base are guards.

### 2. The two WebKit flakes, from their traces

**r73p keys 1 (the address never changed).** Proved from the trace: the click's hover started SvelteKit's preload (`data-sveltekit-preload-data="hover"`): nodes 10 and 33 and the routed `__data.json` were asked at 1705075 to 1705081 ms, within the click (1705065 to 1705116), and fulfilled at 1705210 with a whole body (one line, 16,605 bytes; Playwright set the length itself). Between the click's "action" snapshot (1705059.8) and its "after" snapshot (1705128.7) the page gained `data-collection="open"` and its scroll moved from 552 to 525. On the front page `visitor = !collection.ready || …`: the test's plants were written straight into IndexedDB (`inject`), so the front page's hint (`cultifolio.hasMine`) was never set and the page was drawn as a visitor's, then redrawn as a grower's when the collection opened, mid-click. In SvelteKit's client (2.70.3, `navigate`), a navigation reuses the preload's promise and pushes the address as soon as it resolves; it does not when no click reached the router, or when a newer navigation or an invalidation took the token. The front page calls no `goto` or `invalidate` on that path (searched). So the click itself did not land. Not proved: where the mouse up landed (the trace records only the press point). The app is not at fault: an in-app first plant sets the hint from any page (`+layout.svelte`), so a grower is drawn as a grower; only a test writing behind the page meets the redraw. **Fix, in the test:** `open()` waits for `html[data-collection="open"]` before the click.

**r69p P5 on species (the press lost).** Proved: the scroll from 0 to 1009 is Playwright's own, not the app's. The press record says `scrollBefore` 0, `downTop` 361, `upTop` null, no click, focus on the pressed summary ("Seasons open"). The first `details.cult.acc` summary sits at 1,370.5 px down the page (measured), below the 720 px viewport; Playwright logged "scrolling into view if needed … done scrolling", its action snapshot already shows scroll 1009, and 1,370.5 minus 1,009 is the 361 at which the pointer went down on it. Also proved: the collection opened during the press (absent in the action snapshot, present in the after snapshot), and on `collection.ready` the species page draws "Your notes: none yet" above the cultivation cards: on the base that moved the summary 33.6 px (1,370.5 to 1,404.1, measured in Chromium), more than the 27 px between the summary's top and the press point. Hypothesis: that this move took the mouse up off the summary in WebKit (no WebKit here). **Fix, in the app:** the species page holds the line's room, unseen, `aria-hidden` and `inert`, while the collection opens (`.notesline.hold`). Most pages have no notes of the grower's, so the line takes the room; notes of theirs replace it (a move down), and an old name's notes give it back (a move up).

### 3. The plant page with the reference's photographs on

The plant page now holds the hero's room while the sheet is asked (`heroHeld`, `heroRoom` in `src/routes/plants/[acc]/+page.svelte`): a `.hero.hold` box, unseen and `aria-hidden`, of the species hero's 260 px and margin, and the card laid out as it is under a hero (no tile; the bar's Photo button). **The rule:** held when the grower shows the reference's photographs, the plant has no photograph of its own, it is not a hybrid (no sheet of its own), and the sheet is still asked; 6,318 of the reference's 8,947 species (71 %) have a photograph. **What moves when none comes:** for a species without a photograph, a name the reference does not hold or could not be asked for, or a picture that fails to load, the box goes and the card takes the small tile, so the card and the bar move up by the hero's height. With the photographs off, round seventy-eight's held offer line is unchanged.

Test `tests/e2e/r79f-steady.spec.ts`, like r78m's: the sheet held, the room asserted hidden and `aria-hidden`, the card and the bar measured, the sheet released, the hero drawn (its image answered by the test, as the host is not reachable), and nothing moved, at 1280 and 390 wide; a guard that the photographs-off path holds the offer line and no hero; and the species page (item 2) with the collection's open held back by an init script that queues the database's `success` events, then one press opening "Seasons". On the base 3 failed (no `.hero.hold` at either width, no `.notesline.hold`); measured on the base without those assertions, the card moved 216 px and the bar 182.4 px on a desktop, 220 px and 222.9 px on a phone.

### 4. `--fixtures` writes the committed ids

`--fixtures` read no Kew rows, so from an empty folder it wrote `g5411106` and `g5384013`; with the committed files present it reused their ids. Now `fixtures/upstream.ts` gives Kew's two rows for its real species (`kewRows`, copied from `wcvp_names.csv` of 2026-06-04), and `fixtureIds` in `scripts/build-dossiers.ts` reads them with the build's own `fillKewNames` for the pages this run built of those species, then keys every page by `rekey`, and reads the index entries again under their ids. Refusia testii stays the page whose Kew rows were not read, `g999`, as committed. It writes no `ids-gbif.txt`. The rest of each fixture differs from the committed file as before (the committed ones are of an older builder and hand-edited: `literature`, `nVague`, `changed`); not changed. Test `tests/unit/r79f-fixtures.test.ts`: from an empty folder, the three files, each `key`, `ids.gbif`, `name.kew` and author as committed, the index's ids, and a second run keying nothing anew. On the base it failed: the files were `g5384013.json`, `g5411106.json`, `g999.json`.

### 5. The live check's species-page pair

Covered: the species page's pair already goes through `heldPair` (`scripts/live-check.mjs`, the `b.h('x-cultifolio-page') !== 'held'` line in the species block), as the front page's does. The pair is now in `scripts/live-check-pair.mjs` (`heldPair(get, path, init, { pairs, waitMs, sleep })`, `colo`, `centres`), which the check imports, since the check runs against the site when imported. Test `tests/unit/r79f-held-pair.test.ts` (5): held at once (one pair, no wait); two centres by turns then one (three pairs, two waits of a second); never held (five pairs, four waits, the failure naming IAD then EWR); the headers passed each time; and both of the check's pairs going through it. On the base it failed: no module.

### 6. The about-how paragraph, ready for the merge

`scripts/about-how-r79.mjs` writes round seventy-eight's pending paragraph from the list's header and the corpus on disk: the list's day, genera, species, the 26 and the 15, the genebanks' 1.9 million, from the header; how many of the list's species the reference holds, and Aloe's and Euphorbia's, from `static/s/v3/index.json`. Without `--write` it says what it would write and changes nothing. It refuses with no index, an index of none of the list's species, a list of another day of Kew's file, a changed page, or fewer species than the list without `--why "<words>"`; with it, the paragraph adds "The reference holds N of them; the other M are not here yet: <words>." The list part becomes a paragraph of its own; the "Most grown" part follows as the next, unchanged. The page is not changed this round.

One correction to S's text, in the script and in `docs/PENDING-ABOUT-HOW-R79.md`: "Aloe has 199 of the 593 species Kew accepts, Euphorbia 401 of 2,077" compared the list's counts, which include Aloe's 3 and Euphorbia's 5 nothospecies, with Kew's without (Kew accepts 18 and 41). Both sides counted alike it is 199 of 611 and 401 of 2,118 (counted in `wcvp_names.csv`). And "the list is `scripts/specialist-genera.txt` in the source" keeps the live sentence's "in the source", which `r70p-about-seams` reads. Test `tests/unit/r79f-about-how.test.ts` (7): with every species built the script writes exactly the doc's block; fewer, with and without a reason; a line with no Kew id held by its GBIF key; the refusals; the page applied and kept; the script's `--write`. It holds the page either side of the merge's write. On the base it failed: no script. `r74-growers` and `r70p-about-seams` now accept either paragraph (checked with the paragraph applied, then the page restored).

### DEPLOY.md

`### Round seventy-nine: the review, the plant and species pages, and the list's paragraph`, before round seventy-seven's section.

## Needs

- **Z (the index):** `src/lib/dossier/changed.ts` `substanceOf` now sorts `photos[].shared` (a list in `byId` order hashes as before); `photo-kind.ts` `markShared` compares as sets. If Z changes how `--index` writes `shared`, keep the `byId` order, or every page with a shared photograph is restamped once.
- **`scripts/build-dossiers.ts`, my lines:** the imports at 94 (`KewNamesIndex`) and 122 (`kewRows`, `KEW_FILE_DAY`); `fixtureIds()` inserted after `sayRekey` (about 1292 to 1318); one line in `main` after the `rekeyDisk` line: `if (fixtures && built) fixtureIds(thisRun);`.
- **The merge:** after the build's `--index`, `node scripts/about-how-r79.mjs`, then `--write` (with `--why` if it asks), and commit the page with the deploy that serves that corpus. If K's builder route changes how a list line without a GBIF key is keyed, `held()` in the script reads a `k<plant_name_id>` page as held whatever its GBIF key, so nothing changes for it.

## For the owner's PC

After the full build's `--index`, before the upload (seconds, offline):

```
node scripts/about-how-r79.mjs
node scripts/about-how-r79.mjs --write
```

Good: "about-how: the list holds 48,368 species; the reference (static/s/v3/index.json, N pages) holds 48,368 of them, every one; Aloe 199 of 611, Euphorbia 401 of 2118." then "written into src/routes/about/how/+page.svelte." If it asks for a reason, `--write --why "<the build's own words>"`. Nothing to run for items 1 to 5.

## Measured

- On the base, Chromium: the hero moved the plant card 216 px and the verb bar 182.4 px at 1280 wide, 220 px and 222.9 px at 390; the notes line moved the first cultivation summary 33.6 px.
- The reference's photographs: 6,318 of 8,947 species of round seventy-seven's index have a thumbnail.
- Kew's `wcvp_names.csv` of 2026-06-04: Aloe 611 accepted species (18 nothospecies), Euphorbia 2,118 (41).
- Strict Chromium (`CI_STRICT=1`) of the specs touched or bearing on the changes (r79f-steady, r73p-other-keys, r69p-disclosure, r78m-verbs-steady, r62w-pages, r62h-harness, smoke-2): 46 passed, none flaky, 430 s with the build. The new spec on the base: 3 failed, 1 passed, 250 s.
- `tsc --noEmit -p .` and `svelte-check --threshold error`: 0 errors after one fix to my own test's types.
- The whole unit suite once, alone: 440 files passed, 1 skipped, 2 failed; 4,179 tests passed, 8 skipped, 2 failed, both by their own time limits under a load average of 11 to 18 on two cores (2,495 s, against round seventy-eight's 395 s): `search-generations` "wider" (90 s) and `short-path` "two short words…" (20 s). Neither reads any module I changed (`$lib/server/dossiers`, `$dossier/products`, `$core/search`, `$core/postings`; `dossiers.ts` imports only `heldNamesOf` from `photo-kind.ts`). Rerun alone: `search-generations` passed; `short-path` timed out again at 70.6 s with the machine at a load of 18. Worth one rerun at the merge on a quiet machine.

## Not done, with why

- Why the ids sorted otherwise than the GBIF keys on the owner's corpus: its files are not here (item 1).
- No WebKit here: neither flake was rerun in WebKit; what each trace proves and what is hypothesis is said above.
- A per-species memory of whether a photograph came, which would spare the 29 % move on a return visit: not done, as a guess-free rule needs only the base rate and the plant's own facts, and it would keep a list of the grower's species beside the log.
- The front page's visitor-to-grower redraw on a device whose plants were written behind its back: not an app fault for a grower (the hint is set by any page), so left; the test waits for the collection.
