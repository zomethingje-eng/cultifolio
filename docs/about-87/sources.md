# Round 87, stage 2: the sources agent's sources, sentences and owner's steps

Branch r87-s2sources. Four fields, one fill, four species-page lines:

| Field | Source | Code | Line on the page |
|---|---|---|---|
| `risk` | Kew's predicted extinction risk (Bachman et al. 2024) | `src/lib/dossier/risk.ts` | `src/lib/ui/ref/RiskLine.svelte` |
| `cites` | CITES Appendices I, II and III (hand-transcribed table) | `src/lib/dossier/cites.ts`, `cites-appendices.tsv` | `src/lib/ui/ref/CitesLine.svelte` |
| `chromosomes` | ChromoDB, IAPT/IOPB set, version 3.1 | `src/lib/dossier/chromosomes.ts` | `src/lib/ui/ref/ChromosomeLine.svelte` |
| `nameAgreement` | WFO Plant List, release 2026-06 | `src/lib/dossier/wfo.ts` | `src/lib/ui/ref/NameAgreement.svelte` |

Written by `--fill sources --bulk bulk` (`src/lib/dossier/sources-fill.ts`), and by the walk: a build given `--bulk`
runs the same fill on the pages it built, after `--fill kew-names`. Every sentence below is what the code on this
branch does. The species agent places them; each block says where. Everything here was read on 9 November 2026.

## Licence decisions

