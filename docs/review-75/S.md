# Round 75, agent S: the scaling study

## Done

`docs/SCALE-STUDY.md` (commit `db0481d` on `r75`) is the study. The scripts that measured it are in `scripts/dev/scale/`, and their outputs of 2026-10-17 are in `scripts/dev/scale/results/`. No production code or test changed.

**Which species.**

- iNaturalist's `species_counts` is not capped: all 59,214 cultivated plant taxa paged out. Family totals were cross-checked against separate queries, and `derive-names.ts`'s "capped at 10,000" is wrong for this endpoint.
- Matched to Kew offline under rule 3, they give 53,263 species by the strict rule. They give 56,497 by iNaturalist's own POWO-sourced taxon framework, which the strict rule needs, or Acer palmatum, Aloe vera and Crassula ovata are refused.
- GBIF's living-specimen records add evidence, up to 81,848 species with any cultivated record.
- **Recommended for about 50,000:** at least 3 cultivated records (both sources summed) plus the collector genera whole. That is 54,212 species.
- **Recommended for about 100,000:** at least 1 record, plus whole genera where half the species have one, plus the collector genera. That is 97,184 species.
- About half of today's species (4,273) have fewer than 3 cultivated records, so the collector clause is what keeps them.

**The Worker.**

- Today's cold path, measured in node on the real index and on synthetic indexes of 50,000 and 100,000:
  - 43 MB and 0.5 s at 8,947;
  - 221 MB at 50,000;
  - 446 MB and 5.8 s at 100,000.
- The isolate limit is 128 MB, so today's design stops fitting between about 25,000 and 40,000 species.
- **The proposed design holds nothing whole:**
  - hashed name shards (a page reads one: at most 37 KB, under 1 ms);
  - the photograph judgement moved to the build;
  - search posting files of up to 5-character keys carrying their candidates' search fields (median 2.3 KB, largest 2.4 MB at 100,000);
  - display blocks.

**The build.**

- The last log and a counted 12-species build give about 14 requests a species.
- At 100,000, the iNaturalist allowance (10,000 a day) makes it 28 days, and OpenAlex costs $97 or 97 days.
- Every source has a bulk or batched replacement, sized from its own headers or pages. The bulk design takes about 2 days, plus a 10-day cultivated-photograph fill, because iNaturalist's open data has no captive flag.
- `occurrence.zip` (12.75 GB, 27.9 M records, from GBIF's download record; not in DEPLOY.md) grows to about 69 GB at the 50k rule and 75 GB at the 100k rule.
  - An SQL download of the 13 columns read would be 3 to 7 GB, but it is experimental and needs GBIF's permission.

**Storage.**

- About 5.6 GB in R2 at 100,000 and about 169,000 objects for a full upload: both inside the free allowance.
- The client's first visit does not grow with the corpus.

**Formats.**

- Key pages by Kew's `plant_name_id`: GBIF calls its backbone "obsolete".
- End the Worker's positional coupling to the index.
- Keep one JSON a dossier.

**The plan.** Round 76 starts with name shards and the build-time photograph judgement at today's corpus, proved by identical resolution of every slug and older name on the real index. Rounds 77 to 80 cover the search, the selection and ids, then 50,000 and 100,000. The study lists seven owner decisions.

## Needs

None. Section 1's figures may help G's genus ranking.

## For the owner's PC

Nothing to run for this round. Two things the study needs from Cloudflare, scheduled for round 76:

- a cold start's memory outcome with a 50,000-species synthetic corpus in a preview bucket;
- `wrangler tail`'s `cpuTime`.

## Measured

| | 8,947 | 50,000 | 100,000 |
|---|---|---|---|
| Cold start today (node) | 522 ms, 42.8 MB | 2,504 ms, 220.7 MB | 5,776 ms, 445.7 MB |
| A page's name shard under the design | 0.9 ms, 0.2 MB | 0.6 ms, 0.2 MB | 0.7 ms, 0.2 MB |
| Species by rule | | 54,212 | 97,184 |
| `occurrence.zip` | 12.75 GB (real) | about 69 GB | about 75 GB |
| iNaturalist requests, per-species design | 25,300 | 153,400 | 275,000 |

## Not done, with why

- **No measurement on Cloudflare itself.** Node's heap is a stand-in, and whether workerd compresses pointers was not checked. Round 76 measures it.
- **iNaturalist's 4,117 framework deviations were not applied.** That needs their list; it affects at most 4,117 names.
- **GBIF's SQL download was not tried:** it needs an account with permission. Its size is estimated from a 600-record sample.

The whole unit suite on the final commit, with the browser lock held: 3,927 passed and 8 skipped. `tsc` and `svelte-check` cover nothing this round changed: the scripts are outside both projects, and no file under `src` or `tests` changed.
