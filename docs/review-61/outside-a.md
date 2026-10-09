# Outside review A of round sixty-one

The "round forty-four" outside review, of f4ab4f8 (round sixty-one), received 8 October 2026. Kept as received, less one section on material outside the repository.


The new clock rule mostly works: every clock bug from the last review that I could reproduce is fixed, and a ten-round, three-device run of the real engine converged. But the fuzz's "zero divergence" comes from a model that re-judges every sync, and the real engine judges each batch once. Through that gap, and through two paths no test covers, a far stamp still ends up shown on one device and parked on another for good.

A first-time reader: five of the last review's credibility findings are still open, and two of them are on the front page and in every link preview:
a plant's number in a Referer;
"This is what every species page shows";
"in the wild" in the species meta;
terrestrial orchids in the orchid group;
the incomplete /about/how list.
Data: the species page's notes editor follows a related-species link and Save writes the draft over the other species' notes. That is the bug class the round fixed on plant pages, missed on the one page none of the record agents owned.
The triage's claims: most decisions are done. Search (decision 7) is half done; the front page and the sample are done differently and say so. The fold guard still misses the code that decides what an own batch is judged on.
What was run
System: Linux 6.18, x86_64, in a cloud sandbox. Windows was not available, and only Chromium is installed (no Firefox or WebKit).
Type check: npm run check gives 792 files, 0 errors, 0 warnings.
Unit: npx vitest run gives 130 files: 1,096 passed, 2 expected failures, 2 skipped on Node 22.22.2 and on Node 24.21.0 (fetched with npx -p node@24).
A first Node 24 run, made while eight probe jobs shared the machine, could not start the worker for search.test.ts ("Timeout waiting for worker to respond"). Re-run on a quiet machine, it passed. This was load, not code.
The suite also passes with the clock at 2 January 2027 and at 23:59:50 on 31 December 2026, through the round's clockshift.mjs.
End to end: npx playwright test (its own server on 4173, Chromium 141, Playwright 1.63, Node 22): 179 passed in 7.9 minutes. No test needed its retry.
Two specs leave a Chrome profile in /tmp per run (r61a-a11y.spec.ts:145, r61w-pages.spec.ts:170, mkdtempSync with no cleanup).
Probes: vitest probes over fake-indexeddb, the real two-device engine and the fake-sync server, in throwaway copies. 103 reverts of round sixty-one's fixes: 95 against their own unit tests, plus nine in one build against their e2e tests.
Interface: local builds under wrangler dev, driven by Playwright at 390×844 (touch, DPR 3), 320 with 200% text, 400% zoom and 1280×800, light, dark and forced colours, with axe-core.
Files: Chromium PDFs of the label sheets, measured against Avery's specs. The calendar checked with Python icalendar and recurring_ical_events. CSVs round-tripped through LibreOffice.
Not checked: the live site and GBIF. The sandbox's proxy refuses both. The common-name questions that need the live index are answered from the code and from built name lists, and say so.
Marking: every finding is confirmed (reproduced) or suspected (read, not run). The repo was not modified.

Ranked by what a first-time reader finds first, then data loss, then the rest.

A. What a reader finds first

1. A plant's number still leaves in a Referer (confirmed, rule 4; review 43 #6, unfixed).

Where: +layout.svelte:260 declares the italic Newsreader @font-face through {@html '<style>…'}.
What happens: loading /plants/2026-0042 sent the font request with Referer: http://…/plants/2026-0042, though the header and the meta tag both say no-referrer. A reader who opens devtools on a private page sees it.
Effect: it contradicts /about/how ("the number is never in a referrer").
Fix: move the @font-face into theme.css.

2. The title, the home meta and the first bullet say "cactus, succulent and bulb" species, and the list is wider (confirmed).

Where: +page.svelte:464 (homeDesc), :516 and :520 (title and og:title), :526 (og:image:alt), and the first bullet.
The contradiction: /about/how:38 says the list also holds the 2,500 species most often recorded in cultivation on iNaturalist "across every kind of grower" (Hoya, Peperomia, Pelargonium).
Effect: a reader who searches Hoya gets a page the title says isn't there.
Fix: "…and the plants most grown alongside them" in all four places.

3. The species link preview still says "in the wild" for a modelled cell, and the new figure names say less than the figure (confirmed, rules 1 and 3).

The link preview: ref/head.ts:65 writes "Copiapoa cinerea in the wild: 1 night in 100 below 6.5 °C (NASA POWER)". That is one reanalysis cell at a typical spot. It is what a link preview unfurls.
The new names:
The glance cold card (Glance.svelte:79) names the typical spot, NASA POWER and "40 years". The years, the 0.5° × 0.625° cell and the lapse treatment are in the closed "How" only.
Compare (compare/+page.svelte:189) and the share card (card.ts:43) drop "typical spot": "record low 39.2 °F in 40 years · NASA POWER".
The label still prints "hab. night 6.5 °C" (note.ts:93), with no "1 in 100" and no source.
The sheet's one-line form says "1st-percentile habitat night" (sheet.ts:265).
"Rain a year" (Glance.svelte:54, card.ts:33) is the sum of the twelve monthly medians. That is the "year no cell has" that /about/how:55 itself warns about. The builder keeps only p10 and p90 of per-cell annual totals (provider.ts:196). Fix: "Rain a year (sum of monthly medians)", or store the p50 of annual totals.
The lapse sentence is false when the correction is 0 m (provider.ts:114-120). deltaM === 0 falls through to "no lapse correction (POWER gave no cell elevation)", and Copiapoa's fixture shows it. Fix: choose the wording on whether both elevations exist, not on the delta.
Fix for the cold figure: "Copiapoa cinerea habitat: cold floor 6.5 °C, 1 night in 100 at a typical spot (NASA POWER)"; "typical spot" on compare and the card; "1 in 100, NASA POWER" on the label.

