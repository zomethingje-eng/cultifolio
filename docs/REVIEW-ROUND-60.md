# Round sixty: the fixes from three reviews of round fifty-nine

Three reviews of round fifty-nine were triaged into `docs/REVIEW-TRIAGE-59.md`: the author's own (`docs/REVIEW-SELF-59.md`, nine parallel passes with their tests in `docs/review-59/`), the "round forty-two" review (A) and an independent review (B). This round does every item the triage kept, plus the self-review's experience list. Four agents worked in copies (server and corpus; the public pages; the private pages and accessibility; the grower features) while the data layer was done here, and their work was merged by a three-way merge against one base. Two more agents adopted the reviewers' tests and wrote the grower features' end-to-end tests. What follows states what a test or a measurement shows; where a claim rests on a check made once by hand, it says so.

Results: 770 unit tests in 83 files, on Node 22 and on Node 24; svelte-check clean on 730 files; 134 end-to-end tests (118 in `smoke.spec.ts`, 16 in `r60-grow.spec.ts`), all passing on the last full run; the local live check passes 11 of 11. FOLD_RULES is 5, so every device folds its log once on its first load after the deploy.

## 1. Wrong clocks (decision 1)

1. **An edit always wins.** An edit is stamped past the field's current stamp however far ahead that stamp is (`stampPast`). Before, a device whose own earlier stamps were years ahead (its clock was fast, then put right) stored an edit and silently kept showing the old value, for good; and a device set back three days lost an edit to any field written in the last day of true time. Both were the reviewers' reproductions (S7, A1, B2); both now assert that the edit shows and survives a reload and the clock being put right.
2. **This device's own changes are never parked by its own clock.** `isParked` exempts this device's stamps when there is no arrival to judge them by. When the clock is confirmed and an edit would be stamped past this device's own stamp more than two days ahead, that stamp is parked as part of the edit and the fold rebuilt, so a fast clock's leftovers stop winning without the grower losing anything (S1, A2).
3. **A reading dated after the clock is not a confirmation.** `clockChecked` and the stored correction both require the reading's age to be between minus five minutes and a week. A negative age passed "under a week", so a device set back three days still counted as confirmed and parked its own plants (A, B). Five minutes of slack covers rounding and a time sync's nudge; the end-to-end clock test needed more than one minute, since its page reload loses the test's own 61-second shift.
4. **The snapshot is keyed by whether the clock is confirmed** (B4). A test folds a held change into a snapshot under an unchecked clock, confirms the clock, and checks that the next load folds the log and parks the change; with the key removed, the snapshot is read and the change stays held.
5. **Peer changes on an unchecked clock stay held** (decision 2), and every page that lists records now says how many are waiting (`heldWaiting`, the plants list, Today, the sync page, the backup report).
6. **The engine's hold and batch intake are in the fold-rules hash** (A31), and the harness review's six proposed engine tests (C03, C21, C22/23, C27, C41, C46) are in `sync-engine.test.ts`.
7. **Known divergence, kept:** a device three days fast that pushes and is then put right before a second reading keeps its own edit folded, while its peers park that edit by its arrival. The writer cannot judge its own stamp by an arrival it never sees. The parked edit is listed with Apply on every peer, and `r60-clock-review.test.ts` pins the behaviour. The adopted convergence fuzz shows it at scale: with clock skews up to three days, 120 seeds lose nothing (now asserted), and 26 end with a record shown differently by the writer and its peers; with the three-day-ahead skew taken out, 2 do. The one traced (seed 1008) is this case: the peers parked a plant made 30 hours fast by its arrival, and the writer shows it.

## 2. Numbers two plants share (decision 3)

1. Links go by record id while a number is shared (`plantHref`, `batchHref`) everywhere a record is in hand; a bare shared number opens a chooser; the shared-number notice links the other record; `/labels?acc=` with a shared number picks neither and says so.
2. **Restore yields only to a record born after the removal** (A14). A number two plants already shared before one was removed is left as it was; before, the restore renumbered the restored plant and reversed the keeper the record pages offer. Mutation-checked.
3. The backup preview lists both plants that will share a number (`sharedNumbers`), where it used to promise a renumbering the merge no longer does. The CSVs gain an `id` column (`record id` in events.csv), and text a spreadsheet would turn into a number or a date (`0012`, `3-12`, `1E5`, `00042`) is written as `="…"`, which the import reads back as written.

## 3. Notes

The "replaced unseen" reading follows an edit's base through texts this device holds or has parked (A16), and Apply of a parked note takes the text on screen as its base. Tests in `notes-replaced.test.ts` and `r60-notes-review.test.ts`, mutation-checked.

## 4. The server (decisions 5 to 7)

Done in a copy and merged; the details are in the agent's report, summarised in DEPLOY.md.

