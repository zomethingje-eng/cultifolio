# Review, round forty-seven: 7aa531c (round sixty-nine)

The second outside review of round sixty-nine, as the owner received it, lightly reformatted (tables kept, bullets kept).

Round sixty-nine did what its triage decided, and the rules loosened during the corpus step mostly hold where they were tested. All 86 summaries the lead rule took back are the species' own articles. All 14 ranges reached under older names lead to the same plant. I read every one of the 8,947 live dossiers.

The wrong photographs and identifiers on live pages now come from paths no rule reads:

- Following inactive iNaturalist ids puts another species' photographs on 7 pages, about 257 of them. The worst is Drimia filifolia, which shows 77 photographs of Drimia exuviata.
- Commons titles under an older name: "the species' own name" includes every older name, varieties cut to their species, so Pachypodium windsorii shows nothing of itself.
- An unread Wikipedia sitelink quotes Drosera tomentosa's article on Drosera montana.
- The Wikidata fallback before the §14 fix left Prunus persica carrying the item, POWO, IPNI and WFO of Amygdalus persica.

Three more things matter as much:

- The slow clock: the device last review found losing a grower's edit (R46-17) still loses it after a reload.
- Backups: unreadable.json is carried in every backup and read back by no build.
- The engine run: the all-engine strict run is red on this machine. Its two failures pass alone 8 of 8, so they depend on load.

## What was run

- System: Linux 6.18, x86_64, in a cloud sandbox. The network reached the live site, GBIF, iNaturalist and Wikipedia. Wikidata and Commons answered 429 for most of the session, which the affected findings say.
- Live build: the live site matches HEAD.
- Type check: `npm run check` gives 1,050 files, 0 errors, 0 warnings.
- Unit: `npx vitest run` gives 307 files: 2,697 passed, 9 skipped, on Node 22.22.2 and on Node 24.21.0.
- Strict Chromium: `node scripts/predeploy.mjs` (Chromium and the Chromium phone, Chromium 141, Playwright 1.63, Node 22) gives 447 passed, 5 skipped in 15.2 minutes, every test first time.
- Strict, every engine: `node scripts/predeploy.mjs --browsers=all` on Linux (WebKit 26.6, Firefox 155) gives 1,245 passed, 2 failed, 2 flaky, 17 skipped in 58.5 minutes, exit 1.
  - Failed: WebKit `r67p-pages.spec.ts:21` and Firefox `r60-grow.spec.ts:465`. Both are the "keep data" question, and both failed on their retry too.
  - Flaky: WebKit `r62a-interface.spec.ts:158` and phone-WebKit `r67h-disclosure.spec.ts:52`.
  - Alone: the two failures, re-run with `--retries=0 --repeat-each=2`, passed 8 of 8. See finding 20.
- Probes: vitest probes over fake-indexeddb, the real engine and the server harnesses. 116 reverts of round sixty-nine.
- The live corpus: all 8,947 dossiers through `/api/dossier/{key}`, at about 1 a second; 790 dossiers read for photographs, with 74 leads looked at; 110 credits compared with Commons; 106 Wikipedia redirect records; SPARQL plus GBIF for the 622 species no Wikidata item carries by key.
- Interface: a local build with a real vault, driven in Chromium, WebKit and Firefox.
- Marking: every finding is confirmed (reproduced) or suspected (read, not run). The repo was not modified.

## A. Wrong on a species page

**1. Seven live pages show another species' photographs through iNaturalist (confirmed, live).**

| Page | Shows iNaturalist's | Photographs | How the id got there |
|---|---|---|---|
| Drimia filifolia | Drimia exuviata (also a page here) | 77, 60 shared with it | inactive id followed |
| Pinguicula chilensis | Pinguicula antarctica (also a page) | 33, all shared | inactive id followed |
| Nepenthes angasanensis | Nepenthes mikei (also a page) | 3, shared | inactive id followed |
| Stenocactus boedekerianus | Echinofossulocactus ochoterenanus, our Stenocactus ochoterenanus | 39, shared | "filed by iNaturalist as", carried |
| Ceropegia monteiroae | Ceropegia sandersonii (also a page) | 1, shared | carried |
| Drimia oliverorum | Drimia physodes, which GBIF holds as our Fusifilum physodes | 54 | |
| Cotyledon flanaganii | Cotyledon orbiculata var. orbiculata | 50 | |

