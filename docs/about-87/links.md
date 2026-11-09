# Round 87, stage 2: the links agent's sentences for the about pages

Branch r87-s2links. Three fields, four fills, three species-page sections:

- `flowering` (`src/lib/dossier/flowering.ts`, `--fill flowering`; shown by `src/lib/ui/ref/Flowering.svelte`)
- `elsewhere` (`elsewhere.wikidata` by `--fill elsewhere`, `src/lib/dossier/elsewhere.ts` and `elsewhere-links.ts`;
  `elsewhere.published` by the walk with `--bulk` or `--fill kew-published --bulk bulk`, `kew-published.ts`;
  `elsewhere.published.bhl` by `--fill bhl`, `bhl.ts`; shown by `src/lib/ui/ref/Elsewhere.svelte`)
- `parents` (the walk with `--bulk` or `--fill kew-published`, `kew-published.ts`; shown by `src/lib/ui/ref/Parents.svelte`)

Every sentence below is what the code on this branch does. The species agent places them; each block says where.

## /about/how

### 1. The sources table (`<table class="src">` under "What comes from where", h2 `#sources`)

Change three rows' middle cells and add one row (after the Wikipedia row):

- iNaturalist, old: `Photographs, the taxon a page links, and the counts of plants observed in cultivation that the species list and "Popular genera" were made from.`
  new: `Photographs, the taxon a page links, the counts of plants observed in cultivation that the species list and "Popular genera" were made from, and the counts of wild plants observed in flower, by month.`
- WCVP, old: `The accepted name and author, the native range, Kew's one-line description, and Kew's own words for the range, quoted.`
  new: `The accepted name and author, the native range, Kew's one-line description, Kew's own words for the range, quoted, where the name was published, and a hybrid's parents.`
- Wikidata, old: `Identifiers in other databases, the Wikipedia article's title, the list of botanic gardens, and English names for a page with no GBIF key.`
  new: `Identifiers in other databases, linked under "Elsewhere", the Wikipedia article's title, the list of botanic gardens, and English names for a page with no GBIF key.`
- New row:
  `<tr><th scope="row">Biodiversity Heritage Library</th><td>A link to the page where a name was published, where its resolver gives one page for exactly Kew's citation.</td><td>A link only: nothing of BHL's is copied</td></tr>`

### 2. Identifiers and links (h3 `#ids`)

The summary sentence, old (made untrue by "Elsewhere"):
`The links to POWO, IPNI, World Flora Online and iNaturalist come from Kew's file and from Wikidata. An identifier is linked only where it is shown to be this plant's.`
new:
`The links to POWO, IPNI, World Flora Online and iNaturalist come from Kew's file and from Wikidata, and the links under "Elsewhere" from the page's own Wikidata item. An identifier is linked only where it is shown to be this plant's.`

Add to its "The rules in full" list, after the last item:

```html
<li>"Elsewhere" links the other registers and floras the page's own Wikidata item names: Tropicos, Catalogue of Life, Euro+Med, Species+ (CITES), the IUCN Red List, the Red List of South African Plants, NatureServe, Flora of North America, Flora of China, USDA PLANTS, Calflora, Reflora, Flora of Australia, APNI, FloraBase, VicFlora, NSW Flora, Missouri's Plant Finder, CalPhotos, BHL, EOL, ITIS and NCBI.</li>
<li>Each is the item's own identifier, made a link by the address Wikidata gives its property (<a href="https://github.com/zomethingje-eng/cultifolio/blob/main/src/lib/dossier/elsewhere-links.ts">the list, with each property</a>). The page's own registers, GBIF, POWO, IPNI, WFO and iNaturalist, are linked once, by the build's identifiers; the item's are used only for one the page does not link.</li>
<li>The items are read fifty a request, and the page says the item and the day it was read. A preferred value is read first, and a deprecated one never. An item read for another item than the page's now is not shown.</li>
<li>Until its item has been read, the line says "not asked"; where Wikidata did not answer, "not checked", with the day. An item Wikidata no longer serves under the page's id, deleted or merged into another, gives no links, and the page says it was not answered.</li>
```

### 3. A new h3 after "Identifiers and links" (before `#inat`): where the name was published

```html
<h3 id="published">Where the name was published</h3>
<p class="sum">The page quotes where its name was published, as Kew's file gives it. It links BHL only where BHL's resolver gives one page for exactly that citation.</p>
<details class="full in-full"><summary>The rules in full<span class="sr">: where the name was published</span></summary>
<ul class="rules">
  <li>The citation is Kew's place of publication, volume and page, and year for the page's Kew entry, quoted as Kew's file writes them ("Kew Bull. 16: 181 (1962)"), credited to WCVP with the day of Kew's file.</li>
  <li>BHL's resolver is asked only a citation it can be given whole: a title, a plain volume and page ("16: 181") or a page alone (": 293", a book), and one year ("(1962)"). Any other form, "5(9): 6" or "(1862 publ. 1863)", is not asked, and is shown as text.</li>
  <li>BHL's page is linked only when BHL answers one citation whose address is one page, numbered as the citation's page, in the citation's volume, and dated in its year. Otherwise the citation is shown as text. No page is guessed.</li>
  <li>BHL is asked once a second at most, and 4,000 times a day. A citation it did not answer is asked again by the next run; one Kew's file changes is asked again.</li>
</ul>
</details>
```

### 4. Hybrids (h3 `#hybrids`)

Replace the item `<li>The page says the parents Kew's file states.</li>` by:

