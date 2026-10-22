# Round 80, agent V: the most-voted wild photographs

Branch `r80` in `/tmp/claude-0/rev80/V`, three commits on `r80base` (ddb6576, d3cc5b7, ede492b). Scratch `/tmp/claude-0/rev80/V-s/` (notes in `NOTES.md`).

## Done

**The choice: the API, budgeted, alongside the cultivated fill.** No better rule exists from the open data alone. Its columns (P's reader lists them: observation uuid, observer, latitude, longitude, positional accuracy, taxon, quality grade, date, anomaly score; for each photograph its ids, extension, licence, width, height and position) hold nothing that says which photographs people chose. Any other order (most photographs, largest, oldest) would be a guess at "best", so it is not taken. The API's votes are the only measure, so the API is asked.

**The rule** (`src/lib/dossier/inat-open.ts`):
- `store.count(taxon)`: each taxon's count of qualifying observations, read from its line's `"n"` with the line's place (no extra read).
- `heldWild(…, { mostVoted: true })`: the file answers the wild request only where its set is the whole qualifying set (count at most the 24 asked). For a taxon it holds more than 24 of, the request goes to the API, counted in the day's budget like any other, and the answer carries `mostVotedDetail`: "from iNaturalist's API: research-grade observations not marked captive with an open-licence photograph, the observations iNaturalist puts first by votes, 24 of them (the open data of 2026-09-27 holds N, and no votes)". Without the option (`--wild`, `--cultivated`) the file answers as in round 79.
- `mostVotedToAsk(store, taxon, record)`: asks only where the wild record is the open data's (its words start "from iNaturalist's open data", answered or answered with none) and the file holds more than 24 of the taxon. So it never asks:
  - a taxon of 24 or fewer, whose set is already the whole set and so the API's set too;
  - a set the API answered, by round 78's fill, by the route for a taxon newer than the export, or by this pass;
  - without the file.

**The pass** (`scripts/build-dossiers.ts`, `fillPhotos`):
- It is part of plain `--fill inat`, the plan's cultivated fill. A page whose only need is its most-voted set is in the fill's to-do list, and the count line says how many.
- A refusal at the allowance stops the fill (exit 3) as before. Each dossier is written as it is filled, so the next day's run goes on, and a page done is passed by.
- An answer that is neither "ok" nor "none" (an error) leaves the page's open-data set and record as they were. The fill then ends "most-voted wild sets: N not answered (asked again by the next fill)", exit 3, which the corpus step reads as unfinished.
- `--cultivated` and `--wild` never ask it.
- `upstream()` defaults to the most-voted rule. So a later build that asks iNaturalist gives the same set, and so does Kew's descendants step at the end of the fill.

**The rest of P's rule is kept:** research grade, the taxon or below, CC0, CC BY or CC BY-SA, at most 24, and the author's credit as the API writes it. A wild photograph's page is now its observation's uuid by either route: `inat.photos` takes `uuid` where the API gives it, for the wild set only. A cultivated photograph keeps its number, so a set filled during the fill's days does not change form part way through.

**Kew's descendants step** (`inat-kew-fill.ts`): a wild set asked again now keeps the answer's own words (the open data's, or the most-voted words) before "filled …" and Kew's mark. Before, the open data's words were dropped.

**The plan's place.** No new step: the pass runs inside `dossier --fill inat --bulk bulk`, which the owner runs daily anyway. `scripts/corpus-plan-full.txt` changed in a comment only. I found that `corpus-step.mjs` starts a plan again from its first step (the backup, then the build) whenever the plan file's text changes, comments included, and this round's code reaches the owner part way through the fill. So `corpus-step.mjs` now keeps a run's state when the plan's steps are the same line for line (`sameSteps`); any change to a step starts the plan again, as before.

**Docs.**
- DEPLOY.md, `### Round eighty: the most-voted wild photographs`, after round 79's section: what changes and why, how many, the days it adds, its place in the plan, good output, and the proof. Round 79's step 7 points to it.
- The README's fills paragraph, and the builder's usage lines.

**`/about/how`.** One clause of the "What comes from where" line changed.
- Before: "of a taxon with more than 24 such observations, the 24 whose photographs iNaturalist received last, since the export holds no votes;"
- Now: "of a taxon with more than 24 such observations, the 24 iNaturalist puts first by votes, asked of iNaturalist directly when the daily fill reaches the page, since the export holds no votes (until then, the 24 whose photographs iNaturalist received last);"
- Checked against `mostVotedToAsk`, `heldWild` and `fillPhotos`. The clause after it ("a photograph's page is its observation's, by the observation's uuid") is now true by both routes.

**Tests.**
- `tests/unit/r80v-most-voted.test.ts`, 13 tests on P's real fixtures:
  - the count, the ask rule, the fetcher and the record's words;
  - the page by uuid;
  - Kew's step keeping the words;
  - the real builder run end to end with a fake API: one request for the one page that needs it, the most-voted words, the API's photographs, and the other two pages untouched; the stop at an allowance of 0 and the run that goes on; a second run asking nothing; an error kept as the open data's set with exit 3; `--cultivated` and `--wild` asking nothing;
  - the plan runner keeping its place on a comment change and starting again on a step change;
  - the plan and the about page.
- On `r80base` (run in a worktree at the tag) 12 of the 13 fail:
  - the missing exports and wording;
  - the fill's count line, since the base fill asks nothing for such a page;
  - the plan runner running the fill a second time after a comment change.
  - The thirteenth, `--cultivated`/`--wild` asking nothing, is a guard.
- Two of P's tests in `r79p-inat-open.test.ts` read the old forms: the `upstream()` line, and the API's wild page by number. Both are updated, with a comment.

**Checks.**
- `npx tsc --noEmit -p .` is clean, and `svelte-check --threshold error` gives 0 errors.
- `tsconfig.scripts.json` gives the same errors as `r80base`, plus one of the kind every corpus-step test already has (TS7016, the `.mjs` import) for the new test.
- The whole unit suite, after the last change: 456 files passed, 1 skipped; 4,287 tests passed, 8 skipped; 640 s. An earlier run found P's two tests that read the old forms, now updated.

## Needs

- **The merge, and N and R (and X, if it touches the plan):** do not add, remove or change a step line of `scripts/corpus-plan-full.txt` in round 80. The owner's run of that plan is part way through its fill when this round's code arrives. Any change to a step starts it again at `backup`, then the build. A comment-only change is safe now (`sameSteps`). A new step for this round belongs in a plan of its own, run after the full plan finishes. If a step must change, the merge should carry the finished steps over by hand and say so in DEPLOY.
- **The merge:** keep `sameSteps` in `scripts/corpus-step.mjs` (one function and two lines in `run`). It is the reason this round's comment in the plan is safe.
- **The merge, `/about/how`:** my change is one clause of the long "What comes from where" line, quoted above. If N or R edit the same line, put my clause in word for word.
- **The merge, `scripts/build-dossiers.ts`:** the import (line 121), `inatOpenHeld` and `upstream(mostVoted = true)` (about lines 196 to 213), and in `fillPhotos` the lines `votedToAsk`, `mostVotedPages`, `votedUnanswered`, `voted`, `askWild`, the start and end lines, and `upstream(!cultivatedOnly)`.
- **F's review (optional, as P offered):** count records whose words contain "the observations iNaturalist puts first by votes", to say how many pages the pass has reached.

## For the owner's PC

Nothing new to type. During the cultivated fill (walk step 7), once this round's code is on the PC, carry on as before, once a day after midnight UTC:

```
node scripts/corpus-step.mjs --plan scripts/corpus-plan-full.txt
```

- Keep `bulk\inat-wild.jsonl` until the fill has finished. Without it the pass asks nothing, because it cannot know which taxa have more than 24. `bulk\inat-open` (34 GB) can go as before.
- Good output: the count line says `(M of them for their 24 most-voted wild observations: …)`, M about 19,600 less the pages already done. The last run ends with `…, K asked of its API for the 24 most voted …. Every dossier has been asked for its photographs.`
- Time: about two more days at 9,000 a day, so about eight days for the fill instead of six. It costs no extra disk.

## Measured

- **How many** (`scripts/dev/scale/r80v-count-over-24.py`, `results/r80v/count-over-24.json`; 57 requests to iNaturalist's species counts with the wild request's filters, 2026-10-21, 2.1 s apart). The counts take in subspecies, as `taxon_id` does: Achillea millefolium was 33,748 both ways.
  - 102,209 plant species with a qualifying observation; 28,292 with more than 24.
  - Of the list's 48,368, 19,218 have more than 24 by name.
  - On today's corpus, matching by name finds 2,965 of the 3,027 pages its iNaturalist ids find (98%), so the list's figure is about 19,600, about 40% of the list. P's sample gave 20 of 50.
  - So about 19,600 more requests: the fill goes from 49,000 to 54,000 requests to 68,600 to 73,600, about 2.2 more days at 9,000.
- **The proof, the real fill** (`results/r80v/fill-run.txt`).
  - The data: P's 50 sample species from round 77's corpus, rekeyed to version 3, with their wild sets filled first by `--fill inat --wild` from P's `full-more.jsonl`. Then `--fill inat --inat-open full-more.jsonl`, live, with every iNaturalist request held 2.1 s apart by a preload.
  - It made 70 requests: 20 most-voted wild sets (exactly the 20 taxa of more than 24) and 50 cultivated. The other 30 wild sets were not asked.
  - The same command again made 0 requests.
- **The proof, against the API alone** (`scripts/dev/scale/r80v-most-voted-proof.ts`, `results/r80v/proof.json`, `api-answers.json`; 20 requests, minutes after the fill):
  - The builder's reading of the API's own answer gave the same photographs, field by field (id, address, thumbnail, size, licence, author, page, captive, date, place), for 20 of 20 pages. All 20 records carry the most-voted words.
  - Photographs on those pages: 993 from the open data's newest, 1,038 from the most voted. 211 of the API's 480 observations were among the open data's 24 newest (P had 209).
- **What "most voted" is.** Only 78 of the 480 observations had any vote, so most of the API's 24 are observations with no votes, in the API's own order. That order moves from day to day: against P's answers of 2026-10-20, 3 of 20 sets came back in the same order, and 460 of 480 observations were the same. A page holds the API's choice of the day it was asked, the same as the API route has always given.

## Not done, with why

- **A cheaper hybrid was not taken.** The API could be asked, a batch of taxa at a time, for only their voted observations, with the open data's newest filling the rest. That would cost far fewer requests, but its set is not what the API alone gives (most of the API's 24 are unvoted, in its order), and the brief asks for the API's set. It is open to the owner if two more days matter more than that equality.
- **Order within an observation and the photographs' ids** are the API's for the most-voted pages, and the export's for the rest, as before.
- **Not measured on the PC:** the 19,600 is from today's counts by name, not from the export's file, which is not here. The PC's file gives the exact number on the first day: M in the fill's count line.
- **No browser test:** only one clause of `/about/how` changed, and no page's layout.