Why: `checkedInatId` (build.ts about line 454) and `fillInatIds` (corpus-fills.ts) follow an inactive id to `current_synonymous_taxon_ids` without M6's held-elsewhere test; an iNaturalist lump looks exactly like a rename. Carried ids are never put through M6. `heldElsewhere` compares names literally, so a genus transfer passes (Echinofossulocactus against Stenocactus). Fix: after following an id, and for any id whose iNaturalist name differs from the page's, match the iNaturalist name to GBIF; drop the id when GBIF's accepted key is another page's. Re-check carried ids the same way.

**2. Commons reads every older name as the species' own, and cuts varieties to their species (confirmed, live).** `own` (photo-kind.ts:55), with `binomial()` (:50) cutting "Pachypodium baronii var. windsorii" to "Pachypodium baronii". Pachypodium windsorii shows nothing of itself: its lead is `Pachypodium baronii - Tower Hill Botanic Garden.JPG` (P. baronii has its own page), and its other two files are a PeerJ phylogeny figure and its crop. Older names that are other species: Nepenthes dubia still leads with `Nepenthes_tenuis1.jpg` and holds 9 tenuis files; Nepenthes sumagaya leads with `Nepenthes_amabilis_upper_pitcher.jpg`; GBIF lists both as synonyms (K's test passes because its fixture gives N. dubia no synonyms). A joined name ranks below another species: `epithetRank` (:121) needs a non-letter before the epithet, so "Nepenthesdubia1.jpg" ranks below tenuis. Over all 8,947 names: 524 same-genus pairs where an infraspecific older name makes another accepted species "own"; 260 more through binomial older names (Asclepias curassavica takes "Asclepias syriaca" files, Aloe vera takes "Aloe maculata"). Fix: count only same-type older names as own; skip ranked synonyms unless the title holds their infraspecific epithet; treat a binomial that is an accepted species of the index as another species; drop the non-letter requirement in `epithetRank`.

**3. Non-photographs and other plants still lead Commons-only pages (confirmed, looked at).** Stored dossiers keep no categories (`commonsKind` reads them only on a new answer, :113), so stored files are judged by title alone. Leads: herbarium sheets (Cyphostemma camerounense `…-NMNH-01150553.jpg`; Zanha golungensis's only file, NMNH); plates and prints (Dasylirion graminifolium `…Zuccarini 1843.jpg`, still shown, R46-1; Cyphostemma adenopodum, a Curtis plate credited "M.S. del., J.N.Fitch lith."; Agave polyacantha, `PSM V43 D812…`); a postage stamp (Colchicum macedonicum's only file, credited "Македонская почта"); a hybrid (Nepenthes rhombicaulis, `Nepenthes_rhombicaulis_hybrid.jpg`; `isHybrid` needs "×" or " x "); another species with the genus run together (`namesAnother` needs whitespace after the genus, :67): Nepenthes aristolochioides `2005-12-18 N rajah 034.jpg`, Eriosyce spinosior `Neoporteria(eriosyce) villosa 2.JPG`, Nepenthes monticola `Nepentheslamiiupperpitcher2800.jpg`; another genus, never read: Hesperaloe chiangii's lead is mostly a Yucca carnerosana; not the plant: bark laid on paper (Boswellia dalzielii), museum fruits (Uncarina ankaranensis), a page of printed text (Nepenthes sibuyanensis, shown, not lead). Of 42 random Commons-only leads looked at, 36 are good. Fix: a one-time `--fill` asking for categories, 50 titles a request; meanwhile, title and credit rules for `NMNH-\d`, `\(AM AK\d`, `PSM V\d`, `lith\.`, `\bhybrid\b`, a 16th-to-19th-century year, and "почта"; read a run-together genus and any index genus in a title.

**4. Drosera montana quotes another taxon's article through its Wikidata sitelink (confirmed, live).** The page shows the summary of "Drosera tomentosa" ("In 1906, Ludwig Diels reduced the species to a variety of D. montana"). Wikidata item Q5308558 (Drosera montana) has "Drosera tomentosa" as its English sitelink; Wikipedia has no D. montana article. `summaryTitleFits` (wikimedia.ts:308) and the build's accept list (:238) take a sitelink without reading it, and `checkSummaries` counts it confirmed (corpus-fills.ts:162). `redirectIsThisSpecies` would have refused it. Also: a title carried from the last build when Wikidata lags goes into accept too (build.ts:415), unread. Fix: run sitelinks and carried titles through the rule.

