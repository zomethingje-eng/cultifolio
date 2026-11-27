# Plan 133: literature, brought back (SPECIES 23, with HANDOFF round 8)

Literature has been off since round 78 (the owner's decision 2, 2026-10-19: `LITERATURE_OFF`, the page's papers "not
asked"). HANDOFF round 8 asks for it back as a fill, with a plan put to the owner first; SPECIES 23 amends the rule.
This is that plan, with the count the hand-off asks for. Written 27 November 2026, while the owner is away.

## The count (done, 27 November 2026)

`scripts/dev/r133-literature-count.ts` on 200 pages, every 264th of the index's 52,827 two-word names, two requests each
to OpenAlex with the site's key (read from bulk/openalex-key.txt, never printed), one a second; nothing else asked,
nothing in the corpus written. Result in bulk/r133/count-2026-11-27.tsv.

| | Pages |
|---|---|
| Papers under round 8's rule (title or abstract, any type but datasets, the name checked in the title or abstract) | 149 of 200 |
| Of those, papers under SPECIES 23's rule (the name in the title, article, review, book chapter or preprint, with a DOI) | 107 |
| Of those, none under SPECIES 23's rule | 42 (28%) |
| Papers under SPECIES 23's rule only | 0 |
| Not answered | 0 |

The hand-off's bar: report if the title-only rule leaves more than half of the pages that had papers with none. It
leaves 28%, so the title-only rule stands and no "also mentioned in" list is needed. The 42 are pages whose name appears
only in abstracts (Acacia obliquinervia: 5 such papers, none naming it in a title), which the hand-off rules out on
purpose: a species' page would lead with papers that only mention it.

## The build (the round)

1. **The source module** (`src/lib/dossier/sources/openalex.ts`): `title.search` on the accepted name as a phrase,
   `type:article|review|book-chapter|preprint`, `has_doi:true`; two asks a page, the three most cited and the three
   newest (`sort=cited_by_count:desc`, `sort=publication_date:desc`, `per-page=3`), plus the count (`meta.count`) and the
   decade counts (`group_by=publication_year`, folded into decades): three requests a page. Kept: title, authors (four),
   venue, year, DOI, type (a book chapter or preprint says so), `open_access.is_oa` ("free to read"), cited-by count.
   Dataset DOIs and specimen records stay excluded as before; the title check (`namesSpecies` on the title) stays.
2. **Accepted names only** (HANDOFF 8's rule 3): synonyms are not searched; a name Kew holds for another plant too
   (`hom`, `name.kew.elsewhere`) is not searched, and the page says why.
3. **A fill, not a walk:** `daily dossier --fill openalex` in the daily plan, as iNaturalist's and BHL's are, under the
   key's daily allowance; a page not yet reached says "not asked" (rule 2), never none. 53,372 pages × 3 requests is
   about 160,000 requests: two to four days at OpenAlex's allowance for a key (to be read from its current terms
   before the fill, as round 8 says; no personal address in any request, the site's own User-Agent only).
4. **The display** (`#s-research`, renamed Literature, after Names): the three most cited and the three newest (one list
   when the page has six or fewer), "All N" opening the rest by year, "Papers by decade" as bars with their counts, each
   paper's DOI in full, "free to read" where OpenAlex says so, "book chapter" or "preprint" after the venue. Nothing is
   summarised: titles, authors, venues, years, counts and links, and the page says so.
5. **Rule checks:** /about/how's papers paragraph and /about/formats rewritten (rule 5); "not asked" until the fill
   reaches a page (rule 2); OpenAlex's metadata is CC0 (rule 4), credited on the Data page.

## Tests (the hand-off's)

Round 8's, and: a dataset is never listed; a work without a DOI is never listed; the two lists share no paper unless the
page has fewer than six; the decade counts sum to "All N"; a page not reached says "not asked".

## What it costs (found building it)

Round 78 switched literature off because OpenAlex's searches cost money: about $1 a thousand past a key's free $1 a day
(`scripts/build-dossiers.ts`, round 78's note). Three requests a page would be about 160,000 requests. The build asks
once a page instead: up to 200 works, most cited first, from which the three most cited, the three newest and the
decades are all read; a page with more than 200 works (rare: the 200-page count found 3,437 works in all, about 17 a
page) asks twice more. So the corpus is about 53,000 requests: **about $53 at once, or about 53 days inside the free
allowance**, and the daily growth (1,000 pages) about a day's free allowance more each day.

The fill's day's allowance is 1,000 requests by default (`--openalex-budget`), about the free allowance, so it spends
nothing; it is **not in the daily plan**. Whether to pay for the corpus at once, run it free over about two months (and
then the growth), or add it to the daily plan at all is the owner's decision: money spent is the owner's to approve.

## The decision left

Round 133 builds and deploys the code with no page changed: every page says what it said ("not asked"). The fill is
`node scripts/build-dossiers.ts --fill openalex --bulk bulk [--openalex-budget N]`, run by hand or added to the daily plan
as a `daily` step, once the owner decides the cost. /about/how's "No species page lists published papers" stays true until
then, and is rewritten in the round that starts the fill.
