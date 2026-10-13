# Self-review of round sixty-nine, reviewer C: every photograph on a species page

Working copy `/tmp/claude-0/rev69/C` at the deployed code; nothing in it is changed (`git status` clean after the mutation run). Live site, corpus `540c129738556840`; Commons' API and `upload.wikimedia.org`, GBIF. Requests were paced at one a second or slower. From about 15:05 UTC Commons' API answered 429 to every request from the shared address, so two scans were cut short (see "Not done").

## Findings

### 1. A photograph of another plant leads Othonna daucifolia: only the species' own genera are read (confirmed)

`src/lib/dossier/photo-kind.ts:64-75` (`namesAnother`) looks for another epithet only after a genus of the species or of an older name. A title naming a species of any other genus passes.

- `GET /api/dossier/9251599` (Othonna daucifolia; older names Doria abrotanifolia, Othonna abrotanifolia) shows two photographs, both `File:Euryops abrotanifolius 160732946.jpg` and `…161040712.jpg` (Tony Rebelo, CC BY-SA 4.0). Commons' description reads "Mountain True-Eye (*Euryops abrotanifolius*)": a shrub of another genus that a bot filed under the Othonna category because the older epithet is the same. It is the page's lead and the index tile (`/api/index`: `"thumb": …/500px-Euryops_abrotanifolius_160732946.jpg`).
- `npx tsx` with `commonsKind('File:Euryops abrotanifolius 160732946.jpg', {scientific:'Othonna daucifolia', synonyms:['Doria abrotanifolia Harv.','Othonna abrotanifolia (Harv.) Druce']})` returns `null`.

Fix: a title that opens with a capitalised genus and a lowercase epithet, where the genus is none of the species' own, is "named as another species" unless the binomial is an older name.

### 2. Stored dossiers keep no categories, so a stamp, a plate and two unidentified plants lead pages (confirmed)

K's report says the category test "acts on new answers only" and that a re-ask of about 90 requests would find the rest. The cost is on the pages now. I re-read Commons' categories for 199 of the 576 Commons-led index tiles (50 titles a request) and ran `commonsKind` with them. Four of the 199 leads are files the category rule removes:

- **Colchicum macedonicum** (2740003): the only photograph and the lead is `File:Colchicum macedonicum.jpg`, 189 pixels wide, credited "Македонская почта" (Macedonian Post), categories "Plants on stamps of North Macedonia | Stamps of North Macedonia, 2003". A postage stamp.
- **Cyphostemma adenopodum** (4053092): the lead and tile is `File:Cissus adenopodus 135-8278.jpg`, credited "M.S. del., J.N.Fitch lith.", category "Curtis's Botanical Magazine, Volume 135". A lithographed plate leads because "Cissus" sorts before "Cyphostemma" and both hold the epithet.
- **Colchicum raddeanum** (2739906): the lead `File:Plants of Artavaz 016.jpg` is filed under "Unidentified Liliales in Armenia".
- **Adenia subsessilifolia** (5527900): the lead is filed under "Unidentified Euphorbia".

Two more leads are herbarium sheets that neither rule reads: `File:Cyphostemma camerounense-NMNH-01150553.jpg` (Cyphostemma camerounense, 4052769, the only photograph; Commons: "Specimen Count 1 Barcode 01150553 USNM Number 550119", category "Plants in the National Museum of Natural History, USA") and `File:Zanha golungensis-NMNH-14824184.jpg` (3785189, the only photograph). Ceropegia radicans (7150600) shows five "(AM AK289462-1)"-style files from the Auckland Museum (a cut stem on card with a scale bar), as Commiphora marchandii's "(AM AK377420)" sheet was hidden only for its "aff.".

Fix: re-read categories for the 4,146 shown Commons files (about 83 requests of 50 titles), store each file's verdict (or its categories) in the dossier, and add `-NMNH-\d+`, `\(AM AK\d` and "Plants in the National Museum of Natural History" to the title and category rules.

### 3. Group photographs and non-plant subjects pass (confirmed)

- `File:Parodia Liberec 1.jpg` (Karelj, public domain) is shown on Parodia ritteri (3947849), P. comarapana (7281971) and P. hausteiniana (3949766). Commons: "Several cactuses of genus Parodia: Parodia camargensis, Parodia comarapana, Parodia lecoriensis, Parodia hausteiniana, Parodia purpuroaurea … and P[arodia maassii]", filed under six species' categories. No rule reads a file filed under two or more species of one genus.
- Plectocephalus americanus (3128990) shows `File:Leaf-footed Bug nymphs (Coreidae, Leptoglossus) on Centaurea americana (27334442305).jpg`, a photograph of insects, and `File:Centaurea nutallii.jpg`, whose description strikes the name: "*Centaurea* sp. ~~C. nuttallii~~".

