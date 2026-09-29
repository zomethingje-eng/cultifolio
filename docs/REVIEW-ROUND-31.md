# Round thirty-one: the reference's build-time items from round thirty

Not a review round. Round thirty's note deferred the species-reference findings that need the corpus rebuilt rather than a page changed, "in one corpus pass rather than piecemeal". This is that pass: the builder's rules, the pages that show what the new fields say, and the corpus step in DEPLOY.md that puts them on the site. The author runs the rederive and the upload; nothing here needs a deploy to be right, only to be seen.

## Done

1. **A species split across hemispheres got a year no place has** (round thirty's R2-10). Rhipsalis baccifera, Mexico to South Africa and Sri Lanka, showed April as its warmest month because each month's median was taken over every cell without regard to which side of the equator it lay. A species whose cells sit on both sides in strength (three or more on the smaller side, a fifth or more of the cells) now takes its envelope from the larger side alone; the split is recorded (`climate.hemispheres`: the count on each side and which was used), the envelope's source line says it, and the species page carries a line under the climate saying the other side's seasons are six months apart and are not combined. Shifting the smaller side by six months was considered and not taken: it would give a species a calendar no reader is in. Unit test: five southern cells and three northern, the southern median untouched by the northern nights; two northern cells is not "in strength" and everything is used.
2. **"Cold floor" could be one sea-moderated cell's figure** (R2-9). The typical cell was the one nearest the median coldest night, wherever it lay; on a coast or an island its NASA POWER cell (0.5°) is averaged with the sea. The candidates are tried nearest first and the first whose POWER cell is mostly land (by a 5 × 5 sample of the climate grid) is taken; when none is, the nearest stands and the land fraction is written (`climate.landFraction`), the source line says it, and the page says under the cold floor that the extremes were read at a cell that is N% land. Round thirty already relabelled the card as the typical site's and put the range's coldest month beside it.
3. **Old names in the search** (R2-8, the half round thirty could not do). The index now carries each species' older names as binomials (authorship dropped, other-genus ones first, six at most), the search counts them as it counts common names and origins, and the picker on the add form reads the same index, so "Haworthia attenuata" finds Haworthiopsis attenuata on the front page and in the picker without a request. The species page's "Also known as" uses the same binomials, drops a malformed entry the backbone lists ("? glabra Salm-Dyck"), and credits the backbone (R2-13). Unit tests for the cut and the search order (a species' own name still ranks before another's synonym).
4. **Source dates** (R2-13). Every upstream's row in "Where this page came from" now says the day it was asked, and the paragraph says the figures are as the source held them that day.
5. **Unexplained blanks** (R2-13). Family and Described-by say "not stated by the backbone" rather than a dash; the monthly table's paragraph says what a dash is (a month one or more cells has no figure for, so no median over fewer cells); "No habitat climate" says how many of the in-range records are placed to worse than 10 km and so cannot place a cell, though they count for the map.
6. **Herbarium records among the papers** (R2-12). DiSSCo's DOI prefix names a digitised specimen, not a paper; the literature source leaves those out at the build, and the dossier parser drops them from dossiers built before the rule, so nothing waits for the rebuild.
7. **The genus pages in the sitemap** (R2-13). A genus, family or origin opened by its address has its own title ("Copiapoa — 2 species — Cultifolio"), description and canonical link; the home page's canonical is its own.
8. The records-with-no-accuracy rule (round thirty, 14) and the media query without preserved specimens (round thirty, 13) are already in the builder and take effect with the same rederive.

## Not taken

A photograph taken outside the native range (R2-12): a photograph carries no coordinates in the dossier, only a place name, so the check would need the sources asked again for each; it goes with the next photograph pass.

## The corpus step

In DEPLOY.md, section 5, "Round thirty-one's corpus step": an offline rederive (no API calls), the index, the two uploads. The code deploy goes first, so the pages that show the new fields are live before the fields arrive; the corpus needs no deploy.

## After the changes

`npx svelte-check --threshold warning` clean; `npx vitest run` 37 files, 378 tests; `npx playwright test tests/e2e/smoke.spec.ts --workers=1` 73 tests, no retries; the local live check's seven upstream-free checks pass; `/?by=genus&open=copiapoa` carries its own title and canonical.
