# Self-review, rounds sixty-seven and sixty-eight

This review covers commit `1609c19`: Worker `21821f20-3b98-4ac2-847d-58ad2d7c8d85`, corpus `333fa1914cd6c00a`. It follows the brief in `REVIEW-PROMPT-68.md`. Six reviewers each read one area in a copy of the repository:

| Reviewer | Area |
|---|---|
| A | The corpus builder's matching across sources |
| B | Photographs, their sources, licences and credits |
| C | The example collection and the first visit |
| D | Records, the clock, the import, backups and the vault |
| E | The server, the pages, privacy and the service worker |
| F | Names and search, and the tests of rounds sixty-seven and sixty-eight |

Every finding below names its reviewer and number (A1, B4 and so on). Each reviewer's full report, with its reproductions, is in `review-68/self-<letter>.md`. The reproduction tests are kept in the review copies and are not committed. Before the reviewers started, I read the live corpus on the owner's PC (section 6). I re-checked the headline findings myself afterwards.

**What this review could not do.**
- **The sandbox's reach.** The sandbox could not reach Wikimedia, which rate-limits it, or POWO, which challenges it. The Commons figures come from the owner's corpus, read on his PC. Kew's rows come from GBIF's copy of WCVP. The owner's PC reached cultifolio.com and Commons, and the live checks in section 6 were made from there.
- **Browsers and phones.** No browser suite was run, and WebKit and Firefox were not run. No real iPhone was used.

**Summary.**
- **41 findings:** 7 from A, 8 from B, 5 from C, 5 from D, 10 from E and 6 from F.
- **Six should be fixed before the site is shown to the public** (section 1). Four of them are about what a species page shows as fact: a wrong range, maps and drawings shown as photographs, uncredited photographs, and photographs under a licence that is not theirs. One is a false privacy statement, and one sends a reader to the wrong species.
- **Two corrections to the project's own documents** (section 4). The repository's `wrangler.jsonc` has Workers Logs off, not on. And there is no Worker tail build: the comments that describe one are stale.

## 1. Before the launch

1. **Maps, herbarium sheets, drawings and unidentified plants are shown as photographs (B1).**
   - **What happens.** `commonsPhotos` takes every file in `Category:<species>` that is a JPEG, PNG or WebP under an open licence. Nothing checks that the file is a photograph of the plant.
   - **How many.** On the owner's corpus, 145 of the 4,450 Commons files have names that mark them as something else, across 113 species. 31 of them lead their page, and so are the page's link-preview image too. Among them:
     - distribution maps (Nepenthes platychila, Heliamphora hispida, Haemanthus dasyphyllus);
     - herbarium sheets (Crassula alcicornis, Stephania bancroftii);
     - plates from Curtis's Botanical Magazine (Agave spicata);
     - "Unknown asphodelaceae" for Aloe juvenna and "Unidentified flowers in Eswatini" for Brunsvigia natalensis;
     - a seed (Commiphora zanzibarica) and a stamp (Franklinia alatamaha);
     - another species' files: Nepenthes junghuhnii's map under N. singalana, and "Manfreda aff. jaliscana" under Agave jaliscana.
   - **The fix B proposes needs no extra request:**
     - JPEG and WebP only;
     - a deny-list of words in the title;
     - no title that names another species of the same genus;
     - Commons' categories, read in the same request, tested against the same list;
     - a Commons file leads only if its title names the species.
   - **The 4,450 already in the corpus** can be cleaned at read time from their stored titles, as `mendCommonsThumb` already is. Commons' categories for them would take about 90 more requests.
2. **CC BY and CC BY-SA Commons photographs with no author are published, credited "Own work" (B3).** When Commons' `Artist` field is empty, the builder takes the `Credit` field, which is the file's source, not its author. This breaks rule 4 and `/about/how`. The fix is to read `Artist` only, and to add "Own work" to `--prune-uncredited`.
3. **A GBIF photograph with no licence of its own is published under its record's licence (B6).**
   - **Where.** `gbif.ts:252` reads `licenceTag(m.license ?? o.license)`, though the comment above it says a record's licence is not its photograph's.
   - **Why now.** Since round sixty-eight the request asks only for CC0 and CC BY records, so every such photograph now passes. The download path does not fall back like this, so the two paths disagree.
   - **Live cases.** An ALA weed sighting is published as "Michael Sim, CC BY". Records from MNHNL and zobodat are published as "author not stated, CC0".
   - **The fix** is to drop the fallback, then re-ask the GBIF photographs that are not iNaturalist's, one request each, and drop those whose own licence is missing.