1. **Kew's predicted extinction risk: used, CC BY 4.0.** The Zenodo record "Predicted extinction risk for all
   Angiosperm (flowering plant) species", version 1.0, 1 February 2024 (https://zenodo.org/records/10605228,
   https://doi.org/10.5281/zenodo.10605228), states CC BY 4.0. Its paper is Bachman, Brown, Leão, Nic Lughadha & Walker,
   "Extinction risk predictions for the world's flowering plants to support their conservation", New Phytologist 242(2):
   797-808, online 4 March 2024 (https://doi.org/10.1111/nph.19592), also CC BY 4.0 (Crossref's record). It is the
   current version (the record's "latest" is itself).
   - The file's `category`, `observed_threat` and `combined` columns are IUCN's Red List category or made from it. None
     is kept. IUCN's terms (CC BY-NC-SA, as POWO shows them) do not let the reference show them. The code reads only
     whether `category` holds a category, so the page can say the Red List has assessed the species and link IUCN's
     page. The record itself says a published assessment should be used before a prediction.
   - The brief said the file is keyed by WCVP plant_name_id. It is not today's: its ids are an earlier form of WCVP's, with their
     source database ("10-wcs", "1000003-az"). One number can stand for two names (329046-az and 329046-wcs both exist).
     The match is by the file's `ipni_id` against the page's IPNI id.
   - IUCN's page is linked only by the IUCN id the page's Wikidata item gives (P627), as Wikidata's formatter writes it:
     `https://www.iucnredlist.org/details/<id>/0` (https://www.wikidata.org/wiki/Property:P627).
2. **CITES: the Appendices themselves, transcribed by hand. Never Species+ or the Checklist.**
   - The CITES Checklist (https://checklist.cites.org) is the structured download from CITES. Its data come from
     Species+ (its app reads api.speciesplus.net), and its terms forbid redistribution, sub-licensing, derivative works
     and commercial use without the Secretariat's and UNEP's written permission
     (https://checklist.cites.org/terms_of_use_page_en.html). Not used.
   - The Appendices page (https://cites.org/eng/app/appendices.php) and its PDFs answer a script with a browser check
     (HTTP 403), so neither the edition in force nor cites.org's own terms could be read here. The table
     (`src/lib/dossier/cites-appendices.tsv`, 244 plant listings) is the FLORA pages (pp. 61-79) of the edition valid
     from 7 February 2025. They were read from the copy the North American Rock Garden Society keeps
     (https://www.nargs.org/files/pages/cites_flora_e-appendices-2025-02-07.pdf, 384,051 bytes, md5
     d93e60c5e6c0221e6a882427d2dca031; its PDF names the CITES Secretariat as author). The plant amendments of CoP20
     (in force 5 March 2026) were added as Notification to the Parties No. 2026/005 gives them
     (https://cites.org/sites/default/files/notifications/E-Notif-2026-005.pdf). They were read through the U.S. Fish
     and Wildlife Service's notice PB 26-001 of 13 January 2026
     (https://www.fws.gov/sites/default/files/documents/2026-01/ole-public-bulletin-cites-cop20-amendments-to-appendices-i-and-ii-pb-26-001-01_13_2026.pdf).
     The CoP20 rows are Podocarpus parlatorei to II, Anacampseros quinaria (Avonia quinaria) and Euphorbia bupleurifolia
     to I, Jubaea chilensis in I, Commiphora wightii in II, four Aloe species in Aloe spp., and two Beaucarnea species
     in Beaucarnea spp.
   - **So the table is not applied until the owner has checked it** against the edition in force (the step below).
     Until then every page says "not asked", never "not listed". Each row keeps the URL of the edition or Notification
     it was read from, with its page.
   - Species+ is only linked, by the taxon's Species+ id from the page's Wikidata item (P2040), as Wikidata's formatter
     writes it: `https://speciesplus.net/#/taxon_concepts/<id>` (https://www.wikidata.org/wiki/Property:P2040).
3. **ChromoDB: version 3.1, CC BY 4.0. The brief's version 2.0 is withdrawn: not used.** Zenodo 18343310 (version
   2.0, 22 January 2026) now carries the authors' warning of 6 November 2026. Its records file has a row-alignment
   error (names, counts and countries not linked to their count_id and biblio_id), its files are restricted, and it
   "must not be used". The current version is 3.1, 8 November 2026 (https://zenodo.org/records/24057855,
   https://doi.org/10.5281/zenodo.24057855; all versions 10.5281/zenodo.17156033), by Simon, Bosch & Blanché
   (Universitat de Barcelona), CC BY 4.0. Its exception is the verbatim source excerpts of the antecedents file, which
   is not read. The code reads version 3.0 or later only. CCDB states no licence and is not used.
4. **WFO Plant List: release 2026-06, CC0 1.0.** World Flora Online Plant List June 2026, published 21 June 2026
   (https://zenodo.org/records/20782718, https://doi.org/10.5281/zenodo.20782718). It is the latest of the six-monthly
   releases (2025-12 before it; 2026-12 is due in December).

## The owner's download steps

All files go in `bulk/` beside Kew's files. Check each md5 (PowerShell: `Get-FileHash -Algorithm MD5 <file>`). The
build checks the first three itself and says "md5 as its publisher gives it", or "NOT the one its publisher gives".

1. **Kew's predicted extinction risk.** https://zenodo.org/records/10605228/files/Angiosperm_extinction_risk_predictions_v1.csv?download=1
   → `bulk/Angiosperm_extinction_risk_predictions_v1.csv` (55,277,287 bytes, md5 e6fbee92fe19b783345cda27fc18eddc,
   328,565 rows). Keep the name: the version is read from it.
2. **ChromoDB.** From https://zenodo.org/records/24057855, both files, names kept:
   `bulk/IOPB_IAPT_records_v3_1.csv` (5,924,887 bytes, md5 e5ad7aae7d1ab864d92d7e8ca5b904bd, 32,063 records) and
   `bulk/IOPB_IAPT_biblio_v3_1.csv` (629,998 bytes, md5 462c7f9b934fa80bd055b741582da51a, 1,709 references). The
   other three files and README.md are not read. If a later version is out, take it (both files): the newest beside
   its bibliography is read, and the build says when this code does not know its md5.
3. **WFO Plant List.** From https://zenodo.org/records/20782718, the file `_DwC_backbone_R.zip` (121,660,019 bytes,
   md5 0e4486945cd9f7af548ca87eb9a870ed), **saved as `bulk/wfo_backbone_2026-06.zip`**: the release is read from the
   name. Do not unzip it: its classification.csv is 952,821,772 bytes, and the build streams it out of the zip twice
   (unzip on Linux, tar on Windows 10 and later, as the GBIF download is read). Unzipped, it must be renamed
   `bulk/wfo_classification_2026-06.csv`.
4. **CITES: the owner's check, once, before the table applies.**
   1. In a browser, open https://cites.org/eng/app/appendices.php. Read the edition in force ("valid from …") and
      cites.org's terms of use at the foot of the page. If the edition is not "valid from 5 March 2026", the table's
      `valid-from:` and `edition:` lines change too.
   2. Download the edition's English PDF (now
      https://cites.org/sites/default/files/eng/app/2026/E-Appendices-2026-03-05.pdf) to `bulk/` and take its md5.
   3. Read its FLORA pages against `src/lib/dossier/cites-appendices.tsv`, row by row: each Appendix, name, annotation
      and parenthesis. Most likely to differ are the CoP20 rows, whose exact wording is the Notification's as relayed,
      and the Appendix III rows, which a Party can change at any time. Correct a row in place; add one the PDF has
      and the table has not.
   4. Set the header line `# checked: no` to `# checked: <YYYY-MM-DD> md5 <the PDF's md5>`, commit, and run the fill
      (below). The build's line then says "checked <day> against md5 <md5>" and the pages read the table.

## Corpus-plan lines

After the walk (`--walk --offline --grid climate --bulk bulk` runs the fill on the pages it builds, but a walk that
stopped and resumed leaves its first part's pages to it), once over every page:

```
dossier --fill sources --bulk bulk
review Read the four lines after "Reading the stage-2 sources for N dossiers": each names its file, its date and its md5 ("md5 as its publisher gives it"), the rows read, and the pages matched. Expect about 330,000 risk rows, 32,063 ChromoDB records and 1,664,014 WFO rows; most pages matched by IPNI id for risk (flowering plants only) and found in WFO's list, a few thousand with counts. The CITES line says "not yet checked" until the owner's check (step 4) is done; then "N pages listed". Stop if a line says "md5 NOT the one its publisher gives", or "not asked" for a file you put in bulk/. Then "N dossiers read, M written": a second run writes 0.
dossier --index
```

The fill writes the index at its end. The second line is only for a plan that runs the fill before other fills.
Nothing is asked online, so there are no rate limits or day budgets.

## /about/how

### 1. The sources table (`<table class="src">` under "What comes from where", h2 `#sources`)

Four new rows, after the Wikipedia row:

```html
<tr><th scope="row">Kew's extinction risk predictions (Bachman et al. 2024)</th><td>A model's probability that the species is threatened, with its 95% interval and the model's confidence: a prediction, not an assessment.</td><td><a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></td></tr>
<tr><th scope="row">CITES Appendices</th><td>Whether the plant is listed in Appendix I, II or III, and by which listing, read from the Appendices themselves.</td><td>The Convention's text, transcribed by hand and linked; nothing of Species+ is used</td></tr>
<tr><th scope="row">ChromoDB (IAPT/IOPB chromosome data)</th><td>Chromosome counts as published, each with its reference.</td><td><a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></td></tr>
<tr><th scope="row">WFO Plant List</th><td>Whether World Flora Online accepts the page's name, holds it as a synonym, or does not hold it.</td><td><a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0 1.0</a></td></tr>
```

### 2. A new h3 after "Identifiers and links" (`#ids`), before `#inat`

```html
<h3 id="risk-cites">Extinction risk, CITES and chromosomes</h3>
<p class="sum">Three lines come from files read whole by the build, offline, and are matched to the page by its IPNI identifier, never by a likeness of names. Each names its source, the source's date, its licence and the day it was read.</p>
<details class="full in-full"><summary>The rules in full<span class="sr">: extinction risk, CITES and chromosomes</span></summary>
<ul class="rules">
  <li id="risk">The extinction risk is Kew's model's (Bachman et al., New Phytologist, 2024), read from Kew's data of 1 February 2024. That is the probability the model gives that the species is threatened, its 95% interval, the class it predicts and whether it is confident of it. It covers flowering plants only.</li>
  <li>It is said as a model's prediction, never as an assessment. The file's Red List categories are not read, and the page shows none. Where the file marks the species as assessed by the IUCN Red List, the page says so and links IUCN's page, by the IUCN identifier the species' Wikidata item gives.</li>
  <li>The prediction is matched by the IPNI identifier of the page's name. The file's own numbers are an earlier form of Kew's, not those of the file the pages are built from.</li>
  <li id="cites">The CITES status is read from the plant listings of the Appendices, as CITES publishes them, transcribed by hand with the page and address each was read from. Nothing is read from Species+ or the CITES Checklist, whose terms do not allow it. Species+ is only linked, by the identifier the species' Wikidata item gives.</li>
  <li>A listing of the page's own name, or of a name it includes, is the page's. Failing that, a listing of a name Kew holds as a synonym of it, which the page names. A name the listing excepts (Aloe vera from Aloe spp.) is not listed.</li>
  <li>Failing those, a listing of its genus (Ariocarpus spp.), then of its family (CACTACEAE spp.), with the listing's exceptions.</li>
  <li>Not decided, and said so, where the page's names do not decide. That is where the Appendices' genus or family is narrower than Kew's (Kew's Didiereaceae holds Portulacaria, the listing does not), where only a synonym's genus is listed, or where the listing is of "succulent species only".</li>
  <li>The page says the Appendix, the listing and its level, its annotation and parenthesis, the day the Appendices are in force from, and links the official Appendices. It gives no reading of what a listing requires.</li>
  <li id="chromosomes">Chromosome counts are ChromoDB's, from the IAPT/IOPB chromosome data series, version 3.1 of 8 November 2026. Each number is as published (2n, then n), with its reference linked to its DOI or stable address, and the name it was published under where that is another.</li>
  <li>A count is the page's only when its record's identifier is the page's IPNI identifier and its accepted name is the page's name. Counts their authors retracted and numbers inferred from genome size are left out. A page shows at most twelve counts and says how many more there are.</li>
  <li>Where a file was not there when the page was built, the line says "not asked". A file read and holding nothing for the page says that, with the file's date.</li>
</ul>
</details>
```

### 3. The name (h3 `#names`): add to its "The rules in full" list, after the last item

```html
<li id="wfo">Under Names and registers, one line says how the WFO Plant List (World Flora Online's release of June 2026, CC0) reads the page's name: accepted, a synonym of another name it names, held but not yet placed, or not held. WFO's row is found by the name's IPNI identifier. Where WFO gives the name no IPNI identifier, it is found by the exact name and authors, and only where one row answers. The line is WFO's reading, beside Kew's, and changes nothing on the page.</li>
```

### Sentences made untrue

None on /about/how. One on /about/data (next section): "Its NOTICE names every source, with its licence." stays
true only once NOTICE names these four (below).

## /about/data: the licence table (`#licences`), four new rows after "The quoted summary"

```html
<tr><td>Predicted extinction risk: the model's probability, interval and confidence (in each species file)</td><td>Bachman et al. 2024, Kew's data on Zenodo (10.5281/zenodo.10605228)</td><td><a href={CC_BY}>CC BY 4.0</a></td></tr>
<tr><td>CITES Appendix status (in each species file)</td><td>The CITES Appendices, transcribed by hand</td><td>The Convention's text; no Species+ data</td></tr>
<tr><td>Chromosome counts and their references (in each species file)</td><td>ChromoDB, IAPT/IOPB chromosome data, version 3.1 (10.5281/zenodo.24057855)</td><td><a href={CC_BY}>CC BY 4.0</a></td></tr>
<tr><td>WFO's reading of the name (in each species file)</td><td>WFO Plant List, release 2026-06 (10.5281/zenodo.20782718)</td><td><a href={CC0}>CC0 1.0</a></td></tr>
```

## NOTICE (not this agent's file): four entries for whoever edits it

```
Predicted extinction risk for all Angiosperm species, v1.0 (2024-02-01). Bachman, S.P., Brown, M.J.M., Leão, T.C.C., Nic Lughadha, E., Walker, B.E. https://doi.org/10.5281/zenodo.10605228. CC BY 4.0. Paper: New Phytologist 242: 797-808, https://doi.org/10.1111/nph.19592. IUCN categories in the file are not used.
CITES Appendices I, II and III (valid from 5 March 2026), CITES Secretariat, https://cites.org/eng/app/appendices.php: plant listings transcribed by hand (src/lib/dossier/cites-appendices.tsv). No Species+ or CITES Checklist data.
ChromoDB Source Data: Chromosome counts from the IAPT/IOPB chromosome data series, v3.1 (2026-11-08). Simon, J., Bosch, M., Blanché, C. https://doi.org/10.5281/zenodo.24057855. CC BY 4.0.
World Flora Online Plant List, release 2026-06 (2026-06-21). https://doi.org/10.5281/zenodo.20782718. CC0 1.0.
```

## For the species agent: mounting the four lines

- `<RiskLine risk={d.risk} iucnId={…} />`, `<CitesLine cites={d.cites} speciesPlusId={…} />` and
  `<ChromosomeLine chromosomes={d.chromosomes} />`, together, in a block of their own under The record, or wherever
  the look puts conservation facts.
- `<NameAgreement agreement={d.nameAgreement} />` in Names & registers, after "Also known as".
- `iucnId` is the page's IUCN Red List id (Wikidata P627) and `speciesPlusId` its Species+ id (P2040), from the links
  agent's `elsewhere` field, which holds both. Without them the lines link neither.
- Each line renders "not asked" for a field that is absent, so a dossier written before the fill shows that.
