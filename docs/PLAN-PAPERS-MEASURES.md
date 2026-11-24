# Plans for the two corpus rounds of SPECIES: literature (23) and new measures (24)

Written on 23 November 2026, while the photograph copy held the lock, from the code and the hand-off (SPECIES 23 and 24;
HANDOFF 8, which 23 amends). Both run under the corpus rules: a plan, the counts, a dry run, then the fill. Nothing here
has been run.

## SPECIES 23: literature

**Where the code stands.**
- `src/lib/dossier/sources/openalex.ts` exists from before round 78. That round switched literature off (the owner's
  decision 2, 19 October 2026).
- Every page built since records OpenAlex as `skipped` with `LITERATURE_OFF`, said as not asked (rule 2).

**What changes, per the hand-off:**
- Match on the **title only**, the species' name as an exact phrase.
- Only the four work types of HANDOFF 8 count, and only works **with a DOI**.
- Lists: the three most cited and the three newest, then All N.
- Papers by decade, each DOI in full, and "free to read" where `open_access.is_oa` is true.
- A book chapter or a preprint is said so.
- The section is called Literature and goes after Names.
- Nothing is summarised.

**The fill:**
- A `daily`-style fill, `--fill openalex`, with its own allowance, as iNaturalist's and BHL's run.
- It writes `literature` into each dossier and the record of the ask (`upstream.openalex`).
- Semantic Scholar checks 50 pages, as HANDOFF 8 set.

**The owner's step first: an OpenAlex key.**
- The code's own note says anonymous requests share a per-address pool that shuts after about a hundred calls. A free
  key, from an account at openalex.org, gets its own allowance.
- An account needs an email address. This site never sends the owner's address to a service on its own, so the owner
  makes the account and sets `OPENALEX_KEY` in the environment of the PC's terminal.
- The key goes in the query string as OpenAlex asks. It is never written into a dossier or the log.
- Read OpenAlex's current terms and allowance before the fill.

**The dry run and the hand-off's "Report if":**
- Run the title-only rule over 200 pages spread across the families.
- Count the pages that had papers under the old rule (title or abstract) and have none under the new one.
- If that is more than half, report before the fill. The owner then decides on an "also mentioned in" list.

**Tests (the hand-off's):**
- A dataset is never listed, and a work without a DOI is never listed.
- The two lists share no paper unless the page has fewer than six.
- The decades sum to All N.

## SPECIES 24: new measures

**Where the code stands.**
- The packed grid (`climate/climate.grid`, `scripts/pack-climate.py`) holds CHELSA's `tasmax`, `tasmin`, `tas`, `pr`,
  `rsds`, `hurs`, `vpd` and `sfcWind` by month, and ETOPO elevation.
- It does not hold `clt` (cloud cover), `pet_penman` (evapotranspiration), `scd` (snow cover days) or `fcf`
  (freeze–thaw).

**The steps:**

1. **The source.**
   - The four are CHELSA V2.1 1981 to 2010 climatologies, CC0, the same source and years as every month figure now.
   - `clt` and `pet_penman` are 12 files each. `scd` and `fcf` are one file each.
   - The download is a few GB to `climate/src`, which `pack-climate.py` already resumes.
   - Their units are read from each file's own tags, as the packer does now.
2. **The grid.**
   - `pack-climate.py --add clt,pet_penman,scd,fcf` appends 26 layers into a second file, `climate/climate2.grid`.
   - The first file stays as it is, so every habitat figure stays the same (SPECIES: "no round here changes how a
     habitat figure is worked out").
   - `grid.ts` reads both files.
3. **The build.**
   - The month figures gain `cltPct` and `petMm`, with their 10th to 90th percentiles over the same cells.
   - The extremes gain `snowDays` and `freezeThaw` for the typical cell.
   - The elevation's 10th, 50th and 90th percentiles over every cell of the range.
   - All of this is an offline re-derivation (`--rederive`) of every page: the walk, about 17 hours on round 87's code,
     less with round 88's eight pages at once.
4. **Rain days, a test before anything is shown.**
   - Days of 1 mm or more in NASA POWER's daily rain for the typical cell, against CRU TS 4.09's wet-day frequency, on
     200 pages across the climate classes. The bar is within two days a month in four page-months of five.
   - CRU TS 4.09 needs no account. The hand-off read it at CEDA, behind a registration. The University of East Anglia
     serves the same release openly at https://crudata.uea.ac.uk/cru/data/hrg/cru_ts_4.09/, including
     `cruts.2503051245.v4.09/wet/` (checked on 23 November 2026), under the Open Government Licence v3, which the page
     links.
5. **Soil.** SoilGrids: a plan only, while its service is down.
6. **Fog.** Nothing, as the hand-off says.

**Order:**
- After the pre-launch app rounds.
- The grid's second file can be packed on any day the lock is free, since it reads only CHELSA's files and writes only
  `climate/`.
- The re-derivation is a corpus step with its backup, its review stop and its upload.

## For the owner

1. **An OpenAlex key:** done. The owner wrote it to `bulk/openalex-key.txt` on 23 November (ignored by git). The fill
   reads that file, or `OPENALEX_KEY`, and never writes the key anywhere.
2. **No CEDA account needed:** UEA serves CRU TS 4.09 openly (above).