4. **Kew's range under an older name gave Lantana ×strigocamara another plant's range (A1).** Four holes line up:
   - Kew writes the hybrid sign ("Lantana × strigocamara") and GBIF does not, so Kew's own entry is missed.
   - The fallback also runs when Kew holds the name but has no range for it.
   - A WCVP row is taken whatever its author when it is the only row. That let "Lantana mutabilis Salisb.", a homonym, stand for "Lantana ×mutabilis Lippold".
   - The rule accepts an entry at any rank. The page now shows the range of Lantana camara subsp. aculeata, and a habitat climate read inside it.

   The fix:
   - normalise "×";
   - run the fallback only when Kew has no row for the name;
   - require the authors to agree, with no single-row bypass;
   - skip pro parte synonyms;
   - count every accepted entry reached, and require exactly one, at species rank;
   - record the older name that led there.

   A says the rule should not also require the same type: Erythrina caffra and Conophytum tomasii reach the right Kew entry only through names on another type. The 17 species should be rebuilt afterwards.
5. **The server keeps each vault's network for as long as the vault is used, and `/about/how` says address keys go within two days (E1).**
   - **Where.** Round sixty-seven's per-network limit on new vault places writes the uploading network (an IPv4 /24 or IPv6 /48) into the place record, `f:<vault>` (`counters.ts:336`). `touch` keeps it, and only the 90-day reclaim removes it.
   - **Why it matters.** A /48 is often one customer's own delegation. This breaks rule 5.
   - **The fix.** The network is needed only on the day it was counted. Keep it in a day-dated key swept with the others, or strip it at the sweep.
6. **An older name of two species sends the reader to whichever comes first in the alphabet (F1).**
   - **The scale.** 512 names in the live index are an older name of two or more species. Before round sixty-seven it was 210.
   - **What the reader sees.** `/species/<name>` redirects to the first holder in the alphabet, and the page says "the GBIF backbone accepts this species as X". Checked live from the PC: `/species/cereus-undulatus` goes to Acanthocereus tetragonus, and before round sixty-seven it went to Selenicereus undatus, the dragon fruit. `/species/cotyledon-mammillaris` goes to Adromischus filicaulis, not A. mammillaris.
   - **The fix.** Rule 3 says a name held twice is not an unambiguous match. `bySynonym` should mark it as ambiguous, and the 404 should name both species.

## 2. To fix soon

**Photographs (B).**
- **B2: which photograph leads.** `heroOf` treats a Commons or GBIF photograph as wild, because it carries no cultivated flag. Many Commons files are from botanic gardens. The fill appends Commons after GBIF, but a build orders iNaturalist, then Commons, then GBIF. So at the next build a Commons file can lead ahead of GBIF's observation photographs. Twelve Commons files can also stop GBIF being asked at all. The fix is to rank by source in `heroOf`, put GBIF before Commons in the build, and count only non-Commons photographs towards "fewer than six".
- **B4: credits as written.** HTML entities reach the page as written ("Forest &amp; Kim Starr"). A tile cuts Commons' "No machine-readable author provided. X assumed" so that it reads as no author.
- **B5: "Public domain" labelled CC0.** 217 Commons files are shown as CC0 on the lead photograph and the tile, which is a false licence statement. Rule 4's wording should also say how public domain is shown.

**Matching (A).**
- **A2: the drops audit sees too little.** It misses a lost Wikidata item, summary, identifier or range, a large drop in photographs, and a second lagged build in a row. Bisnaga glaucescens's loss of its Wikipedia summary and POWO links passed it.
- **A3: synonyms read 50 at most.** GBIF's synonyms are not paged, so "exactly one" and "same type" are judged on part of the list. Oenothera glazioviana has 63.

