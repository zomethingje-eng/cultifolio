# Review S, round 85: search, names and the honesty of the claims

**Verdict: works with faults.** The catalogue's search is strong for the names a cactus, succulent or bulb grower types:

- every scientific name;
- every older name, including round 84's 501 changed headings and the old genera (Trichocereus, Notocactus, Neoporteria, Sansevieria, Brachystelma, Avonia, Ceropegia for the stapeliads);
- every hybrid, cultivar, "cf.", "sp." and pasted label.

All of these put the right page first, on the live site and in the code run over the whole live index. Round 84's fixes in my area mostly hold.

Two faults hit the most-grown plants and should be fixed before the site is shown:

1. **The add form mislabels accepted names.** It tells a grower who types **Aloe vera**, **Crassula ovata**, **Echeveria elegans**, **Cyclamen hederifolium** or **Phalaenopsis amabilis** that the name is "an older name of" *Aloe succotrina*, *Crassula sarmentosa*, *Echeveria harmsii*, *Cyclamen persicum* or *Phalaenopsis aphrodite*. It offers to file the plant there, and it swallows the first press of Add.
2. **A plant filed under the name GBIF gives a page's key loses its page.** This covers the old heading of any of the 501 pages Kew's names now head: Ceropegia alstonii, Avonia quinaria and the rest. The plant page says "No species page under this name", though its GBIF key is the page's. /about/how promises the opposite.

Two honesty faults follow:

- /about/how never says that a page's records are a sample (at most 2,000 a species from GBIF's download; the first 900 GBIF's search returns otherwise), and says "every record".
- About ten sentences and examples of /about/how went stale the day the walk was uploaded.

**Scores**

| Area | Score | Why | What would make it 10 |
|---|---|---|---|
| Search relevance | 8 | First hit right on 296 of 328 queries with a target (90%). Scientific, older, stapeliad, hybrid, cultivar, label: 100%. Common names: 42 of 59. | "tulip" and "baobab" obeying the stated rule; two-letter misspellings of big genera; San Pedro and peyote (data) |
| The picker against the search | 5 | Same reference rows as the search for 255 of 298 queries, and the rest are mostly by design. But the older-name line misfires on the commonest names and arms Add on them. | S1 and S2 fixed, and „…“ and «…» read as cultivars |
| /about/how, /about/formats, NOTICE | 6 | The mechanisms are true of the code. The live counts come in once the page runs; the field lists and file counts are right. The record sample is undisclosed, and ten passages went stale with the walk. | S3 and S4, and a seam test over the live index rather than a frozen fixture |
| Other claims a grower reads | 7 | The extremes causes are now right on every page I read. The few-records mark, the 404s and the merged-page sentences are right. Some smaller mismatches remain: set-aside extremes are filed as "nothing to report", "not checked" is used against the glossary, and a common-name row says "under another genus". | S8 to S10 |

**What I covered**

- **Live search:** 363 queries in 22 groups, each asked once (`/api/search?…&n=30`, corpus `8520c2875b2699ba`):
  - scientific 54, misspellings 34 (one and two letters), common names 61;
  - round-84 headings 24, old genera 15, older names 12, `hom` 5, merged 13;
  - hybrids 17, cultivars in every quote style 22, "cf."/"sp." 10, labels 7, long 4, Unicode 10, short 5, regions 5;
  - the about pages' examples 46, earlier claims 8.
- **The picker:** the same queries, typed into the live `/plants/new` in Chromium (service worker blocked, third-party hosts aborted): 298 queries (the about examples, regions and short queries left out). Rows, the line under the field after leaving it, and the requests sent.
- **Add-a-plant flows:** 5, each with screenshots in `S-s/add-*.png`. Aloe vera, Crassula ovata ’Gollum’, Crassula ovata „Gollum“, Echeveria elegans, Ceropegia alstonii.
- **Offline, with the code's own `search()` over the live index** (`S-s/dbg/off.ts`): the 363 queries, which agree with the live top five on 351; the other 12 differ only by the server's own layers. Also all 501 old headings, and a random 4,500 older names.
- **Pages:** /about/how, /about/formats and the front page read in full, plus `NOTICE`. The 23 species pages and 10 old or ambiguous addresses fetched are listed below the table.
- **Data:** D's 266 dossiers of today (`D-s/dos/`, read-only).
- **Tests:** `r84a-about` and `r84m-merge`, 42 passed.
- **Requests:** 1,520 to cultifolio.com in all, which reached the limit, so I stopped there.
  - 403 were direct: 363 searches, pages and addresses.
  - 1,117 came from the browser runs, 477 of them the app's immutable files.
  - Never more than two a second. None to third-party hosts.
