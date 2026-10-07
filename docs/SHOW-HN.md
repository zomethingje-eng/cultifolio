# Show HN draft

Working notes, not the post. Figures in brackets are read from `report.txt` and the index on the day of posting; do not post a number the index does not say. Rewrite it in your own voice before posting (round sixty-one: every sentence below was checked against the code at this round).

## Title

Under 80 characters, no adjectives. The title (round sixty-one):

`Show HN: A cactus and succulent reference where every number names its source`

Not "the climate where 8,900 cacti and succulents grow wild": the list is 172 collector genera plus the 2,500 species most often recorded as cultivated across every kind of grower, so many of the species are neither, and not every species has a climate (some are pending, some sources did not answer). Kept in reserve: `Show HN: Cultifolio – habitat climate for cacti and bulbs, plus a local-first plant record`.

## Text

Under 300 words. HN skims the first paragraph and the last.

---

Cultifolio is a reference for growers of cacti, succulents and bulbs: [8,947] species, and for [N] of them, where the sources answered, the habitat climate. Nothing about a species is written for its page by a person or by AI, apart from credited quotations: every sentence is a credited quotation, a figure with its source, or a labelled reading of a fixed rule, filled into templates written once for every species. A figure that cannot be derived is left out and said to be missing.

Each page takes the native range from Kew's WCVP and the GBIF records inside it, and reads CHELSA's monthly climate at the cells those records fall in: the median year, and the 10th to 90th percentile across cells, drawn as a climograph. The cold floor is the 1st-percentile night at a typical spot in the range, from NASA POWER's daily series (each page says how many years), with the record low printed beside it. Two fixed rules read a season from the curves. The sheet gives no advice. The map shows the openly licensed records; the rest are counted.

Example: [Copiapoa cinerea](https://cultifolio.com/species/copiapoa-cinerea), a fog-coast cactus, or [three side by side](https://cultifolio.com/compare?s=copiapoa-cinerea,ariocarpus-fissuratus,haworthia-truncata).

The other half is a plant record: numbered plants, sowings that mint numbered plants, places, labels with QR codes, a frost watch. It lives in your browser, with no sign-up. Sync is optional, end-to-end encrypted, and free during the launch [AUTHOR: confirm the price sentence]. `/about/how` lists every request your own pages make, and every host any page loads from.

The code, and the sentence templates the pages fill with sourced figures, were written with AI coding agents (Claude) under my review; nothing is written or generated for any one species. AGPL; the corpus scripts are MIT.

I would most like to hear where a derived figure is wrong.

https://cultifolio.com · https://github.com/zomethingje-eng/cultifolio

---

## Before posting

- Fresh `npm run dossier -- --index`; put the index's species count and the count with a habitat climate in the text (`report.txt` has both). Check that both deep links open in a private window on the deployed site and that the three species are in that build's index.
- Use the app with your own collection for two weeks first; the first question will be how many plants you keep in it.
- The first-load figures, if asked: `npm run build && npm run preview`, then `node scripts/dev/first-load.mjs`; do not quote a figure from an older build.
- Open five species pages in a private window on the deployed site: a cactus, a bulb, an epiphyte, a one-cell species and a species whose climate was not checked. The last two are the ones a commenter will find.
- `npx wrangler tail --status error` during the first hour (errors only: a full tail streams every request address to your terminal).
- R2 spend alert set (DEPLOY.md §1).
- Rate limits are per address; a corporate NAT can trip them. The reply is "Retry-After", not a ban.
- Post between 08:00 and 10:00 US Eastern on a weekday. Answer the first two hours of comments, the wrong ones too, briefly.

## Replies to have ready

"Why not an LLM summary?" A summary that is 95% right is a reference that is 5% wrong and does not say which 5%. The Wikipedia lead is quoted, credited and cut at a sentence; nothing else on the page is prose.

"Habitat climate isn't hardiness." Agreed, and the page says so. The cold floor is the 1st-percentile night at a typical spot in the range (one night in a hundred is colder), from NASA POWER over the years its series covers (the page says how many), and the record low is printed beside it; both are figures about a place, not a tested limit for a plant in a pot. The sheet states the figures and two fixed rules, and no advice.

"Your 10 °C minimum for my Puya is wrong." It no longer exists: the care groups table never raises a cold floor, its four indoor conventions are shown apart and labelled as conventions with no source, and terrestrial bromeliads and orchids are in no group at all (round sixty).

"CHELSA cells are 1 km; yours are coarser." The grid is packed to 0.05° cells (each the mean of CHELSA's 30-arc-second pixels in it); the page says how many cells and records the figures rest on.

"GBIF records are noisy." Living specimens and records marked introduced are dropped, records outside the WCVP native range are dropped, a record placed worse than 10 km stays on the map and off the climate, and each cell counts once however many records fall in it. The map shows every openly licensed record used; restricted ones are counted, not drawn.

"AI-built?" Yes, and the post says so: the code was written with AI coding agents under my review, and the reviews are in `docs/`. What is on a species page is derived by scripts in `scripts/`: re-derived from the built files in about an hour; built from the sources over several days (a CHELSA pack, a GBIF bulk download, and OpenAlex and iNaturalist at their daily allowances). The sentence templates were written once, with the code, and are in `src/lib/core/sheet.ts`.

"Will sync stay free?" [AUTHOR: one sentence, the same as in the post.] The server is AGPL and in the repository, so you can run your own.

"Why AGPL?" So a hosted fork publishes its changes. The scripts are MIT so the derivation can be reused anywhere.

"No accounts means no recovery." Correct. The key is the account; lose it and the ciphertext is nobody's. The backup file exists for that, and the plants list keeps a link to it.
