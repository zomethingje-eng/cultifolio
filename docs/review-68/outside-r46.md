Review, round forty-six: 1609c19 (rounds sixty-seven and sixty-eight)

Round sixty-seven closed nearly everything the last review found: 24 of its 29 findings are fixed and three partly. Its claims hold almost decision by decision. Round sixty-eight is a different matter. Each of its new matching paths puts another plant on some page, and it does so on the live site today:

Commons leads: 40 of the 619 species whose lead photograph now comes from Commons lead with a herbarium sheet, a distribution map, a botanical plate, seeds or resin. That picture is also each page's link-preview image.
Ranges under older names: Lantana strigocamara shows the native range, and the habitat climate built from it, of Lantana camara subsp. aculeata.
Wikipedia redirects: Weingartia pulchra quotes the Wikipedia summary of Weingartia canigueralii.
Search: the search now sends /species/aloe-variegata to Aloe vera.

Two more faults matter as much:

Frost: a place page tells a US grower "All clear." when the National Weather Service did not answer.
The example collection: its new "Keep it as my own" button keeps only the species.

WebKit and Firefox: this is the first time anyone outside has run the full suite in these engines. Three tests fail in a way that reproduces, and two of the three are the example collection's cross-tab paths.

What was run
System: Linux 6.18, x86_64, in a cloud sandbox. This time the network reached the live site, GBIF, iNaturalist and the GBIF-hosted copy of WCVP.
Wikidata and Wikimedia answered most requests with 429 or maxlag, because the egress is shared.
POWO answered with a Cloudflare challenge.
Live build: 1791729459359, built 14:37 UTC today. The one commit after it, 1609c19, changes only builder scripts and tests. The live /about/how and /about/formats match the source sentence for sentence.
Type check: npm run check gives 1,000 files, 0 errors, 0 warnings.
Unit: npx vitest run gives 274 files, 2,332 passed, 8 skipped, on Node 22.22.2 and on Node 24.21.0. The 8 skips are the real-corpus tests, which need data the sandbox doesn't hold. The owner's count was 2,339 passed and 1 skipped.
End to end, Chromium: npx playwright test (chromium and phone, Chromium 141, Playwright 1.63, Node 22) gives 410 passed, 5 skipped in 13.8 minutes, with no retries.
End to end, WebKit and Firefox: npx playwright test --project webkit --project phone-webkit --project firefox on Linux, after npx playwright install webkit firefox (WebKit 26.6, Firefox 155): 742 passed, 3 failed, 2 flaky, 12 skipped in 38.9 minutes.
The three failures, re-run alone twice each with --retries=0, failed 3 of 4 (WebKit), 4 of 4 and 2 of 4 (Firefox). See findings 19 and 30.
Probes: vitest probes over fake-indexeddb, the real engine and the server harnesses. 74 reverts of rounds 67 and 68.
Interface: a local build under wrangler dev driven at 390×844 in Chromium, WebKit and Firefox, including a two-build deploy swap.
The live corpus, sampled:
the live index (8,947 species);
97 dossiers, 85 of them random;
229 Commons photographs, 79 of which I looked at;
all 619 Commons leads, by file name and credit;
52 range fallbacks;
60 species with older names in another genus;
about 95 live searches, paced at 1.1 s.
Marking: every finding is confirmed (reproduced) or suspected (read, not run). The repo was not modified.

Ranked by what a skeptical first visitor, technical and in a hurry, finds first; then a wrong fact or photograph on a species page; then data loss; then the rest.

A. What a first visitor finds

1. Forty species lead with something that is not a photograph of the plant (confirmed, live).

