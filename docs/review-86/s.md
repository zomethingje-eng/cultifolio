# Review S, round 86: search, names and the honesty of the claims

**Verdict: works with faults.** Search is now very good for the names a cactus, succulent or bulb grower types:

- every scientific name, stapeliad, old genus, renamed heading and new page I tried;
- every hybrid, cultivar, "cf.", "sp." and pasted label;
- all 533 live answers agree exactly, top five, with the code's own `search()` run over the live index.

Round 85's two blockers are fixed: accepted names no longer draw "An older name of", and a plant filed under GBIF's name finds its page. /about/how's examples all hold on the live site. Four faults remain, and none needs a re-derivation to mend:

1. **Kew everywhere has a residue.** About 20 pages still carry a name Kew places only in another plant. Because of it, the old address `/species/paeonia-corallina` leads to the wrong peony, with a line that misquotes Kew.
2. **English names are missing on very grown plants.** 64 of the 1,648 species grown 1,000 times or more have none: loquat, almond, crimson bottlebrush and bush lily among them. "Peyote" was dropped from *Lophophora williamsii*, though its record holds it. So a grower's common name often finds nothing, or the wrong plant.
3. **The add form loses a press.** The older-name line says "Add keeps exactly what you typed", but the first press only arms the button.
4. **Some sentences on the about pages are false or stale.** /about/how says no page searches a name Kew places elsewhere, and that every English name is searched. Both pages still say "not checked" where the live pages say "not asked".

**Scores**

| Area | Score | Why | What would make it 10 |
|---|---|---|---|
| Search relevance | 8 | Right page first on 425 of 465 queries with a target (91%). Scientific, older, stapeliad, new-page, hybrid, cultivar, cf./sp. and label queries: 100% or near it. Common names: 58 of 77 (75%). | S2's names, S8's old genera, S11, S12 |
| The picker against the search | 7 | The picker's reference rows match the search's on 190 of 190 queries. S1 (round 85) is fixed: no accepted name draws the line, and Aloe vera adds on one press. But the line's own words are false (S3), it names the wrong page for Kew-elsewhere names (S1), and a pasted author makes it say "not in the backbone" (S5). | S1, S3, S5, S6 |
| /about/how, /about/formats, NOTICE | 7 | The mechanisms, counts and examples are true of the code and the live index: 48,375 pages, 6,493 genera, 37,667 with a climate, 5 `g` pages, 486 hybrids, Aloe 199 and Euphorbia 401, 11 merged names, 366 region files, and every quoted search example. The record sample is disclosed now, and the folded length is 4,208 and 765 words. Two rules state what the data does not do, and four passages are stale. | S4 |
| Other claims a grower reads | 7 | Right:<br>• the verdict line on GBIF's own names;<br>• the found-by line and its re-file offer;<br>• the few-records notice's place;<br>• set-aside extremes said as answered;<br>• San Pedro's "not asked".<br>Wrong: lines false on keyless and autonym addresses, a banner naming the typed name as the page, and the chip one page short. | S1, S7, S9, S16 |

**What I covered**

- **Live search:** 533 queries in 33 groups, each asked once (`/api/search?q=…&n=30&c=48c27bf790016ccc`).
  - 70 scientific names, 61 misspellings of one and two letters, 77 common names;
  - 24 old headings, 31 old-genus names and 15 old genera alone, 33 stapeliad names and genera;
  - the 18 new pages and 9 of iNaturalist's names for them, the 11 re-keyed pages, 14 same-type names;
  - 13 merged names, 5 homonyms;
  - 27 hybrids, 34 cultivars in every quote, 19 cf./sp., 16 labels;
  - 10 Unicode, 8 short and 4 long queries;
  - 10 names Kew places elsewhere, and the 20 examples /about/how quotes.

  The queries are in `S-s/queries.tsv`, the answers in `S-s/search-results.json`.