- Reservations are leases (`p:<id>`) that lapse after ten minutes; a recount is committed only if no upload landed and no removal was made while it was taken.
- Admission fails closed: a counter that cannot be read answers 503 with Retry-After and a sentence, and nothing is stored uncounted. A vault takes its place among the day's (200) and all (2,000) at its first stored object; a failed first write gives the place back.
- A photograph's PUT and DELETE are serialised by a hold in the vault's counter object; receipts use R2's version; a removal older than a newer upload of the same photograph is answered 409 and leaves it. The engine now sends the removal's time (`X-Photo-Removed-At`), retries a 503 next run without a word, and takes a 409 as done. Tested, mutation-checked.
- A 503 refusal is shown on the sync page in the server's own words; the device keeps receiving and sends nothing more until Retry-After has passed.
- The corpus: a refused index never falls to the fixture; a remembered refusal expires after ten minutes; an R2 error keeps the held corpus; a dossier the index lists but cannot be read is a 503, never a 404; `/api/dossier` is `no-store`. Compare says "Could not be read just now" for such a column.
- Search reads growers' names: rank markers, hybrid marks and pasted author citations are skipped; on no match it searches the first two words and the front page says "Showing results for …" (read from the `x-search-relaxed` header). Every English common name is searched. The near pass is charged with the exact pass, once per request.
- Security headers (nosniff, Permissions-Policy, HSTS), `X-Robots-Tag: noindex` on private pages, CSP `img-src` limited to the four photograph hosts, a global cap on calls to outside services, odd species addresses redirected to their slug.
- The service worker's update check is once per full page load (the code always did this; `/about/how` and the README said "at most hourly" and now say what it does).

The reviewers' server tests are adopted (`r60-review-server*.test.ts`, `r60-proposed-*.test.ts`): eleven that reproduced fixed bugs were rewritten to assert the fixes, three ported to the lease API, one split in two, and 21 single-line reverts of the fixes each failed its test.

## 5. Credibility (decision 4)

- The archetype table never raises a habitat floor. Its minimum is shown apart, as a convention with no source; terrestrial bromeliads and terrestrial or temperate orchids leave the epiphyte and orchid groups, and a family that splits assigns no group.
- The words review's findings are fixed in the sheet, the climograph (NASA POWER named on its lines), the share card, the front page, the species page, `/about/how` (the corpus paragraph, every storage key, the request list) and `/about/formats` (the clock rules, numbers, vault ceilings, uploads, search, import, the watering calendar, the label code). A species page's map-marker sentence said "The map marker: the map marker:"; it now says it once.
- `og.png` is unchanged: the only species data in the repository is the fixture corpus, whose figures are not facts about any species, so a card drawn from it would be invented. Its text is true as it stands.

## 6. The interface

- **Front page.** A visitor sees three short lines, the day's photographs, and, on a desktop, one species' figures and chart as its page shows them ("This is what every species page shows"), read from the corpus under the page's own corpus id. On a phone that block took 1,300 px and put the search four screens down, so there it is a link in the second line; the search, the photographs and the first catalogue row are on the first screen at 390 × 844 (end-to-end test). The welcome line offers the sample collection.
- **Species page.** In-short removed; cards closed at rest; one "How this section is made" per section; a season card in the reader's months; grower labels on the figures; no grey box for a missing photograph.
- **Private pages.** Today, the plants list, labels (A4 by default outside the US and Canada), the backup preview and report, the sync page's words, settings that no longer lose choices made before the load, printing, focus after Undo, no "Water these 0", forced colours, 44 px targets, and the layout at 320 px with 200% text (checked by script on ten private pages: no sideways scroll; the empty plants page scrolled 58 px until the sample button was allowed to wrap).
- **Grower features.** Paste and CSV import with a review before anything is saved; Download as a spreadsheet; select mode (water, move, labels, archive, each with Undo); photo timeline; firsts; spending this year; the Wanted list (a followed species now says "On your Wanted list ›"); a watering calendar file; the sample collection in a database of its own; the iPhone Home Screen card; a one-time storage persistence request; a label QR code that tells a phone without the plant which species it is. Sixteen end-to-end tests (`r60-grow.spec.ts`) passed twice in a row.
- "Also today" is drawn only when something is under it.
- Two end-to-end flakes are answered: the test helper that writes changes straight into the page's database could open it before the page had made its stores (it now waits for them and never creates the database itself), and the round-twenty-nine restore test passed on Node 22 and failed on Node 24 by timing, since its other plant was born before the removal; it now removes first, as the round-sixty rule needs. The forecast refusal now reads "Forecast not checked: the forecast could not be reached just now, so this is not an all-clear."
- The tab bar no longer flips for a grower on a server-rendered page: `app.html` reads `cultifolio.hasMine` before paint (the CSP hash is updated).

## 7. Not done, and why

- **B13, the prune race across two checkouts:** one operator and one checkout publish; documented in DEPLOY.
- **The /48 total for daily upload bytes** and **`sheetsIn`'s fallback:** decided last round.
- **Photo credits by author on tiles:** the index carries a thumbnail address, not its author, so tiles credit the source site and the page each tile opens carries author and licence. Adding a `credit` to each index entry is a corpus-build change for a later round.
- **The corpus review's cost, refresh and grower-query harnesses** stay in `docs/review-59/tests` as measurements: they assert nothing, so they are not in the suite. Its fuzz test and its mixed-corpus test are (`r60-corpus-*.test.ts`); the fuzz now checks the relaxed retry against the whole index.

## 8. After the deploy

The common-names search needs the corpus index rebuilt (`commons`): deploy first, then `npm run dossier -- --index` and the upload as in DEPLOY.md section 5. Until then search reads the first common name only, as before. Check that the slugs in the launch draft exist on the live index, and settle its sync price sentence (marked `[AUTHOR: confirm]`).
