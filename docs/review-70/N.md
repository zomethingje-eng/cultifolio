# Round seventy: agent N (names, search and the species page)

Copy: `(scratch)`, two commits on `base`. Files changed: `src/lib/core/search.ts`, `src/lib/dossier/index-entry.ts`, `src/lib/server/dossiers.ts`, `src/lib/server/synonyms.ts`, `src/routes/species/[slug]/+page.server.ts`, `src/routes/species/[slug]/+page.svelte`, `scripts/audit-common-names.ts`. `core/postings.ts` needed no change. New tests: `tests/unit/r70n-shared-names.test.ts` (12), `r70n-search.test.ts` (11), `r70n-headlines.test.ts` (6), `tests/e2e/r70n-tiles.spec.ts` (1). Two round-69 tests of my route changed with the decision: `r69n-older-names.test.ts` and `r69p-species-ambiguous.test.ts` (below).

Each "fails on the base" was run with the file copied into `(scratch)`, then deleted. Data: `/api/index`, fetched once on 12 October (8,947 entries), and the 9 October dossiers at `/tmp/rev66/corpus/v2`. Under the base rules, those dossiers' English names give the live index's `common`, `commons` and `spellings` exactly, for all 8,947, so the headline measure covers all 4,082.

## Done

### F1. A shared older name never redirects

- **The maps** (`dossiers.ts`, `indexMaps`, `synonymMaps`). An older name, shown or held for the search, goes to `bySynonym` only when one species holds it. Two holders or more put it in `ambiguous`, whichever shows it. Round 69's shown-first rule is gone.
- **The 404** (`+page.server.ts`). For a shared name the route reads each holder's dossier and takes from its stored synonyms the author under which it holds the name (`authorsOf` in `synonyms.ts`). That is the text after the name in GBIF's record, as it stands. A record with no author for the name, or one that cannot be read, names that holder without one, and an unread record makes the 404 `no-store`. Two authors in one record (Murraya exotica L. and DC., both under Murraya paniculata) are both said. One author written twice with other spacing ("Ker Gawl.", "KerGawl.") is said once. The holders come in the search's order for the name: the species that keeps the epithet first, then one that shows the name, then the alphabet. The sentence (`sharedNameMessage`):
  - "Echeveria farinosa is an older name of two species of the reference, so this address leads to neither: Echeveria farinosa Lindl., now Dudleya farinosa; Echeveria farinosa VanHoutte, now Dudleya pulverulenta".
  - "VanHoutte" is how GBIF's record writes it. The triage's "Van Houtte" is not what the record holds, so it is not shown.
- **Where the authors come from.** The decision says "where the index has one", but the index has none: `syn` and `older` are canonical binomials. The dossiers' `name.synonyms` carry them. Reading the holders' records on this 404 (two to nine reads, kept five minutes) is the nearest thing that needs no new index field and no change to B's builder. Authors in the index would need both, and the index is the file every catalogue load fetches.
- **The `?was=` line** (`+page.server.ts`, `+page.svelte`). A shared name can still reach a page: through a link written by hand, or through a 302 a browser kept for a day. For such a name (the name itself, looked up in the maps), the load gives `wasShared` (the other holders). The line then says: "**Echeveria farinosa** is an older name of this species, and the reference holds it for another species too, *Dudleya farinosa*, so it names no one species here." "The GBIF backbone accepts this species as" is said only of a name this species alone holds.
- **Tests:** `r70n-shared-names`.
  - On the base, 10 of 12 fail. Examples: "expected 302 to be 404" (Echeveria farinosa and Aloe variegata); for Eugenia malaccensis it received "… Syzygium aqueum, Syzygium jambos and Syzygium malaccense, so this address leads to neither"; "expected undefined to deeply equal ['dudleya-farinosa']" for the `?was=` line.
  - The 2 that pass on the base are guards: a name of one species still redirects, and Echeveria argentea names no other holder.
