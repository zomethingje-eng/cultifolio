# Round fifty-eight: three reviews, one round

Three reviews of rounds fifty-five to fifty-seven arrived together: the author's own (`docs/REVIEW-SELF-57.md`, P0 to P3, from seven passes over the code, the live site and the pages at phone width), the "round forty" review of 3dfd361 (R1) and an independent review of the three rounds (R2). This round takes everything in them that holds up, in five parts: the server (1), the collection on the device (2), the Today tab, the frost watch and the copy that no longer matched the code (3), the first screen a stranger sees (4), the grower's daily use (5), and accessibility with the design tokens (6). What was checked and left as it was is in 7.

## 1. The server

1. **Vault creation from another site** (self P0-1, R1). A page anyone opens could create vaults from its visitors' browsers: a `no-cors` POST with a Blob body carries no content type, so SvelteKit's origin check (forms only) let it through. Now every write to `/api/sync/*` that names another site in `Origin` or `Sec-Fetch-Site` is refused in the hook (`_foreignWrite`), and the vault POST takes only `application/json` (415 otherwise). A script can still make any request it likes; it could before, and the ceilings below are what bound it.
2. **The ceiling in all counts vaults that hold something.** A vault takes its place under the ceiling at its first stored object (`fillVault`, marked `filled` in its meta), not at its creation, so empty creations can no longer spend it. The day's and the address's ceilings still count every creation.
3. **The /48 counts for the requests that call another service.** Forecast, names and match are counted by an IPv6 address's /48 as well, at four times one address's allowance, as vault creation has been since round thirty-eight.
4. **The byte cap could be reset** (self P0-2). `recount` trusted a listing cut short at fifty pages and wrote the smaller figure back; a cut-short listing is now a floor, never written over a larger total.
5. **Concurrent uploads were counted as one** (self P0-3). With the counter object bound, the bytes are taken in it, one object per vault and one per address, check and count in one step; KV's read-then-write remains the fallback without the binding. An upload that does not land gives its bytes back in both.
6. **Two uploads of one name.** `storeOnce` writes with `onlyIf: { etagDoesNotMatch: '*' }`; the second of two concurrent uploads is judged against what the first stored (same or different), never written over it and never counted.
7. **One corpus per request** (all three reviews). `product`, `entriesIn`, `sheetsIn`, `catalogueRows`, `searchAnswer` and the home page take the one load the request began with (`corpusNow`), so a refresh landing mid-request can no longer apply the new manifest's postings to the old index's positions. The product cache is keyed by hash, holds 160 files under the same 24 MB, and a file that does not parse is a miss for a minute, said in the log.
8. **Search cost** (self P0-4, R1). `rank` stops at the first query word that matches nothing; repeated words count once. One-word queries of one or two letters (the first keystrokes, which match most of the index) are answered from `short.json`, the build's own top hundred hits for every such key, so they cost a lookup. The adversarial generator of the server review (small alphabets, accents, digits, rank markers anywhere, slips at every position, 3 by 3,600 queries) now runs in the suite: the postings and the short answers equal the whole index, order included. The search route's answers are cached at the edge by the adapter (it puts any public response in `caches.default`; R1 was right and my own server pass was wrong about this), so no separate Cache API call is added.
9. **The manifest is read strictly.** A manifest is adopted only when its counts are the ones the build would choose for its species and it names every product those counts call for (`short.json` optional), so a half-written one leaves the corpus held before in place.
10. **The home page's window is bounded.** `?at=` with `?open=` far below it sent the whole catalogue; the window is now at most two windows wherever it starts (`homeWindow`, read the same way by the page and the page cache's key), and an opened row carries 240 species a page (`?part=`), with Previous and Next: an origin such as the Cape held thousands.
11. **Bodies held once.** A body with a declared length is read into one buffer of that length (one longer than declared is refused), and the photo upload checks its removal proof before it reads the body.
12. **Requests the edge did not hold** (`/api/dossier`, `/api/entries`, the sitemap files) are counted under a `reference` rate, since a query string makes any request a miss; the sitemap's address list is built once per index.
13. **Small items.** The page cache's key reads the path decoded, so `/species/%63opiapoa-cinerea` shares the page's copy. The service worker keeps a reference answer only when it was asked for under a corpus id. `/api/corpus` says whether a manifest is served, and the live check fails the real site when it is not and asks a one-letter search.
14. **The prune guard** (R1). The bucket's `p/` was pruned from this checkout's build history, so a prune from a second checkout, or after two refreshes in a day, could delete a file the live manifest names. Now `npm run dossier -- --keep-list <live manifest>` lists what the manifest the bucket serves names, refusing anything the Worker would not accept as a manifest, and DEPLOY.md section 5 pairs it with `rclone delete --exclude-from keep.txt --min-age 24h`, with a dry run first. Section 5's opening, which still described sheet files beside the index and an index-last upload, is rewritten, and the old one-off steps' upload lines are written as today's.