**5. Wrong Wikidata identifiers on live pages (confirmed against GBIF's copy of IPNI).** Prunus persica carries Q21870184, the item for Amygdalus persica, so its POWO and IPNI (324718-2) are Amygdalus persica L.'s and its WFO is the synonym's; the right item Q13189 exists. Oenothera fruticosa carries Q15345195 Kneiffia fruticosa; Q7078662 exists. Both were rebuilt before the §14 fix through the older-key fallback (wikimedia.ts:177-208); the drops audit flags lost identifiers, not changed ones. Homonyms' IPNI numbers the §14 rule would take again:

| Page | IPNI shown | Which name that is |
|---|---|---|
| Peperomia monticola Miq. | 679160-1 | Hook.f.'s homonym, a synonym of P. vulcanica |
| Agave variegata Jacobi | 62332-1 | hort. ex Steud., under A. americana |
| Albuca longifolia Fisch. ex Steud. | 527398-1 (also its POWO) | Baker's |
| Othonna rosea Harv. | 236136-1 | Klatt's 1895 |
| Convolvulus cneorum L. | 266048-1 | Spruner ex Nyman |
| Raphionacme linearis K.Schum. | 100799-1 | N.E.Br. |

POWO and IPNI disagree on 470 of 6,995 pages; in a sample of 40, 19 are duplicates of one name, 8 another name, 13 unresolved. `sameNameRecord` (wikimedia.ts:108-117) takes any Plantae record of the same canonical name, with no author check and no check of its acceptedKey; 85 of 282 simulated same-name proofs rest on a record GBIF holds as a synonym of another taxon (live: Pandanus tectorius is proved by a record GBIF puts under P. odorifer). The taxon test is dead code: wikimedia.ts:154 reads P31 through `strings()`, which keeps only strings, and P31's value is `{id}`; the test passes P31 as an object and stays green with the clause removed. The rule would also take a P225-only item that is a "Wikimedia duplicated page" (Q133620833). Fix: rebuild the two pages, and have the audit flag a changed wikidata id; refuse a same-name record whose acceptedKey is another taxon or whose author disagrees (`authorsAgree`); read `.id` for P31; flag ipni when it is not the number in powo's LSID; treat items sharing a P566 as one (Ceropegia sociarum is "ambiguous" between two items with one basionym).

**6. Ceropegia macrocarpa lost its range to a doubtful homonym (confirmed, probe).** The page says "Kew holds Ceropegia macrocarpa J.N.Haage & E.Schmidt, with no native range", a different, doubtful name. `WcvpIndex.accepted()` (bulk.ts) takes a lone row whatever its author, and `parseWcvpName` gives an Unplaced row itself as its accepted id, so `holds()` blocks the older-name fallback. Fix: a lone row whose author disagrees, or that is not Accepted, does not count as held. Sound: the 14 live ranges reached by older names all lead to the same plant; a sample of 400 found no range taken from another author's entry.

**7. The summary rule will quote a sibling species, and reads any mention as "names the species" (confirmed in code; none live today).** `sameEpithet` (edit distance ≤2 from 6 letters) runs before the same-genus refusal: "Acer saccharum" is kept for Acer saccharinum, "Conophytum minimum" for C. minutum, "Drosera microphylla" for D. macrophylla, whatever the lead says; 178 sibling pairs. Deleting the same-genus refusal leaves every test green. `namesUs` is true wherever "Genus epithet" appears (a moth that feeds on Agave lechuguilla, a genus page listing "including Ceropegia linearis", a hybrid naming its parent). The genus and group pattern misses "is a plant genus", "one of the largest genera", "are plants of the genus", "comprises", "refers to any of"; family, subgenus and section pages; "List of …"; hybrids, cultivars and products (Mezcal, Sotol, Teak). The same epithet in another genus is kept on any lead: the 13 live cases are right, but none of their titles is among the stored older names; "Orbea ciliata" would be kept for Ceropegia ciliata (Wight), a different plant from Ceropegia ciliatioris (= Orbea ciliata). On 9 live pages (Apple, Pea, Peach, Pomegranate, Loquat, Chayote, Borage, Coconut, Pomelo) the record says "whose lead is this species'" where the lead was kept only for lacking genus wording. Fix: compare epithets exactly within a genus; count the name only as the lead's first subject; keep a one-word title only when its lead names the species, a sole species, or "monotypic"; require another-genus titles among the older names.

**8. Wrongly left out, and wrongly dropped (confirmed).** Summaries left out: Fenestraria and Harpephyllum (monotypic genus pages whose leads don't name the species); Callistemon lanceolatus (→ Melaleuca citrina) and Ranunculus ficaria (→ Ficaria verna). Ceropegia pulvinata and C. mixta lost 24 photographs each, wrongly: Bruyns gave them new names when moving them to Ceropegia because the old epithets were taken, and GBIF lists Stapelia hirsuta L. and Orbea variegata (L.) Haw. as their synonyms (not pro parte); neither is a page here. Fix: also accept a synonym whose GBIF acceptedKey is this species and which no page holds.

**9. The index's photograph count is not the page's (confirmed, live).** On 31 of 60 random iNaturalist- or GBIF-led pages the index counts more than the page shows (Ceropegia woodii 7 of 14; Sinningia elatior 34 of 58; Ledebouria ovalifolia 75 of 98). Formats calls the count "the photographs the species page shows", and the front page selects on 8 or more. Cause (suspected): `indexEntry` (build-dossiers.ts:194) runs `shownPhotos` on the raw list without `safeUrls`' `dedupePhotos` and `webUrl` filter. Also: 47 of 576 Commons tiles are original uploads (`photoAt`, photo-size.ts:37), so 40-pixel rows load the whole file, not the 120 or 250 /about/how promises.

**10. Smaller species-page points.**
- Provenance: 66 pages say "the previous build's identifiers are kept" with no build named; 332 pages have an iNaturalist id and no `inat.taxon` row; 4 "homonyms, unresolved" ranges say the author "matches neither" when it matches both.
- Credits: "(talk)" is stripped only at a line's end ("Marco Wentzel … MarcoPedia (talk) 22:07, 3 December 2016"); link text is left in ("Marco Schmidt [1]"); "Photograph by: Noah Elhardt" passes as the author. 110 compared credits showed no licence mismatch, no CC BY without an author, and no public domain shown as CC0.
- The lead (suspected): `leadRank` puts GBIF media from herbarium hosts (oxalis.br.fgov.be/BR000…, collections.nmnh.si.edu) above Commons photographs (Adenia goetzei, Ceropegia stapeliiformis, Franklinia alatamaha). Fix: rank PreservedSpecimen media below Commons.
- Misspelt sister species: `misspelt` reads 10 real pairs of sister species as one, all with pages here (Drosera macrophylla/microphylla, Stephania suberosa/tuberosa, Ceropegia radians/radicans and others); applied to older names it reads 47 more (Babiana stricta/striata, Ficus macrocarpa/microcarpa). Fix: allow `misspelt` only against the accepted name, and never when the title's binomial is an index species.

## B. What a first visitor finds

**11. A tab that gains sync from another tab says "checking now" and never checks (confirmed, Chromium).** `sync/+page.svelte:39` calls `sync.init()` but schedules no run. Steps: tab C on /plants with no vault; tab A creates one; C goes to /sync by a link: for 30 s "checking now", 0 requests. Also untrue: with the server refused, the card says "it will check again in a minute" (:185), but the engine reschedules only on a Retry-After; nothing was asked for 90 s. Fix: schedule a run on mount when configured, not running and not busy; on "not reached", `schedule(60_000)`. Sound: §12's reload works in all three engines.

**12. "All clear." where the NWS was never asked (confirmed, code and render).** `isUS` (forecast.ts:150) is false for Puerto Rico, the Virgin Islands, Guam and the western Aleutians, so the route returns `alertsStatus: 'n/a'`, and the place page shows "All clear." and "frost: clear"; the NWS answers 200 for San Juan. The other way: the same box includes Toronto and Monterrey, where the NWS answers 400, and those pages say it "did not answer". A non-US place also reads "All clear." where no alerts service exists. Fix: add the territories to `isUS`, and say "Forecast clear" whenever `alertsStatus` is not ok or none.

**13. /about/how describes checks the code doesn't make (confirmed).** "another species of its genus is not shown" is false for the 10 sibling pairs; "Another species of its own genus is never quoted" is false; §14 and how:36 describe the "instance of taxon" test, which never runs; formats says writes an hour count what is "stored", but they are counted at reservation, so failed puts count. The seam tests do not check the photograph sentences, the summary and Kew rules, which slot gets which size, or whether every `cache.put` uses `workerKey`.

## C. Data loss

**14. A slow device reloaded offline still loses the grower's later edit (confirmed; R46-17 not fixed).** `hlc.ts:114`: `readStored` sets `awaiting = true` at every load, and `inForce` (:254) then drops the stored correction. Steps: a device 3 days slow and confirmed goes offline and is reloaded (an iPhone app relaunch is enough); the grower moves a plant to bench C, stamped 72 hours behind; on reconnecting, a peer's move to bench B, made 12 hours before the reload and not yet seen, arrives and wins. Round 69's step 2 stamps only past held changes the device has already seen. Related: a clock 3 days fast, set right while closed for over 3 days, keeps −3 days; a reload a minute after a confirming reading, with the clock unmoved, drops the correction too; across tabs, a newly opened tab's first disagreeing reading writes `out: true` (:134), every open tab adopts it, and a confirmed tab then refolds, hides its peers' last 3 days, and dates events 3 days back. Suspected: a correction just under 2 days stays in force while the clock was set right; its edits are held, not parked, and later overwrite peers' first-day edits. Fix: in `readStored`, wait only when `Date.now() − confirmedAt ≥ offset − TRUST_SERVER_PAST_MS`; a tab that has had no reading never writes out; use `FOLLOW_HELD_MS` (1 day) as the threshold rather than 2.

**15. unreadable.json is carried in every backup and read back by no build (confirmed).** `backup.ts:47-53` puts every row in `skipped`, never in `changes`. Merge takes only `merge.fresh` (io.ts:135), and Replace (replace.ts:52) refuses with "replace from a newer version of the app", which no version does. A change in that file is not in the log after a restore, and the next backup no longer carries it; a build that can read the change still leaves it out; a sync set up on an older build never queues such changes. Fix: in `readBackup`, pass the rows through `checkRows` and add the readable ones to `changes`; append the rest, as they are, to the log on Merge and Replace.

**16. The import key still makes two plants one (confirmed).** `rows.ts:68,73` keys 05/01/2024 and 01/05/2024 the same, even on a sheet answered day first: re-sorted with a new 01/05/2024 line, the 1 May plant is skipped as done and the 5 January one offered again; a day-first 01/05/2024 is skipped against an ISO 2024-01-05 already imported. A sheet that gains or loses an unmapped column offers an imported line again, because the no-column fallback is skipped when two lines share it (plan.ts:92). Fine: €12.50 against 12.5 €, 1-May-2024, 01.05.2024, 2024/05/01, a cell filled in later. Fix: key an answered ambiguous cell in written order; store the no-column key beside the full one; allow the fallback when one of the sharing lines is unmatched.

**17. "Keep it as my own" loses everything when the next page is slow, and the example is still deleted (confirmed, Chromium).** `keep-draft.ts:42`, with `leaveDemo`'s 10-second fallback: press Keep while the next page takes 12 s; Leave decides the tab stayed and drops the draft, then the page loads anyway at `/plants/new?kept=1`, outside the example, with the form empty and the example's database deleted. At 5 s every field carries. Keep drops the parent place when the grower has none of that name, with no word. Fix: don't drop the draft when Leave is called off (it is read only with kept=1); say the parent wasn't carried.

## D. The rest

**18. Server.** W5 (confirmed): photographs and log batches share one hourly cap of 3,600; a device uploading more than about 3,550 photographs in an hour gets the refusal, and so does another device on the same vault that sent almost nothing. Fix: separate counts, or keep 600 for batches. W2 (suspected): a pull cancelled mid-walk may leak its 50-page reservation, since the give-back is in a `finally` the Worker may never reach; about 24 backgrounded pulls would refuse that vault's listings until the hour ends. Fix: settle through `waitUntil`, or let reservations lapse in a minute. W1: every address key has a fixed expiry or is swept; only the upstream object's in-memory map keeps an address past its minute, until its next call.

**19. The harness.** 116 reverts: 95 red, 21 green. Those that matter (fix; revert; smallest test):
- §13 another epithet in the species' genus never; drop `m[1] === title[1]`; a lead "Weingartia pulchra is now included here".
- §13 another genus only when the lead names the species; two-word → true; Melaleuca citrina for Callistemon lanceolatus with a lead that doesn't name it.
- §13 group and common-name wording; drop those alternatives; "X is a common name for several species" → false.
- §13 `checkSummaries` lead path; byLead → false; a stored summary with no item whose lead names the species.
- §13 the build passes `who`; removed; a build of Welwitschia through `buildDossier`.
- §14 synonym acceptedKey branch; `if (false)`; a record with another canonical name and acceptedKey = the species'.
- §14 isTaxon; removed; a print with P225 equal to the name.
- §15 seven-letter minimum; 5 or 8; a 6-letter guard and a 7-letter shown case.
- K1 PNG excluded; png allowed; `commonsKind('File:Aloe vera 1.png')`.
- K2 first line only; lines joined; Artist `'Jane Doe<br>notes'` → "Jane Doe".
- X2 leftover offered until answered; ignore `offered >= last`; an edit after an answered offer.
- X5 malformed changes make it not empty; removed; `ownEmpty` with malformed > 0.
- R1 `onlyIfUnique`; removed; two lines sharing the alternate cells.

The address helper: in r62s-server and r62bs-server only the vault-creating POST carries `docAddress()`; the first photo PUT, which takes the vault's place, goes from 127.0.0.1. Repeating the two specs 6 times gave 10 passes, then 503. Fix: the same address on every request. `limitAddress` depends only on project and run, so a retry reuses an address that has spent its five; under `retries: 1` any transient failure becomes a certain one. Fix: mix in retry and `repeatEachIndex`.

**20. The all-engine run is red on Linux, by load (confirmed).** WebKit `r67p-pages.spec.ts:21` (the keep-data question put once over six loads): received 0 asks against 1, on both attempts. Firefox `r60-grow.spec.ts:465` (the answer said once after the first plant): the toast stayed empty, on both attempts. Alone, both passed 8 of 8. Why (suspected): both turn on the collection having finished reading before the next navigation; r67p waits a fixed 1,200 ms a page. Under two workers on WebKit no page finished reading in time, so nothing was asked; the same would happen to a grower on a slow iPhone who moves on in under a second. Fix: ask from the first plant's commit as well as the load; in the tests, wait for the collection to open rather than a fixed time. The two flaky tests: WebKit select mode at 390 (`r62a-interface:158`) and phone-WebKit's "Use my own number" while the name check answers late (`r67h-disclosure:52`).

## The claims, checked

- REVIEW-TRIAGE-68: done: K2, K3, K4 (except finding 9's originals), K5; M1 to M8; N1, N2; W1 to W6; X1 to X5; R1 to R6 as written (R2 has gaps, finding 14); P2, P3. Half done: K1 (categories never reach stored files; findings 2, 3); P1 (the territories, finding 12; tested only by a source regex); P4, P5 (the seam tests miss the photograph and matching rules). merge-needs.md: every item applied.
- REVIEW-ROUND-69: §11 done, finding 19 applies; §12 done in all three engines apart from finding 11's other path; §13 86 of 86 restorations right, finding 4 bypasses the rule, finding 7 is its latent gap; §14 done apart from findings 5 and 6; §15 done, `misspelt` has finding 10's sister pairs.
- REVIEW-ROUND-46's 32 findings: fixed 2, 3, 4, 5 (all but the slow page), 6 (all but the territories), 7, 8, 10 to 15, 19 to 27 and 29; partly 1, 9, 16 and 31; still open 17 (finding 14) and 28's race; 30's named tests all pass alone now in WebKit and Firefox.

## Also checked and sound

106 redirect records: 86 taken back, all right (59 monotypic genus pages, 17 the species under another genus, 10 crop or common-name articles); 20 left out, of which 16 are right. No section, disambiguation or list-page redirect is quoted. The 8 pages proved by label are the right plant. The 14 ranges reached under older names, and a 400-sample for homonym ranges. GBIF licences: 6,319 non-iNaturalist photographs, 17 sampled across seven publishers all carry their own open licence. Every hero equals `heroOf` of what is shown and the index tile, across 790 pages. The example's `?left=` token held in every order tried; a tab away during another tab's Leave comes back correctly in Chromium and WebKit, and in Firefox is safe. R3's outbox, push and preview skip unreadable changes. The snapshot key, and the single-tab reading and sleep cases. Rule 5: no reading writes to the log. W3 and W4's pre-check; the listing reserve; small batches counted; Worker cache keys carry the build. Every storage key and host on /about/how matches the code. A retry-only pass fails both predeploy and a plain run.

## In three sentences

What's best is that the strict Chromium run passes 447 tests first time on this machine as on the owner's, and the three rules written in a day during the corpus step hold on every live case they were written for, including 86 of 86 restored summaries. A skeptical first visitor who opens Drimia filifolia, Pachypodium windsorii or Pinguicula chilensis will find another species' photographs, and on Prunus persica a POWO and IPNI link for Amygdalus persica. If I could fix only one thing it would be finding 1: put a followed or carried iNaturalist id through the held-elsewhere test.
