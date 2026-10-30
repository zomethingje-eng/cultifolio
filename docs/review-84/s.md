# Review S, round 84: search, the index's names and the honesty of the claims

**Verdict: works with faults.** Search finds the plant a grower means for scientific names, older names, hybrids, cultivars, "cf." and "sp.", the eleven merged names and pasted labels. The add form's picker lists the reference's species in the same order as the catalogue for every query where both answer. Round 82's and round 83's search fixes hold on the live site.

Four things should change before the site is shown to the public:

- **A wrong reason on species pages.** Where the cold extremes were set aside by the round 83 rule (the 1-in-100 night warmer than the coldest month's mean low), the page says in two places that "the weather cell's ground is too far off". Eulychnia acida, round 83's own example, contradicts itself.
- **Common-name searches.** The species a shared one-word name belongs to comes last. "saffron" does not list Crocus sativus in the first 30. "snowdrop" puts Galanthus nivalis 24th. "pepper" lists neither Piper nigrum nor Capsicum annuum in the first 30.
- **A cultivar in ’…’ quotes.** The picker reads `Crassula ovata ’Gollum’` as a name nobody holds. The form then files it with no key and no cultivar, though the catalogue's search reads the same text correctly.
- **/about/how is out of date.** It still describes the 29 October upload and repair as things to come, and says hybrids have no habitat climate, while 253 hybrid pages show one.

**Scores**

| Area | Score | Reason |
|---|---|---|
| Search relevance | 7/10 | First hit right on 191 of 217 queries with a target. Scientific, older, hybrid, merged and `hom` names are right every time. Common names fail where a word is shared. |
| The picker against search | 7/10 | Same order every time both answer. Loses a ’…’ cultivar, a fully quoted name and a pasted label with two ranks, and never says why a row is offered. |
| /about/how and /about/formats | 5/10 | The mechanisms I checked are true of the code. Nine statements are out of date or false on the live site, and the page runs to 22,753 words. |
| Other claims a grower reads | 7/10 | "Not checked" and no-climate reasons are specific and true, and the few-records mark is right. The extremes reason is wrong, and the merged page has one untrue sentence. |

**What I covered**

- **Live search:** 247 queries in 16 groups (189 in the main set, 58 testing claims), each asked twice: as the front page asks (`n=30`) and as the picker asks (`n=6`). That is 494 search requests.
  - Groups: scientific 36, misspellings 21, common names 36, genus alone 11, hybrids 14, cultivars 10, "cf."/"sp." 6, older names 12, `hom` 5, merged 13, regions 5, short 5, long 4, Unicode and pasted 11, about-page examples 50, extra 8.
- **The picker in Chromium:** the same 189 queries typed into the live `/plants/new` (`picker.mjs`; 414 requests, service worker blocked, third-party hosts aborted).
- **The add form:** three add-a-plant flows, one per quote style (`addflow.mjs`).
- **Pages:** 16 species pages and addresses, 9 dossiers, both about pages read live.
- **The index:** `/api/index` fetched once, at 21:22 UTC, and saved for D at `/tmp/claude-0/rev84r/inputs/index.json`.
- **Ranking checked offline:** the whole-index ranking, from a scratch copy of `search.ts` over that index, reproduces the live answers for every query I compared. I measured the shared-word fault over all 566 cases in the index.
- **Tests:** the 12 about-seam unit files plus `r83k-merged` and `r82s-search`: 14 files, 193 passed, 2 skipped.
- **Requests:** about 1,190 to cultifolio.com in all (`S-s/requests.log`; browser page assets included), never more than two a second. None to third-party hosts.
- **Scratch:** `/tmp/claude-0/rev84r/S-s/`. Key files: `search-results.json`, `search-results2.json`, `picker-results.json`, `shared-word.tsv`, `shared-word-fixed.tsv`, `pages/`, `dbg/`, `add-0.png` to `add-2.png`.

## Issues

### S1. Major: species pages give the wrong reason for extremes set aside by round 83's rule

- **What I did.** I fetched `/species/eulychnia-acida` and its dossier `k2803037`, then read `src/lib/core/lapse.ts`, `src/lib/dossier/schema.ts` and `src/lib/core/sheet.ts`.
- **What I saw.** The page contradicts itself (`S-s/pages/eulychnia-acida.txt`):
  - **The habitat figures card (line 16):** "6.8 °C … Jul at the habitat, not a floor; extremes not used (the weather cell's ground is too far off)".
  - **The climate section (line 54):** "The daily extremes were read at a weather cell whose ground is too far above or below the typical spot to correct for, and are not used."
  - **The same section (line 73) and the record of sources (line 114):** the true reason, that "the 1-in-100 night, 7.5 °C, is warmer than the coldest month's mean nightly low across the range, 6.8 °C …". The lapse correction is only −432 m, well inside the 1,000 m limit.
- **Cause (from the code).**
  - `lapseSetAside` (`lapse.ts:21-34`) has three reasons: a lapse correction beyond 1,000 m, a record low warmer than the coldest month's mean low, and round 83's 1-in-100 night warmer than it.
  - `schema.ts:403` records all three as `extremesStatus: 'lapse'`.
  - `sheet.ts:268`, `:275` and `:277` (`extremesWhy`, `extremesWhyTag`, `extremesWhyShort`) word `'lapse'` as the elevation reason only.
- **How many pages.** The PC's run names 422 pages whose extremes are set aside. Every one set aside for a warm night carries the false sentence. That is proved on Eulychnia acida and follows from the code for the rest; I did not count them.
- **What should happen.** Each surface gives the reason that applied.
- **Smallest fix.** Use `lapseSetAside(...)`'s own sentence wherever the extremes are explained. In the glance tag, a neutral "extremes set aside (see Temperature)" is enough. Or store a reason kind beside `'lapse'`.

### S2. Major: the species named exactly by a shared one-word name comes after species that only contain the word

- **What I did.**
  - Asked the live search for common names a grower types.
  - Reproduced the order offline over the whole index (`S-s/dbg/run.ts`).
  - Measured every case in the index (`S-s/dbg/shared.ts`, output `S-s/shared-word.tsv`).
- **What I saw (live, `/api/search?…&n=30`).**

  | Query | Where the expected species comes | What comes first |
  |---|---|---|
  | snowdrop | Galanthus nivalis 24th of 27 | Anemone sylvestris |
  | saffron | Crocus sativus 34th of 36 (not in the 30 shown) | Jamesbrittenia aurantiaca, "Cape Saffron" |
  | pepper | Piper nigrum and Capsicum annuum 125th to 128th of 145 | — |
  | mint | no Mentha in the first five | the Pycnanthemum mountain mints |
  | squill | Scilla siberica 54th | — |
  | stonecrop | Sedum acre 116th of 117 | — |

  - **Across the index:** 566 cases of a species holding the query as a one-word name that other genera share, or as a generic noun, while one of its longer names holds the word. 515 of them rank behind species that hold the word only inside a longer name, and 167 fall past the 30 shown.
- **Cause.** Two rules mark the exact one-word match as "no evidence" (`c = 3.5`, worse than the whole-word match `c = 2` that its own longer name would earn):
  - `closeness()` for generic nouns (`search.ts`, around line 751);
  - the shared one-word rule in `collect()` (around line 897).
  
  Round 82 exempted only a species whose *headline* is the word ("peppermint"). Galanthus nivalis ("Common snowdrop" headline, "Snowdrop" among its names) and Crocus sativus ("Saffron crocus", "Saffron") are punished below "Cape Saffron".
- **What should happen.** The plant a source calls exactly "Saffron", whose own headline says "saffron", comes before plants merely nicknamed with the word.
- **Smallest fix.** Measured on a scratch copy (`S-s/dbg/search-fixed.ts`): keep the exact match when the species' headline holds the word whole.
  - The 515 cases fall to 247, and the 167 past 30 fall to 49.
  - snowdrop: G. nivalis 3rd. saffron: C. sativus 2nd. pepper: P. nigrum 2nd and C. annuum 4th. squill: S. siberica 1st.
  - "rose", "peppermint", "rosemary", "fig", "jade plant" and "echeveria" are unchanged.
  - Applied to the generic nouns too, "cactus" and "lily" would lead with Acanthocereus tetragonus and Cardiocrinum cordatum. Applying it to the shared-word rule always, and to generic nouns only where the headline ends in the noun, is the owner's call.

### S3. Major: the picker reads a cultivar in ’…’ quotes as part of the species name; the form files it with no key and no cultivar

- **What I did.** On the live `/plants/new` in Chromium I typed `Crassula ovata ’Gollum’` (U+2019 on both sides), left the field and pressed Add twice. I repeated with `‘Gollum’` and with `'Gollum'` (`S-s/addflow.mjs`, screenshot `S-s/add-0.png`).
- **What I saw.**
  - **With ’…’ quotes:** the pill read "not in the backbone · Not a reference name. Did you mean *Crassula ovata*? Otherwise Add keeps exactly what you typed." The button turned to "Add as typed", and the plant was filed as "Crassula ovata ’Gollum’": the whole string italic, no CULTIVAR mark, no GBIF key.
  - **With ‘Gollum’ or 'Gollum':** "GBIF 5362063 · cultivar", and the plant is filed as a cultivar with its key.
  - **The catalogue's search** reads ’…’ correctly ("Aloe ’Blue Elf’": `x-search-left: ’Blue Elf’`). So the picker and the search disagree.
  - **Genus-only cultivars:** `Echeveria ’Lola’` and `Aloe ’Blue Elf’` are read as species of the genus with no cultivar. Their straight-quote forms read as "hybrid, parentage not stated".
- **Cause.** `src/lib/core/names.ts:81`: `s.replace(/[‘'"](.+)[’'"]/, …)` does not accept ’ as an opening quote. The add form parses with it (`plants/new/+page.svelte:211`). The server's own comment (`api/search/+server.ts`, round 40) records that iOS writes apostrophes as ’ ("Lithops ’Ruby’").
- **What should happen.** A cultivar in any pair of single or double quotes is read as a cultivar, as the catalogue's search reads it.
- **Smallest fix.** Accept `’` (and `“ ”`) as an opener in `names.ts:81`, or turn a word-initial ’ into ‘ in `cleanTyped`. Add a unit test with ’…’.
- **Not proved here.** Whether the owner's iPhone keyboard writes ’ at the start of a word: see "Needs from the PC".

### S4. Major: /about/how says things on the live site that are no longer true

Each sentence below is live (fetched at 21:4x UTC) and in `src/routes/about/how/+page.svelte` at `ba78fb9`.

1. **"Kew's older names reach the search with the index uploaded after the daily fill … (due at the end of October 2026); until that upload, a search by one of Kew's names … finds nothing."**
   - The rest of the paragraph goes on in the same vein: "The same upload brings a hybrid's sign … sets apart the older names by another author (until then their rows say 'older name') and the names of the pages merged …".
   - That upload is live. The index carries `kew` on 10,673 entries, `hom` on 2,619, `merged` on 10, and the × on 485 names. "Haworthia attenuata" and "Echinocactus chrysacanthus" both find their pages.
   - A grower reads the site as half-finished. The paragraph should state the present behaviour.
2. **"The corrections to both of round eighty-three … reach a page when it is next derived, and until then its record of its sources says what was left out under the rules before them."**
   - The round 83 repair re-derived 18,407 pages and was uploaded on 29 October (pc-state).
   - Picea omorika's dossier is `built 2026-10-29T20:04`, with a climate from 7 records in 5 cells and records inside Serbia's shape, which round 80's shapes had lost.
3. **"…a species with no habitat climate on file gets no derived climate rows, and a hybrid gets none at all, since it has no habitat."**
   - 253 of the 485 hybrid pages have a habitat climate (index `climate: ok`).
   - `/species/mentha-piperita` shows a cold floor (−8.5 °C), the rain rule's reading and the season card.
   - The plant-page code shows "No habitat of its own" only for a cross with no species page (`plants/[acc]/+page.svelte:874`). The sentence should say that.
4. **"About 4,400 of the 37,788 pages with a climate on the live corpus of 23 October 2026."** The live index has 37,727 pages with a climate. Dated, but stale beside a corpus that is not the 23 October one.
5. **Search examples the live site does not give.**
   - "'Echinocactus chrys' … is Ferocactus chrysacanthus, after any species whose own name it is": the live answer is Parodia chrysacanthion first, which holds the name only as an older name.
   - "'cop' is Copiapoa and the other genera that begin so": Copaifera and Copernicia come first.
   - "'hens and chicks' is the Sempervivums' 'Hen-and-chicks'": Echeveria lilacina comes first, then S. tectorum.
   - /about/formats: "'Tecoma speciosa' is Campsis radicans before Tecomanthe speciosa": Handroanthus speciosus comes first.

- **The seam tests do not catch any of these.** All 14 files pass (193 tests). None of them:
  - reads a dated "until …" sentence against the corpus;
  - runs the search examples against a real index;
  - compares the hybrid sentence with the index.
- **Smallest fix.** Rewrite the five passages in the present tense, change or remove the four examples, and add a seam test that runs the page's quoted search examples through `search()` over a fixture with those species.

### S5. Major (clarity): /about/how is too long for a grower to read

- **What I measured.** On the live text: 22,753 words and 339 sentences, by a rough split.
  - 41 sentences run past 100 words and 15 past 200.
  - The longest, about photographs, runs to roughly 1,280 words. The search paragraph is one block of about 1,900 words.
  - /about/formats: 18,655 words; 31 sentences past 100 words.
- **Why it matters.** The "In brief" list is good. Below it, a grower who wants "where do the photographs come from" or "what is sent when I type a name" must read sentences of hundreds of words with nested brackets. The site's promise that the page states the method is kept to the letter, but not in a form a grower can check.
- **Smallest fix.** Keep the text, but break the six longest paragraphs into lists under the headings they already have (sources, photographs, search, names, privacy). Put a three-line plain summary at the head of each.

### S6. Minor: /about/formats states counts and fields of an older corpus

- **The key file's doc.** The page gives `[name, family, origin, common, commons, spellings, syn, older]`. The code's `Doc` (`search-files.ts:94`) has 11 fields, adding `kew`, `hom` and `merged`.
- **Answers.** The page gives `{ a, b?, t?, x? }`. The code adds `n`, the count since round 80 (`:105`).
- **The index entry's fields.** The list omits `hom` and `homBy`, which 2,619 live entries carry.
- **File counts "at the present size":**

  | Files | The page says | The code's own rule gives at 48,357 species |
  |---|---|---|
  | `cards/` | 256 | 1,024 (`lookups.ts:115`) |
  | `older/` | 128 | 512 (`:117`) |
  | `search/<n>.json` | sixty-four | 512 (`search-files.ts:112`) |

  The page's figures are those of round 77's 8,947-species corpus.
- **Fix.** Correct the field lists, and state the counts by their rule rather than as "the present size".

### S7. Minor: the merged page says its merged key comes from Kew's synonymy

- **What I saw.** `/species/echeveria-desmetiana`, line 83: "Its records are GBIF's under the keys of the names Kew's World Checklist holds as this plant: 4202274 …, 5688475 …, 7530398 (Echeveria peacockii, 0 records). No name was matched to GBIF; the keys are read from Kew's synonymy."
- **Why it is untrue.** Kew files Echeveria peacockii under Dudleya pulverulenta. Key 7530398 is read by the owner's merge, as the detail row a few lines down says correctly ("the key of a page merged here by the owner's decision").
- **For D.** The merged key now brings 0 records (GBIF's download of 21 October). The page's 26 records come from 4202274. Round 81's copy of g7530398 had 29 records in 22 cells.
- **Fix.** Name merged keys apart in that sentence.

### S8. Minor: the picker never says why a reference row is offered

- **What I saw.**
  - Typing "Haworthia fasciata" offers "Aloe humilis · has a species page, under another genus". It is reached through "Haworthia fasciata subsp. armata".
  - Typing "Sempervivum montanum" offers five other Sempervivum rows, each "has a species page", one of them by another author's name.
  - The catalogue's rows say "older name: …" and "older name under another author: …".
- **Cause.** `rowNote` in `SpeciesPicker.svelte:338-350` explains merged rows only.
- **Fix.** Reuse the catalogue row's line from `$lib/ui/ref/searched.ts` for local rows found by an older name.

### S9. Minor: the picker drops reference rows the catalogue finds

- **A name wholly in quotes:** `"Haworthia cooperi"` is parsed as a cultivar with no genus. The pill reads "hybrid, parentage not stated", nothing is asked, and no row appears. The catalogue lists Haworthia cooperi.
- **A pasted label with author, two ranks and a field number:** `Lithops lesliei (N.E.Br.) N.E.Br. subsp. lesliei var. lesliei C001 Kimberley` gives no reference row (only GBIF's). The catalogue lists Lithops lesliei first.
- **Cause.** The `offered` rule in `search()` requires a relaxed answer of exactly two words. The quote handling in `names.ts:81` treats a fully quoted name as a cultivar.
- **Fix.** Strip quotes around the whole field, as the server does. Offer the local rows when the relaxed words begin with the genus and epithet.

### S10. Minor: a typing error of two letters, or a genus misspelling near two genera, gives poor or no answers

- "lithops lesleyi" and "sansiveria" find nothing, not even Lithops or the Sansevieria-named Dracaenas. "sanseveria", one edit away, works.
- "mamillaria", one edit from both Mammillaria and Maxillaria, loses the genus word's order: M. albicoma comes first, where "mammillaria" gives M. heyderi, M. prolifera and M. elongata. "agava" lists Agave in the alphabet.
- "lithop" lists Lithophragma before Lithops. That is by the rule for several genera begun, but it is the commonest way to start typing Lithops.
- **Fix.** When nothing matches and the first word is a genus, or one edit from one, answer with that genus and say so, as is done for a capitalised cultivar. When a misspelling reaches several genera, order the nearest one's species by the genus word's order.

### S11. Minor: tie-breaks let a hyphen or a one-photograph page lead

- "century plant": Agave americana, whose headline is "Century-plant", comes 6th, behind four Agaves with 7 to 42 photographs whose headline is "Century plant". The cause is the "written as typed" tie-break, placed before photographs (`commonTie`).
- "ponytail palm": Beaucarnea recurvata comes 3rd, behind B. hiriartiae (1 photograph) and B. gracilis.
- "mother of thousands": Kalanchoe daigremontiana comes 5th.
- These follow the stated rule. I list them because a grower would call them wrong. Putting photographs before "written as typed" would fix the first.

### S12. Minor: odd readings worth knowing

- "aster" (a genus typed whole) also offers the region "Easter Is." under Andes & Chile.
- A pasted sentence is retried as "this is" and lists thistles.
- "peyote" misses Lophophora williamsii, which shows the headline "Indian-dope". GBIF's nine "Peyote" rows carry no language tag (dossier `k2337299`), so the English-name rule drops them, though the page's own Wikipedia quotation begins "Peyote, also known as Lophophora williamsii". This is data, for D.
- Non-English names sit among the English ones: "Ætihvönn" on Angelica archangelica, "Amor platónico" on Albizia lebbeck, and a stray "ا" after "Asian Indian mallow" on Abutilon auritum.
- "moth orchid" finds no Phalaenopsis: none in the index has an English name. This is round 81's C finding, unchanged, and data rather than search.

## Confirmed working

- **Scientific names:** 36 of 36 first, in any case and word order, abbreviated ("Eche eleg"), accented, full-width, with a soft hyphen, with commas, and with extra spaces.
- **Older names:** 12 of 12 to their pages, Kew's included ("Haworthia attenuata" goes to Haworthiopsis attenuata, "Echinocactus chrysacanthus" to Ferocactus chrysacanthus).
- **Older names by another author (`hom`):** 5 of 5, with the page of that name first and the holder after it. Sempervivum tectorum's row reads "Under another author Sempervivum montanum Sibth. & Sm. …".
- **The eleven merged names:** all 11 list the kept page first when typed in full, Ceropegia nubica and C. cereiformis included (Echidnopsis cereiformis). "peacockii" alone and the misspelling "Echeveria peacokii" keep Dudleya first, by design.
- **Hybrids:** found the same with ×, with x and with neither (Mentha × piperita, Fragaria × ananassa, Agave × leopoldii, Citrus × limon). `/species/mentha-x-piperita` answers 301 to `/species/mentha-piperita`.
- **Cultivars, qualifiers and authors:** quoted and unquoted cultivars, "cf.", "aff.", "sp.", "sp. nov.", field numbers and pasted authors are all answered by the species or the genus, with "leaving out …" headers.
- **Round 82's fixes:**
  - "peppermint" puts Mentha × piperita 1st and "rosemary" puts Salvia rosmarinus 1st.
  - "echeveria", "crassula", "gymnocalycium" and "galanthus" lead with E. elegans, C. ovata, G. mihanovichii and G. nivalis.
  - "rose" lists the roses first.
  - The picker writes "Lithops lesliei var. luteoviridis" and "Picea omorika f. pendula".
- **Round 83's merged page first:** live, in search and in the picker ("Echeveria peacockii is merged into this page; no key filed").
- **Addresses:** `/species/arbutus-uva-ursi`, `/species/echinopsis-pachanoi` and `/species/echeveria-peacockii` answer 302 as /about/how says. `/species/echeveria-farinosa` answers 404 and names both holders with their authors.
- **Picker against search:** the same reference rows in the same order for 172 of 189 queries (152 identical, 20 by similar spelling, marked as such). The other 17 are the deliberate cases (crosses, genus with cultivar, "sp.", one letter) plus S3 and S9.
- **Round 81's D6 (searches that never answered) is not reproduced.** All 675 of my search calls answered 200 (494 direct, 181 from the picker).
  - Speed: a first ask had a median of 539 ms, p90 1,073 ms and a maximum of 2.8 s (a pasted sentence; "hens and chicks" 2.6 s). A second ask in the same isolate had a median of 206 ms.
  - Picker from typing to rows, including a 500 ms settle: median 1.2 s, p90 2.2 s.
- **Regions:** "Namibia", "Cape Provinces" and "Mexico" return the region row. "cape prov" and "provinses" return "narrow" with the region, as /about/formats says. "a e" returns "narrow".
- **No-climate reasons:** specific and true on Lithops lesliei (66 in-range records, none placed to within 10 km), Curio rowleyanus and Haworthiopsis attenuata (one land cell). The few-records mark shows with both counts on Acharagma roseanum (3 records in 3 cells).
- **/about/how's other claims checked against the code:**
  - Today waits 15 s for the sheets and shows a "Resting months" "not checked" pill (`today/+page.svelte:132`, `:409`).
  - The frost bar's 72-hour rule (`frost.svelte.ts:19`).
  - Aloe 199 and Euphorbia 401 pages (index).
  - 485 hybrids (index).
  - The front strip's rule (`catalogue.ts:242`).
  - The search route's limits (`n` at most 100, default 60, `at` at most 2,000).
  - The search-file constants (200, 2,000, 12,000, 4,096, 16).

## Not checked, with why

- **The rest of /about/formats against the code:** the change log, backup and sync-wire sections, sentence by sentence (about 14,000 words). I read them, but checked only the search and dossier sections against the code in the time I had. C covers the sync and backup code.
- **Backup messages and the sync status card against their code:** not reached.
- **A WebKit run of the picker:** Chromium only here.
- **How many of the 422 set-aside pages carry S1's false wording:** that needs every such dossier, and I fetched only 9 dossiers to stay within budget.
- **The front page's rendered search rows** (as opposed to the API answers): the r82s and r83k browser specs cover them, and W and P walk them.

## Needs from the PC

1. **On the owner's iPhone, with the default keyboard and Smart Punctuation on:**
   - Open `/plants/new` and type `Crassula ovata 'Gollum'`, pressing the apostrophe key before and after Gollum.
   - Note which characters appear (‘ U+2018 or ’ U+2019) and whether the pill under the field reads "cultivar" or "Not a reference name".
   - Repeat by pasting `Crassula ovata ’Gollum’` from Notes.
   - Delete the plants afterwards, or do it in the example collection.

   This decides how often S3 happens on the owner's own device.
2. **Optional:** count the dossiers with `climate.extremesStatus === 'lapse'` whose `lapseSetAside` reason is not the elevation one:

   ```
   node -e "…for each s/v3/*.json with climate.extremesLapse: print lapseSetAside reason kind…"
   ```

   (or `npm run dossier -- --list-…` if one exists). That gives S1's page count.
