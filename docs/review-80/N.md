# Round 80, agent N: English common names from Wikidata

Branch `r80` in `/tmp/claude-0/rev80/N/`, four commits on `r80base` (1b1e9d3, 8427da2, 464bfe3, 21f211c). Scratch, measuring scripts and every list: `/tmp/claude-0/rev80/N-s/` (`NOTES.md`, `m/`, `measure-keyless-lines.txt`, `measure-keyed.txt`, `keyless-names.txt`).

## Done

**How names were chosen before (read first).** GBIF's vernacular rows (`gbif.vernacular`, one row per spelling and language, with `source`, `alsoFrom`, `sources`, `preferred`) go into `name.vernacular`. `englishNames` (`src/lib/dossier/index-entry.ts`) is the one rule for the page, the index and the catalogue: English rows only, comma lists split, spellings pooled by `nameKey`, a bare genus word or a single word given only in a list put after fuller names, a generic noun never the headline, another genus set back, then more sources, then the preferred flag, then GBIF's order, capitals read across spellings. `indexNames` adds the spellings the search reads; the index entry's `common` goes to the cards (`lookups.ts`) and the search. Sheets carry no names. A page without a GBIF key had `vernacular: []` and `gbif.vernacular` skipped with `NO_GBIF_WHY`.

**The rule** (`src/lib/dossier/wikidata-names.ts`, new; written in its header and on `/about/how`):

- Read: the item's P1843 statements in `en` and every `en-…` (one `en-us` in the whole set), each read as English, since GBIF's English does not tell them apart either. Any other language is not read, Scots (`sco`) included.
- Refused, each listed in the record with why: a statement ranked deprecated; a name with a letter outside the Latin script; the scientific name or one of Kew's names for it written as an English one; a genus named alone (the species' own, any genus of the reference, or one of `ENGLISH_USE`, by `bareGenus`); a binomial the reference holds as another species.
- Taken: each other name, as a `name.vernacular` row `{ name, lang: 'eng', source: 'Wikidata', preferred?, alsoFrom? }`, so `englishNames` orders and shows them exactly as it does GBIF's (generic nouns, set-backs and capitals included).
- The headline: the existing rule's order with Wikidata's meaning: a name's sources are Wikidata itself and each reference of its statement that names a source outside Wikimedia (P248 "stated in", else the host of a P854 URL), each counted once; P143 "imported from" (English Wikipedia, Wikispecies) or a Wikimedia URL counts nothing. So more references first, then the preferred rank (only a tie-break, as GBIF's flag), then the alphabet, because the query service gives no statement order. Both readings (the entity's claims in the build, a query's bindings in the fill) give the same statements, so build and fill agree (tested).
- The record `upstream['wikidata.names']`: `ok` with the item, the names taken and those refused; `none` where Wikidata answered and holds none the rule takes, or where no item carries Kew's identifiers; `skipped` (two items, or Wikidata not asked) and `refused`/`error` (it did not answer), each with why.

**The builder** (`build-kew.ts`): `kewItem` already reads the item's entity (claims and sitelink, batched fifty a request by `batch.ts`), so the names come from that read, with no extra request. `KewBuildOptions.genera` is new; `build-dossiers.ts` passes the reference's genera (`kewGenera`). This applies from the next build of such a page; round seventy-nine's build is untouched (it runs round seventy-nine's code).