4. Three claims from the last review are still false as written (confirmed).

"This is what every species page shows" (+page.svelte:735; review 43 #3): pending (Welwitschia) and refused (Refusia) pages show none of it. Fix: "a species page with a habitat climate".
Terrestrial orchids are still in the orchid group at 13 °C (arch-tables.json, genus.orchid; review 43 #33).
Still listed: Paphiopedilum, Ludisia, Phaius, Phragmipedium, Cynorkis and Cymbidium. Alcantarea and Billbergia are still epiphyte, Selaginella tropical.
/about/how:66 says terrestrial orchids "are in no group at all".
The why text "the genus X, which is reliably one kind of plant" (arch.ts:66) is still an authored claim on a species page.
The share card's footer "Derived by rule, not written." (card.ts:103) contradicts /about/how:42, which says the templates were written by the author with Claude.
Fix: move those genera to none; reword the why text to "listed under the genus X in the archetype table"; make the card's footer "Figures derived by rule".

5. /about/how and /about/formats still say things the code does not keep (confirmed, rule 4).

Edge caches (review 43 #5):
how:89 says the edge keeps "two public answers", and how:94 lists three.
Not listed anywhere: each name typed into the picker, lower-cased, for a day (api/names/+server.ts:40,66); rendered pages for 60 s (hooks.server.ts:15,189); /api/sheets buckets for a day.
Requests: "this list and nothing else" (how:94) omits that the picker also sends its text to /api/search (SpeciesPicker.svelte:87), and SvelteKit's version.json fetch after a failed navigation.
plants.csv (formats:41): says the id is "beside its number" and the file is "not for import". The id is the last column (backup.ts:349), and csv.ts:5 says the import reads it back.
Waiting counts: "Every page that lists records says how many are waiting". HeldNote is only on /plants and /today.
Restore: formats says a number goes "only to a record created after the removal". The code decides by the order records arrived on this device (collection.svelte.ts:1472-1486), so a peer's duplicate made offline before the removal, arriving after it, renumbers the restored plant.
Photo removal: formats says a 409 is asked again "at most once an hour". asked409 is kept in each tab's memory, so every reload asks again.
Refusals kept in the sync record: formats says a 503 asking for less than a minute is not kept. A 503 with no Retry-After defaults to 300 s (engine.svelte.ts:603) and is kept as "not taking uploads from this vault", which formats does not describe.
Import: formats omits that a future date, or one before 1900, is not read (csv.ts:218,226).
What the seam test misses: r61w-about-seams.test.ts checks quoted cultifolio.* keys by substring, and only api.* hosts in server code. It does not check:
local versus session storage;
keys the page names that no longer exist;
template-built cultifolio.demo.* keys;
IndexedDB, cache, lock and channel names;
the browser's own /api/* requests;
edge caches;
any figure the pages state (600, a tenth, 90 days, 30 s, an hour);
the plants.csv, waiting and restore sentences.
Several assertions sit behind if (CONST === …) and pass vacuously once the code changes.

6. Today waters resting plants when the species sheets fail, and says nothing (confirmed, rule 2).

Where: today/+page.svelte:94, :103.
Steps: 6 plants in Greenhouse, half Copiapoa. /api/sheets* aborts or answers 503.
With the sheets: the Copiapoa sit in their own resting row, and the button reads "Water 3 here".
Without them: after about 2.2 s they are drawn as ordinary past-rhythm rows, and the button reads "Water 6 here". No sentence mentions the sheets.
A hanging request: "Reading the species sheets…" stays with no stops for 11.8 s.
No second try: failed slugs are marked asked (sheetsAsked), so this visit never asks again.
Fix: on m === null, show "The species sheets did not answer, so no plant is set apart for its habitat's rest", and don't mark the slugs asked.

7. Search: a cross with an abbreviated second parent is answered as the first parent, unflagged (confirmed; review 43 #11, partly open).

Where: search.ts:116 resets lower after x/× but not names/need, so E. reads as an author.
Example: Echeveria lilacina × E. pulvinata and Copiapoa cinerea × C. humilis (on the Worker) return the first parent with no x-search-relaxed. This breaks decision 7 and /about/how's "after x or × the name starts again". Fix: names = 0; need = 1 there.
A trailing full stop (the iPhone's double-space) makes the last word an author: String of pearls. searches "String of" and returns four species, unflagged (search.ts:90,111). Fix: a dotted word is an author only after a 4-letter epithet.
The picker lowercases before searching (SpeciesPicker.svelte:71), so the case rule never fires there. Fix: send the scientific name as typed.
Unquoted cultivars find nothing: Haworthia Big Band, Crassula Gollum, Echeveria Perle von Nurnberg.
Invisible and full-width characters break a word: a zero-width space or soft hyphen inside a word, and full-width letters, still find nothing (api/search/+server.ts:38, NFC only). Fix: .normalize('NFKC').replace(/\p{Cf}/gu,'').
The add form can still file a cultivar under another species: Echeveria Lola, Echeveria cv. Lola and Echeveria Ruby one-typo-match E. lilacina or E. rubromarginata. Picking one files that species, and "Lola" is gone (pickedName).
A variety under the species' key: through a synonym listed on the species, Copiapoa cinerea var. columna-alba is an exact hit, offered as "has a species page", and filed with the species' key (suspected; it depends on the real synonym lists).

8. The picker says "did not answer" when the site refused (confirmed, rule 2 as the round restated it).

Where: SpeciesPicker.svelte:54, :239, :240. Only a 503 or 429 carrying held: true is worded as not asked.
A 400 for the characters: /api/names:35 answers 400 for anything outside its letter pattern. The picker sends field numbers ("Conophytum sp. 2024"), iOS's curly apostrophe ("Aloe ’Blue Elf’" goes out as "Aloe Elf’"), and & from a pasted author.
A 429 without the flag: the per-address 429 (:45) carries no held.
What the grower sees: "The name service did not answer." for all of these.
Fix: word any 4xx as "not asked: …", with the reason.

9. The sample collection: Leave can strand the tab, and still deletes added records without asking (confirmed).

Leave with an unsaved edit (demo.ts:36-45):
What happens: leaveDemo closes the database, clears the flag and starts the delete before location.href. That navigation fires the plant page's "Leave site?" dialog.
Steps: Try the sample, open a plant, Edit, type a price, Leave, then Cancel.
Result: the tab stays on a sample page with no database and no flag, the button stuck on "Leaving…". Save then shows "This change was not saved: …The database connection is closing.. Free space or back up now." (a double full stop and the wrong advice).
Fix: navigate first and let the next page's dropLeftoverSample delete it, or ask first when a form is dirty.
Added records (review 43 #8): DemoBar.svelte:45 has no confirmation, and demo.ts:43 still treats onblocked as success. Round sixty-one adds a second silent path: dropLeftoverSample deletes a closed sample on the next ordinary load.
The compare tray chosen in the sample stays in the grower's own storage after Leave (compare.svelte.ts:55 writes localStorage directly).

10. The front page's first screens (confirmed).

Phone, 390×844: no catalogue row is above the tab bar. The search sits at about y 685, its placeholder cut off at "…genus, fam". REVIEW-ROUND-61 §6.4 says the first row stays on the first screen. The pitch is clear about what the site is.
Desktop, 1280×800: the pitch, one strip photo, then the search and chips at about y 640. The feature (about 700 px) sits between the chips and the rows, so the first row is at y 1340. A chip click navigates, the feature is gone (it is sent only for the plain /), and the rows jump up 700 px under the chips.
Fix: put the feature above the search, or keep its height on chip pages.

11. At 320 px with 200% text the tab bar still splits words (confirmed; review 43 #9). +layout.svelte:407. It shows "Spec/ies", "My plan/ts", "Plac/es", "Prop/agati/on" and "Toda/y", and the bar is 112 px tall. It is no longer cut off. Fix: icons with aria-label when a label won't fit.

12. The phone's hero credit is cut by an ellipsis (confirmed).

What appeared: the credit moved to the top and doesn't hide the subject. But it is nowrap, scrollWidth 441 against 334, so "· observed growing wild · 2010-01-10" is already lost.
Effect: an author name over about 15 characters will cut the licence.
Fix: two lines, licence first.
B. Data and rule 5

13. The species page's notes editor carries a draft to another species, and Save overwrites that species' notes (confirmed, data loss).

Where: species/[slug]/+page.svelte:178-185. editingMy and myDraft survive a slug change. The page has no {#key} and no leave guard.
Steps: on Copiapoa cinerea, "Write what you know", type "CINEREA draft". Tap the Copiapoa humilis tile, then Save.
Result: humilis's notes read "CINEREA draft", with no prompt.
Fix: a species/[slug]/+layout.svelte with {#key page.params.slug}, and the plant page's beforeNavigate guard.

14. A far stamp the clock parked in memory is never judged by its arrival on the writer (confirmed; the fuzz model hides it).

Where: engine.svelte.ts:866 filters !collection.parkedStamps.has(c.t). parkedStamps includes the clock-only parks now kept in memory, so the re-fetch skips the change and never stores the arrival verdict. Each batch is judged once.
Steps:
A's clock is confirmed.
A merges a file holding a peer's change 3 days ahead, and parks it in memory only.
A syncs, and three more pushes move the listing past that batch.
Result: four days later A shows "file 3d ahead"; the peer, with a stored park, shows "mine".
Why the fuzz misses it: the convergence fuzz's model re-judges at every sync.
Fix: filter on the stored parks only (parkStamps already ignores duplicates).

15. Parked changes are pushed again into a new vault (confirmed).

Where: engine.svelte.ts:306 (outboxFill) through vault.ts:485.
Steps: A's 3-days-fast edit is parked in vault V1. A week later A leaves sync and creates V2; P joins V2.
Result: against the new arrival the stamp is no longer far ahead. A shows "start"; P shows "typed 3 days fast" with nothing parked.
Fix: leave stored-parked stamps out of outboxFill, or send the park list with the first batch.

16. Clock-only parks leave the device through the backup (confirmed, rule 5).

Where: backup/io.ts:28 exports parked: collection.parkedStamps, which includes the clock-only parks the round says are no longer stored.
What happens: a merge restore stores them through markParked, a replace through setParked.
Same set elsewhere (suspected): takeBatch (:934) passes it through hold().
Fix: export the stored set only.

17. The correction lapses on a clock that is still wrong, and the lapse refolds over and over (confirmed).

Where: hlc.ts:100-101 (overtaken) and :120 (drift).
A slow clock: a device 1 h slow loses its +1 h correction after 61 minutes with no reading. A slow clock does not catch up by waiting. Its offline edits are then stamped up to an hour behind, and a peer's earlier edit to the same field wins.
Sleep: a 2-minute laptop sleep, or any suspend that pauses performance.now, drops a −3-day correction.
The next reading records only a pending value, so until a second reading a minute later, edits are stamped about 3 days ahead.
Peers park those edits by arrival, and so does the writer.
The lapse clears storage, so every tab loses the correction.
Refolds: a device 7 minutes slow, idle 10 minutes between syncs, ran 3 full rebuild()s per cycle (15 over 5 cycles). They come from the lapse listener, the pull's own rebuild (:982), and the listener again on re-confirm. Every other tab refolds on the storage event, and the snapshot is unusable while the offset differs.
Fix: don't lapse a correction that has held steady; judge only drift against the monotonic clock. On a lapse, keep the offset as unconfirmed rather than 0. Skip the pull's rebuild when the listener has run.

18. The import's "already imported" both adds duplicates and skips real plants (confirmed).

Where: markAlreadyImported in import/plan.ts matches the sheet's own number plus the same name.
Adds duplicates:
A sheet with no number column (the commonest kind): run twice, it offers "Add 3 plants" again with no notice.
A line given a new number on the first run, because its own was taken.
A line renamed with "Use it" on the first run.
Skips real plants:
Two lines with the same number and name, cut off after the first: both are skipped.
A second sheet that restarts its numbering: "7 Lithops lesliei" is dropped.
Fix: record each written line (import id and line, or a hash of the line) and match on that.

19. Changing the date order after "Check names" is ignored (confirmed).

Where: plants/import/+page.svelte. review() reads dateOrder once, and the radios stay live under the review.
Steps: a sheet with 09/03/2024. Day first, Check names, switch to Month first, Add.
Result: the plant is filed 2024-03-09, not the 2024-09-03 the screen now shows.
Fix: re-run review() on change, or lock the radios.

20. The date reader's slips, and a year-only date read as past (confirmed). In csv.ts readDate unless noted.

"15/06/27" is read as 1927-06-15 without a word, and the plant is numbered 1927-xxxx for good.
"24/03/09" and "24.03.09" are read day first, though year first is as likely; only dashes are held back.
"00/01/2020" is held as ambiguous: "could be 0 January or 1 undefined".
"2019.5" is read as May 2019.
Year-only dates on Today: photo-due.ts:28 compares strings, so "2026" < "2026-04-07", and a whole sheet of this year's plants is flagged for photos at once.
Sound: 2024-13, 45000, Spring 2019, future dates and dates before 1900 are refused with the text kept in notes. 1/2/03 asks. Saving the plant form keeps a partial date, though the input shows it blank.
Fix: refuse two-digit years, hold yy/mm/dd as ambiguous, refuse a 0 day or month, and compare dates by their period.

21. cf., aff. and sp. plants are shown as a species they are not (confirmed).

"Copiapoa cf. cinerea":
its "Species page" button and habitat comparison are cinerea's (plants/[acc]/+page.svelte:87,586);
it is listed among "yours" on cinerea's page (species/[slug]/+page.svelte:169);
its label care line is cinerea's.
The review screen says "filed as written; the reference was asked about Copiapoa cinerea", never "filed with no reference key".
"Lithops sp. …": every such plant shares one lithops taxon record, so "My notes on Lithops sp. C 036" are shared with every bare-genus Lithops.
Qualifier first: "cf. Mammillaria bombycina" parses to genus "Cf.".
Fix: label the links "compare: Copiapoa cinerea", leave cf. and aff. out of mine, say "no reference key" on the review row, and key sp. notes by the full name.

22. Restore: a removal from before this deploy gets a false sentence and the wrong keeper (confirmed).

Where: collection.svelte.ts restore.
When it applies: every removal made before this deploy, since arrival order is unknown for changes stored before the order store existed.
What it does:
The toast says only "2026-0001 restored.".
Both pages say the number was shared because "two devices gave it out while offline, or a file was merged in", which is false.
The restored plant is made the keeper, so "Renumber now" takes the number from the live plant, whose label is likely printed.
Fix: when the order is unknown, say so and keep the live plant.

23. Photographs: two removal paths still fail (confirmed; review 43 #21, partly open).

A re-sealed undo records no claim:
Where: sync.ts:669, :682 record a claim only on stored or same.
Steps: B removes at R. A undoes, and the new seal makes different bytes, so A's PUT gets 409 different with the right proof and no claim. A's engine counts it uploaded (serverHolds, engine :716). B's DELETE carrying R deletes it.
Result: blank on every device but A. This contradicts /about/how's "unless the photograph was brought back".
Fix: claim whenever the proof matches, whatever the result.
A token holder can put a removed photograph back for good:
Where: sync.ts:674.
Steps: after a removal, they PUT the ciphertext they copied earlier with any 64-hex proof. It is stored and claims the name. The owner's DELETE then gets noproof (403) forever, which the engine notes once and stops.
Result: still stored and counted 30 days later.
Fix: keep the removal receipt for the name, and refuse a first store of a removed name without the removal's proof.

24. Counting: recounts still double, a cut-short sweep loses places, and the 90-day reclaim drifts on older vaults (confirmed).

Recounts (review 43 #22):
Double count: between an upload landing in R2 and its release (sync.ts:596-602), a recount reads 2,000 against 1,000 stored.
Double subtraction: between r2.delete and give (:96-118), it reads 0 against 1,000. A key holder can repeat it hourly to store past the allowance.
Fix: bump the generation before the R2 put and before the delete.
A sweep that throws partway (counters.ts:411, :422): places are deleted page by page, but all is lowered only at the end. An error on the second page left 1,000 places deleted and all at 1,010, for good. Fix: lower all with each page.
The reclaim, on vaults from before round 58 (meta without filled): after a reclaim, touch(legacy=true) re-records the vault without counting it, so all drops by one each time such a vault sleeps 90 days (5 → 4 → 3 while it holds data).
The reclaim, on vaults first filled under round 58 (filled: true and no f:, since round 58's fill() kept no per-vault record): touch reads these as reclaimed and counts them again (5 → 6). At the ceiling their next upload gets 503 with Retry-After: 86400 and "This vault had no upload for 90 days, so its place was given back", which is false for them.
What the grower sees after a real reclaim:
That sentence, with every push stopped (batches as well as photos).
The data stays on the server, and other devices still read it.
A vault that is only read keeps no place: a second device pulling daily does not count.
Fix: a one-time adoption of filled: true vaults; count a reclaimed vault like any other; mention reads in the sentence.

25. Archive's Undo is two commits with no catch (suspected).

Where: SelectMode.svelte:147-155.
If the second commit fails: void unarchive(...) swallows it, and the plants are growing again with an "Archived" line in their log.
If a sync lands between the two: its own "Archived" lines on those plants are removed too.
Fix: one putWith; remove only lines of plants in back; catch and say so.

26. Apply picks a removal whenever one is parked (suspected). collection.svelte.ts:168-174. If a removal and a later restore are both parked, Apply removes the plant. Fix: take the latest parked _deleted by stamp.

27. The calendar trusts the stored rhythm (confirmed in ics.ts; reachable through a backup, import or sync, suspected).

A fractional rhythm breaks the file: every: 7.5 writes INTERVAL=7.5. recurring_ical_events then refuses the whole file (BadRuleStringFormat). The forms check, the export does not (rhythms.ts:35,45, ics.ts:100). Fix: Number.isInteger(n) && 1 ≤ n ≤ 365 in CalendarExport.svelte:19,21, else the default.
Still open from review 43 #36:
There is no SEQUENCE.
water-place-none@cultifolio is one UID in every collection.
A re-download after a dry season gives the March series the base UID where the earlier file had -from-, so a missed delete duplicates it.

28. The writer's own stamps after a month offline (suspected, by design but silent). A writer 3 days fast, offline 30 days, then put right. Peers hold its last day or two of stamps rather than park them. A peer's real-time edits to those fields then show for about two days, until A's older change comes due and replaces them, with no notice. Both converge.

C. The server

29. The species 404's old-name check skips the per-address part of the cap (confirmed).

Where: synonyms.ts:68 calls upstreamAllowed, which passes ip=null (sync.ts:1293). Only the match limit of 60 per 10 minutes bounds it.
Probe: one caller made 600 of 700 calls, after which every other GBIF call answered {ok:false, who:'site', retryAfter:59}.
Cost (each address's window opens at the same moment):
Share	To use up one minute	To keep it used up
GBIF from IPv4 (120 in the first minute per address)	5 addresses	17 addresses
GBIF from IPv6	2 /48s	5 /48s
MET Norway	10 IPv4 addresses or 3 /48s	100 IPv4 addresses or 25 /48s
Not limiting: rotating /64s inside a /48 gains nothing, and IPv4 is not grouped.
NWS: a US coordinate uses up the NWS share at no extra cost.
The page said right: the 404 says "not checked … held back" when the cap answers.
Fix: pass the client address through synonymOf to upstreamCall.

30. A busy photograph still stops the whole vault's uploads for a minute (confirmed; review 43 #27).

Where: counters.ts:227 gives 60 for any hold under a second old. sync.ts:175 passes min(60, …), and engine.svelte.ts:607 keeps any wait of 60 s or more as a vault-wide refusal.
Effect: every upload waits a minute, and the sync page shows a refusal. /about/formats says this case is not kept.
Fix: answer uploads with a fixed 10 s, as removals are (DELETE_BUSY_S).

31. Older Safari may have every sync write refused (suspected; review 43 #28). hooks.server.ts:108-111 refuses Origin: null. A same-origin fetch POST under no-referrer sends that from browsers without Sec-Fetch-Site (Safari before 16.4). Fix: referrerPolicy: 'same-origin' in syncFetch.

32. The mark can be set by a hostile peer (confirmed; needs the key).

Where: hlc.ts:290 (observe), :323 (hlcAfter).
The carry: an unmarked counter of 0x7fffff carries into the mark. After observing it, the clock's own ticks and hlcAfter of it are marked. Fix: clamp below PAST_BIT for unmarked input.
The mark itself: a peer that sets the bit can place a year-ahead stamp that no device holds or parks, and it wins its field until someone edits it. The clock does not follow it, and counters stay at 6 hex digits and ordered.
Natural counters: no normal path reaches 0x800000 (about 8 million ticks in a millisecond).
Verdict: this is worse than before only as an unchecked way around parking for a key holder. Worth one line on /about/formats.
D. Words, names and the reference

33. The common-name rule as stated is not the rule the live corpus applies (confirmed by code; live not reachable).

Why:
The live index was rebuilt from stored dossiers built with the old gbif.vernacular. That code merged case variants and kept no preferred flag or source count.
The rebuild keeps clean dossiers as they are (build-dossiers.ts:727-729).
Offline re-derivation carries the old name block (build.ts:164-169).
Effect:
Step 3 (GBIF's preferred flag) applies to no kept dossier.
Step 4 counts hyphen, space and apostrophe variants instead of sources ("money plant" and "Money-Plant").
Elsewhere the choice is the set-back step, then GBIF's order. This needs the live index to size.
/about/how:36 states all five steps. It also says "every other English name is listed"; the page lists four (+page.server.ts:136), joined with commas, so a name that is itself a comma list blurs.
Fix: a vernacular-only fetch pass (one GBIF call per species). Until then, say "GBIF's order" on /about/how.

34. Setting back names that contain a genus buries growers' own words (rule at fault; data suspected).

Where: index-entry.ts:95. In built GBIF-style lists, the name shown, with the set-back one in brackets:
Aristaloe aristata: "Torch plant" ("Lace aloe")
Peniocereus greggii: "Arizona queen of the night" ("Night-blooming cereus")
Colchicum: "Meadow saffron" ("Autumn crocus")
Zantedeschia: "Calla lily" ("Arum lily")
Haworthiopsis attenuata: "Zebra plant" ("Zebra haworthia")
Fix: set back only when the genus word is capitalised in the source spelling ("String-Of-Beads Senecio"), not when it is used as an English noun ("lace aloe").
Page and tile: they agree in code. Until the next index build, tiles show the earlier rule's case ("Apple-of-peru" against "Apple-of-Peru").

35. Smaller word items (confirmed).

Provenance: reads "climate · not asked · asked 2026-09-20", and its footer omits "not asked" (Provenance.svelte:19; review 43 #34).
Photo sources: mixed refused and skipped photo sources are all said to have "did not answer" (species +page.svelte:354,576). That is rule 2 inverted for the skipped ones.
Grey box: a Related tile with no photo still renders an empty .noim square (species +page.svelte:289).
Licence: "(CC BY) · CC0" is printed in one credit when the sources disagree, rather than saying they disagree.
Ties: the Climograph's <desc> judges coldest-night ties at 0 decimals, while Glance uses 1.
Commons: an original still loads when a dossier has no thumbnail (photo-size.ts:59).
Meta: the home meta says "Your plant records stay on your device" with no sync caveat (the footer is right). The /about/how description is 202 characters. /compare has no description.
Add form: "already used by" still picks one sharer by load order, and links /plants/undefined for a number held only by a removed plant (plants/new/+page.svelte:269; review 43 #23).
CSV: a LibreOffice round trip still turns 12.50 into 12.5, 0.50 into 0.5 and "1,200" into 1200 (review 43 #24).

36. Labels: one sheet is off, and the QR name keeps invisible text (confirmed).

Geometry, measured from Chromium PDFs at the CSS page size:
Sheet	Paper	Error
5160	Letter	exact
L7160	A4	0.06 to 0.13 mm
5167	Letter	every column 0.33 to 0.39 mm left

5167's side margin is 7.3 mm against the spec's 7.62 mm (labels/+page.svelte:41). Row pitch is exact on all three. Firefox and Safari were not available.

The QR name: direction overrides, controls and newlines are removed. What survives:
tag characters U+E00xx, zero-width space, word joiner, soft hyphen and BOM, so a forged code can hide text;
a letter with 59 combining marks;
a ZWJ emoji cut mid-cluster.
A lone surrogate (possible from a backup's JSON) throws "URI malformed", and that label silently loses its code.
Fix: strip \p{Cf} and runs of \p{M}, cut with Intl.Segmenter; set 5167's side margin to 7.62 mm.
E. Interface and accessibility

37. Focus drops to the page in two new places (confirmed).

"Show N more" on Today (today/+page.svelte:257): focus goes to <body>, and the next Tab skips the chips just drawn. Fix: focus the first new chip.
Import's "Use it" with "Show only lines that need me" ticked: the row leaves the list with focus on it, and focus goes to BODY. Every suggestion button is named "Use it". Fix: focus the next row; name the button "Use Copiapoa cinerea on line 1".

38. The toast: the same sentence twice is silent (page confirmed; screen-reader effect suspected).

Where: toast.svelte.ts:35. Pressing Move twice with nothing ticked, or Water twice ("Already recorded as watered today."), changes nothing in the page the second time, because Svelte skips an equal string. No real screen reader was available.
What holds: the live region is in place before any text arrives. Folding uses width and height 0 with no display change and no aria-hidden. Chrome keeps the status node.
Also (read):
show() doesn't clear cap, so an earlier toast's 30 s cap can hide a new one early.
show() resets holds while focus may be inside, so a toast replaced under focus leaves early.
Fix: clear the text and set it a frame later when it is unchanged; clear cap; re-hold if focus is inside.

39. Spending splits one currency, and misses common formats (confirmed).

Where: spend.ts:13-20.
Split: $12 and 12 USD are totalled apart, as are £ and GBP, and € and EUR.
Not read: R$ 30, US$12, A$15, C$10, NZ$10, 12 usd, £1,200, ¥12,000 and Rs 500.
Wrongly said: "free" and "gift" are reported as "could not be read as a number", though they are deliberate.
Read right: €12,50, 12,50 €, £8, ¥1200, 12.5, CHF 20; 1.234,56 and $12-15 are left unread, which is right.
Fix: map symbols to codes, accept lower-case codes and a , thousands separator, and count "free" as zero.

40. Smaller items (confirmed).

Select mode: Escape does nothing in the Move panel or the Archive question.
Undo after 10 minutes: Today's done-row Undo is pruned after 10 minutes, and a keyboard user resting on it falls to <body>.
Empty gap: about 150 px of space above "By place" on the phone.
Forced colours: the toast is see-through over the select bar for about 0.18 s mid-animation.
F. The harness

41. 18 of 95 unit reverts stay green; the ones that matter (confirmed).

Fix	Revert	Why green	Smallest test
Clock-only parks carried in the snapshot	held = [...heldStamps]	no test reloads from a snapshot after the clock unconfirms	park a peer change by the clock, write the snapshot, clearClockOffset(), reload: the change shows
rebuild drops this tab's clock parks	remove both resets	same gap	same setup, then rebuild()
Engine takes 409 as "ask again"	push to photosDropped	the test is server-only	DELETE answered 409, then 200 an hour later
At most hourly	remove the throttle	same	two runs inside the hour make one DELETE
Year-only date mints that year's number (collection)	yearOf back to ^\d{4}-	only the plan's own yearOf is tested	addAccession({acquired:'2019'}) gives 2019-0001
Web Lock respected	drop if (!lock)	no test	a held lock stops dropLeftoverSample()
hasMine never written from the sample	drop the guard	green in unit and e2e	in the sample, load /, assert hasMine is null
Move Undo removes only the moved plants' lines	drop the line deletion	only the opposite revert is caught	after Undo, the put-back plant's "to X" line is _deleted
Equivalent mutants, or redundant fixes: a stored server time, ownMax counting flagged stamps, the proof check inside the hold, the re-read before delete, the sync-run guards in the sample, and the calendar's all-dry skip. None needs a test.
E2E: the nine e2e reverts all went red except the hasMine guard. They cover the {#key} layouts, the removed plant by id, ?parent=, the relaxed picker, the aria-disabled Water, the toast's Tab and the BroadcastChannel.
Flakiness: none. One revert went red at load 25, green alone, and red 10 of 10 with its partner file.

42. The fold guard still misses what decides an own batch's judgement (confirmed).

Hashed: all of log.ts, hlc.ts and vault.ts; 20 collection methods; the engine's hold, takeBatch, clockChanged, ownToJudge and judgeOwn; REQUIRED_FIELDS and KINDS.
Each of these passes it, and changes folds:
the device getter returning another tag (it is hold().except);
removing the ownToJudge call in pull;
pushBatch judging far from batch[0] instead of the latest stamp, which passed the whole suite;
listOwnOnce with return changed to break, which marks a failed listing done and also passed the whole suite;
stillParked always true.
Fix: hash get device, isOwnStamp, heldWalls, pull, pushBatch and listOwnOnce. Better, add a behavioural guard: fold a fixed set of logs and clocks and hash the result.

43. The bundle test never guards a deploy (confirmed).

What happens: with the last build older than the sources (any checkout), it skips. Touching an old manifest to look newer makes it fail ("to not include 'backup'"); a fresh build passes. npm run deploy tests before it builds, so it always skips there.
Fix: move the manifest assertion into scripts/check-bundle.mjs as "postbuild", so npm runs it after every build, Playwright's webServer build included. Make it fail hard when the manifest is missing, and keep only the source-text assertion in the unit test.

44. Four e2e helpers still race the first snapshot (read).

The race: each writes changes and deletes meta.fold, but adds no order rows. The page's first snapshot write is not awaited (collection.svelte.ts:463), so a snapshot saved after the delete hides the injected rows.
Where:
smoke.spec.ts:3417-3434, the helper inject, called at :3439 and :3470;
smoke.spec.ts:3253-3258, inline;
r61w-pages.spec.ts:28-43, called at :85 right after ready;
r61a-a11y.spec.ts:17-36, where the double delete around 500 ms narrows the race but doesn't close it.
Safe: r61l-records.spec.ts:18-35 adds order rows.
Fix: do the same in the other four.
The triage, decision by decision
Done:
1, the clock: the 0x800000 mark (hlc.ts:304); its exemption from hold and park (log.ts:210,228); ownToJudge and judgeOwn (engine 820-885); the lapse; Apply restores; FOLD_RULES 6 (log.ts:46). Review 43's #13 to #17 are fixed (#17 over-fires: 17 above). The guard is partial (42).
2, records: the keyed layouts, ?parent= through withNumber, and species chips through plantHref. The species notes editor was missed (13).
3, import: dates, cf. and the speed. 2,000 rows add in 148 s, down from over 10 minutes. The per-row cost still grows from about 37 rows/s to about 10.
4, labels: done; 5167 is off by a third of a millimetre (36).
5, photographs: claims, proof first, and the hold fence. The stalled delete is an expected failure, as decided.
6, server: reclaim, cap and recount, apart from 24, 29 and 30.
11, accessibility and performance.
12, the grower: place filter, spending per currency, VALARM, UNTIL series, all-dry places left out, one photo-due rule.
Review A: A23.
Half done:
7, search: the hybrid reset (7).
8, words: "every species page shows" and the orchid group (4).
13, the harness: fixed waits remain in smoke.spec.ts, each justified in a comment.
Review A: A31.
Done differently, and stated:
9, the front page: phones show no feature. Note that §6.4's "first row above the tab bar" does not hold (10).
10, the sample: units and the label sheet are kept per tab.
Missing: review A's A17 (the clock line) and A7 (Commons originals without a thumbnail).
Review 43's 41 findings:
Status	Findings
Fixed	1, 4, 7, 10, 12-19, 21 (partly), 22 (unadmit only), 31, 32, 35, 37
Partly	2, 3, 5, 8, 11, 23, 24, 26, 27, 29, 36, 39, 40, 41
Changed by design	20
Not fixed	6, 9, 28, 33
Also checked and sound
Clock:
A three-device run with a second tab, ten rounds and one device a year fast for rounds 1 to 3 agreed on every row from round 4.
A batch from another tab, a re-push after a lost answer, and a reload mid-listing are all judged.
The mark keeps stamp order, and observe never inherits it from a marked stamp.
No load writes to the log.
Server:
The proof is checked before the hold and the claim.
The fence renews and re-reads before the delete.
Two crossed listings answer 503 with Retry-After: 30, not kept as a refusal; a lapsed lease marks the total stale.
The unadmit race is fixed: landed() asks again for the place.
The sweep's cursor resumes in a second.
The cap takes every service of a call or none, with held: true on 503 and 429.
The forecast, frost line, places page, Today and species 404 word a held call right.
Search:
Author citations in full (Opuntia ficus-indica (L.) Mill., Aloe vera (L.) Burm.f., Sedum album L.).
"St. John's wort" in every case, and curly quotes.
A cross written out in full is flagged.
Quoted cultivars give the genus.
The picker hides retried hits.
The species 404's "Did you mean" works.
The sample:
Settings stay in the tab.
Two sample tabs and one own tab with Leave in either order work, and the other tab is told.
Sync, restore and staging refuse in code with no path around them.
The CSP hash matches app.html in source, responses and the prerendered meta tag.
Records:
The keyed layouts keep the Undo toast and scroll on Back, and keep the leave guard.
An upload in progress keeps its plant.
A label for your own removed plant offers Restore by id.
Pages:
Refused and pending climates are said as such on the glance row, compare, the label and the plant page.
The share card states its hemisphere.
Ties name every month.
The chart caption names CHELSA and NASA POWER.
The storage keys on /about/how match the code in both directions.
Every species description is at most 155 characters.
Interface:
axe is clean on the plant page, Today, import, labels, select mode and the sample, light and dark at 390 and 1280.
No sideways scroll at 320 with 200% text or at 400% zoom.
The toast never traps Tab, and focus moves sensibly through select mode, Today and import, apart from finding 37.
Forced colours are legible.
New controls are 44 px.
Calendar: valid RFC 5545.
CRLF lines of at most 75 octets.
DATE UNTIL.
VALARM with ACTION:DISPLAY, DESCRIPTION and TRIGGER:PT9H, which is 09:00 local for a floating all-day event.
Series split around a Nov to Feb dry season across the year end.
A 1-day rhythm works.
All-dry places are left out and named.
How the three apps treat it is reasoned, not tested: Google ignores imported alarms, and Outlook likely drops a positive trigger.
2027: the unit suite passes with the clock in 2027 and at New Year's Eve. None of the e2e specs' "2026" strings depends on the year.
In three sentences

What's best is the clock: own changes judged by arrival, the mark, and a correction that lapses when the clock moves fixed every clock loss the last review reproduced, and a ten-round three-device run of the real engine agrees on every row. Both suites are green on Node 22 and 24, 179 end-to-end tests included. A first-time reader will see "Copiapoa cinerea in the wild: 1 night in 100 below 6.5 °C" in the link preview, open devtools on a private page, find the plant's number in a font request's Referer under a page that says it never is, and search a Hoya on a site titled cactus, succulent and bulb. If I could fix only one thing it would be finding 13: key the species page by its slug and guard its leave, because it is the one path where a grower types their own notes, taps a related species, presses Save, and silently replaces that other species' notes.