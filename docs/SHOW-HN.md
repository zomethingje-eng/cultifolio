# Show HN draft

Working notes, not the post. Figures in brackets are read from `report.txt` and the index on the day of posting; do not post a number the index does not say.

## Title

Under 80 characters, no "AI", no adjectives. The three candidates, best first:

1. `Show HN: Cultifolio – a plant species reference where every figure shows its derivation`
2. `Show HN: Cultifolio – habitat climate and cultivation sheets for 8,900 species, derived, not written`
3. `Show HN: A species reference built only from public data, plus a collection tracker that never phones home`

The first says what is different in the fewest words. The count in the second is what people click on but it goes stale by the day, so it goes in the text, not the title.

## Text

Keep it under 300 words. HN readers skim the first paragraph and the last, and reply to whichever sentence they can argue with, so put the one they should argue with (nothing written, nothing filled in) first.

---

I grow cacti and succulents and got tired of cultivation advice that was either copied from another site or guessed. Cultifolio is a species reference for [8,947] species where nothing on a species page is written by a person or a language model. Each page is derived from public data and says how: the native range from Kew's World Checklist, every georeferenced wild record inside it from GBIF, the climate read from the CHELSA cells those records fall in (median year, 10th to 90th percentile across cells, drawn as a climograph), forty years of frost nights and extremes from NASA POWER at the typical cell, and a cultivation sheet assembled from those figures by two fixed rules. Where a number cannot be derived it is left out and the page says so. Photographs are CC-licensed from GBIF and iNaturalist, credited by name.

The other half is a collection tracker: accession numbers, timelines, sowings that mint numbered plants, benches, labels with QR codes, frost watch. It lives in your browser and nowhere else. No accounts, no analytics. Sync between your own devices is end-to-end encrypted with a key only you hold; the server stores ciphertext and cannot read a plant name. The backup file and the wire format are documented so you can read your data without the app.

Stack: SvelteKit 5 on Cloudflare Workers, the corpus in R2 as one JSON per species, IndexedDB on the client. The corpus is built offline on my PC from a names list; a full re-derivation of the rules runs in about an hour with no upstream calls. AGPL-3.0. The engineering log and two full adversarial code reviews with what was done about each finding are in the repo.

What I would most like to hear about: a species page where the derived figures are wrong, and why. `/about/how` is the methodology.

Site: https://cultifolio.com · Source: https://github.com/zomethingje-eng/cultifolio

---

## Before posting

- Fresh `npm run dossier -- --index`; put the index's species count and the photograph coverage in the text if you quote them (`report.txt` has both).
- Open five species pages in a private window on the deployed site, one from each of: a cactus, a bulb, an epiphyte, a one-cell species, a species with a refused climate. The last two are the ones a commenter will find.
- `npx wrangler tail` open in a window for the first hour.
- R2 spend alert set (DEPLOY.md §1). A front-page day is a few hundred thousand reads of small objects; R2 class B reads are cheap, but see the bill before the second day.
- Rate limits are per address and the name proxy is limited too; a corporate NAT can trip them. That is by design; the reply is "Retry-After", not a ban.
- Post between 08:00 and 10:00 US Eastern on a weekday. Answer every comment in the first two hours, especially the wrong ones, briefly.

## Replies to have ready

"Why not an LLM summary?" Because a summary that is 95 % right is a reference that is 5 % wrong and does not say which 5 %. The Wikipedia lead is quoted, attributed and cut at a sentence; nothing else on the page is prose.

"Cold floor from a 30-year climatology and a 40-year extreme is not hardiness." Correct, and the page says what it is: the habitat's coldest night on record at the typical cell, not a hardiness rating. Cultivation advice is derived by rule from the figures and the rule is printed.

"CHELSA cells are 1 km; your cell is coarser." The grid is packed to tenth-degree cells (each the mean of ~144 pixels) for the range read; the provenance line on the page says exactly that, with the cell id.

"GBIF records are noisy." Yes: cultivated, naturalised and invasive records are dropped, records outside the WCVP range are dropped, coordinate uncertainty is kept and preferred on dedupe, and the marker moves to the fullest bin so a stray record does not place it. The record map shows every record used.

"Why AGPL?" So a hosted fork has to publish its changes. Scripts are MIT so the derivation can be reused anywhere.

"No accounts means no recovery." Correct. The key is the account; lose it and the ciphertext is nobody's. The backup file exists for that reason and the plant list keeps a link to it.