```html
<li>The page says the parents Kew's file states for the hybrid's entry (its hybrid formula), and links each to its page here where Kew's ids lead to one.</li>
<li>A parent is read by Kew's exact words, the genus written out only where Kew writes the hybrid's own genus by its initial ("A. glutinosa" under Alnus). Its words must name a row of Kew's file, and its page is the entry Kew accepts for that row.</li>
<li>Where the words name other authors' names as well as the one Kew accepts, the accepted one is the parent, and the page says how many others there are. Words that name no row, or rows of more than one plant, are listed with why and linked nowhere.</li>
<li>Each parent's habitat figures are shown beside the other's, each with its source, read from that parent's own page when the page is served: the coldest month's mean low, the warmest month's mean high and the year's rain (CHELSA), and the record low (NASA POWER). They are never combined into one climate for the hybrid.</li>
```

### 5. A new h3 after "The iNaturalist taxon" (`#inat`), before "Papers": flowering by month

```html
<h3 id="flowering">Flowering by month</h3>
<p class="sum">A page shows how many of iNaturalist's research-grade observations of wild plants are marked as flowering, month by month. The months are the calendar's, as each plant was observed.</p>
<details class="full in-full"><summary>The rules in full<span class="sr">: flowering by month</span></summary>
<ul class="rules">
  <li>The counts are iNaturalist's: research-grade observations, not captive or cultivated, annotated "Flowering", by the month they were observed in, for the page's iNaturalist taxon, its varieties and subspecies included. The page names the day they were read and links the same search on iNaturalist.</li>
  <li>An observation not annotated is not counted, so the counts say when people saw the plant in flower and said so, not how long it flowers.</li>
  <li>The months are never moved to your hemisphere: an observation is dated where the plant was seen. Where the habitat climate is read south of the equator, the page says so.</li>
  <li>Under 12 observations, the strip is marked "from few records", as a habitat climate is, and shown as read. Twelve months of nothing is said as no observation annotated, never as a plant that does not flower.</li>
  <li>Until a page has been read, it says "not asked"; where iNaturalist did not answer, "not checked", with the day. iNaturalist is asked one request a page, at most one every 2 seconds, within the reference's 4,000 requests a day to iNaturalist.</li>
</ul>
</details>
```

## /about/formats ("Fields that may be absent", h3 `#dossier-fields`; after the `occurrences.api` item)

```html
<li><code>flowering</code> (<code>{`{ taxon, months?, read, unanswered? }`}</code>): iNaturalist's research-grade observations of wild plants annotated flowering, by month, January first, for the taxon named, and the day read. Without <code>months</code>, with <code>unanswered</code>: asked and not answered.</li>
<li><code>elsewhere.wikidata</code> (<code>{`{ item, read, ids, unanswered? }`}</code>): the identifiers the page's Wikidata item holds, each <code>{`{ p, v }`}</code>, its Wikidata property and value, and the day read.</li>
<li><code>elsewhere.published</code> (<code>{`{ place, volPage?, year?, row, file?, bhl? }`}</code>): where the name was published, as Kew's file writes it for the row named, and the day of Kew's file. <code>bhl</code> (<code>{`{ page?, none?, read }`}</code>): BHL's page for exactly that citation, or why none was taken, and the day asked.</li>
<li><code>parents</code> (<code>{`{ formula, row, file?, of }`}</code>): a hybrid's parents as Kew's formula states them. Each of <code>of</code> gives the words, Kew's row and accepted entry, the page here where there is one, and why where there is none. <code>others</code> counts the other authors' names of the same words.</li>
```

## The plan's lines (for the integrator's stage-2 plan)

No download: every step reads `bulk/wcvp_names.csv` (already in bulk/) or asks online.

```
dossier --walk --offline --grid climate --bulk bulk
review The walk's last lines include, after Kew's names: "Kew's file of 2026-06-04: N pages read, … P pages say where their name was published; H hybrids list X parents as Kew states them: L linked to their pages here, E Kew entries with no page here, U not matched (said why); … pages written". Expected on the live corpus (measured against the live index and Kew's file of 2026-06-04): about 48,367 citations, 506 hybrids, 1,031 parents, about 918 linked, 73 entries with no page, 40 not matched. If P is far below 48,000, stop and paste the end of corpus-step.log back.
dossier --fill elsewhere
review "N Wikidata items read on <day>: M hold an identifier of another register …". About 47,000 items (97.7% of a 781-page sample have one), fifty a request, under twenty minutes. If N is far below 45,000, or "not answered" is over a few hundred, stop and paste it back.
dossier --fill flowering
dossier --fill bhl
dossier --index
upload
live-check
```

`--fill flowering` and `--fill bhl` stop at their day's allowance (exit 3), which corpus-step reads as "run the same command again tomorrow". A walk run without `--bulk` leaves the citation and the parents as they were; `dossier --fill kew-published --bulk bulk` writes them alone (offline, about 15 seconds a pass of Kew's file, two or three passes).

How long the online fills take:

- `--fill flowering`: one request a page with an iNaturalist taxon: about 44,000 (90.9% of the sample, 710 of 781). At 2 s a request and 4,000 a UTC day: about 11 days, 2 h 13 min of requests a day, about 24.4 hours in all. iNaturalist's day is shared: a day that also runs `--fill inat` or `--fill credits` reads fewer pages.
- `--fill bhl`: 39,963 citations of the live corpus's 48,367 can be asked exactly. At 4,000 a day: 10 days at the least. BHL's resolver answered in about a second and in over 30 s when tried on 2026-11-09, so a day's 4,000 take from about an hour to more than the day; the fill resumes either way.
- `--fill elsewhere`: about 950 requests at Wikimedia's pace: under twenty minutes.