## 2. The collection on the device

1. **The fold-rules guard covered too little** (self P0-7). It now hashes the whole of `log.ts` and `hlc.ts` (the key, the stamp order, the hold and park rules and their constants), the collection's hold, park and snapshot methods, and the vault's `storeIn`, `readFold`, `writeFold` and `arrivalsAfter`. Checked by mutation: moving `PARK_MS` fails it. FOLD_RULES stays 3: nothing this round changes what a fold of a log comes out as.
2. **A peer's held change skipped the grower's protections** (self P0-8). The engine stored a held change straight into the log, so a batch whose every change was held never reached the fold's held list, and the grower's next edit to that field was stamped below it and lost when it came due. Every pulled change now goes through `collection.ingest`, which folds the due ones and holds the rest as a load does; the edit is stamped past a held change within a day, as round forty-nine designed.
3. **Rule 5: a sync run wrote the number repair even when it brought nothing** (self P0-9). The repair now runs over the numbers that merged changes touched, once at the end of a pull, and a run that folded nothing writes nothing. A restore repairs only the restored record's number; "Renumber now" repairs only its own number. The record made first, by its first stamp, keeps the number (not the lower id), the notice says which record the button renumbers, and the toast says so when the repair did not land.
4. **Notes replaced are read from the log, not written to it.** The "Notes replaced" line a device wrote when a pull or a file replaced its text was a reading of the log writing to the log, missed a text replaced by a held change that came due across a reload, and was written by one device only. `src/lib/core/notes.ts` reads, from a record's changes, every text an edit replaced without having seen it (by the edit's `notesBase`), and the plant and batch pages show them under the notes on every device. Nothing is written; the plant page's own "replaced by this edit" line is gone with it.
5. **The species key written on view** (the writer round fifty-six left). The plant page and the labels page no longer write `taxonKey` when the reference files the name under another key; the plant page says so and offers "Use the reference's key".
6. **"This change was not saved"** showed for a sync batch that could not be stored. `lastWriteError` is now the grower's own writes and files only.
7. **The grower's writes are checked as a pull is.** A local commit with a value its field never takes is refused with the reason; a number must be finite, so the place form's "1e999" is refused rather than stored as Infinity and sent as null.
8. **A rolled-back build was locked out of the snapshot** (self P0-12). A snapshot under rules no build reads any more is replaced once no newer shell has written it for an hour (`savedAt`).
9. **Tabs** wrote their own copies of the parked-done and photographs-to-check sets over each other; those are now read and written in one transaction (`updateMeta`). A sync run takes a Web Lock, and starts from the sync record as stored, so two tabs no longer run at once on two copies of it.
10. **The clock** check reads the fold rather than the whole log on every open, and does not call an edit stamped just past a held change a clock that jumped back; the warning is cleared when neither condition holds.
11. **A backup carries the parked set** (`parked` in the manifest): a merge parks those changes before folding, and a replace takes the file's set.
12. **Small items.** The plant edit form's leftover `location` key; `ChangeRow` no longer accepts `m`; the waiting-record notice reads each set-aside entry's kind; the sync engine's HLC-cursor meta conversion and its duplicate clock listener are gone; stale comments put right. The sync page no longer says nothing on the server is ever deleted (a removed photograph's bytes are), shows the set-aside counts apart, and puts its account of how the collection was read in a disclosure. A shell left open across the round fifty-seven deploy still reads `importedOn` until it reloads; nobody runs one, so it is noted here, not handled.