- **Round-69 tests changed.** In `r69n-older-names`, Aloe variegata, Cereus undulatus and Murraya exotica now answer neither, and Cotyledon mammillaris lists A. mammillaris first. In `r69p-species-ambiguous`, the new message is expected and Aloe variegata is a 404. Each file's header says so.

### N2. Search

- **An exact older name first** (`search.ts`, `olderOrder`). This is F's tested fix, with one change.
  - The order: a species that holds the typed name exactly, then the one that keeps its epithet, then one that shows the name itself.
  - "Shown" counts a shown name of the typed length, never a variety. F's fix counted only an exact shown name. With that, a name still being typed ("Opuntia longisp") found no species showing it, and fell to the alphabet. The length rule keeps the shown holder first while typing, and still never counts "Opuntia frutescens var. longispina".
- **A family from its start** (`familyMatch`, `prepare(items, genera)`, `searchGenera`). A word of six letters or more matches the start of a family only when it is neither a genus of the reference nor a word of the entry's own name.
  - `prepare` takes the genera, by default those of the entries prepared.
  - The server's posting passes (`searchOnce`, `exactPass`) are given the whole index's genera, held once per index (`generaOfIndex`). Its candidates for "crassula harmsii" hold no Crassula, so genera read from them would let the family through.
- **"None of them"** for three holders or more. This is in the F1 sentence.
- **Tests:** `r70n-search`. On the base, 10 of 11 fail. Examples: "expected ['Cornus officinalis', 'Cornus mas'] to deeply equal ['Cornus mas', 'Cornus officinalis']"; "expected 'Cylindropuntia leptocaulis' to be 'Opuntia orbiculata'" while typing; "expected ['Crassula elegans', …(4)] to deeply equal ['Crassula elegans']"; "searchGenera is not a function". The one that passes on the base is a guard: "aizoac", "burserac" and "crassulaceae" still find their families.

### N3. Hyphenated older names

Both maps also key every older name by `slugify(name)`. `synonymInIndex` looks the address's slug up first, then the name read from it. `ambiguousSynonym` and the new `sharedOlderName` take a name or a slug. So `/species/arbutus-uva-ursi` goes 302 to `/species/arctostaphylos-uva-ursi?was=Arbutus%20uva-ursi`, and a shared hyphenated name is a 404 that writes it as the index does. Tested in `r70n-shared-names`. On the base, `synonymInIndex` gave undefined, and the route asked GBIF for "Arbutus uva ursi".

### N4. Ties between spellings of one name

In `casedSpelling` (`index-entry.ts`), after "more sources", a tie between forms of one name is now decided in this order:
1. A form some botanical source gives comes before one only a source outside botany gives. That is `OUTSIDE_BOTANY`, a fixed list holding the World Register of Marine Species.
2. Then the form the species' botanical sources write more often across all its English names (`commoner`). For each form, it counts the sources, each once, whose names hold the words that form does not share with the others: "tarweed" against "tar" and "weed".
3. Then round 69's open form.
4. Then GBIF's order.

Among a form's capitals, a botanical source's variant also wins a tie. `englishNames` passes every name's words and sources to `casedSpelling`.

The ordering between names is unchanged. There, the marine register counts as any source: discounting it there changed Monstera deliciosa to "Tarovine" and Ipomoea alba to "Tropical white morning-glory", since it is often one of several sources on a land plant's name.

The audit gains the cause "the botanical or commoner spelling on a tie (triage-69 N4)".

Tests: `r70n-headlines`. On the base, 3 of 6 fail: "expected 'Pigeon berry' to be 'Pigeonberry'", "expected 'Self-heal' to be 'Selfheal'", and Madia elegans (`OUTSIDE_BOTANY` undefined). The 3 guard tests pass on both: Swamp-mahogany, Swiss cheese plant, and False acacia with Hubei Anemone.

### C5 (tile half)