- **Offline:** the code's `search()` with the route's layers, over the live index (`S-s/dbg/off.ts`). It gives the same top five as the live site on 533 of 533.
- **Kew's file against the index** (`wcvp_names.csv` of 2026-06-04): every `syn` and `older` name of the 46,021 `k` pages (318,162 names), and the 14,686 names that left 6,768 pages since round 84's index (`S-s/kewcheck2.py`, `lost2.py`).
- **The picker:** 191 queries typed into the live `/plants/new` (Chromium, service worker blocked, third-party hosts aborted). For each: its rows, the line after leaving the field, and the button (`S-s/picker-results.json`).
- **Add flows:** 6 plants added, with screenshots in `S-s/add-a*.png`: Ceropegia alstonii, Hibiscus acetosella, Trichocereus pachanoi, Trichocereus macrogonus var. pachanoi, Aloe vera and Paeonia corallina.
- **Pages:**
  - /about/how and /about/formats with all 44 and 13 folds opened, read paragraph by paragraph (847 and 691 paragraphs; 24,407 and 20,396 words), and `NOTICE`;
  - 14 species pages and verdict lines;
  - 20 old addresses and redirects;
  - 9 dossiers;
  - the front page.
- **Requests:**
  - **cultifolio.com:** 1,291 in all, never more than two a second. That is 584 direct, and 707 from the browser runs, whose immutable files I answered from memory after the first fetch: 406 saved.
  - **Third-party hosts:** 5, to api.gbif.org: the vernacular names of keys 9482657, 9317408 and 7802717, and two of the species records.
- **Speed:** all 533 searches answered 200 in a median of 458 ms (p90 967 ms, max 6.1 s).
- **Scratch:** `/tmp/claude-0/rev86r/S-s/` (7 MB).

## Issues

### S1. Major (rules 3 and 5; a wrong name on species pages): names Kew places only in another plant are still shown, searched and redirected on about 20 pages; `/species/paeonia-corallina` leads to the wrong peony with a false line

- **What I did.** I checked every `syn` and `older` name of every `k` page against Kew's file, read by Kew's own rows of that name. I left out misapplied rows, and names with any unplaced row (`S-s/kew-viol2.json`).
- **What I saw.** 78 names on 71 pages lead only to other plants. 20 pages hold one whose every Kew row leads elsewhere, with no unplaced row. Among them:
  - Paeonia broteri: Paeonia corallina (Kew: *P. mascula*);
  - Aria latifolia: Sorbus aria (Kew: *Aria edulis*);
  - Pteridium latiusculum: Pteris aquilina (Kew: *Pteridium aquilinum*);
  - Sanguisorba verrucosa: Poterium sanguisorba (Kew: *S. minor*);
  - Antirrhinum barrelieri: Antirrhinum murale (Kew: *A. majus*);
  - Aria sudetica: Pyrus chamaemespilus;
  - Hesperochloa hallii: Festuca altaica;
  - Onoclea pensylvanica: Pteretis struthiopteris;
  - Cistus lasianthus, Mentha × gracilis, Orchis italica, Valeriana lecoqii and others.
- **What a grower meets (live).**
  - **The address.** `/species/paeonia-corallina` answers 302 to `/species/paeonia-broteri?was=Paeonia%20corallina`. That page says "Paeonia corallina is an older name of this species: Kew's World Checklist files it under *Paeonia broteri*". Kew's file holds Paeonia corallina Retz. (519012) under *P. mascula* (523358).
  - **The picker.** For "Paeonia corallina" and "Antirrhinum murale" it says "An older name of Paeonia broteri" and "An older name of Antirrhinum barrelieri". The plant I added is linked to P. broteri, with "An older name of Paeonia broteri · File it under Paeonia broteri" (add-a5-c.png).
  - **The search.** "Paeonia corallina" lists P. broteri before P. mascula, and "Antirrhinum murale" A. barrelieri before A. majus. "Sorbus aria", "Pteris aquilina" and "Poterium sanguisorba" put the wrong page second.
  - **The 404.** `/species/sorbus-aria` names "Sorbus aria proles latifolia (Lam.) Samp., now Aria latifolia" as a second holder.