Fix: on a new answer, a file in two or more species categories is a group and is left out; add insect and "nymph" words, or require the binomial to open the title, for the first.

### 4. A file whose title says "hybrid" is shown, against /about/how (confirmed)

`/api/dossier/3702113` (Nepenthes rhombicaulis) shows `File:Nepenthes rhombicaulis hybrid.jpg` (Commons: "*Nepenthes rhombicaulis* × *Nepenthes spectabilis*?"). `isHybrid` (`photo-kind.ts:96-100`) reads only "×" and " x "; "hybrid" is in `NOT_EPITHET`, not in any rejecting rule. /about/how says a file whose name marks it as "a hybrid" is not shown. `commonsKind('File:Nepenthes rhombicaulis hybrid.jpg', …)` returns `null`.

Fix: add `\bhybrids?\b` to `TITLE_KINDS` (it is already in `CATEGORY_KINDS`).

### 5. `misspelt` reads real species of one genus as one (confirmed in code; no live crossing found in what I could check)

`photo-kind.ts:84-93`. The round's account says two letters apart "stays another species (Conophytum minimum and minutum)". One letter apart is often another species too. In the live index (`/api/index`, 8,947 entries), these accepted pairs of one genus pass `misspelt`, so a file titled with one is the other's own:

Drosera macrophylla / D. microphylla; Ledebouria ovalifolia / L. ovatifolia; Stephania macrantha / S. micrantha; Stephania suberosa / S. tuberosa; Ceropegia johnsonii / C. johnstonii; Ceropegia cubiformis / C. tubiformis; Ceropegia radians / C. radicans; Cyphostemma maranguensis / C. marunguensis; Echinocereus scheeri / E. schereri; Dorstenia crenulata / D. renulata.

`commonsKind('File:Drosera microphylla 1.jpg', {scientific:'Drosera macrophylla'})` returns `null`; so do the Ledebouria, Stephania and Ceropegia johnstonii cases. Through older names, 34 more species read another accepted species' files as their own. For example, Drosera aliciae's older name "Drosera spathulata" reads D. spatulata; four Babiana with "Babiana stricta var. …" read Babiana striata; Crassula natalensis's "Crassula rubescens" reads C. pubescens. None of the pages I fetched showed a crossed file. The Commons category scan that would say whether one is waiting for the next rebuild was stopped by the 429s.

Fix: take a one-letter variant as the species' own only when no species of the reference (the index the build already holds) has that spelling or one within a letter of it.

### 6. An infraspecific older name makes another species "own" (confirmed)

`binomial` (`photo-kind.ts:50-53`) cuts "Babiana stricta var. purpurea" to Babiana stricta. That binomial joins the species' own names, so on Babiana purpurea's page a file titled "Babiana stricta" is the species'. The same holds for Haworthia monticola ("H. chloracantha var. monticola"), Aeonium rubrolineatum ("Aeonium arboreum var. rubrolineatum") and Acer saccharum ("Acer nigrum var. glaucum"). `commonsKind` returns `null` for each. In the live index, 788 infraspecific older names on 640 species cut to another accepted species. That is a floor, since the index keeps only six older names a species.

Fix: from an older name with a rank marker, take the genus and the last epithet, not the first.

### 7. Five files named as Nepenthes lamii lead Nepenthes monticola: run-together names are not read (confirmed)

`/api/dossier/7219396` shows only `File:Nepentheslamiiupperpitcher2800.jpg`, `Nlamiiupper2800.jpg`, `Nepentheslamiiplant2800.jpg`, `Nlamii2rosette2600.jpg` and `Nlamii2pitcher2600.jpg`. Each description reads "*Nepenthes lamii* from Western New Guinea"; a later editor filed them under N. monticola. N. lamii is its own page (3702141), led by the same photographer's series. A title naming one accepted species and a filing naming another is not unambiguous (rule 3). The regex needs a space after the genus, so "Nepentheslamii" and "Nlamii" are never read. K noted "Neptenuis" for N. dubia, where the files are the species; here they are not.

Fix: also match a genus or its initial run together with an epithet of another species of the genus.

### 8. Commons credits that name no author, or more than the author (confirmed)

`commonsAuthor` (`photo-credit.ts:44-54`) strips tags with no space and drops only a trailing "(talk)". Live credits, all under CC BY or CC BY-SA:

- Plectocephalus americanus: "Dwight Sipler [2]Uploaded by uleli". The Artist is `Dwight Sipler <a class="external autonumber">[2]</a><small>Uploaded by <a>uleli</a></small>`.
- Graptopetalum bellum (tile and four files): "Guérin Nicolas (messages) 19:48, 25 September 2008 (UTC)", a signature with its talk link and time.
- "Marco Schmidt [1]" (Boswellia dalzielii tile), "Kurt Stüber [1]" (Dorstenia urceolata and Pinguicula agnata tiles).
- Agave cocui's lead (CC BY 3.0): "(MiNombre", a template's unfilled "MyName". In substance this is a CC BY photograph shown with no author.
- "manfred.sause@volloeko.de" on the Echeveria turgida and Parodia hausteiniana tiles. Web addresses are refused as authors; a mail address is published.
- "The original uploader was Jean-Jacques MILAN at French Wikipedia." (Conophytum longum); the same on Nepenthes eustachya and mantalingajanensis.
- Probe: `commonsAuthor('<a>X</a> (<a>talk</a> · <a>contribs</a>)')` gives "X (talk · contribs)".

Fix: drop `<sup>…</sup>`, `<small>…</small>` and autonumber links before stripping tags, and put a space where a tag was. Remove a trailing `\(\s*(talk|messages)[^)]*\)` and a signature time `\d\d:\d\d, \d+ \w+ \d{4} \(UTC\)`. Take X from "(The )?original uploader was X at …". Treat a mail address and a bare "[n]" as not an author.

### 9. The index counts photographs the page does not show (confirmed)

`scripts/build-dossiers.ts:194` counts `shownPhotos(d.photos, …)`. The Worker's read (`src/lib/dossier/schema.ts:294`) shows `shownPhotos(dedupePhotos(d.photos.filter(webUrl…)…))`. An iNaturalist photograph and its copy through GBIF count twice in the index and once on the page. In a random sample of 45 live species, 18 disagree:

| Species | Page | Index |
|---|---|---|
| Albuca paradoxa | 8 | 16 |
| Pachyphytum viride | 3 | 6 |
| Nolina durangensis | 23 | 46 |
| Mesembryanthemum rapaceum | 41 | 62 |
| Cyrtanthus debilis | 47 | 71 |

For Pachyphytum viride, GBIF occurrence 4522657370 carries iNaturalist photos 350433688, 350433558 and 350433768, the page's three. A probe with one iNaturalist photograph and its GBIF copy gives 2 from `shownPhotos` and 1 from `safeUrls`. /about/formats says `photos` "counts the photographs the species page shows". The count picks the front page's featured species (`src/routes/+page.server.ts:17`, `photos >= 8`) and breaks search ties (`src/lib/core/search.ts:647`). `r69k-index-seam.test.ts` pins the call's text, so it passes. In both samples (80 species) the lead matched the tile.

Fix: one exported `pagePhotos(d)` (dedupe, `webUrl`, `showable`, `shownPhotos`) used by `safeUrls`, `indexEntry` and the page.

### 10. The category rule will hide living plants on the next rebuild (confirmed in code)

`CATEGORY_KINDS` (`photo-kind.ts:37`) has `specimens?\b`. Commons files garden collections as "Specimens in …". Of the 199 tiles re-read, five would be left out by a new answer: Adenia keramanthus ("Specimens in the National Botanic Garden of Belgium"), Agave pachycentra ("Specimens in the University of California Botanical Garden"), Ceropegia cimiciodora ("Specimens in the Sukkulenten-Sammlung Zürich"), Crassula streyi ("Plant specimens at Lotusland") and Dorstenia yambuyaensis. Cyphostemma juttae's `…Lyman Plant House, Smith College - DSC04321.JPG` is in "Specimens in the Lyman Plant House". `commonsKind` returns `filed under "Specimens in the Lyman Plant House"`.

Fix: read "herbarium specimens", "specimens of", "preserved specimens" and "type specimens"; leave "Specimens in" and "Plant specimens at" alone.

### 11. Good files still hidden that the known list does not cover (confirmed)

All from `commons-audit.txt`, each the species:

- **Short epithets one letter off:** Cyphostemma "jutae" for juttae, and Mammillaria "mabudae" and "matuadae" for matudae. These fail the seven-letter floor, not the one-letter rule.
- **A transposition:** "Aeonium dodantrale" for dodrantale. It is two edits by the rule's count, one by any reader's.
- **Run-together:** "Centaurea americanabud" (Plectocephalus americanus).
- **Fruit:** "Tecomanthe Speciosa Seed Pod" is hidden as "not the plant".

These are small. They show the rule was fitted to the twelve cases rather than to spelling.

### 12. A thumbnail-sized photograph leads when large ones exist (confirmed)