- **Speed:** a search answered in a median of 367 ms (p90 920 ms, max 3.3 s; all 363 answered 200). The picker took a median of 3.0 s from the first keystroke to its rows and its line, with my 0.9 s of settling included.
- **Scratch:** `/tmp/claude-0/rev85r/S-s/`. `search-results.json`, `picker-results.json`, `addflow.log`, `pages/`, `dbg/`, `heading-changes.json`, `heads-held.json`.

**Pages and addresses fetched**

- **Species pages (23):** aloe-vera, cedrus-deodara, selenicereus-monacanthus, oreocereus-trollii, opuntia-galapageia, eulychnia-acida, hoodia-alstonii, huernia-zebrina, echinopsis-macrogona, echeveria-desmetiana, ferocactus-hamatacanthus, lithops-lesliei, acharagma-roseanum, galanthus-nivalis, abies-marocana, crassula-ovata, echeveria-elegans, and others.
- **Old or ambiguous addresses (10):** /species/echinopsis-pachanoi, ceropegia-alstonii, sprekelia-formosissima, othonna-lineariifolia, conophytum-calculus-vanzylii, dypsis-lutescens, ceropegia-edulis, ceropegia-tanzaniensis, echeveria-farinosa, agave-virginica.

## Issues

### S1. Blocker (the add form, the most-grown plants): an accepted name is called "an older name of" another species; the first Add press is taken to say so

- **What I did.** I typed names into the live `/plants/new` and left the field (`picker-results.json`). I added five plants (`addflow.log`; `add-0-b.png`).
- **What I saw.**
  - **Typing "Aloe vera":** the list's first row is "Aloe vera · has a species page", and the pill reads "GBIF 2777724". The first press of **Add** does not add. The button turns to "Add as typed" and the line reads: "An older name of *Aloe succotrina*, which has a species page: pick it, or press “Add as typed” to keep exactly what you typed." The second press files Aloe vera, linked to its page.
  - **The same line on other accepted names in my run** (14 of 298 queries, plus every form of the Gollum cultivar):

    | Typed | Line names |
    |---|---|
    | Crassula ovata, and Crassula ovata 'Gollum' in ' " ‘’ “” and cv. | Crassula sarmentosa |
    | Echeveria elegans, in any case and in full-width | Echeveria harmsii |
    | Cyclamen hederifolium | Cyclamen persicum |
    | Phalaenopsis amabilis | Phalaenopsis aphrodite |
    | Sempervivum montanum | Sempervivum caucasicum |
    | Mentha canadensis | Mentha arvensis |
    | Platanus occidentalis | Platanus racemosa |
    | Agave hookeri | Agave inaequidens |
    | Allium senescens | Allium angulosum |
    | Echeveria peacockii (merged into E. desmetiana, which the list puts first) | Dudleya pulverulenta |

  - **Across the index,** 3,021 headings are another page's exact older name or another author's name (`heads-held.json`). Each can draw the line when that page is among the picker's six rows.
  - **Where the line is right,** it is good: Haworthia attenuata, Sansevieria trifasciata, Ceropegia alstonii, Chamaecereus silvestrii and 41 more true older names.
- **Why it matters.** A first-time grower adding the three commonest succulents is told their plant's name is someone else's, and is offered a link that would file it as another species.
  - The press lost under the line is the fault round 84 set out to end. Review-c C2 was "Add armed 'Add as typed' for a name the reference holds"; that has come back by another path.
  - Rule 3 (no guessing): the line asserts a relation the data does not hold. Aloe succotrina's record holds "Aloe vera Mill." as another author's name, not as an older name of the grower's plant.
- **Cause (from the code).** Each part:
  - `SpeciesPicker.svelte:427`: `olderOfTyped` takes a row whose `older` **or `hom`** name equals the typed name.
  - `:434`: `olderRow` excludes only a row that *is* the typed name. It never asks whether such a row exists, that is, whether the typed name has its own page.
  - `olderFirst()` (`:377-383`) then arms Add on the first press.
  - `r84k-picker.spec.ts` 6 tests only the true-synonym case (Aloe aristata), never an accepted name.