- **Cause.** The first two parts are from the code and the dossiers I fetched; the third is from the code alone.
  - **Truncation.** `canonicalSynonym` (`src/lib/core/names.ts:253-260`) reads only "var.", "subsp.", "ssp." and "f." as rank words. So GBIF's "Sorbus aria proles latifolia", "Pteris aquilina subvar. latiuscula", "Paeonia corallina proles ovatifolia", "Poterium sanguisorba proles spachianum" and "Antirrhinum murale proles barrelieri" become the binomial of another species. That binomial is then an older name (`olderNamesOf`, `index-entry.ts`).
  - **No Kew check on the derived name.** `kewPlace` runs on the stored names (`kew-names.ts:252`), never on the binomial derived from them. So `name.kew.elsewhere` misses it. In k2942040, k3143767, k2991013 and k518994, `elsewhere` is absent.
  - **The line.** On a keyless page, `wasLine`'s `gbifless` branch (`src/lib/ui/ref/was-words.ts`) says "Kew's World Checklist files it under …" without checking that `kewSynonyms` holds the name.
- **Against the claims.** /about/how [37]: "A name Kew accepts, or files under another species it accepts, is never a search name of a page it does not lead to."
- **Smallest fix.**
  - Treat every rank word (proles, subvar., nothosubsp., nothovar., subf., lusus, race, convar., grex) as infraspecific in `canonicalSynonym`.
  - Run `kewPlace` on the index's derived binomials too.
  - In the `gbifless` branch, claim Kew's verdict only when `kewSynonyms` holds the name. Otherwise say the reference's filing.
- **Done looks like.** `kewcheck2.py` over the next index finds 0 names whose every Kew row leads elsewhere. `/species/paeonia-corallina` goes to Paeonia mascula.
- Mark: confirmed.
- **The other side holds.** Of the 14,686 names that left pages since round 84, none that Kew places only in that page's plant was dropped. The 11 exceptions are a species' own names leaving its subspecies' pages, which is right.

### S2. Major (search, names): heavily grown species have no English name, and their common names find nothing or the wrong plant

- **What I saw (live index).**
  - 24,147 pages have no English name at all. That includes 133 of the 2,507 species grown 500 times or more, and 64 of the 1,648 grown 1,000 or more:
    - Ixora coccinea (grown 28,936), Eriobotrya japonica (18,300), Melaleuca citrina (17,837), Murraya paniculata, Clivia miniata (8,750);
    - Chrysanthemum × morifolium, Dracaena sanderiana, Haworthiopsis attenuata, Kalanchoe × houghtonii, Prunus amygdalus, Eucalyptus camaldulensis;
    - Stapelia gigantea (2,297), Sabdariffa acetosella (699).
  - Lophophora williamsii is headed "Indian-dope", and "Peyote" is nowhere in its index entry. Selenicereus undatus holds only "Nightblooming Cactus".
- **What a grower gets (live, `/api/search`).**

  | Query | Answer |
  |---|---|
  | "peyote" | L. diffusa, Ariocarpus fissuratus, Pelecyphora…; no L. williamsii |
  | "peyote cactus" | Astrophytum asterias alone |
  | "loquat" | Quercus rysophylla ("Loquat leaf oak") first; E. japonica 5th |
  | "almond" | Terminalia catappa first; no Prunus amygdalus in 30 |
  | "river red gum" | read as "river red": Dendrobium lasianthera |
  | "jungle geranium", "cranberry hibiscus", "dragon fruit", "starfish flower" | nothing |
  | "bush lily" | Clivia nobilis |
  | "false roselle" | read as "false rose": Selaginella lepidophylla; the picker says "Did you mean Selaginella lepidophylla?" |