**The example collection (C).**
- **C1: `?left=sample` deletes too much.** It acts as Leave's delete mark in any tab that was ever out of the example, not only the tab that pressed Leave. So a copied link, or "Go to my own collection" in a tab another tab sent home, can delete an example opened afterwards in another tab, with the visitor's records and no question. This undoes V6, and section 7's fix in round sixty-seven was too broad.
- **C2: "Keep it as my own" carries only the species** (or a place's name). The date, source, price, count, notes and place are dropped, and the form's guard asks "Leave site?" partway through.
- **C3: a pending Replace counts as "empty".** A replacement from a backup that is waiting to finish (the live log wiped on a full device) counts as empty, so the example opens over the grower's collection and hides the notice saying why.

**Records (D).**
- **D1: the import key gives two plants one key (a regression from R3).** Two causes:
  - dates are keyed with day and month in either order, so 5 January and 1 May match;
  - columns no field takes are left out of the key.

  A new line inserted above a plant already imported is then dropped as already here.
- **D2: R2 holds a slow clock back.** On a device whose clock is really days slow, R2 puts the clock back by days at every load and after every sleep, until a reading comes.
  - Peers' recent changes are hidden until then.
  - An offline edit can lose to an older one.
  - The cached fold is never used, so every load re-reads the whole log.
  - R2 contradicts round sixty-two's decision that a correction does not lapse, and `hlc.ts` and `/about/formats` still state the old rule.
- **D3: a malformed change is skipped by the fold only.** It still breaks backups, restore previews and sync's first push. One malformed change can make every other device set aside a whole batch of up to 2,000 good changes.
- **D4: a refused database is said only on Today and Backup.** My plants, Places, Propagation, a plant's page and Labels say "Opening your collection…" for good.

**Server (E).**
- **E2: the listing budget never refuses concurrent pulls.** It is checked before a walk and charged after. 200 concurrent pulls made 9,800 list calls, and none was refused.
- **E3: only the adapter's cache is keyed by build.** The Worker's own caches for search, sheets, names, forecast and the old-name check ignore it. An old build's search answer was served to a request naming the new build. `/about/how` says the opposite.

**Names and search (F).**
- **F2: a family typed in part finds nothing.** "aizoac" and "asparagac" find nothing, and "cactac" finds an unrelated plant by a similar spelling. The fix is to match a family from its start once the typed word reaches the family less "aceae".
- **F3: standard names ending in another genus are set back.** "Tree-anomone", a misspelling, heads Carpenteria californica, because "anemone" is not on the list of genus words allowed as English nouns.
- **F5: round sixty-eight's script wiring has no test.** Reverting the five Wikidata retries, the kept identifiers, either fill's resume check, or the homonym guard in the range lookup leaves the suite green.

## 3. Minor

- **A4:** same-type names miss the right name when GBIF records no basionym (Tylecodon cacalioides). It never gives a wrong plant.
- **A5:** iNaturalist's search is not limited to plants ("Iris oratoria" finds a mantis). Add `taxon_id=47126`.
- **A6:** kept identifiers carry no date; iNaturalist's own taxon name is dropped from the record; a refused synonyms request reads as "nothing to report".
- **A7:** a full rebuild during a Wikidata lag spell would take about 87 hours. It needs a circuit breaker.
- **B7:** Commons' plain "Attribution" licence would show as CC BY.
- **B8:** `mendCommonsThumb` may give a missing tile for files with very long names.
- **C4:** some add paths inside the example open the form there instead of leading out: "Sow seed", Wanted's "Got it", search's "add it as a plant", the error page and Labels.
- **C5:** the closed state's refusal words on some pages mention free space, and some pages without an unload guard lose what was typed when another tab leaves.
- **D5:** changing a renumbered plant's number by hand hides both renumber notes.
- **E4:** a token-only upload of the same bytes still takes the photograph's hold.
- **E5:** a server failure on the sheets or entries is worded as a refusal.
- **E6:** a vault refused a place is told "it will try again tomorrow"; the device tries every hour.
- **E7:** a NASA POWER failure is still recorded as a refusal.
- **E8:** the removal proof is a static header, replayable by anyone who sees headers.
- **E9:** the monthly "keep data" limit also applies to Chrome and Safari, which answer without asking.
- **E10:** a tab still on an old build after two deploys loses its lazy chunks.
- **F4:** `/about/how` overstates two naming and search rules.
- **F6:** the Worker's search cache key was not moved for round sixty-eight's change of answers.

## 4. Corrections to the project's own documents

- **Workers Logs.** The repository's `wrangler.jsonc` has `"observability": { "enabled": false }`, as the owner's has. `REVIEW-ROUND-67.md` section 3 says the repository's copy is stale on this line, and `REVIEW-PROMPT-68.md` says it is on. Both are wrong, in the safe direction, and both should be corrected.
- **There is no Worker tail build at this commit (A7).** No route or server module calls `buildDossier`. The comments in `build.ts`, `wikimedia.ts` and `fetch.ts` that describe tail builds are stale, and so is round sixty-eight's statement that "the Worker does not wait" for Wikidata.
- **`/about/how` and `/about/formats`.** Seven sentences are untrue (E's list):
  - the address counters (E1);
  - "never answered from an old one's copies" (E3);
  - the Commons sizes, since a narrow file is its original;
  - the browser's HTTP cache list, which leaves out the year-long cache of sealed log batches and photographs;
  - the listing bound (E2);
  - "to the end" for the generation listing;
  - "the server's log".

  F4 adds two naming rules that are overstated, and D2 two sentences on the clock.
- **The account's photograph claims.** Round sixty-eight said Commons' photographs keep the lead photograph as it was. That holds for the fill but not for the next build (B2).

## 5. The triage, verified

- **The example collection (V).** V2, V3, V5, V7, V8, V9 and V10 are done. V1 is partly done (C2, C4), V4 has a gap (C3), and V6 does not hold (C1).
- **Records (R).** R1, R4, R5, R6, R9, R11, R12 and R13 are done. R2 is done as written, at the cost in D2. R3 is done apart from D1, and R8 apart from D5. R10 is partly done (D3, D4). R7 is covered only by a browser test and was not run. R14 was not probed.
- **Server and pages (S, P).** S1 to S4, S9, P1, P2 and P3 are done. S5 (E1), S6 (E2), S7 (E3), S8 (E5, E7), S10 (E4) and P4 have gaps. P5 to P10 are present.
- **Names (N).** N1 to N13 are done as described. N1's wider set of older names causes F1.
- **Round sixty-eight.** The maxlag wait, the kept identifiers, iNaturalist's `matched_term`, the older-name range, same-type names, the P566 rule, the open-licence GBIF request, the Commons addresses and sizes, and both fills are done as described. All ten of their unit-level fixes are caught by a test when reverted (F's mutation table). A, B and F found the faults above in the rules themselves, not in their wiring.

**Found sound:**
- **The sweep:** nothing could make it delete a live generation.
- **The adapter's cache:** an omitted or forged `v=` cannot poison it.
- **Reloads:** no deploy sequence reloads a page over typed text.
- **Small batches:** the free batches cannot spend storage without limit.
- **The P566 rule:** it never picks a wrong plant.
- **Kept identifiers:** they are dropped as soon as Wikidata answers.
- **The mended tiles:** they load, at 128 kB for Nepenthes dubia, against 543 kB for its original.
- **The lead photograph:** no species that had photographs before the last fill had its lead tile changed by it.

## 6. What I checked myself

On the owner's PC, against the live corpus and site:

- **Commons' 4,450 files.** By licence: CC BY-SA 2,915, CC BY 1,126 and CC0 409. Of the CC0, 217 came from Commons' "Public domain". By title: 145 suspect files in 113 species, 31 of them leads, with the examples in section 1 read from the files themselves. By credit: 108 credits hold entities, "Own work", user pages, URLs or free text, and 12 say "author not stated".
- **The 17 ranges taken under older names,** read from the dossiers: Lantana strigocamara under "Lantana camara subsp. aculeata", Conophytum tomasii under "Conophytum hanae", Erythrina caffra under "Erythrina afra", and the others as section 1 describes.
- **The live redirects** for `cereus-undulatus` and `cotyledon-mammillaris`: 302s to Acanthocereus tetragonus and Adromischus filicaulis.
- **The lead tiles** before and after the last fill: none changed.
- **In the code:** `gbif.ts:252` (B6), `counters.ts:336` (E1), `dossiers.ts:411` (F1), and the repository's `wrangler.jsonc`.

## 7. What I would do next

A round sixty-nine in three parts:

1. **The species pages' facts.** B1, B3, B6, B4 and B5 at read time, so the deploy puts the pages right and `--index` puts the tiles right with no rebuild. Then the one-off cleanups: Commons' categories, about 90 requests; GBIF photographs without their own licence, re-asked; `--prune-uncredited`. Then A1, A2 and A3, and rebuild the 17 species and Lantana's climate. Then B2.
2. **Privacy and the reader.** E1, F1, E3 with F6, and the seven untrue sentences on the about pages.
3. **The device.** D1, C1, C3, D3 and D4, D2 (decide whether R2 stays), C2 and F2. The minor items as time allows.

Each part needs the unit suite, a strict browser run on the PC, and the live check. WebKit and Firefox should be run before the public launch, since they have not been run since round sixty-six.
