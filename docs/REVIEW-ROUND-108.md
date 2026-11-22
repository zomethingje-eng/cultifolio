# Round 108: the record

A habitat climate from records placed only to within 30 km, built on 22 November 2026. The plan, the proof and its
confirmation are `docs/PLAN-108.md`, the first hand-off's round 5.

## The proof

- `scripts/dev/r108-blur-proof.ts` (read-only): 422 species with 30 or more records placed to within 1 km, in southern
  Africa (346) and South-East Asia (76), their records blurred as iNaturalist blurs and read by the coarse rule, against
  the same records read exactly; the bar set in PLAN-108 before any result was read.
- First run (seed 108): the months, the rain and the light held in both regions; the cold floor failed in both (90th
  percentile 2.72 °C and 2.67 °C against 2.5). By the bar, the tier as planned was not built.
- The amended tier (no NASA POWER figure), decided after that run and so held to a fresh one: seed 2108, both regions pass
  (the coldest month's mean nightly low 0.36 / 1.28 °C and 0.61 / 1.94 °C; the warmest month's high 0.34 / 1.18 and
  0.29 / 1.11; the rain 4.6% / 17.2% and 3.4% / 10.7%; the light 0.5% and 0.9%). The cold floor failed again (2.73 and
  2.95 °C), as it should for leaving it out to be right. The tables are in PLAN-108.

## What changed

- **The rule** (`src/lib/core/coarse.ts`): a record stating an uncertainty over 10 km and at most 30 km, in-range, inside
  a proved region's box, is kept apart (`readRecords`' `forCoarse`); where the records placed to within 10 km give no
  climate (fewer than three land cells, or none placed), the build reads those records by the provider's coarse rule
  (`withCoarse`, both builds): each a three-decimal position read as the mean of the land cells whose centres lie within
  the half-diagonal of iNaturalist's 0.2° cell (about 15 km), three areas needed, the months the median across areas, the
  rain the median of their years, the typical area the one whose coldest month is nearest the median, its position rounded
  to 0.1°. No NASA POWER figure: `extremesStatus` 'coarse', the record's NASA POWER row "not asked" with why.
- **The dossier:** `climate.coarse` `{ km, areas, region }`; `cells` counts the areas.
- **The page:** "Habitat in short" carries "placed to 30 km" in place of the few-records mark, linked to the Climate
  section's notice (`#coarse-records`), and says "from N records placed only to within 30 km, in M areas"; the notice says
  what the figures rest on and that no cold floor, record low or hardiness band is derived and why; the cold floor's line
  says "not derived" (never "none on file"); the chart's key, its text alternative, the Köppen–Geiger card, the share card
  and "How this section is made" say areas, not grid cells. The Hardiness section, as on a page whose extremes are set
  aside, is not drawn.
- /about/how has the rule (#coarse), /about/formats the field; /changes has round 108.
- **The tidy:** Glance.svelte, drawn by no page since round 106, removed with r73p and the source tests that read it
  (r61w, r62bw, r62bw-species, r62w, r63c, r67n, r74, r84e, r85e).
- **Not this round:** the notice counting records withheld or blurred by their publishers (PLAN-108 step 5).

## The gate

`node scripts/predeploy.mjs --tier=launch`, 22 November 2026: svelte-check 0 errors in 1,867 files, 6,447 unit tests in
716 files, 2,877 browser tests, every test first time in every engine, on the third run. The first failed r84a about 2 in
the two phone engines (the new section's heading was an h3 where every top-level section of /about/how has an h2; now an
h2, kept out of the contents line, which a link more takes past sixty words); the second failed only r69p P5 on the plant
page in Firefox, once (the summary moved under the press; 112 of 112 alone, eight times over, with no retry).

## The deploy

052bda0 pushed and deployed 22 November 2026 with `node scripts/deploy.mjs` as version a2a804e7 (the record written after
the stamp, so svelte-check, 0 errors in 1,867 files, and the 6,447 unit tests ran again first); the live check passed, 23
of 23, with GBIF still serving the backbone. Next: the corpus step, `node scripts\corpus-step.mjs --plan
scripts\corpus-plan-r108.txt`, in the owner's CMD.

## The corpus step's first run, and the follow-up

The plan's first run (22 November 2026) built the 776 pages (377 gained a coarse climate; the index's climates 38,384)
and stopped at `--check-ranges`: the 377 coarse pages had no `climate.admitted` ("records or climate cells not counted by
reason"), and two typical areas, published rounded to 0.1°, lay past a grid cell's reach (Lithops optica at 26.7 S,
15.0 E, offshore; Conophytum albiflorum at 32.7 S, 18.1 E). Nothing was uploaded.

The follow-up:
- each coarse area keeps the reason its record was let into the range;
- the climate counts its areas by reason (`climate.admitted`, adding up to `cells`) and says the typical area's
  (`climate.coarse.how`), never a record's position;
- the range check reads a coarse typical area by that reason's reach, less a cell's half-diagonal, plus the rounding
  (`coarseReached`, 0.071°).

The two pages pass, Lithops optica only by its record's coast reason (scripts/dev/r108-reach-check.ts). /about/formats says
the field. r108a has four tests more, FAILED on 052bda0. The plan's stop names the new fields, so its run starts again
at step 1.

The launch gate: svelte-check 0 errors in 1,867 files, 6,451 unit tests, 2,877 browser tests, every test first time in
every engine, on the first run.

## BHL's error answers (the daily fill)

On 22 November 2026 the daily fill stopped twice within minutes: "5 requests in a row not answered". BHL was up. Its
resolver answered Status 2, "String or binary data would be truncated", for every citation of "Pap. & Proc. Roy. Soc.
Tasmania" (cache/upstream/2026-11-22). The fill read such an answer as not answered, which is right (r87l: asked again,
never recorded as "no page"). But it also counted each toward the five in a row that end the day. Those citations are asked
first on every run, so no other citation was reached.

Now:
- an answer that is BHL's own error (`bhlError`) is still not answered and is asked again, but it resets the run of
  failures instead of adding to it;
- the day's line says how many of the not answered were such errors, in words the daily plan's `expect` still reads.

Test r108c, FAILED on 16bd0c7. The corpus gate: 6,454 unit tests, 1,079 browser tests in Chromium desktop and phone, every
test first time.