## 3. Today, the frost watch and the copy

1. **Today** (self P2-1, P1-15). Undo is in the done row only: in the header it sat where Water had been, so a second tap undid the watering. A failed Undo keeps its entry to try again. Each plant is a chip with its number and name, ticked by default; unticking one makes the button "Water 5 of 6 here". A watering the grower started for a place counts as a sighting (`auto` is for lines the app writes by itself), the ninety-day rule speaks only in a place that has been audited, a plant is listed once per stop, the day counts read the day store, "15 growing here and inside" says what the count covers, the toast is short and wraps, and the front page's "Water these" keeps its line with its own Undo.
2. **The frost watch** reads the new site at once when it is changed in Settings, takes the answer's own age for its half hour, and gives up after ten seconds, said as a check that did not happen. /about/how says this.
3. **Copy that no longer matched the code** (self P1-16 to 18): the photographs' "offer it to the gallery", the home page's "bring in a collection", the batch provenance `f1` ("seed from F1 plants in cultivation"), the species page's floor line naming whichever place came first, labels' "12 cutting", the photo-host disclosures without Wikimedia Commons, README's three-species fixture (four). Welwitschia is no longer called a cactus or succulent: its genus and family have no care group.
4. **The species not-found page**: an address in capitals moves to the lowercase one, a genus alone opens its catalogue row, a slip offers the names the search finds, and "Kew does not accept" is gone (no source said it there); the page says the name as written is not on the list.

## 4. The first screen

1. **The front page** says what this is to a visitor, at every width: "Cultifolio" and one sentence naming the plants, the figures, the sources, no account, free and open source. The title is "Cultifolio: cactus, succulent and bulb reference, and a private plant record", with Open Graph tags and an image (`static/og.png`, the name and the sentence, no photograph).
2. **The species page**: "In short" is a list in plain words, the fact first and the rule and source in grey after it, with the reader's months and the habitat's once in brackets; the top cards' captions are one line; "Its year" is "Seasons"; DLI and the cold floor link to the glossary. Six photographs sit under the name card and the section menu directly under them; `content-visibility` with its 480 px placeholder is gone, so the scrollbar no longer jumps.
3. **/about/how** opens with "In brief" and a table of contents; its privacy section leads with eight lines, the full account under "Full detail". The public pages lose their "round …" notes and the "dossier v2 · node" line.
4. **Maps in dark mode**: the land's colours come from the theme, not the file.
5. **Dead ends**: an empty search says the reference is a fixed list and offers to add the plant anyway; the 404 is "Not found" with a search box and links. The footer is three lines, its source list whole.
6. **Titles** use "Name · Cultifolio"; the em dashes left in visible strings are gone.
7. **Compare on a phone**: a picker on the page, two columns to a phone's width, one chart with every species' year overlaid, and rows shaded where the figures differ by a stated rule.

## 5. The grower's daily use

1. **A watering rhythm per place**, inherited down the tree, with a per-plant override, and the months a place is kept dry (`waterDays`, `dryMonths`, `waterDays` on a plant). "Due" means past the rhythm (21 days unless set); a place in its dry months shows one quiet line on Today. One reading for Today, the lists, the place page and the plant page (`collection.isDue`).
2. **Places**: every picker shows the full path and "last used"; the top bar's "+" adds a place on Places and a batch on Propagation; altitude is in feet on a US device; an unheated place without coordinates is watched at the grower's site and says so.
3. **The plant page**: card, actions, the plant's own figures, the last five log entries, photographs, then "Habitat vs this place" folded; no "Set your site" step on every plant; a dead plant offers no Move or "Since watered"; a removed log entry has Undo; a repot records a pot size and medium; lengths follow their own setting (millimetres or inches).
4. **Lists**: names wrap between words, rows are two lines of about 56 px, the photo column goes when nothing in view has one, and the place page's Inside list reads "Bench 1, Bench".
5. **Propagation**: cards on a phone; an "In the pot now" count mode that works out the total and shows it before saving; the parent picker shows number and name with a filter; the Sow form's buttons are pinned and a disabled Start says why; "Add 10 as typed" adds ten.
6. **Labels**: a Labels action after adding plants, "Print N labels" after a pot-up, picked plants first, "No plants yet" on an empty sheet, and the QR option unticked where the stock has no room for it.
7. **First visit**: the empty plants list is three steps (where you grow, the first plant, your location); the sort and the chips wait for two plants.
8. **On a phone** the tab bar hides on scroll down and the compare tray is a pill; a toast never sits over a field being filled.
9. **Settings** grouped under headings, one option a line, placeholders that do not look like values; a bad zip says the file is not a readable zip and nothing changed.

