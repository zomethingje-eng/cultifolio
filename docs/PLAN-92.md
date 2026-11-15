# Round 92 plan: flowering from one GBIF download

Planned 14 and 15 November 2026, at the owner's request ("plan a round that fills the flowering section from one GBIF
download of that dataset … instead of the iNaturalist API"). The owner asked Claude to make the design decisions; they are
in section 5 with their reasons. Not built yet: the build, its commits and its deploy each wait for the owner's go.

## Why, and what it is

Round 90 measured this as lead 1 (docs/ROUND-90.md) and found the download's counts are not the API's: about 0.79 of
them, the peak month the same on 84% of pages, the months of a tenth of the year's count the same on 64%. So this is a
**change of source, said as one**, not a faster way to the same figure. Done that way, one download replaces about ten
more days of iNaturalist requests, covers every page with a GBIF key at once, can be refreshed in about an hour, and is
citable by DOI.

## 1. The download

- One GBIF SQL download, as the builder's occurrence download already is:
  ```
  SELECT specieskey, month, reproductivecondition, COUNT(*) FROM occurrence
  WHERE datasetkey = '50c9509d-22c7-4a22-a47d-8c48425ef4a7' AND kingdomkey = 6
  GROUP BY specieskey, month, reproductivecondition
  ```
  iNaturalist research-grade observations, Plantae; a few hundred thousand rows, not 39 million.
- **Checked first, before any code:** that GBIF's SQL table exposes `reproductivecondition`. If it does not, the round
  reads that dataset's Darwin Core Archive instead, as lead 1's scan did (about 15 minutes a pass).
- Values are split on our side, not in SQL: a value can hold several annotations ("flowers|flower buds"), and a
  `LIKE '%flowers%'` would also take "no flowers or fruits".

## 2. What the pages say differently

- **The source line.** Now "iNaturalist, read <the day each page was asked>". After: iNaturalist research-grade
  observations annotated Flowering, as shared with GBIF, with GBIF's citation of the download (its DOI and its day). One
  day for every page: the download's.
- **Licences.** iNaturalist shares with GBIF only observations under CC0, CC BY or CC BY-NC; all-rights-reserved
  observations, which the API counts, never reach GBIF. That is most of the gap. The page says "openly licensed
  observations", or it would be claiming the API's figure. Counting is not reproducing; GBIF's terms ask for the
  download's DOI, cited on the page and on /about/data.
- **Taxonomy.** Grouped by the page's GBIF species key, the backbone its records, map and climate already use, plus its
  extra keys (merged synonyms), as its records are. Where GBIF and iNaturalist split a species differently the figure
  moves (Melaleuca citrina and Monardella odoratissima were the farthest apart in lead 1).
- **None becomes sayable.** The download holds every iNaturalist research-grade plant observation shared with GBIF, so a
  key with no "flowers" row has none in it; the line names the source, so it is not a claim about the plant (rule 2). A
  page with no GBIF key says "not asked: no GBIF key", never none. A download not read whole writes nothing and says so.
- **The daily plan.** Its flowering step comes out; BHL keeps the daily run alone until it finishes.

## 3. The counts against the API's

Measured on 14 November 2026, on the 6,785 pages the API had read, against the 21 October download:

| | Pages |
|---|---|
| No GBIF key | 123 |
| No iNaturalist row under the page's key | 679 |
| None from both | 1,662 |
| Some from the API, none from the download | 366 (median 2; a tenth over 1,969: taxon mismatches) |
| Some from both | 4,623 |

On the 4,623: the download holds 0.79 of the API's count (quartiles 0.67 and 0.94); shape cosine median 0.994; peak
month the same on 84.3%, within a month on 92.1%; the months of a tenth of the year's count the same on 63.5% (69.9% on
pages of 30 or more).

The round repeats this against the fresh download, on every page the API has read by then, as a review stop with
`expect` checks, so the figures are seen before anything is uploaded. It stops when:

- the peak month is within a month on fewer than 85% of pages compared;
- the median ratio is below 0.6;
- more than 2% of pages with an API count above 100 have none in the download.

## 4. The tests

- **Unit:** the reader ("flowers" alone; "flowers|flower buds" once; "no flowers or fruits" never; rows with no month left
  out); grouping by the page's key and extra keys; the words (no key: not asked; a key absent from a complete download:
  none, with the source; an unreadable download: says so, writes nothing); the new record (`source`, `doi`, `day`,
  `months`, `keys`), the API's form still read as it is until the fill replaces it, both rendered; the source line (DOI,
  day, "openly licensed"); /about/how's rule and /about/data's DOI against the code (rule 5); the daily plan without
  flowering and the round's plan (download, fill, review, index, upload, live check).
- **Browser:** the fixture species' flowering section with the new line and months, desktop and phone.
- **Integration:** a small fixture download through the fill into dossiers.
- Each file says what failed before the change.

## 5. Decisions (made by Claude at the owner's request, 14 November 2026)

1. **Flowers only, no buds.** That is what the API counts today (iNaturalist's value 13). Buds would move each season
   earlier and the figure would no longer be comparable with what pages said before.
2. **One source for every page: the download, under the page's GBIF keys. No page keeps the API's figure.** Two sources
   section by section would leave a reader unable to tell which a page uses, and only the pages the API happened to read
   could be checked. The review lists every API-read page where the two disagree sharply (API 30 or more and none in the
   download, or a very different shape); each cause is looked into before anything goes live. A synonym GBIF files under
   another key is fixed by the extra-keys rule, for every page; otherwise the download's figure stands, and the page says
   what it counts. (This replaces the earlier suggestion of "not matched" on mismatched pages.)
3. **Refresh monthly.** A month-old count is fresh enough for a season; a refresh is one download request and one plan
   run, about an hour. The round writes the monthly plan.

## 6. The steps

1. Check that the SQL download exposes `reproductivecondition` (GBIF's documentation; nothing requested).
2. Build: the reader, the fill, the source line, the about pages, the comparison review, the round's plan, the monthly
   plan, the daily plan without flowering; tests; `node scripts/predeploy.mjs --tier=launch`.
3. (owner) Commit, push, deploy. The site shows what it shows now until the fill runs.
4. (owner) Request the download on the owner's GBIF account with the command the round gives; GBIF emails when ready.
5. (owner) Run the round's plan in its own window: fetch, fill, then stop at the comparison review.
6. Read the review together. Within the stop conditions: `--go-on` (index, upload, live check). Outside: stop and decide.
7. Monthly after that: steps 4 to 6.