Where: commonsPhotos (wikimedia.ts:185-221) keeps Commons' category order, which is alphabetical by file name, and heroOf (dedupe.ts:29) takes the first unflagged photograph. Names that start with digits or capitals sort first, so COI000…, Curtis's… and Distribuzione… lead.
Live, the 40 leads:
24 herbarium sheets: 11 Coimbra COI000… sheets, including the Adenia tisserantii holotype; 7 "specimen" files (Crassula alcicornis, ankaratrensis, basaltica, cordifolia, depressa; Ceropegia discoidea; Stephania bancroftii); 5 Colchicum "(GBIF n)" sheets; Commiphora marchandii.
9 distribution maps: Nepenthes clipeata, N. mapuluensis, N. platychila; Heliamphora elongata and H. hispida; Haemanthus dasyphyllus; Adromischus bicolor; Boswellia ogadensis and B. pirottae.
4 plates: Agave spicata and Furcraea flavoviridis (Curtis's Botanical Magazine), Dasylirion graminifolium (Zuccarini 1843), Nepenthes edwardsiana.
3 not the plant: resin for Commiphora myrrha (a 190-pixel image); seeds for Anacampseros pisina and Commiphora zanzibarica.
Another species' files:
Nepenthes dubia's lead and its whole strip are files named "Nepenthes tenuis" (Nepenthes_tenuis1–5.jpg, Neptenuis.jpg, Neptenuis2.jpg). Commons' category also holds 12 files named N. dubia.
Crassula socialis shows "Bahá'í Terraces unknown plant 1".
Random sample: of 79 images I looked at, 74 (94%) show the right plant. 2 are herbarium sheets, 1 shows two species, and 2 are unclear. By file name across 229 sample photographs, 3.1% are not a photograph of the plant and 1.3% show another taxon.
Would P180 have helped? Commons' depicts statements (P180) catch only about 16 of the 40 bad leads: the specimen sheets and plates carry the taxon as P180. And 55% of good files have no P180. It costs one wbgetentities per species.
Fix, no extra requests:
Reject file names matching /distribution|range\b|\bmap\b|specimen|herbari|holotyp|isotyp|\(GBIF \d+\)|^COI\d|botanical magazine|Tab\.\s*\d|\bseeds?\b|resin|unknown|unidentified/i.
Add Categories to iiextmetadatafilter and reject Media from GBIF|herbari|distribution maps|botanical illustrations.
Rank titles holding the epithet first, and set back titles naming another species of the genus.
Never let a Commons file lead when the dossier has a photograph of its own.
On this sample, steps 1 and 2 catch all 40 bad leads.
The page: /about/how:36 should say Commons photographs are taken from the category as filed.

2. Commons credits come out wrong, and public domain is labelled CC0 (confirmed, live).

Where: wikimedia.ts:202 strips tags from the Artist field but keeps boilerplate, entities and line breaks.
What a visitor reads:
Boilerplate as the author (7 leads): "No machine-readable author provided. Denis Barthel assumed (based on copyright claims)." on Drosera kenneallyi, D. felix, D. oreopodion, Echeveria subalpina, Myrica rubra, Pinguicula gypsicola and Sinningia leucotricha.
The specimen's collector (4): "Collector:\tBolus, H.M.L." on Crassula alcicornis, basaltica, cordifolia and depressa.
Talk link and upload history: "derivative work: Photohound (talk)\nIncenseWikiVers.jpg: Transferred from en.wikipedia…" on Commiphora myrrha. Its index credit is empty, and the same holds for Dipcadi montanum.
Entities as text: "Forest & Kim Starr" on Aloe juvenna and Gasteria glomerata.
CC0 files with meaningless credits: "See above" and "Unknown authorUnknown author".
Public domain: wikimedia.ts:200 maps ^Public domain$ and ^PD.* to cc0.
Of 18 sampled "CC0" photographs, 7 are public domain by age or government work.
On the live Nepenthes clipeata page the badge says CC0 while the credit line says Public domain, and the disagreement check (head.ts:118) treats the two as the same.
Suspected, none found live: licence.ts reads "Attribution", "Attribution only license", "Copyrighted, attribution-only" and "Data licence Germany – attribution" as CC BY.
Fix:
Decode entities, take the first line, and map "No machine-readable author… X assumed" to X.
Use the institution when Artist begins "Collector:". Treat "See above", "Own work", "Unknown author" and a bare "(talk)" as no author, which under CC BY or BY-SA drops the photograph.
Add a pd tag labelled "Public domain".
Accept only ^(CC0|CC BY(-SA)? \d) short names.

3. A name two species share sends the visitor to the wrong one (confirmed, live).

Where: dossiers.ts:411 (bySynonym) keeps the first species in index order, and the 15,791 search-only older names now take part.
522 names are older names of more than one species.
In 124 of them the address goes to the species that holds the name only in its search-only list, while another species shows it among its six shown older names.
Live redirects:
/species/aloe-variegata answers 302 to aloe-vera?was=Aloe variegata.
/species/mammillaria-sulcata answers 302 to Ariocarpus kotschoubeyanus.
Live searches: "Aloe variegata" lists Aloe vera before the tiger aloe. The same happens for "Mammillaria sulcata", "Murraya exotica", "Euporteria senilis" and "Agave spectabilis".
Should: before round 67, these went to the species that shows the name.
Fix:
Fill bySynonym from shown older names first.
Drop a name that two species claim only from search-only lists, so the address doesn't redirect.
In closeness, rank a hit that keeps the older name's epithet first.

4. Search: ties go by the alphabet, an apostrophe changes the reading, and pooled spellings can't be found (confirmed, live).

Ties (search.ts:490-501, :578): 70 of 4,082 headlines, typed as written, list another species first.
"jade plant" gives Crassula arborescens before C. ovata.
"hen and chicks" gives Chlorophytum before Sempervivum.
"bleeding heart" gives Dicentra formosa before Lamprocapnos.
"ponytail palm" puts Beaucarnea recurvata third.
Apostrophes (search.ts:29): "devils backbone" is read as a similar spelling, and Kalanchoe daigremontiana comes third. The same happens to "St Johns wort", "bishops cap" and "mother in laws tongue".
Pooled spellings disappear: the spellings that pool are dropped from commons (index-entry.ts:78, :261).
"blue mink", "porcelain flower", "velvet leaf" and "corn cockle" miss their species.
On a tie, the closed spelling can win the headline: "Swampmahogany", "Bluemink", "Porcelainflower".
Partial family names find nothing: "cactace" answers [].
Fix:
Break a tie by the name's place in [common, ...commons], then by photo count.
Strip apostrophes before splitting, as nameKey does.
Index pooled spellings in a search-only field.
Prefer the open spelling on a tie.
Match a family from its start at 6 letters or more.

5. "Keep it as my own" keeps only the species, behind a "Leave site?" warning (confirmed, Chromium).

Where: ExampleAddLine.svelte:19; keep() at plants/new/+page.svelte:236; guardUnload at :109-111.
Steps: in the example, open /plants/new. Type a species, From "Mesa Garden", Price 42, Last watered and Notes. Press "Keep it as my own".
What appeared: the browser's "Leave site?" dialog. After accepting, the grower's own form held only the species and its key. Source, price, date and notes were gone, and so was a place typed in the picker.
Elsewhere: Propagation keeps only the species; Places keeps only the name.
Fix: carry every bound field in the address (or one sessionStorage key the form reads once), and set saved = true before leaving.

6. A US place page says "All clear." when the National Weather Service did not answer (confirmed by reading, rule 2).

Where: places/[id]/+page.svelte:340, with the type at :278 and the wording at :470.
What it does: alertsUnchecked is true only for alertsStatus === 'refused'. Round 67 split the old status in two, and the new unanswered (timeout, 5xx, bad body) now shows "All clear." and the pill "frost: clear". Where the NWS really refused, :470 still says it "did not answer".
Should: "not checked", worded apart for each, as Today already does (today/+page.svelte:488-491).
Fix: test refused || unanswered and reuse Today's two sentences.

7. Other refusal wording (confirmed).

Sheets: index.svelte.ts (about line 105) now turns every non-429 error from /api/sheets and /api/entries into "refused". So the server's own "could not be read just now" 503, and a Cloudflare 500, 502 or 504, become "the server refused the species sheets just now". That inverts the last review's finding 11 the other way.
Picker: SpeciesPicker.svelte:337,431 says "The reference's own search did not answer" for a search 503, which did answer.
Fix: a 503 carrying retryAfter reads "could not be read just now"; a 5xx without a body reads "did not answer".

8. /about/how claims that copies are kept only under the current build; the Worker's own cache is not (confirmed).

The claim: how:90 and :95 say each copy is kept "under its full web address, which … names the app's version, so a new version is never answered from an old one's copies".
The code: these Cache API keys carry no build:
search, search6?c&n&q (api/search/+server.ts:57, a day);
sheets per bucket (api/sheets/+server.ts:43, a day);
names, names2?q (api/names:47);
the old-name check, match?name (synonyms.ts:76);
the forecast (api/forecast:63).
Effect: a deploy that changes ranking or the sheet rules but not the corpus serves the old build's answers for a day. They go out public under the new v=, so the adapter keeps them another day.
Not listed either: a species 404 is sent public, max-age=300 (species/[slug]/+page.server.ts:65). Agent S thought the adapter caches only answers below 400, but adapter-cloudflare caches 404, 405, 410, 414 and 501, and the live response carries exactly that header. The old-name 302 is public, max-age=86400 (:60). Neither is on how:90 or how:95.
Measured live: a forged v=garbage answers no-store, so it cannot mint keys; no v= gets a day of public cache.
Fix: put version (or the derivation version) in those keys, and list the 404 and 302.

9. Commons photographs are heavy, and get no size steps (confirmed, live).

Leads at 960 pixels: of 31 measured, the median is 217 kB, 11 are over 300 kB, and the largest is 558 kB (Parodia nigrispina).
PNG thumbnails at 500 pixels: Nepenthes edwardsiana's lead is 757 kB; Gymnocalycium basiatrum's tile is 637 kB.
Small rows: photoAt (photo-size.ts:23-28) passes Commons addresses unchanged, so 40-pixel catalogue rows and 56-pixel genus thumbnails fetch the 500-pixel file.
Mid-width uploads: a file 501 to 959 pixels wide leads at its 500-pixel tile, stretched across the lead box. Nepenthes dubia's lead is one.
Fix:
Request iiprop=size, and drop or shrink PNGs.
Map /500px- to /120px- or /250px- for small slots; both are on Commons' standard list.
Give leads a 500w/960w srcset.

10. /about/formats still says the example is set out "in one change" (confirmed; last review's finding 13). formats:51 says "set out in one change … that same change marks it". It is one transaction of hundreds of changes (demo-seed.ts:166), and formats itself defines a change as one field. Fix: "in one commit (one transaction)".

B. A wrong fact on a species page

11. Lantana strigocamara shows another plant's native range and climate (confirmed, live).

Live page: "Mexico Southwest, Bahamas +7", a Range source row "WCVP …, under the name Lantana camara subsp. aculeata", and a habitat climate built from 8 of 1,843 records.
What Kew says: WCVP accepts Lantana ×strigocamara R.W.Sanders, with 160 rows, every one introduced and none native.
Path:
The page's own name is missed because WCVP writes "×" and GBIF does not.
The fallback reads all of GBIF's synonyms, heterotypic ones included. "Lantana mutabilis" (Lippold) matches WCVP's only row, "Lantana mutabilis Salisb.", which Kew files under L. camara subsp. aculeata.
accepted() takes a single row whatever its author (bulk.ts:124).
Reproduced with a probe on WcvpIndex.
Also false here: the note "Kew holds no entry under this page's name" (+page.svelte:583).
Hit rate: of 17 live ranges that came "under the name…", 1 is another plant. One more (Conophytum tomasii under C. hanae) can't be shown to share the type but covers the same region. The other 15 are right.
Which rule is right: the Wikidata and iNaturalist rule, same-type names only.
Fix:
bulk.ts:466: pass only sameTypeNames.
bulk.ts:124: refuse a single row whose author disagrees.
Remove "× " before comparing.
Count an accepted Kew entry with no range as a hit (:167).
Name the older name the range came by.

12. A Wikipedia redirect brings another taxon's summary (confirmed, live).

Live:
Weingartia pulchra (3947359) quotes "Weingartia canigueralii is a species of cactus…". W. canigueralii has its own page here.
Kopsia fruticosa (5536025) quotes the Kopsia genus article.
Path: the item has no English sitelink, so enTitle falls back to the scientific name, and summary() keeps whatever title the redirect returns (wikimedia.ts:151).
Hit rate: of 54 live summaries, 1 is another species and 1 is a many-species genus article. Monotypic genera are fine.
Fix: take a redirected title only when it is the item's own sitelink, a same-type name, or a monotypic genus. Otherwise record "none: Wikipedia redirects X to Y".

13. Inactive iNaturalist ids are carried build after build (confirmed, live).

Live: 6 of 83 dossiers with an iNaturalist id use an inactive taxon, and each shows 0 iNaturalist photographs:
Species	Id used	Current taxon	Open-licence observations on it
Dypsis lutescens	133599	276548	86
Plectocephalus americanus	127482	699778	1,054
Erythrina caffra	119671	1588191	119
Hatiora gaertneri	327670	1435384	3
Stenocactus crispatus	274366	870808	12
Rebutia fidana	442942	1576156	2
Source: all 6 come from Wikidata's P3151.
Why they persist: when an id is present the name search never runs (build.ts:367). The previous build's ids (prevIds, build-dossiers.ts:868; build.ts:336) have no age and no re-check.
Wikidata too: 7 of 96 Wikidata items no longer carry the page's GBIF key. Today's rule would reject two of them (the Antimima pair), but they stand by carry.
Fix:
Ask /v1/taxa/{id} for any carried or Wikidata-sourced iNaturalist id. Follow current_synonymous_taxon_ids when it names one taxon; otherwise search.
Give carried identifiers a maximum age.

14. The iNaturalist older-name fallback will take another species' taxon at the next build (confirmed against live sources, not yet live).

Case: Weingartia pulchra finds nothing under its own name. Its older name "Rebutia pulchra" matches iNaturalist 1576161, Weingartia canigueralii, which has its own page here. "Every name that finds a taxon finds the same one" passes, because the other older name finds nothing.
Sample: 33 of 57 species get an answer from the fallback; one lands on another accepted species and one on a subspecies.
Why: iNaturalist's matched_term follows its own synonymy, including heterotypic lumps (Aloe barbadensis → A. vera).
Fix: in the fallback, take a taxon only when its own name is the accepted name or a same-type name, and never one the index holds as another species (inat.ts:29,46).

15. The new fallbacks don't say where an answer came from, and "ambiguous" is recorded as "none" (confirmed, rule 2).

Missing on the page: no line says a Wikidata item or the iNaturalist photographs came under an older name. The Wikidata detail doesn't name the older name (wikimedia.ts:106).
"Ambiguous" recorded as plain "none":
two Wikidata items left over (15 of 57 in the sample);
iNaturalist older names that disagree (inat.ts:46);
a WCVP homonym among older names, which reads "no WCVP entry for this name" (build.ts:437).
The Range source row names Kew's accepted name, not the older name it was reached by.
Fix: an ambiguous status, said as "not taken: two items answered", and the older name on each source line.

16. Smaller matching points.

The P566 rule (suspected, low): the newer placement is not always the current item. For Gonialoe variegata it would pick the stub Tulista variegata over Aloe variegata, which carries the article and the iNaturalist id. 8 pairs name each other as basionym and are both set aside, which is safe.
The search limit: srlimit=3 is used without reading the total (wikimedia.ts:86). 4 of 57 sample species have more than 3 items; none collapsed wrongly.
The lead photograph (suspected): heroOf ranks an unflagged Commons photograph above a cultivated one of the dossier's own. When Commons reaches every species at its next full build, a species whose own photographs are all cultivated gets a Commons lead.
Duplicate pages: Weingartia fidaiana (7281301) and Rebutia fidana (7906297) are two live pages for one plant.

C. Data loss

17. A device still 3 days slow, reloaded offline, stamps edits that lose to its peers' older ones (confirmed, R2).

Where: hlc.ts:232 (inForce); the clock-only park in log.ts isParked; collection.svelte.ts:1567 (stampPast).
What happens:
The tab is unsure and stamps by its raw clock, while clockChecked() stays true from the stored confirmedAt.
A peer's plant added 6 hours ago is parked by the clock, and a notes edit from 30 hours ago is held.
The grower edits two fields, stamped 3 days behind true time.
After the confirming reading, and on every peer, the peers' older values win. The grower's later edits are lost silently.
One disagreeing reading: a single disagreeing Date header (10 days) takes a confirmed tab back to its raw clock at once (hlc.ts:269). So does a 2-hour sleep that pauses performance.now.
The snapshot: a still-slow device never reuses it (collection.svelte.ts:552 compares the offset in force), so every load costs two whole-log folds.
Suspected: a photo removed in that state has a removal time 3 days back, so the server DELETE goes at once on every device after confirmation, skipping Undo.
Answer to the brief: R2 partly reverses round 62's "a correction does not lapse": it now drops at every load and in every new tab.
Fix:
While unsure with a stored positive correction over two days, hold peers' changes rather than park them.
Stamp local edits past the field's newest stamp, held ones included.
Never take a confirmed correction out of force on one reading.
Key the snapshot by the stored offset.

18. A change skipped as malformed (R10) breaks every backup made afterwards (confirmed).

What happens: the change stays in the log, and exportChanges includes it.
With a reserved field ("id"), building a backup throws, and so does opening any file to restore (previewMerge, backup.ts:276).
With an unknown kind or a bad stamp, the backup downloads normally but cannot be read back ("Change 4 … cannot be read").
Read, not run: outboxFill (vault.ts:606) pushes it, and every peer quarantines the batch it rides in.
The trigger: an unknown kind counts as malformed, so a newer build's kind, written here and then rolled back, poisons every backup.
Fix: filter with changeError(c, true) in exportChanges, toPush and previewMerge, and carry skipped rows in the backup as unreadable.json.

19. The example: a tab that was away when another tab left never closes, and re-seeds (confirmed, Chromium, WebKit and Firefox).

Steps: tab A in the example opens B with window.open('/plants'). B goes to another site, A presses Leave, then B goes Back.
What appeared: B's flag was still 1. It loaded a new empty cultifolio-demo and seeded 12 plants, with no "closed in another tab" line. A tab the browser discarded and reloads does the same.
Why: the closed signal reaches only live pages, and the flag is per tab (app.html:293, demo.ts:37).
The suite in WebKit: r61g-import-labels.spec.ts:174 ("a second sample tab is told plainly when the sample closes") fails 3 times in 4. The second tab stays on /today in the example after the first tab's Leave (:185).
A Places form loses its text to another tab's Leave: /places has no beforeunload guard (places/+page.svelte:111-115). Tab B, with "My real cold frame" typed, went to / the moment tab A left, with no question. A place typed in /plants/new's picker is not part of dirty either.
The leftover offer is "once" even when ignored (demo.ts:508-510): noteOffered is written before the offer shows. Close the tab without answering, and the leftover is kept and never offered or deleted again. That contradicts formats:51's "does not come back stale".
Fix:
On Leave, write a generation to localStorage that app.html compares before paint.
In sampleClosedHere, don't navigate when a field has had input.
Note the offer only when it is answered, and delete leftovers past an age.

20. The import key makes two plants one, and a re-saved sheet still duplicates (confirmed, R3-R5).

Two plants as one: dateKey (rows.ts:47) sorts day and month even for unambiguous ISO dates. So Lithops lesliei acquired 2024-01-05 is keyed as the one acquired 2024-05-01, and is skipped as done in a later sheet.
Unmapped columns: they are left out of the key but written into notes (rows.ts:65). A sheet with an unmapped Locality, re-sorted after a line is added, skips the new plant as done and offers an old one again.
Re-saved sheets:
Price 12.50 → 12.5 is offered as "changed" and kept by default.
A date re-saved as 5/1/24 isn't flagged at all.
A numbered line whose name was corrected (lesleii → lesliei) is added again under a new number.
Fine: trailing spaces, case, column order, an added column, 5/1/2024 and identical twin lines.
Fix:
Sort day and month only when the cell was ambiguous.
Key by the final notes text.
Compare price as a number.
Match already on number alone.

21. A resumed Replace is not announced to other tabs (confirmed, R1).

Where: vault.ts:179: the resume in openVault does not announce('replaced').
What happens: tab A kept showing the old collection. Its edit to an old record went into the new log as a half record that is never shown, and its new plant took 2026-0002 from the old state.
Sound: running out of space while staging or during the switch, a reload mid-switch, and a second tab writing during it all left the collection whole.
Fix: announce after a successful resume.

D. The server

22. Concurrent pulls overrun the listing budget (confirmed).

Where: listBatches (sync.ts about 553-580) checks the hour's count, walks, and only then adds the pages.
Probe: 100 pulls at once on a 49,000-batch vault made 4,900 list calls against the 1,200 budget, and all 100 succeeded.
Fix: reserve 50 pages at the check, and give back what wasn't used.

23. Replaying a photograph's own bytes without the proof takes the hold (confirmed).

Where: storeOnce (about 1027-1032).
What happens: with the token alone, a client can GET the ciphertext and PUT it back with any proof. The sha matches, so the request takes the hold and answers same, and the grower's DELETE during the replay gets PhotoBusy.
Exposure: new ids carry 16 random characters, but old guessable ids are still accepted.
Fix: answer same without taking the hold when the proof doesn't match.

24. Small batches are uncounted (confirmed).

What happens: nothing counts objects or writes per vault. 3,000 one-byte batches from one address all stored.
What bounds it: the sync rate window, 1 POST a second per IPv4 address or 4 per /48. The 16 KB exemption opened nothing new.
Cost: about $0.47 a day per address, so 100 addresses come to about $1,400 a month.
Fix: a per-vault hourly write count inside vault.take (for example 3,600).

25. Ten new vault places a day per /24 or /48 (confirmed, wording). Everyone behind one carrier's NAT shares those 10, and the vault is made before the first upload is refused. The sentence "Sync has taken all the new vaults it takes from this network today" should add that another network (home Wi-Fi) may work now.

E. Interface and engines

26. Below the example bar, nothing says it is the example (confirmed, 390×844). The bar scrolls away. A scrolled plant page offers "the original stays in your camera roll" and "every plant of this species you own", and the footer says "Your collection stays on this device". Fix: an "Example" chip in the top bar while PAGE_IN_DEMO.

27. Some add links still lead into the example's own forms (confirmed by reading). These are:

the species page's "Sow seed" (species/[slug]/+page.svelte:399);
the Wanted list's "Got it";
a place's "Add a plant here";
Labels;
Today's empty "Add one";
the no-match "add it as a plant".

The forms they reach say the plant joins the example. Fix: addLeavesExample on each.

28. The leftover and the closed state on older tabs (suspected).

Tabs still on the round-66 build have no closed state until their next reload.
"See the example" pressed before the Leave page's delete takes the lock brings the example back.

29. A numeric t breaks the tail read (confirmed, unlikely). IDBKeyRange.bound throws at vault.ts:907, so a tab's catchUp fails on every call. Fix: skip non-string stamps.

30. Two more engine failures (confirmed in the suite; cause suspected).

Firefox, r67v-example.spec.ts:52 (V3), fails 4 of 4. A tab opened with window.open('/plants/new') from an example tab is not in the example (html[data-demo] absent, :60).
The test assumes the opener's session storage is copied, which Firefox evidently doesn't do there.
The app's behaviour is safe (the new tab is the grower's own), but the round's V3 claim is untested in Firefox, and finding 19's per-tab flag behaves differently by engine.
Firefox, smoke.spec.ts:1994, fails 2 of 4. The service worker does not take control of /plants within 15 s (:2003), so the offline plant page is never reached. That is the offline story, which the skip list already excludes for WebKit.
WebKit, r62l-plant.spec.ts:81 (flaky): a cancelled /api/sheets fetch logs "due to access control checks" as a page error during navigation.
phone-webkit, r67h-offline.spec.ts:32 (flaky): the worker took more than 20 s to take control.

F. The harness

31. Green reverts (confirmed).

Round 68: 24 of 30 reverts go red, including every fix named in the brief. Six stay green:
Fix	Revert	Smallest test
COMMONS_SHOWN = 960	800	assert the request has iiurlwidth=960
iNaturalist rank !== 'genus'	dropped	a genus hit with an exact matched_term gives none
viaOlderNames: a homonym returns null	dropped	one clean older name plus a homonym gives null
viaOlderNames: accepted entries with a range only	dropped	mixed accepted entries, with and without a range
The script sets mwWait.tries	removed	a seam test reading build-dossiers.ts
"under the name X" label	off	a build fixture with via
Round 67: 37 of 44 go red. Six stay green, and one test hangs instead of failing:
the sync engine's two PAGE_IN_DEMO checks;
the dropStrays re-put;
the photo id's 16 characters;
LIST_PAGES_PER_HOUR, which the test reads instead of hard-coding;
the 16 KB boundary;
commit()'s frontier advance;
S5 per-network limit set to Infinity, where the test hangs for 900 s instead of failing.
The request budgets guard regressions, not round 67's fixes. At HEAD the seed takes 905 requests against a limit of 1,400 and one Water takes 10 against 20, and no round-67 revert reddens either.
The disclosure check: r67h-disclosure.spec.ts tests 3 of the source's 26 <details>. Elsewhere openDisclosure only annotates a second press.
Strictness: failOnFlakyTests: true is unconditional now, so a plain run fails a retry-only pass. My WebKit run counted its two flaky tests and exited 1.
Inspector port: the config's webServer starts wrangler on the default inspector port 9229, which collides when a second suite runs on the same machine.

32. What only the live sources could check, checked once each.

Claim	Live answer
Wikidata's maxlag answer	Confirmed: HTTP 200 with {"error":{"code":"maxlag",…"lag":9.57}}
iNaturalist: Cinnamomum camphora	Confirmed: taxon 1591063 Camphora officinarum, matched_term "Cinnamomum camphora"
iNaturalist: Bisnaga glaucescens	Confirmed: none; Ferocactus glaucescens → 274273
Bisnaga's same-type names	Confirmed: Echinocactus (3944752), Ferocactus (3959669) and Parrycactus (3946670) glaucescens
GBIF's open-licence filter	Confirmed: 21 of 127 Bisnaga images, all CC BY 4.0
Commons refuses off-list widths	Confirmed: an 800-pixel thumbnail gives 400
Commons addresses as stored	Confirmed: upload.wikimedia.org at 500 and 960 answered 200 at the claimed width, with %2C, %27, accents, a curly quote and parentheses; no thumb.wikimedia.org or utm_ left
The tracking query and Q310510's P566	Not verified: 429

The claims, checked
REVIEW-TRIAGE-66:
Done: V1-V10, R1-R14, S1-S6, S8-S10, N1-N5, N7-N9, N11-N13, P1-P3, P5-P10 and H1-H10.
Done differently, and stated: N6 (small words not adopted), N10, and S2 (wrangler.jsonc now off).
Half done: S7 (finding 8) and P4 (findings 8 and 10, and the seam tests).
REVIEW-ROUND-67:
§1-6 are done as written, apart from the faults above in R2, R3, R10 and V.
§9: the maxlag wait is confirmed live.
§10: the WCVP fallback, the open-licence filter and whole-word families are in the code. The fallback is too wide (finding 11).
§11: same-type names and the basionym set-aside work. The iNaturalist fallback has the gap in finding 14.
§12: addresses and sizes are right, but the category is taken unchecked (findings 1, 2 and 9).
REVIEW-ROUND-45's 29 findings:
Fixed: 1-8, 10-12, 14-23, 25-27, 29
Partly: 9 (small words, by choice), 13 (finding 10 and the negative-only tests), 28 (the WebKit service-worker takeover deferred)
Not fixed, by decision: 24
The seam tests do not check:
photograph addresses against the image policy, only that each policy host is named on the page;
the "960 and 500" sentence;
the Worker's cache keys;
the cached 404 and 302;
a direct persist() call outside the gate (vault.ts:689 defaults to asking);
hover preloading and the reload rule as behaviour (both are regular expressions over source);
the third Wikidata route (sentence() cuts at the first ". ").
r62bw-words-species:17,55 and r62ba-words:56-57 still only assert an old phrase is absent.

Also checked and sound
Live site:
The image policy matches every host the live pages load.
Every storage key, lock, channel, cache and cookie in src is on /about/how under the right store.
The monthly keep-data gate, hover preload off on private pages, the bucket count (32) and the species count (8,947) all match.
Matching:
Bisnaga glaucescens is right live: Q310510, iNaturalist 274273, and its range under Ferocactus glaucescens.
The Wikidata guards gave no item of another plant in 47 sample species.
15 of 17 older-name ranges are right.
The iNaturalist search never returns a genus or an inactive taxon.
Names:
Last review's finding 9 is fixed live: "Lily of the Nile", "Queen Victoria Agave" and "Garden star-of-Bethlehem" keep their capitals.
"String-of-Pearls" pools across hyphens, and brackets don't split names.
"snake plant" answers only Dracaena trifasciata.
Older-name hits rank in the last group, below every current-name hit.
Live search times on cache misses are 0.2 to 1.4 s, with network noise dominating.
The example:
The seed is one transaction: 9 random reloads mid-seed all ended seeded once with both marks.
Browsing every section and leaving writes nothing to the grower's storage and does not touch persistAskedAt.
A leftover with records is kept and offered with the right count.
"Empty" counts the whole fold, removed records included.
Deploy reloads (a two-build swap): tabs with typed text were taken over without a reload and kept their text, an untyped tab reloaded at once, and an old tab offline loaded an old chunk from the previous build's cache.
Records:
Running out of space during a Replace leaves the collection whole.
The tail read is right with out-of-order arrivals and missing order rows.
A snapshot from another device is refused.
Rule 5 holds: no reading writes to the log.
Server:
The sweep's conditional re-put closes the stalled-revival race.
Paged listings never delete a young generation.
An unreadable pointer makes an upload wait, and GET and HEAD answer 503.
Nothing deletes without the proof.
The MET, GBIF and NWS refusals are worded as refusals on the server.
Photograph ids carry 16 random characters.

In three sentences
What's best is that round sixty-seven did what its triage decided, and both suites pass on Node 22 and 24 in Chromium (410 end-to-end tests with no retries). Its fixes now also stand up in WebKit and Firefox apart from three cross-tab and offline tests. A skeptical first visitor will open a Nepenthes or a Crassula and find a map, a herbarium sheet or another species as the lead photograph, credited to "No machine-readable author provided". They will search "jade plant" and get the wrong Crassula, and follow /species/aloe-variegata to Aloe vera. If I could fix only one thing it would be finding 6, the place page's "All clear." when the National Weather Service did not answer: a one-line test of the new status, and the only finding here that could tell a grower to leave plants out on a night that kills them.