**The fill** `--fill wikidata-names` (`fillWikidataNames`; `fillWikidataNamesStep` in `build-dossiers.ts`, through `upstream()`, the day's cache, as every fill): one pass over the dossiers for names and genera, then SPARQL, `WD_NAMES_ITEMS` = 200 items a query (address under 4.1 kB), English only, any rank, each reference's P248 and P854. Each page's earlier Wikidata rows are replaced, GBIF's left; a page whose query did not answer is left as it was and counted (exit 3, so `corpus-step` says "a source did not answer"); a page with no item gets the record of why; an unchanged page is not written (a second run writes nothing). Then the index.

**Behind a flag, off by default:** `--keyed` also asks for keyed pages whose GBIF rows give no English name, appending Wikidata's rows; a later `--keyed` run removes them once GBIF gives one. Kept elsewhere: the `--names` step keeps Wikidata rows beside GBIF's fresh ones (`scripts/names-step.ts`), and an offline re-derivation carries them with their record or drops them when it has no record (`build.ts`, `taxon.wdNames`, passed by `build-dossiers.ts`). A fresh build of a keyed page drops them, as it drops the record.

**Pacing** (`fetch.ts`): `alsoPacedAs('query.wikidata.org')` is `['wikimedia']`: a query takes a slot of Wikimedia's shared allowance (0.35 s) as well as the query service's own 1.1 s, so the build's and the fills' queries are paced as one with Wikimedia's other sites. `paceKey` is unchanged.

**The site.**

- The species page: under the name, `#names-source`: "English names from Wikidata, item Q… (linked), read <day> (CC0)." where names were taken. For a page without a GBIF key, "English names not checked: <why>." where Wikidata did not answer, two items answered, it was not asked, or the dossier has no record yet (a round seventy-nine dossier before the fill). Nothing where Wikidata answered none (Provenance says "nothing to report"). `namesSource` in `src/lib/ui/ref/upstream.ts`.
- Provenance: the row "Wikidata common names" (`UPSTREAM_NAME['wikidata.names']`).
- The index, cards and search carry the names because they come from `name.vernacular` through `indexNames`; no code there changed.
- The export's LICENSE.md: a row for vernacular names whose `source` is Wikidata, CC0 1.0 (`scripts/export-corpus-lib.ts`).

**About pages** (each checked against the code):

- `/about/how`, sources paragraph: "The common name shown is one of the English names GBIF reports, chosen by a fixed rule…" was untrue of these pages; now "…GBIF reports (for a page without a GBIF key, Wikidata's, below), chosen by a fixed rule…".
- `/about/how#no-gbif-key`: after the Commons clause, the whole rule: what is read, what is refused, the order, the page's line, not checked and none, when it is read, and "Pages with a GBIF key take no names from Wikidata."
- `/about/formats`: the vernacular passage says what a `source: "Wikidata"` row holds (`alsoFrom` as references, `preferred` as rank). The keyless-dossier passage says where its English names are and what `upstream['wikidata.names']` says, and that a dossier without that row is not checked.

**DEPLOY.md**: `### Round eighty: common names from Wikidata`, before round seventy-seven's section. New plan `scripts/corpus-plan-r80-names.txt`: backup, the fill, a review, upload, live check.

**Fixture.** `k457911` (Hesperocyparis lusitanica) has two Wikidata names made for the test, "Mexican cypress" (stated in USDA PLANTS) and "Cedar of Goa". `scripts/dev/r80n-fixture-names.ts` writes them by the rule, and the index entry by `indexNames`. The live item Q50843040 holds no English name, so a real build gives "none" (checked live: the fill on a copy wrote `none`). `r61q-common-name-rule.test.ts` now counts two species with a common name.

**Tests** (each fails on `r80base`: `wikidata-names.ts`, `namesSource` and `alsoPacedAs` did not exist, the names step dropped the rows, the page had no name):

- `tests/unit/r80n-wikidata-names.test.ts` (13):
  - reading en and en-us, the references that count, and "imported from";
  - each refusal with why;
  - the headline order, en and en-gb pooled, "Cactus" never shown;
  - the query's reading equal to the entity's;
  - the builder's record for ok, none, two items, refused and not asked, with no extra request;
  - the fill: one query, a second run writes nothing, keyed pages left alone, `--keyed` adds and later removes, a failed query leaves pages as they were, 200 items a query;
  - the index entry, the card and the search finding "mexican cypress" and "cedar of goa";
  - the page's line;
  - the pacing.
- `tests/unit/r80n-names-kept.test.ts` (3): the `--names` step keeps the rows; an offline re-derivation carries them with the record, or drops them; the fixture matches the rule.
- `tests/e2e/r80n-wikidata-names.spec.ts` (3): the page's names and `#names-source` with its link, both Provenance rows; the search API by both names (first hit, no `gbif`), the API dossier, the front page's tile; a keyed page shows no line.

## Needs

- **R (the not-checked pages).** `#names-source` sits under the name in `.idcard`, after `#kew-cited`. Its not-checked wording is "English names not checked: <why>." If you want it as a `NotChecked` pill with the others, it is one line in `+page.svelte`. If your branch changes `fixtures/dossiers/s/v3/k457911.json` or `fixtures/dossiers/index.json` (single-line JSON, so any two edits conflict), take yours at the merge and run `npx tsx scripts/dev/r80n-fixture-names.ts`, which puts my two names and the entry's names back (a second run changes nothing).
- **Merge (DEPLOY.md and the about page).** If the owner turns `--keyed` on, replace "Pages with a GBIF key take no names from Wikidata." in `/about/how#no-gbif-key` with: "A page with a GBIF key whose GBIF names give it no English name takes Wikidata's by the same rule, from its own item, when the build's <code>--fill wikidata-names --keyed</code> step is run, and loses them once GBIF gives it one." Also add `dossier --fill wikidata-names --keyed` to the plan after each build. The sources paragraph's parenthesis would then read "(for a page without a GBIF key, or one GBIF gives no English name, Wikidata's, below)".
- **X.** None from me. I found no fault in round seventy-nine's build path on names: a keyless page's `vernacular: []` with `gbif.vernacular` skipped is honest, and its page says nothing false of names until round eighty's Worker and fill.
- **V.** None.