`heroOf` takes the first file of a rank. Mammillaria laui leads with a 480-pixel file beside four 4,000-pixel ones. Nepenthes spectabilis leads with `Nepenthes spectabilis1.jpg` at 256 pixels, shown in a 480-pixel box. Fix: among Commons files of one epithet rank, prefer a width of at least 500.

### 13. The tests do not pin several rules (confirmed by mutation)

I made 54 single-line mutants of `photo-kind.ts` and `photo-credit.ts` and ran the seven photo test files on each (script: scratchpad `mutate.mjs`). 36 were killed and 18 survived. Three of the survivors are equivalent: `stem` without "ii" (`misspelt` covers it), "CC0 1.0" refused (Commons writes "CC0"), and splitting the credit at the leftmost comma. The other 15:

- reading any two epithets that share five letters as one;
- allowing a length gap of two;
- the seven-letter floor at 6 or 8;
- reading hyphens;
- emptying `NOT_EPITHET` (the "Crassula in flower" guard tests nothing, since "in" is too short to be read);
- accepting PNG in a stored dossier;
- dropping "plate", "sp.", "aff" without a dot, "map" or "label";
- dropping "specimens" or "hybrids" from the category list;
- `<br>` not read as a line break.

Fix: add a case for each, including Drosera macrophylla/microphylla as a guard.

### 14. The strip and related tiles load 500-pixel Commons tiles for 72-pixel boxes (confirmed, read)

`src/routes/species/[slug]/+page.svelte:415` (`<img src={p.thumb} width="72">`) and `:315` (related tiles) load `p.thumb`, the 500 tile, not `photoAt(…, 'small')`. K4 says Commons images load "at the size the slot needs". Fix: `photoAt(p.thumb, 'small')`.

## Checked and sound

- **The audit, line by line:** every "named as another species", PNG and herbarium entry in `commons-audit.txt` was classified.
  - **Named as another species:** 84 entries. Rightly hidden are the multi-species and other-species files: Nepenthes truncata, Opuntia bergeriana, Campanula portenschlagiana, Momordica charantia, Calathea ornata, Echeveria pulvinata, Cyphostemma currorii, Haworthia serrata, Mammillaria microthele and others. The ones hidden wrongly are the known list's classes plus item 11. Echinocereus lindsayi, Frailea angelesii, Haworthia divergens and Parodia mairanana (under P. comarapana) are subspecies or variety names that GBIF does not list as older names, so hiding them is defensible.
  - **Herbarium sheets:** 86 entries. Samples of the "(GBIF n)" and "specimen" files on Commons are sheets (ELAR Moscow, Kew, Queensland Herbarium).
  - **PNG:** 82 entries, as decided.
- **Licences:**
  - **Short names:** `commonsLicence` was probed with 34 of them. NC, ND, GFDL, FAL and "Attribution" are refused. CC0 and PD-… are kept apart.
  - **Live files:** PD-self is "Public domain" and CC-Zero is CC0 (Daderot's two Cyphostemma juttae files, NPS, USDA).
  - **Re-reading:** `readCommonsPhoto` re-reads a stored `cc0` "Public domain" file as `pd`, and drops CC BY files left with no author.
  - **Unknown author:** no "Own work", URL or "Unknown author" credit appears among 576 tile credits.
- **The lead:** in 80 sampled species (45 random, 35 Commons-led), the page's lead (`heroOf` of `/api/dossier`) equals the index tile, and no Commons file leads a page with an iNaturalist or GBIF photograph.
- **Sizes:**
  - **Widths:** Commons serves 120, 250, 500 and 960 (200 or 206) and refuses 800 (400), as the code says.
  - **Addresses:** none of 30 sampled addresses gave 404 or 400 (the 429s were the shared address).
  - **The lead:** its `srcset` is `500w, 960w` with `sizes="480px"`.
  - **Originals:** they appear only for files 960 wide or narrower.
- **Mutants killed:** 36 of 54, including every licence-mapping and author-rule mutant except `<br>` and the two equivalent ones.

## Not done

- **Misspelt and older-name pairs (items 5 and 6):** the Commons category scan of the 53 Commons-led candidates stopped after 16 (none crossed), because Commons' API answered 429 from about 15:05 UTC.
- **Tile categories (item 2):** 199 of the 576 Commons-led tiles were re-read; the other 377 were not.
- **Shown Commons files that do not lead:** only those in about 60 fetched dossiers were read.
- **Visual check:** "Parodia Liberec 1" and the two Kew Gardens files on Parodia comarapana were not looked at (429 on the thumbnail host).
- **WebKit and Firefox:** not run. No Playwright run, since nothing here touched the page.
