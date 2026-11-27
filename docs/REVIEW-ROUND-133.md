# Round 133: literature, ready to come back (SPECIES 23 with HANDOFF round 8)

The plan and its count are docs/PLAN-133.md. This round builds the code; no page changes until a fill runs, and the fill
waits on the owner's decision of its cost. Built in the clone on 27 November 2026.

## Done

- **The count** (`scripts/dev/r133-literature-count.ts`; PLAN-133): on 200 pages, the title-only rule with a DOI keeps
  papers on 107 of the 149 that had them under round 8's rule (28% left with none, under the hand-off's bar of half).
- **The source** (`titleLiterature`, `src/lib/dossier/sources/openalex.ts`): the name as a phrase in the title; an
  article, review, book chapter or preprint; with a DOI. One request a page answers the three most cited, the three
  newest and the decades where the page has 200 works or fewer; more asks twice more. A dataset's DOI, a specimen record,
  a work with no DOI and a work whose title does not name the species are never listed; the two lists share no paper;
  the decades sum to the total. The key goes in the query string and never into the dossier.
- **The dossier** (schema): a paper may carry its kind (book chapter, preprint), "free" (OpenAlex's `open_access.is_oa`),
  the times cited and its list; `literatureCounts` holds the total and the decades. Absent on every page built before.
- **The fill** (`--fill openalex`): every page with a two-word species name, under a day's allowance of its own (1,000
  requests by default: about OpenAlex's free allowance, so nothing is spent), counted in cache/day-budget/, resumable,
  stopping at the allowance (exit 3); a page asked under the title rule is passed by (`--again` asks again); a source
  that did not answer is said so on the page (rule 2) and asked again by the next run. Not in the daily plan.
- **The section** (`src/lib/ui/ref/Literature.svelte`): "Literature", after Names, where the title rule has answered: the
  most cited and the newest, each with its authors, venue, year, kind, times cited, "free to read" (never "open
  access") and its DOI in full; "Papers by decade" as bars with their counts; "All N papers since the 1860s, on
  OpenAlex", which opens the same search there; "nothing here is summarised". A page with papers from before round 78
  keeps its old block.
- /changes says the reference can ask, and that no page shows papers until a fill runs.

## Decisions

- **One request a page, not three**, so the corpus is about 53,000 requests (about $53, or about 53 days within the free
  allowance) instead of about 160,000.
- **The fill does not run, and is not in the daily plan**: OpenAlex's searches cost money past the free allowance, and
  money spent is the owner's to approve (PLAN-133, "What it costs").
- **/about/how unchanged**: "No species page lists published papers" stays true of the site as served until the fill.

## Tests

- r133a (unit, 7): the query; never a dataset, a work without a DOI, a specimen or a title that does not name it; one
  ask for a page of 200 works or fewer, three for more; the lists share no paper; the decades sum to All N; no key in
  the dossier; the section as rendered ("free to read", the kind, the DOI, the decades, All N). FAILED on fa85be4.
- r87p and r87rec on the new /changes lines; r84u-instants lists the section's asked day (`at.slice(0, 10)`) among the UTC days, as Provenance's is.

## Gate and deploy

(Written at the gate.)