## For the owner's PC

After round seventy-nine's upload, with round eighty's code:

```
node scripts/predeploy.mjs --tier=app
node scripts/corpus-ready.mjs && npm run deploy
node scripts/corpus-step.mjs --plan scripts/corpus-plan-r80-names.txt
```

The Worker goes first: round seventy-nine's would show the names but say on `/about/how` that every common name is GBIF's. The fill is about 10 SPARQL queries for 1,868 items (12.8 s here, all 2,327 pages), then `--index` (10 to 30 minutes at 48,368) and an upload of what changed (about 2,327 dossiers and the products holding names). Good output and the review are in DEPLOY.md. A rebuild later keeps the names with no extra request. `--keyed` is your decision (Measured).

## Measured

All live, Wikidata's query service, one query at a time with the project's `USER_AGENT`, 2026-10-21.

**The 2,327 pages without a GBIF key.** Kew's identifiers from `wcvp_names.csv`; items by K's batched query (47 queries): one item for 1,868, two for 12, none for 447, as K measured. Their English P1843 (10 queries, 11 s): 332 statements on 250 items; `en` 331, `en-us` 1; 330 normal, 2 preferred, none deprecated. References: USDA PLANTS 163, IUCN Red List 27, ARKive 15, iNaturalist 11, Belgian Species List 9; 27 with none and 19 only "imported from" Wikispecies or English Wikipedia. The fill over synthetic pages built from Kew's file and those items (12.8 s, 10 queries):

- **249 pages take names, 243 show one.** The other 6 take only ARKive's "Cactus" (Copiapoa esmeraldana, three Echinopsis, two Ferocactus), searched, not shown.
- 1,619 items hold none the rule takes. 459 pages have no item and say why (447 none, 12 two items, not checked).
- Refused: "artocarpus" (Artocarpus mariannensis, a genus alone; the page then has none) and "woodsia" (Woodsia scopulina). No deprecated, other-script or scientific-name statement occurred.
- Examples:
  - Allium porrum "Garden leek"; Hesperocyparis macrocarpa "Monterey cypress"; Blechnum spicant "Deer fern; Hard fern".
  - Sanguisorba minor "Small burnet; Salad burnet"; Monotropa hypopitys "Yellow Bird's-nest; Pinesap" (the preferred rank breaks a tie of one reference each).
  - Cylindropuntia bigelovii "Teddy bear cholla"; Picea albertiana "Interior spruce; Western white spruce"; Solanum rostratum "Buffalo bur" (nine names); Ferocactus hamatacanthus "Turk's head" (given by USDA and IUCN, over four names IUCN alone gives).