- **Smallest fix.** No `olderRow` when a local row's name equals the typed name, or when the name service answers the typed name as an accepted species. Never from a `hom` (another author's) name. A merged row wins over an older-name row. Add a negative test: "Aloe vera" and "Crassula ovata 'Gollum'" file on one press with no line.
- **Done looks like.** No accepted name of the reference draws the line. A test runs every heading of a fixture that another entry holds as `syn`, `older` or `hom`.

### S2. Major (a grower's plants, rule 5): a plant filed under GBIF's name for a page's key has no species page, though it carries that page's key

- **What I did.**
  - I typed "Ceropegia alstonii" (Hoodia alstonii's old heading) on `/plants/new`.
  - I pressed "Add as typed" after the correct line "An older name of Hoodia alstonii", as a grower keeping the label's name would.
  - The plant was filed with GBIF key 9269454, which is Hoodia alstonii's (`gbif` in the index).
- **What I saw.** The plant page (`add-4-c.png`) reads "Added 2026-10-31 · No species page under this name · Is it an older name?". It has no species link, no habitat beside its space, and no sheet.
- **Who it affects.**
  - **Every plant a grower recorded before 30 October under the heading of one of the 501 pages Kew's names now head.** These include 268 Apocynaceae (the stapeliads), 19 Anacampseros, 34 cacti such as Chamaecereus silvestrii and Hatiora gaertneri, Sprekelia formosissima and Albuca bracteata. Each such plant lost its link at the upload. Its key is unchanged and still the page's.
  - **Any new plant filed by GBIF's name.**
- **What the about pages promise.**
  - `/about/how` line 82: "A plant you recorded under the old heading keeps its name and its GBIF key, and the key still leads to the page."
  - Line 704: "a plant, an older name and a GBIF key in an address all find their page".
- **Cause (from the code).** `sheetForNameOr` (`src/lib/ui/index.svelte.ts:331-350`) finds a plant's sheet by the slug of its name alone. The key is used only to choose between homonyms when the slug answers, so an old heading's slug answers 'none'. The cards' `@<GBIF key>` map, which formats says exists for this, is not consulted.
- **Smallest fix.** When the slug answers 'none' and the plant has a key, look the key up through the `@<key>` map (one more bucket). Show that page, with "filed under GBIF's name Ceropegia alstonii", writing nothing.
- **Done looks like.** A test with a plant "Ceropegia alstonii" with key 9269454 whose page shows Hoodia alstonii's habitat.

### S3. Major (rule 5): /about/how says every record is read; the build reads a sample, and the pages say "all"

- **What /about/how says.**
  - Line 498: "The build takes every georeferenced record with no flagged geospatial issue."
  - Line 543: "The habitat climate is read across every well-placed wild record."
  - Line 171: "Records come from GBIF under the page's own key, as GBIF held them on the day it made the download."
- **What the code does.**
  - **From the download:** at most 2,000 records a species, a uniform sample by a hash of each record's id (`src/lib/dossier/bulk.ts:684`, `cap = 2000`). `docs/SCALE-STUDY.md:340` and `docs/DEPLOY.md:367` say so, but no page a grower reads does.
  - **From GBIF's search API:** the first 900 records GBIF returns (`sources/gbif.ts:409-421`, 3 pages of 300). That is GBIF's order, not a sample.
    - About 8% of D's 266 dossiers took this path, Galanthus nivalis among them.
    - /about/how mentions "up to 900 records a key" only for *other* keys (line 172).
- **What the pages show.**
  - Galanthus nivalis's page (API path) says "The map marker rests on **all** 156 georeferenced records inside the native range". GBIF holds tens of thousands of native-range records of the species, and 528 of its 900 were outside the range.
  - In D's sample, 16 dossiers sit at 1,400 to 2,300 records, at the cap: Dionaea muscipula 1,932, Sarracenia flava 1,933, Ipomoea pes-caprae 2,000.
- **What should happen.** /about/how should say what the build reads: "At most 2,000 records a species are read from GBIF's download, a uniform sample by a hash of each record's id; a species read through GBIF's search takes the first 900 it gives." The pages should say "all N of the records read".
- **For D and C.** Whether the API path's first 900 bias a page's climate (GBIF's default order) is a data question.

### S4. Major (rule 5): ten passages of /about/how went stale with the walk; the seam test cannot see it

The walk re-derived every page on 30 and 31 October (D's 266 dossiers: built 2026-10-30/31, 265 tested by `r84`, none with papers). These sentences (`src/routes/about/how/+page.svelte`) are now false, empty or out of date.

| Line | What it says | Why it is wrong now |
|---|---|---|
| 44 | "Rules of 30 October 2026 (…) reach a page when it is next built." | Every page was built by them. |
| 81 | "A page built before 30 October 2026 may still be headed by GBIF's name for its key, which on about 500 pages was not Kew's." | No such page is left. |
| 360 | "A page built before October 2026 may still list papers OpenAlex gave." | No such page is left. `NOTICE` line 33 lists OpenAlex "(papers listed on pages built before October 2026)" for the same pages. |
| 396 | "A reference built before 30 October 2026 chose them otherwise." | No such page is left. |
| 520 | "A page whose record names no test… one that names no rule of the shapes was tested before 30 October 2026." | No such page is left. |
| 657 | "A page built before October 2026 has no such median…" | No such page is left. |
| 458 | "/species/echinopsis-pachanoi is Trichocereus macrogonus" | It is now Echinopsis macrogona (302 to `/species/echinopsis-macrogona?was=Echinopsis%20pachanoi`). It is reached by Kew's older name, so it no longer illustrates the backbone path either. |
| 295, 296, 349 | "Huernia zebrina" for Ceropegia zebrina; "Zephyranthes formosissima" for Sprekelia formosissima (twice) | Both pages are now headed by those very names, so the examples show nothing. |
| 347 | "…the page's Othonna lineariifolia" | The page is now Othonna linearifolia; the old address answers 302. |
| 332, 333 | Parrycactus flavovirens, and "Wikidata's item for Bisnaga glaucescens is Ferocactus glaucescens" | Both pages are now headed by Kew's names, so the examples lean on the old headings. |
| 563 | "On the reference of 29 October 2026, 4,839 of the 37,727 pages…" | Dated, but the live reference has 37,648. |
| 409 | '"Black eyed Susan" is Rudbeckia hirta and the other black-eyed Susans' | Live, Callilepis laureola ("Black Eyed Susan") comes first and R. hirta second. The example is not marked `data-first`, so the test passes; the sentence reads as an order. |

- **The live counts are right.** /about/how reads "now holds 48,357 species pages in 6,493 genera, and 37,648…" once its script runs. The server's HTML says "on 29 October 2026 … 6,529 genera … 37,727", which is dated and fine.
- **Why the test missed these.** `tests/unit/r84a-about.test.ts` §4 runs the examples over `fixtures/r84a-search-examples.json`, the 29 October index. Its own `data-order="Trichocereus macrogonus"` would fail on today's index. The rest of these sentences are not examples, so no test reads them.
- **Smallest fix.**
  - Drop the six "built before" conditionals, or move them to one "Older pages" note.
  - Re-pick the five examples from current headings.
  - Mark the Black-eyed Susan example honestly, or reword it.
  - Remove the OpenAlex line from NOTICE.
  - Point the seam test at a fixture regenerated from the index each upload. `--index` could write the examples' entries.
- **Done looks like.** No sentence of /about/how speaks of a state no page is in, and the seam test fails when an example's page is renamed.

### S5. Major (search, bulbs): "tulip" and "baobab" break the page's own common-name rule

- **What I saw (live, `/api/search?q=tulip&n=60`).**
  - **"tulip":** Liriodendron tulipifera, Heritiera littoralis, Haemanthus coccineus, Harpullia pendula, Spathodea campanulata… The first Tulipa, T. gesneriana ("Garden tulip"; it holds "Tulip"), is **42nd of 104**. A grower sees 30 rows with no tulip.
  - **"baobab":** A. gregorii and A. za come before A. digitata ("Baobab").
- **The stated rule.** /about/how: "Of the species that hold a one-word query as a name, one whose shown English name holds the word too comes first, wherever the name stands among its others". T. gesneriana holds "Tulip" and shows "Garden tulip"; A. digitata holds and shows "Baobab". The offline run over the whole index gives the same order (`dbg/rank.ts`).
- **Cause.** Not traced. I suspect the round-84 shared-headline demotion (`name.shared`) or the photograph tie-break placed before the exact rule.
- **Fix.** Make the exemption cover a species that holds the word exactly as a one-word name, and test "tulip" and "baobab".

### S6. Minor (search): two-letter misspellings, nothogenera and common names still answer poorly

- **Two-letter misspellings** (live):
  - "sansiveria" and "sansevera" give two obscure Dracaenas (D. hanningtonii, D. hyacinthoides), not the snake plant.
  - "mamilaria" gives Cocos nucifera and Pelargonium crassicaule.
  - "euforbia obesa" gives nothing.

  "lithops lesleyi" and "trichocerus pachanoi" now work.
- **A regression from round 84's shorter-reading retry:** "x Gasteraloe" and "× Gasteraloe" answered nothing on 29 October. Now they answer "similar spelling" Solidago ulmifolia and Salvia microphylla.
- **Common names whose plant is not first:**
  - saffron: Elaeodendron croceum first, Crocus sativus 2nd;
  - hens and chicks: S. marmoreum first;
  - ponytail palm: B. gracilis first;
  - mother of thousands: K. daigremontiana 5th, behind Soleirolia;
  - water lily: N. alba 5th;
  - crown of thorns: Koeberlinia spinosa first;
  - moth orchid: 20 unrelated orchids by "similar spelling" (moth → mouth).
- **Data, left by round 84, for D:**
  - **"San Pedro":** Desmodium batocaulon, then Echinopsis cuzcoensis, and no E. macrogona. The picker's line offers "Did you mean Desmodium batocaulon?". This is queued.
  - **"peyote":** L. williamsii not listed.
  - **"living stones":** one Lithops.
  - **No English names in the index:** "starfish flower", "pregnant onion", "lifesaver plant" and "dragon fruit" answer nothing. Selenicereus undatus holds only "Nightblooming Cactus".
- **Fix for the first two.** When a misspelt genus is nearest to one genus of the reference, answer that genus. Never offer a near spelling of a shortened reading when the word typed is a nothogenus (× or a leading x).

### S7. Minor (the picker against the search): what the picker does not read as the search does

- **„…“ and «…»:**
  - "Crassula ovata „Gollum“" is read as a name nobody holds: "not in the backbone · Not a reference name". It is filed as "Crassula ovata „Gollum“" with no CULTIVAR mark (`addflow.log`).
  - The search reads it as Crassula ovata.
  - /about/how line 437 says "any quotes". `names.ts:76` `QUOTES` lacks „ « ».
- **"lithops lesleyi"**, the about page's own example: the catalogue finds Lithops lesliei; the picker offers no reference row ("not in the backbone, kept as typed"). The `offered` rule rejects a relaxed reading "lithops lesle".
- **A false row note.** A row found by a common name says "has a species page, under another genus" ("jade plant" gives "Crassula ovata · has a species page, under another genus"; "tulip", "San Pedro cactus"). `rowNote` reads `far` (the typed first word against the genus) for a common name (`SpeciesPicker.svelte:403`).
- **A keyless page's row.** "Echinopsis cuzcoensis · its species is in the reference; no key filed" for a page with no GBIF key: it *is* the species.
- **Fix.** Add „ ‚ « » ‹ › to `QUOTES`. Let `offered` accept a relaxed reading that is the typed genus and the start of the epithet. Set `far` only when the hit came by a scientific name.

### S8. Minor (rule 2's words): extremes read and set aside are filed as "nothing to report"

- **What I saw.** Every page whose extremes were set aside (Aloe vera, Cedrus deodara, Eulychnia acida, Selenicereus monacanthus, Oreocereus trollii) lists "Daily extremes (NASA POWER) climate.extremes **nothing to report**". Its detail then gives 44 years of POWER data.
  - The sea case (Opuntia galapageia) says "answered … read, and set aside".
  - The page's own key says "Only 'nothing to report' is ever shown as an absence".
- **Cause.** `build.ts:474` (and `build-kew.ts:279`) map `extremesStatus 'lapse'` to `'none'`.
- **Fix.** `'ok'` with the detail, as for the sea cell (step 2, or at display).

### S9. Minor (rule 2's words): "not checked" for a source the build did not ask

- **What I saw.**
  - Abies marocana's page: "GBIF's records not checked. GBIF files this species' names under Abies pinsapo".
  - The front page's chip: "No climate, 9,789, 920 not checked", the 920 being `pending`.
  - /about/how's own list says such a page "has its GBIF records not asked … and each says 'not checked'".
  - Its glossary defines "Not checked" as "refused or failed" and "Not asked" as "a source the build skipped".
- **What should happen.** One word: "not asked" for a skip, as the glossary says, or a glossary entry that covers this case.

### S10. Minor (names): old addresses and one merged name

- **`/species/conophytum-calculus-vanzylii`** (the old heading, before its rank word was added) answers 404 "No species page for …", with "Did you mean Conophytum calculus subsp. vanzylii?". Line 80 says GBIF's name's "old address moves to the page". It is one page, in the owner's genus. Add the old spelling to the page's older names.
- **Old headings that now lead to another page first** (offline, 5 of 501):
  - "Ceropegia modesta": Ceropegia modestantha first, Duvalia modesta 2nd;
  - "Ceropegia edulis": Ceropegia edulissima first;
  - Ceropegia tanzaniensis, Erythrina caffra and Rhododendron roseum: another holder first.

  An accepted name that only *begins* with the epithet outranks an exact older name. That follows the stated order, but a grower would call it wrong.
- **`/species/ceropegia-tanzaniensis`** (k3313620's old heading) answers "this name as written is not among them". Kew's file holds the name under C. cordiloba, which it does not mention. /about/how allows this ("except where Kew's file holds that name for another plant").
- **The merged list.** /about/how's list of `scripts/merged-pages.txt` (line 121) leaves out **Rebutia fidana into Weingartia fidana**, the eleventh line.

### S11. Minor (clarity): /about/how is still 23,020 words

- **What changed.** Every sentence is now 60 words or fewer (0 over 60; 38 over 40), and each section opens with a short summary. That is a real gain.
- **What did not.** The page is longer than before (22,753 words), and /about/formats is 20,663.
- **For a grower.** "Who writes the words", "A refusal is not an absence" and the summaries are readable. The 1,229 sentences under them are an audit trail.
- **Done looks like.** The how page under about 6,000 words, with the per-source rules moved to a "Method in full" page.

### S12. Minor (names shown): a few non-English names remain

- "Ætihvönn" (Icelandic) on Angelica archangelica.
- "Wild Bell Appleˌ" with a stray modifier letter on Passiflora actinia.
- 19 names with Spanish accents ("Cardón Cactus"), which are fine.

## The round-84 reviews' findings in my area

| Finding | Status | Evidence |
|---|---|---|
| S1 (D1, A3) extremes' wording | **Fixed** | The three causes and the sea case each word their own reason on 6 live pages. |
| S2 the shared one-word name | **Half** | Snowdrop, stonecrop, squill, pepper and mint are first. Saffron is 2nd. Tulip (42nd) and baobab (3rd) break the rule (S5). |
| S3 a cultivar in ’…’ | **Fixed** for ' " ‘ ’ “ ” and cv. **Left** for „ « » (S7). | |
| S4 /about/how stale | **Half** | The old "until …" passages are gone; new ones appeared with the walk (S4). |
| S5 too long | **Half** | Sentences of 60 words at most, but 23,020 words (S11). |
| S6 /about/formats fields and counts | **Fixed** | The doc's 11 fields, the index's 22 fields and the file counts by rule all match. |
| S7 the merged key "from Kew's synonymy" | **Fixed** | Echeveria desmetiana and Ferocactus hamatacanthus. |
| S8 the picker says why | **Fixed** ("older name: …", "under another author") | But a false "under another genus" on common-name rows (S7), and the older-name line misfires (S1). |
| S9 the picker drops catalogue rows | **Fixed** | "Haworthia cooperi" in quotes and the Lithops label are offered. |
| S10 two-letter typos | **Half** | "lithops lesleyi" in the catalogue only. "sansiveria", "mamilaria" and "euforbia" are poor. A new junk answer for "x Gasteraloe" (S6). |
| S11 tie-breaks | **Half** | Century plant is 1st. Ponytail palm is 2nd; mother of thousands is 5th. |
| S12 odd readings | **Half** | "aster" no longer offers Easter Is. Peyote is left (data); Ætihvönn is left. |
| A8 San Pedro | **Half** | "Trichocereus pachanoi", "Echinopsis pachanoi" and "Trichocereus peruvianus" find E. macrogona first. "San Pedro" typed does not (queued). |
| A15 `offline-tried` in "every key" | **Fixed** | |
| A20 NOTICE's sources | **Fixed** (ETOPO, Wikidata, Natural Earth) | The OpenAlex line is now stale (S4). |
| C2 Add armed "as typed" for a name the reference holds | **Regressed** by another path (S1) | |
| W6 an older name asks once | **Fixed** for true older names | It is over-applied (S1). |
| Triage: search examples the site no longer gave | **Fixed** for the four named | Black-eyed Susan's order is not as worded (S4). |

## Confirmed working

- **Old names reach their new pages.**
  - All 24 round-84 old headings I typed live, and 496 of the 501 offline, put their new page first. That includes Ceropegia alstonii (Hoodia alstonii), Ceropegia mixta (Orbea variegata), Avonia quinaria, Chamaecereus silvestrii and Sprekelia formosissima.
  - So do 15 of 15 old-genus names.
  - 99.3% of 4,500 random older names typed exactly find their single holder first. The rest have a second holder by Kew.
- **Old addresses** answer 302 to the right page with `?was=` and `max-age=86400`: ceropegia-alstonii, trichocereus-macrogonus, sprekelia-formosissima, othonna-lineariifolia, agave-virginica, arbutus-uva-ursi and echeveria-peacockii. mentha-x-piperita answers 301.
- **Names held by two pages** answer 404 naming both holders with their authors: echeveria-farinosa, dypsis-lutescens and ceropegia-edulis.
- **Hybrids** with × and with x, **cultivars** in ' " ‘ ’ “ ” and cv., "cf.", "aff.", "sp.", "sp. nov.", authors, field numbers and full-width text: the right species or genus, with "leaving out …" said.
- **The picker against the search:** the same reference rows in the same order for 255 of 298 queries.
  - The list was never open after leaving the field: 0 of 298.
  - Every `/api/search` and `/api/names` call answered.
- **Species-page claims:**
  - The few-records mark, with both counts, on Aloe vera (4 in 4) and Acharagma roseanum.
  - Lithops lesliei's no-climate reason is specific and true.
  - The merged pages' key sentences are right.
- **/about/how's checkable figures:** 485 hybrids; Aloe 199 and Euphorbia 401; 14 `g` pages; the live counts; the 60-word limit.
- **/about/formats:** the index entry's fields, the key doc's fields, the answer shape, and the row, card, older and directory file counts at 48,357.

## Not checked, with why

- **/about/formats' log, backup, sync and limits sections against the code:** C's area, and I ran out of time.
- **Today, the frost bar, backup messages and the sync status card in a browser:** the request limit was reached. The code for Today's 15-second wait and "Resting months not checked", and for the frost bar's 72 hours, agrees with /about/how.
- **A WebKit run of the picker:** Chromium only here. P's walk covers the add form.
- **Which ranking rule demotes Tulipa** (S5): cause not traced.
- **How many existing plants S2 strands:** that needs growers' devices.
- **NOTICE against the national checklists** GBIF's distributions bring where Kew has no entry: none in D's sample used them.

## Needs from the PC

1. **S2's reach on the owner's own collection.** On the iPhone, open My plants and search "Ceropegia", "Avonia", "Chamaecereus", "Hatiora" and "Sprekelia". For each plant, does its page say "No species page under this name"? Note how many.
2. **S3's size.** Over the published dossiers, count the pages by path and those at the cap:

   ```
   node -e 'const fs=require("fs"),p=process.argv[1];let a=0,api=0,c2=0,c9=0;for(const f of fs.readdirSync(p)){if(!f.endsWith(".json")||f==="manifest.json")continue;const d=JSON.parse(fs.readFileSync(p+"/"+f));const o=d.occurrences||{};const n=(o.nOpenInRange||0)+(o.nRestrictedInRange||0)+(o.nOutsideRange||0);const det=((d.upstream||{})["gbif.occurrences"]||{}).detail||"";a++;if(/search API/.test(det)){api++;if(n>=880)c9++}else if(n>=1950)c2++}console.log({pages:a,api,apiAtCap:c9,downloadAtCap:c2})' <the walk's dossier folder>
   ```
3. **Optional:** the iPhone's keyboard with Smart Punctuation typing `Crassula ovata 'Gollum'`: which quotes appear. They are read correctly unless they are „ or «.