The strip under the name card and the Related tiles load `photoAt(…, 'small')`: 240 for iNaturalist, 160 for GBIF's cache, 250 for Commons. The spec `r70n-tiles.spec.ts` (Chromium, port 4304) checks that every strip and Related `src` ends in `small.jpg`. It passes here and fails on the base: "Expected pattern: /\/small\.jpe?g$/ Received string: …/photos/901/medium.jpg".

## Measured

On the live index (12 October), with the repository's own exact pass over its postings and the whole index's genera:

- **Older names typed exactly:** 37,037 binomials. The first hit held no such name for 162 on the base and for 26 now. 136 are fixed and none newly missed. The 26 are answered by a name typed as a name ("Nepenthes mira" by N. mirabilis, "Stramonium datura" by Datura stramonium, and tautonyms such as "Malus malus").
- **Headlines typed:** 4,027 of 4,082 find their own species first, before and after. No first hit changes. With the index rebuilt under the new names (below), it is still 4,027, and each of the 11 changed headlines finds its species first.
- **Families:** 81 genera of the index begin their family's name (F counted 17). Of 1,109 queries made of them, their species and their headlines, 73 answer otherwise in their first five. 66 lose a hit that came only from the family ("Crassula elegans": Echeveria elegans, E. harmsii, E. simulans, Sedum acre), and 7 are reorderings from the older-name rule.
- **Shared older names at an address:** 582 names (not an accepted name's address) are held by two species or more, 22 of them by three or more. On the base, 207 redirected to one holder. Now none does, and all 582 are 404s naming every holder.
- **Authors:** of the 1,187 holder-and-name pairs, the 9 October records give an author for 1,078 and none for 109. That is a floor: the live record of Acer rubrum holds "Acer sanguineum Spach", where the 9 October one had no such synonym.
- **Hyphenated binomial older names:** 233. 232 are held by one species and reached no page on the base; all 232 redirect now. The one shared name is a 404 naming its holders.
- **Headlines, N4:** over all 4,082, 11 change, and 23 species' name lists change. The 11:
  - Madia elegans: Showy tar weed to Showy tarweed
  - Duranta erecta: Pigeon berry to Pigeonberry
  - Prunella vulgaris: Self-heal to Selfheal
  - Erythranthe guttata: Monkey-flower to Monkeyflower
  - Grevillea robusta: Silk-oak to Silkoak
  - Artemisia stelleriana: Old-woman to Oldwoman
  - Tridax procumbens: Coat buttons to Coatbuttons
  - Tabernaemontana divaricata: Pinwheel-flower to Pinwheelflower
  - Araujia sericifera: Bladder-flower to Bladderflower
  - Hydrocotyle verticillata: Whorled Marsh pennywort to Whorled marshpennywort
  - Rhododendron macrophyllum: California rose bay to California rosebay

  The 12 other names that change under a title include Monk's hood to Monkshood, Castor-bean to Castorbean, Milk bush to Milkbush, and Common paw paw to Common Pawpaw. False acacia, Sweet scented geranium, Softseed wild petunia and Hubei Anemone stay: the rule gives them. Every list is in `scratchpad/N70` (`base-heads.json`, `n-heads.json`), made by `heads.mts`.

## Needs

### For P: `/about/how`, the species paragraph

- "then, given by as many, one written open or hyphenated before one written closed ("Swamp-mahogany", not "Swampmahogany"), its hyphens chosen by their sources too, then GBIF's first."
  becomes: "then, given by as many, one a botanical source gives before one only the World Register of Marine Species gives (Madia elegans is "Showy tarweed", not the register's "Showy tar weed"), then the one the species' botanical sources write so more often across all its names ("Selfheal", as they write "Common selfheal"), then one written open or hyphenated before one written closed ("Swamp-mahogany", not "Swampmahogany"), its hyphens chosen by their sources too, then GBIF's first."
- "and the page says which name was asked for."
  becomes: "and the page says which name was asked for; a name other species of the reference hold too is said as that, and never as a name the backbone accepts as this species."
- "250 on a front-page tile and 120 in a catalogue row or beside a genus."
  becomes: "250 on a front-page tile, in the strip under a species' name and on a Related tile, and 120 in a catalogue row or beside a genus."

### For P: `/about/how`, the search paragraph

- "the species that keeps the name's epithet first, then the one that shows the name among its six ("Aloe variegata" is Gonialoe variegata before Aloe vera);"
  becomes: "a species that holds the name exactly first ("Cornus mascula" is Cornus mas before Cornus officinalis, which shows "Cornus mascula var. japonica"), then the species that keeps the name's epithet, then one that shows the name itself among its six ("Aloe variegata" is Gonialoe variegata before Aloe vera);"
- "(a family is matched by a whole word, or from its start by a word of six letters or more, so "aizoac" finds the Aizoaceae while "plant" is never the start of Plantaginaceae)"
  becomes: "(a family is matched by a whole word, or from its start by a word of six letters or more that is neither a genus of the reference nor a word of the species' own name, so "aizoac" finds the Aizoaceae, "plant" is never the start of Plantaginaceae, and "Crassula elegans" is not the Echeveria elegans of the Crassulaceae)"
- "A species address under an older name goes to the species that shows it among its six, or to the one species that holds it; a name two species show, or that two hold only for the search, goes to neither, and the page says it is an older name of those species and names them."
  becomes: "A species address under an older name goes to the one species that holds it, among its six or for the search, read as the address is written, so /species/arbutus-uva-ursi is Arctostaphylos uva-ursi; a name two species or more hold goes to none of them, whichever shows it, and the page says it is an older name of those species and names each with the author under which its record holds the name, where the record gives one ("Echeveria farinosa Lindl., now Dudleya farinosa; Echeveria farinosa VanHoutte, now Dudleya pulverulenta")."

### For P: `/about/how`, the caching list (line 90)

- "a species address the reference does not hold, answered "not found", for five minutes,"
  becomes: "a species address the reference does not hold, answered "not found", for five minutes (not at all when GBIF could not be asked or a species' record could not be read),"

### For P: `/about/formats`, the search paragraph

- "for an older name the species that keeps its epithet and then the one that shows it;"
  becomes: "for an older name a species that holds it exactly, then the species that keeps its epithet, then one that shows the name itself;"
- "and a family is matched whole, or from its start by a word of six letters or more."
  becomes: "and a family is matched whole, or from its start by a word of six letters or more that is neither a genus of the reference nor a word of the entry's own name."

Nothing is needed in another agent's code. B's builder already writes the index with `indexNames`, so N4 reaches the index at `--index`.

## The corpus step

None of its own. F1, N2 and N3 act where the index and the dossiers are read. N4's headlines and spellings reach the live index at step 5's `--index`. `npx tsx scripts/audit-common-names.ts --dossiers <corpus>` names those changes under the new cause, before the upload. Until `--index` runs, the deployed rules show the old headlines.

## Not done, and the decision departed from

- **N4, "then lower case".** Measured as a rule between forms, placed before the open form: it changed 44 more headlines. Most moved to one checklist's hyphens ("Sand-lettuce", "Coral-bean", "Dove-tree"), and some for the worse ("Northern rata" for "Northern rātā", "Spotted joepyeweed", "Raffles' Pitcher-plant"). It is not a rule. Lower case still decides a word's capitals where some source writes the word so, as before. As a tie-break among one form's case variants it changed no headline, so it was not kept.
- **N4, between names.** The marine register is not discounted between names, for the reason above. It never decides a tie between spellings.
- **Checks.** `tsc --noEmit` and `svelte-check --threshold error` report nothing. The unit suite passes: 311 files, 2,739 tests, 1 skipped. It was run in chunks of twenty files with one worker, because whole runs were killed for memory while eight agents shared the machine.