- Doubtful, all shown as Wikidata gives them (rule 1 lets no hand correct them):
  - Woodsia scopulina "Cliff-fern", the genus's name, over "Rocky Mountain woodsia": a tie of two sources each, settled by the alphabet.
  - Cleome speciosa "Volantines preciosos": Spanish, tagged `en`, from USDA.
  - Primula jeffreyi "Sierrra shootingstar", a typing error from USDA.
  - Ceratozamia becerrae "Cycad" and Rhus taitensis "Sumac": genus-level single words. "cycad" is not in `GENERIC_NOUNS`; adding it would hide the first.
  - Ismelia carinata "Carinated glebionis", the last word an older genus.
  - Anchusa arvensis "Bugloss" over "Small bugloss": a tie, settled by the alphabet.

**The keyed pages of round seventy-seven's corpus** (8,947): 4,861 have no English name from GBIF. Only two of them have any English row (generic nouns); the rest have none at all, among them Eucalyptus camaldulensis, Larrea tridentata, Clivia miniata, Murraya paniculata and Ixora coccinea. 4,771 of them have a Wikidata item (24 queries, 26 s). With `--keyed`:

- **105 would gain names and 69 would show one.** The other 36 take only "Cactus".
- 29 of the 69 are ARKive's "Pitcher plant" for Nepenthes species. A few more are genus names too: "Stone plant", "Cone plant", "Bottle tree", and Spanish "Biznaguita" for three Mammillaria.
- The rest are good: "River redgum", "Creosote bush", "Bush lily", "Miner's lettuce", "Orange jasmine", "Black sapote", "Barbados lily", "Kauri".
- One refusal: "thaumatophyllum" for Philodendron bipinnatifidum.
- So the gain is small, and nearly half of what is shown is a genus's name. I would leave it off, or take it with "pitcher plant" handled as a generic name; it is your decision.

**Runs.**

- `tsc --noEmit -p .` and `svelte-check --threshold error`: 0 errors. Scripts-only `tsc`: only the old `judged` lines in `build-dossiers.ts`.
- New unit files: 16 passed.
- The whole unit suite once: 4,292 passed, 1 failed (`r72d-day-cache`, which requires every fill to ask through the day's cache). Fixed in 21f211c and passed after.
- Strict Chromium, port 4742: `r80n-wikidata-names` and `r79k-no-gbif`, 8 passed; after the fix, `r80n-wikidata-names`, `r73p-front` and `r75g-most-grown`, 10 passed.
- The real command on a scratch corpus (the fixture plus six real keyless species): the lines above, the index carrying "Garden leek", "Yellow Bird's-nest" and "Cliff-fern", and a second run "0 dossiers written".

## Not done, with why

- **The flag's names for keyed pages in the build itself.** Only the fill reads them, after each build, since the flag is off and a fresh keyed build asks GBIF afresh. A build reading them would need the item's claims kept per keyed page; it is not needed unless the owner turns the flag on.
- **The item's own order of statements.** The query service does not give it, so the last tie-break is the alphabet, the same for build and fill. Reading every entity in full instead (fifty items a request, much larger answers) would give it.
- **A correction of doubtful names** ("Sierrra", the Spanish one): rule 1 lets no hand fix them; they would be fixed in Wikidata.
- **The whole e2e suite**: only the specs this change touches were run (smoke-1 and smoke-3 count Hesperocyparis's rows but read no common name).