## 6. Accessibility and the design tokens

1. A focused element is scrolled clear of the sticky bars (`scroll-margin` on `:focus`; WCAG 2.4.11).
2. Every font size is rem on a seven-step scale (`--fs-xs` to `--fs-2xl`) with `html { font-size: 100% }`, so the browser's text size applies; nothing is under 11 px at the default.
3. Fields and chips have a 3:1 edge (`--field-edge`) and the page's focus ring; warm text has its own colour (`--warm-ink`); the two grey inks read apart; `--line` and `--warn`, used and never defined, are defined.
4. The lightbox and the audit keep focus (on open, on each swap, back to the opener on close) and the lightbox hears Escape on the window; the grower's photographs have text alternatives.
5. The skip link is first, the top bar is a `<header>`, the breadcrumb a labelled `nav`, the current tab carries `aria-current="page"`, and `aria-haspopup` is only on the real menu.
6. Tap targets follow `--tap` (44 px under a coarse pointer, 40 px in a narrow window); short forms have visible labels; one toggle-group component replaces three patterns; the cold-floor card is a card with a small °C/°F button; sideways scrolling regions are reachable by keyboard; the climograph's title names the species and its description gives the figures.
7. One word per concept in the interface (plant, plant number, batch, place, the reference, sync key, "could not be read here"), and the radii are three tokens.

## 7. Checked and left as it was

- The vault POST answers 404 for "no vault answers to that key" and 403 for a wrong token: a vault's id is derived from its token, so only a holder can tell the two apart.
- No separate Cache API call on the search route: the adapter already caches its public answers per colo.
- `accNo`/`sowNo` still fall back to the id (round fifty-seven kept it deliberately).

## The corpus refresh this round needs

`short.json` is a new product, so the live corpus serves the search without it (the postings path, correct and slower for one- and two-letter queries) until the next `--index`. After the deploy:

```
npm run dossier -- --index
rclone copy static\s\v2 r2:cultifolio/s/v2 --transfers 32 --checkers 32 --exclude report.txt --exclude manifest.json --exclude manifest.prev.json --s3-no-check-bucket -P
rclone copy static\s\v2\manifest.json r2:cultifolio/s/v2 --s3-no-check-bucket -P
npm run live-check
```

## After the first deploy run

The deploy's unit suite failed on the author's machine with 22 failures, all in the sync engine's file, and passed in the build sandbox. The sandbox ran Node 22, which has no `navigator.locks`, so the new one-run-per-browser lock was never taken there; Node 24 has one. Three things came out of it.

The lock had one name for every vault, so a run of a vault the tab had left (after "Stop syncing" and a new key) could still hold it and the new vault's first run would be skipped without a word. It is now named by the vault. A test stalls the old vault's push, joins a new vault in the same tab and expects its first run to land; with the old name it fails.

The engine holds the lock manager as a field, and the test harness gives each simulated browser its own, so two tabs of one device share a lock and two devices do not, on any Node. A second test shows a tab leaving the run to the tab already running it, then running once that one ends.

The harness let a run scheduled by an edit (2.5 s on a real timer) fire during a later test, against that test's store; under the key every test shares, and now that a run reads its sync record from the store, it took the later device's record as its own. Every engine a test boots is retired when the test ends, and three tests that acted as one device after booting another now put that device's store back in play first, as the rest of the file already did. The file passed fourteen runs in a row on Node 22 and 24 after the change.

## Counts

Type check clean on 595 files; 500 unit tests on 52 files, on Node 22 and on Node 24; 100 end-to-end tests; the local live check passes 10 of 10; the build is clean.