- **Cause (proved on the dossiers and at GBIF).**
  - **Rows with no language are dropped.** `englishNames` takes only `lang === 'eng'` (`index-entry.ts:385`). L. williamsii's dossier holds "Peyote" (Catalogue of Life, lang "") and "peyote" (NCBI, ITIS; lang ""), so neither reaches the index. S. undatus's "dragon fruit" (NCBI, lang "") is lost the same way.
  - **The page's own key has no names, and nothing stands in.** A page reads GBIF's vernacular names under its own key only. GBIF's API answers 0 names for Clivia miniata (Lindl.) Verschaff. 9482657, Ceropegia gigantea 9317408 (Stapelia gigantea's key) and Hibiscus acetosella 7802717. GBIF holds such names on other usages, the older combinations among them. Wikidata's English names are read only for pages with no GBIF key (/about/how [150]).
  - **The same-type rule stops short.** It recovered Sabdariffa acetosella's item and summary (the page quotes the "Hibiscus acetosella" article), but not its names.
- **Against the claims.** /about/how [53]: "Every English name a source gives is searched, whether shown or not". [61]: a set-back one-word name "stays searchable". Neither holds for "Peyote".
- **Smallest fix.**
  - Read GBIF rows with no language as English when the source is one of the English-language checklists (Catalogue of Life, ITIS, NCBI) and the name is in Latin script, and say so in the rule.
  - For a page whose key gives no English name, read Wikidata's P1843 English names of the item the page already proves, as keyless pages do.
  - Never make a shorter reading of a phrase that has no word of a scientific name: "false rose", "river red".
- **Done looks like.** "peyote", "loquat", "almond", "bush lily", "false roselle", "dragon fruit" and "starfish flower" each put their plant first. A test asserts that no species grown 1,000 times or more lacks an English name where GBIF or Wikidata gives one.
- Mark: confirmed.

### S3. Major (a first-time grower, any device): the older-name line says "Add keeps exactly what you typed", but the first press of Add only arms the button

- **What I did.** I typed a true older name on the live `/plants/new`, pressed Tab, then pressed Add (`S-s/addflow.mjs`).
- **What I saw.** Four of four times:
  - **Before the press** (add-a0-a.png): the line reads "GBIF 9269454 An older name of *Hoodia alstonii*, which has a species page: pick it, or Add keeps exactly what you typed". The button reads "Add".
  - **After it** (add-a0-b.png): nothing is added. The button becomes "Add as typed", and the line says "press 'Add as typed' to keep exactly what you typed".
  - **The second press adds.**

  The four names: Ceropegia alstonii, Hibiscus acetosella, Trichocereus pachanoi and Paeonia corallina. These are the stapeliad and old-genus names this owner's growers type.
- **Cause.**
  - `SpeciesPicker.svelte:693` writes "Add keeps" whenever `armed` is false.
  - `plants/new/+page.svelte:213` arms on the first press (`olderFirst()`) and returns without saving.

  The line and the button disagree. It is round 84's C2 ("a press taken to say so") in a new form.
- **Also.** For a genus with a capitalised word ("Echeveria Lola"), the line says "Press Add to keep it" while the button reads "Add as typed" (`:695`).
- **Smallest fix.** Arm when the line is shown, so the button already reads "Add as typed" and one press does what the line says. Or keep the arming, and word the line "press Add, then 'Add as typed'".
- **Test.** Type "Ceropegia alstonii", leave the field, and press the button once. The plant is filed, or the line said that two presses are needed.
- Mark: confirmed.

### S4. Major (rule 5): sentences on /about/how and /about/formats that are false or stale

| Where | Says | Live and code |
|---|---|---|
| how [37] (Names, the rules in full) | "A name Kew accepts, or files under another species it accepts, is never a search name of a page it does not lead to." | False on about 20 pages (S1) |
| how [53]; [61] | "Every English name a source gives is searched"; a set-back name "stays searchable" | "peyote" does not find L. williamsii; the lang "" names are never read (S2) |
| how [137] (`how/+page.svelte:205`) | Species with no GBIF key: "Where there are none, the page says its records were not checked, and why." | The page says "GBIF's records not asked" (Echinopsis pachanoi), as [153] and the glossary [789] say |
| formats [610] (`formats/+page.svelte:772`) | "…and the site says each as not checked, never none." | Same: "not asked" |
| how [367]; formats [450] | Cultivars "in any quotes" are left out | "Galanthus 'Wendy's Gold'", and iOS's "Galanthus ‘Wendy’s Gold’", answer nothing (S10) |
| how [668] | Cloudflare's error logging is on "as it is in October 2026" | Dated; now November |
| formats [661], [670], [674], [679] (`:836, 847, 851, 858`) | "At 48,357 species: 512 …, 1,024 …" | Round 84's count. The figures still hold at 48,375, but the count is not the one the page states above |
| how [309] | "26 species are here for that reason alone" | Unclear which reason. The species list says 26 are there "only because they are already in the reference" ([307]'s rule), not by [309]'s Kew-entry rule |

- **True and checked.**
  - Every quoted search example holds live: copi, rose, Sansevieria trifasciata, Cornus mascula, Aloe variegata, Black eyed Susan, snake plant, snowdrop, peppermint, pepper, jade plant, fig, echeveria, aloe, devils backbone, Echinocactus chrysacanthus, Echeveria peacockii, lithop, Aloe Verra and Tecoma speciosa.
  - The counts hold: 48,375, 6,493 and 37,667; 5 `g` pages "on 3 November"; 486 hybrids; Aloe 199 and Euphorbia 401; eleven merged names, Rebutia fidana now listed; 366 of 369 regions.
  - So do the sample rule ([413]-[415]), the generic-noun and English-use lists against the code, the frost bar's 72 hours, Today's 15 s, and the forecast's half hour.
- **Smallest fix.** Correct the eight rows above. Have `--index` write the formats page's file counts too, as it writes the how page's.
- Mark: confirmed.

### S5. Minor (the picker against the search): a pasted label with its author is said to be "not in the backbone · Not a reference name"

- **What I saw.** Four labels:
  - "Ceropegia alstonii (N.E.Br.) Bruyns": GBIF's own accepted name, with its author;
  - "Sabdariffa acetosella (Welw. ex Hiern) Christenh. & Byng": the reference's heading, with Kew's author;
  - "Hoodia gordonii (Masson) Sweet ex Decne. SH1234 Namibia";
  - "Hoodia alstonii (N.E.Br.) Plowes Richtersveld".

  Each leaves the field saying "not in the backbone … Not a reference name. Did you mean …?". Meanwhile `/api/names?q=Ceropegia%20alstonii` answered 200, and the search reads each as the species, "leaving out" the author.
- **Should.** The line reads the species part the name service was asked, and says the author was left out, as the search does.
- Mark: confirmed. The cause is not traced.

### S6. Minor (San Pedro under iNaturalist's name): "Trichocereus macrogonus var. pachanoi" files a plant with no page

- **What I saw.**
  - **The search** puts Echinopsis pachanoi first.
  - **The picker** shows no older-name line, files GBIF 11093098, and its row says "under another genus".
  - **The plant page** (2026-0004) says "No species page under this name · Is it an older name?".
- **What it should do.** Kew holds the name (2999002) as a synonym of E. pachanoi, and the index holds it among the names GBIF files under its varieties. "Opuntia polyacantha var. nicholii" does get the line, so the two are treated differently.
- **Cause, from the code.** `olderLine` matches only `older` (shown and searched older names), never the `kew` field where such variety names sit.
- **Fix.** Read `kew` names, typed whole, for the line and for the plant page's lookup.
- Mark: confirmed.

### S7. Minor (claims on the plant page): the banner names the typed name as the reference's page

- **Trichocereus pachanoi** (2026-0003): "The reference holds Trichocereus pachanoi without a GBIF key … This plant records GBIF key 7282455, which no species page holds; the species shown here is the reference's page of that name." The page is Echinopsis pachanoi, not a page "of that name".
- **Paeonia corallina** (2026-0006): "The reference holds Paeonia corallina without a GBIF key of its own…".
- **Should.** Name the page ("The reference's Echinopsis pachanoi has no GBIF key …").
- Mark: confirmed.

### S8. Minor (search, old genera): one epithet match switches off "an older genus lists its own genus first"

- **"Bryophyllum"** gives Cyphostemma digitatum (older name Cissus bryophyllum) and Galium triflorum (Galium bryophyllum) before the Kalanchoes.
- **"Callistemon"** gives Xeronema callistemon, Allium webbii (Allium callistemon) and two Kunzeas, with Melaleuca citrina 6th.
- **Cause.** `search.ts:1023` applies the order only when every hit holds an older name of that genus (`hits.every(…)`).
- **Fix.** Order the hits that do hold one first, and the epithet matches after them.
- Mark: confirmed. "Trichocereus", "Notocactus", "Neoporteria", "Brachystelma", "Mahonia" and "Chamaecereus" are right.

### S9. Minor (the verdict line): two old addresses say too little or something misleading

- **`/species/stapelia-hirsuta-var-hirsuta`**, the page's own former heading and Kew's autonym, reads: "…is a variety under an older name of this species in GBIF's backbone, which files it under Ceropegia pulvinata … Kew's World Checklist … does not list this name among its synonyms". Kew accepts it as the heading's typical variety, and the "older name" is the heading itself. It should say: "this page's former heading; the typical variety of *Stapelia hirsuta*".
- **`/species/conophytum-calculus-vanzylii`** answers 302 with no line, though `wasLine` has "is this plant's name written without its rank". The server sets `listedHere` only from older names, never from the heading's own words (`species/[slug]/+page.server.ts:185-208`).
- Mark: confirmed.

### S10. Minor (search, bulbs): a quoted cultivar with an apostrophe inside finds nothing

- "Galanthus 'Wendy's Gold'", and the iPhone's "Galanthus ‘Wendy’s Gold’", answer 0: "Nothing matches".
- `QUOTED` and `CULTIVAR` (`search.ts:209, 216`) stop at the inner apostrophe and need a closing quote before a space.
- "Galanthus nivalis 'Wendy's Gold'" works only through the retry.
- The picker files it rightly, as a cultivar of the genus.
- **Fix.** Let a closing quote be the last quote before the end, a space or punctuation.
- Mark: confirmed.

### S11. Minor (search, older names): "Erythrina caffra" and two stapeliad old names put the wrong page first

- **"Erythrina caffra"** gives E. humeana first: GBIF files a name of those words under it, and it shows it among its six. E. afra comes second. Kew's file writes E. afra Thunb. and has no row of "caffra", so the name is never placed. The 2024 "caffr-" to "afr-" rule is read only for photographs ([216]).
- **"Ceropegia modesta"** gives Ceropegia modestantha before Duvalia modesta, and **"Ceropegia edulis"** gives Ceropegia edulissima first: round 85's S10, left.
- **Fix.** Read Kew's rows with "afr-" for "caffr-". Put an exact older name before a name the query only begins.
- Mark: confirmed.

### S12. Minor (common names): residue

- **Not first:**
  - "hens and chicks" (Sempervivum marmoreum first);
  - "christmas cactus" (Cylindropuntia leptocaulis first, Schlumbergera truncata 4th);
  - "mother of thousands" (5th), "crown of thorns" (2nd), "desert rose" (Rosa stellata first);
  - "zebra plant" (3rd), "star cactus", "baby toes", "split rock" (Pleiospilos simulans).
- **"moth orchid"** gives 19 near-spelling orchids; no Phalaenopsis has an English name.
- **"Platanus x hispanica"** (London plane) answers Platanus occidentalis alone, unlabelled, through its older variety name "Platanus hispanica var. pyramidalis".
- **The picker:**
  - for "hens and chicks" it says "Did you mean Echeveria lilacina?", its 4th row;
  - plural common names keep "under another genus" ("hens and chicks", "living stones");
  - "mamillaria" rows say "similar spelling, another genus" for Mammillaria itself.
- Mark: confirmed.

### S13. Minor (honesty): Echinopsis macrogona's page does not say it holds San Pedro's records

- The decision to keep San Pedro's records there stands. The disclosure is only on E. pachanoi's page.
- The dossier (k2783497) reads 282 in-range records, which hold the records GBIF files under Trichocereus macrogonus var. pachanoi: 410 of 639 GBIF records by round 85's count.
- Its page and register say nothing of it, and its quoted summary says it "may be called San Pedro cactus".
- **Should.** One line under the name or in the climate card: "GBIF files the records of Echinopsis pachanoi's names (San Pedro) under this species; they are read here".
- Mark: confirmed (page read). The count of records is from round 85's documents.

### S14. Minor (names shown): non-English names

- "Bucaneve" (Italian) is the second name under Galanthus nivalis's heading.
- "Angelique" appears on Angelica archangelica.
- Mark: confirmed.

### S15. Minor (polish)

- **The front page's chip** reads "All, 48,375 … Climate known, 37,667 No climate, 9,773, 934 not asked". That adds to 48,374. Monsonia lheritieri, a `g` page with a key and climate "pending", is in none of them.
- **Aria latifolia** is headed "Photographs not asked" when only GBIF's media was not asked. iNaturalist answered "nothing to report".
- **E. pachanoi's register** says "GBIF common names … not asked … so GBIF's records were not asked": the reason is about records on a names row.
- **A zero-width space between words** joins them (`_clean`): "Lithops​lesliei" is read as "lith", and L. lesliei comes 6th.
- Mark: confirmed.

## The round-85 reviews' findings in my area

| Finding | Status | Evidence |
|---|---|---|
| S1 / P2: accepted names called "an older name of"; a press lost | **Fixed** for accepted names. **Regressed** in another form for true older names (S3) | No line on Aloe vera, Crassula ovata, Echeveria elegans, Cyclamen hederifolium, Phalaenopsis amabilis, Mentha canadensis, Platanus occidentalis, Agave hookeri, Allium senescens or Sempervivum montanum; Aloe vera added on one press |
| S2 / C4 / W9 / A16a: a plant under GBIF's name has no page | **Fixed**; half for iNaturalist's variety names (S6) | Ceropegia alstonii and Hibiscus acetosella plants: "Filed under GBIF's name for its key; the reference heads its page …" with "File it under …" |
| S3 / D11: the sample undisclosed | **Fixed** | how [413]-[415], [457]; formats [590] |
| S4 / A21: stale passages and examples | **Half** | All 20 examples hold; new stale lines (S4) |
| S5 / A14: tulip, baobab, saffron, Sulcorebutia | **Fixed**; old-genus order half (S8) | tulip: T. gesneriana; baobab: A. digitata; saffron: C. sativus |
| S6: two-letter typos, nothogenera | **Fixed** | sansiveria, mamilaria and euforbia obesa are right; "x Gasteraloe" answers nothing, with no junk |
| S7: the picker's quotes and its row notes | **Fixed** for „ « ‚ ‹ and keyless rows. **Half** for "under another genus" on plurals and a misspelt genus (S12) | |
| S8: set-aside extremes as "nothing to report" | **Fixed** | Lonicera acuminata: "answered … read, and set aside" |
| S9 / W11: "not checked" for not asked | **Fixed** on pages, picker and chip; stale on the about pages (S4) | |
| S10 / D5 / A15: old addresses | **Fixed**: conophytum-calculus-vanzylii, the 11 re-keyed slugs, hibiscus-acetosella and trichocereus-pachanoi answer 302 with `max-age=86400`. **Left**: Ceropegia modesta and edulis (S11); the vanzylii line is missing (S9) | |
| S11 / A22: about pages too long | **Fixed** | 4,208 and 765 visible words |
| S12: non-English names | **Half** | Ætihvönn and "Wild Bell Appleˌ" gone; Bucaneve left (S14) |
| W1 / P1 / C1 / A1: the old address's verdict line | **Fixed** for GBIF's own names (Hoodia alstonii, Huernia hadhramautica, Sabdariffa acetosella); false on keyless pages (S1) and misleading on an autonym (S9) | |
| A9a / D1: Kew everywhere | **Half** | 14,686 names correctly gone; about 20 pages left (S1) |
| B6, A8: "San Pedro" | **Fixed** | E. pachanoi first in the search and the picker |
| A9h: a quoted title's proof | **Fixed** | Sabdariffa: "its title is one of this species' older names (GBIF Backbone), which is the proof" |
| A10 / A13: the form waits; one plant per Add | **Fixed** | A 502 from `/api/names` for "Bryophyllum" was said: "The name service did not answer, so only the reference's own species are offered." |

## Confirmed working

- **Search.**
  - Every new page by its name and by iNaturalist's variety name.
  - Every re-keyed old heading.
  - Every round-84 old heading, stapeliad and Anacampseros name.
  - Old genera with an epithet: Trichocereus, Notocactus, Neoporteria, Sansevieria, Brachystelma, Trichocaulon, Mahonia, Callistemon.
  - Merged names, homonyms, hybrids with × and with x, cultivars in ' " ‘’ “” „“ «» ‚‘ ‹› and cv., cf./aff./sp./sp. nov., pasted labels with authors and field numbers, full-width text and short queries.
  - Headers name every reading ("relaxed", "left", "near").
- **Old addresses.** All 20 fetched answer 302 to the right page, with `public, max-age=86400`. Names two pages hold answer 404 naming both.
- **Dossiers.** `/api/dossier/<GBIF key>` answers 302 to the page's id, and a former id answers 404.
- **Species-page claims.**
  - E. pachanoi's "not asked" and its GBIF-lumps line.
  - The few-records notice's place: Aloe vera, "Al Buraymi, Oman".
  - Set-aside extremes worded once, in one unit.
  - The verdict line on GBIF's own names.
  - The summary's revision and day.
- **NOTICE** matches the sources the code reads. The OpenAlex line is gone.

## Not checked, with why

- **Today, the frost bar, the backup messages and sync's status card in a browser:** the request budget went to the picker (191 queries) and the add flows. In the code, the frost bar's 72 h (`frost.svelte.ts:20`), Today's 15 s (`today/+page.svelte:139`) and the forecast's half hour match /about/how.
- **/about/formats' log, backup and sync sections, against the code:** C's area. I read them for clarity only.
- **The Wikipedia order claim:** /about/how [242], "by the item's article first … then by Kew's name, then by GBIF's". I started on it in `build.ts` and did not finish.
- **Why "not in the backbone" is said for an author-bearing label** (S5): the cause is not traced.
- **WebKit:** Chromium only here.

## Needs from the PC

1. **S2's reach.** Over the walk's dossiers, count the pages whose English names would change if rows with no language counted:

   ```
   node -e 'const fs=require("fs"),p=process.argv[1];let a=0,b=0;for(const f of fs.readdirSync(p)){if(!/^[kg].*\.json$/.test(f))continue;const d=JSON.parse(fs.readFileSync(p+"/"+f));const v=d.name?.vernacular||[];const en=v.some(x=>x.lang==="eng");const blank=v.some(x=>!x.lang&&/^[\x20-\x7e]+$/.test(x.name));if(!en&&blank)a++;if(!v.length)b++}console.log({noEngButBlank:a,noRowsAtAll:b})' <the walk's dossier folder>
   ```
2. **S10 on the iPhone.** With Smart Punctuation on, type `Galanthus 'Wendy's Gold'` in the catalogue search and in Add. Note which quotes appear and what each answers.
