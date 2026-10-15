# Self-review of round seventy, reviewer A: Wikipedia summaries

Copy `(scratch)` at `76dcd55`. Trial fix: `A-fix.diff` (summary-proof.ts, summary-fill.ts, build-dossiers.ts, two fixtures, a new `tests/unit/rev70-self-a.test.ts`); the full unit suite passes with it (3,353 passed, 8 skipped; baseline 3,349 plus my 4). Working files are in `(scratch)`. I fetched `/api/index` once, 1,579 random dossiers plus the 221 whose name Wikipedia redirects (1,799 in all), at about one a second.

## Findings

**1. Most of round seventy's summary work is not on the live site. Two live pages quote another species' article. (confirmed)**
About 70 live records still give round sixty-nine's proof, "whose lead is this species'". I found 12 in 1,579 random dossiers and 46 in all I fetched (Bismarckia, Cocos nucifera, Malus domestica, Arundina, Tetrapanax, Megaskepasma, Callistemon viminalis, Dypsis decaryi and others). Round seventy says the lead is never proof.
- **Drosera montana** (3191221) still quotes "Drosera tomentosa", a species Kew accepts in its own right (A.St.-Hil.). Its record reads "ok, carried from build of 2026-09-29; this build: skipped".
- **Coryphantha macromeris** (3084426) quotes "Pelecyphora macromeris", which the reference holds as a species of its own (11798439). Kew holds C. macromeris as a synonym of it, so the reference has two pages for one plant (for B or N).

I ran the deployed `checkSummaries` today, unchanged and with live sources, over the 228 dossiers of my set that it asks online. All 228 answered first time: none was left not checked, 5 were dropped and 63 records were rewritten. Every "whose lead" record got a structured proof (58 by Kew's count, Apple and Coconut as products), and Drosera montana was dropped.
**Fix:** run `--fill summaries` again with finding 4's changes, then upload.

**2. The basionym proof accepts the species' own item as "another name", which bypasses the other-species guard. (confirmed)**
`summary-proof.ts:163-166`: when the title's item *is* the species' item (`ti.id === sp.id`), the shared-basionym branch finds the item's own P566. This is where "the basionym of Q278283 and Q278283" comes from. It takes a sitelink that `foreignBinomial` has just refused.
- Tetragonia tetragonoides and Ariocarpus agavioides are the right plants, but reached by this bypass.
- Run today, the deployed fill keeps Coryphantha macromeris's "Pelecyphora macromeris" the same way, another species of the reference: "Wikidata gives Q15031906 as the basionym of Q1135881 and Q1135881".
**Fix (diff):** require `ti.id !== sp.id`. Finding 3's change keeps the two right ones.

**3. GBIF's backbone holds both spellings of one plant as two species, so right articles are dropped. (confirmed)**
`foreignBinomial` (`:116`) trusts GBIF alone. In each case below, GBIF holds the second spelling as a separate accepted species by the same author, and Kew holds no row of it:
- Echinocereus ferreirianus, against Kew's ferreiranus H.E.Gates;
- Nepenthes burbidgeae;
- Stenocactus ochoterenianus (Tiegel);
- Tetragonia tetragonioides;
- Ariocarpus agavoides.

The deployed fill drops the first three today, though each title is the species' own Wikidata sitelink.
**Fix (diff):** a binomial is another species only when GBIF says so *and* Kew's WCVP holds a row of it. This costs one request, and only for a binomial GBIF refuses. Drosera tomentosa stays refused, because Kew accepts it.

Over the 228, the patched fill:
- keeps those five as "the English article of this species' Wikidata item";
- drops Coryphantha macromeris;
- otherwise answers as the deployed one (205 proved, 3 dropped).

**4. Why `--fill summaries` leaves about 232 not checked, and whether it can finish (root cause suspected; symptoms confirmed).**
It is not one bad batch, one source or a data bug:
- every sampled species the 70c run left unchecked answers at once today;
- all 446 sampled Wikidata items exist, with no `no-such-entity` (which fails a whole batch of 50) and no redirects;
- a 50-item batch of the heaviest items is 1.7 MB in one second.

70c proved 11 summaries under another title, against 75 in 70b and over 200 today, so its online pass mostly failed. The code turns run conditions into a fill that cannot finish:
- `maxlag=5` on read-only `wbgetentities` (`summary-proof.ts:223, 247`). Wikidata's lag now comes from the query service ("type: wikibase-queryservice"; queryserviceLag 444 to 617 s, read as 7.4 to 10.3 s at 01:31, 01:52 and 02:18 today, and under 2 s between). That lag has nothing to do with reading entities. On the owner's day it held species for 15 to 45 minutes.
- The retries cannot outlast it. Three passes fall within about 25 minutes, ten minutes apart (`fillRounds`). After a cooldown, `hostTouchy` (`fetch.ts:78-82, 143-148`) cools a host again for ten minutes on its first 429 for an hour. Wikimedia's edge answers this address 429 with `x-envoy-ratelimited` and Retry-After 27 to 55 s.
- No run makes progress for the next. Every summary with a recorded redirect is asked again on every run, and a not-checked one is left with no mark, so each run repeats about 440 asks (my estimate: 2.4% of dossiers) under the same exposure.
- Only a count is printed, so nobody can tell which source failed.

The fill can finish: my run did 228 in about three minutes.
**Fix:** drop `maxlag` from the read-only calls (or set it at 30), wait past the hour of touchiness, and print each not-checked species with its source. The diff adds `uncheckedLines` and prints them. Also record a not-checked state (finding 5).

**5. A summary whose proof was not read stays published as "ok". (confirmed in code; Drosera montana is the live case)**
`/about/how` says such a summary "is recorded as not checked". The code does not do this:
- `summary-fill.ts:93` leaves the stored summary and its record untouched.
- `build-dossiers.ts:1097` (`carry('wikipedia')`) puts back the previous summary under the previous status when the proof was not read.
- `build.ts:439` (`keepPrevIds`) asks the previous title when Wikidata does not answer. A title that is not a binomial then needs no proof. With fixtures, a carried "Strombocactus" is taken for S. corregidorae with an empty record.

**Fix:** under a title other than the name, publish only a summary whose proof was read in this run, or whose record names a proof. Carry only those. When Wikidata did not answer, ask by the name.

**6. The product proof takes a product of the genus. (confirmed in code; not seen live)**
At `:167-170`, a product naming no taxon is taken when one species' item lists it (P1672), and so is one naming only the genus. Wikidata today:
- Mezcal, Tequila, Pulque, Sotol, Bacanora, Raicilla, Agave syrup, Prickly pear and Dragon fruit have no P1582;
- Nopal names only Opuntia.

**Fix (diff):** the product must name this species. The genus is passed over only beside it, which keeps Apple.

**7. The monotypic-genus proof by parent does not ask whether Kew's one species is this one. (confirmed in code; not seen live)**
At `:173`, a reference species whose item names genus G takes G's article when Kew holds one species in G, whichever species that is.
**Fix (diff):** take the parent route only when Kew's one species is this species' name or an older name. The wording of the existing records is unchanged.

**8. The named cases.**
- **Rosa luciae: wrongly dropped.** "Rosa lucieae" is Q17246292. Its IPNI, 60464116-2, is IPNI's duplicate record of *Rosa luciae* Franch. & Rochebr. ex Crép. (the top copy, 733162-1, is in the dossier). Kew holds no "lucieae" and puts Rosa wichurana under R. luciae. **Fix:** add a proof that the title's item carries this name's IPNI identifier or an IPNI duplicate of it (B's `ipniNames` already reads duplicates).
- **Reicheocactus famatimensis: wrongly dropped, but within the rule.** Kew's one species is *R. famatinensis* (Speg.) Schlumpb., the backbone's name with the same authors, one letter different. The dossier has no Wikidata item. **Possible fix:** the uploader's-slip rule plus identical authorship.
- **Strombocactus disciformis: right to drop.** Kew counts 2.
- **Crossostephium chinense: right by the rule.** Kew holds it as *Artemisia chinensis* and the genus as a synonym, so the count is 0.
- **Matteuccia: right by the rule.** Kew sinks the genus into Onoclea.
- **Echeveria kimnachii → "Reidmorania": right by the rule.** The deployed fill drops it; Kew sinks Reidmorania into Echeveria.

**9. `spellingKey` joins distinct species beyond the reference. (confirmed)**
I grouped the 8,947 accepted names by genus and key. No pair of accepted species is joined any more. Two synonyms key as another reference species' accepted name:
- Schinus terebinthifolia's "Schinus aroeira" keys as Schinus areira. `oe→e` reads a vowel hiatus as a diphthong, and these are two different words.
- Cistus creticus's "Cistus ladanifera" keys as Cistus ladanifer.

Against Kew's accepted species in 534 of the reference's genera (all genera from A to roughly E; the survey stopped there), the key joins:
- **Euphorbia peplus and E. peplis.** Peplus is in the reference (3066386). The -us/-is join is across declensions.
- **Allium chrysanthum and chrysantherum; melananthum and melanantherum; Erica leucantha and leucanthera; Dioscorea trichantha and trichanthera; Bauhinia macrantha and macranthera.** This is round seventy's e-drop before -ra/-rum.
- **Asplenium formosum and formosae.** A genitive -ae is read as an ending.
- **Begonia chambersii and chambersiae.** A man's and a woman's genitive.
- **Anthurium lanceum and lancea.**

The name proof is read offline before GBIF, and the Commons and iNaturalist rules read the same key, so a "Euphorbia peplis" file or taxon counts as peplus wherever the reference holds no peplis.

-ai/-ae and caffr-/afr-: no join found. Kew writes afr- (Erythrina afra Thunb., Harpephyllum afrum). Strelitzia nicolai is a genitive of Nicolaus, not of a name in -a, but nothing else shares its key. Short stems are left apart (afra/afrum/afer, ater/atra/atrum), which is only conservative.

**Fix:**
- drop the e only after -f and -g (-fer, -ger);
- read a final -ae and -iae as a genitive, never as an ending;
- limit `oe→e` to Latin roots (foetida, coerulea), or apply it only inside a word;
- join -is with -us only where GBIF or Kew holds no other species of that spelling, which keeps scaphirostris and scaphirostrus.

**10. Four of the summary sentences on `/about/how` are untrue of the code or the site. (confirmed)**
- **"(but not when that title is a binomial … that GBIF holds as another species …)".** Tetragonia and Ariocarpus are quoted under such titles (finding 2).
- **"What the article's opening says is never taken as proof".** About 70 live records still cite the lead (finding 1).
- **"recorded as not checked".** The record is left untouched (finding 5).
- **"that species is this one by Wikidata's parent taxon or by name".** The parent alone takes a genus Kew keeps for another species (finding 7).

With the diff these should read:
- "(but not when that title is a binomial, neither its name nor an older name, that GBIF holds as another species or under a variety or subspecies of this one, and that Kew's World Checklist holds as well)";
- "the title's item names this species as the plant it is a product of, and no other plant but its genus ('Apple')";
- "and that species is this one by name".

**11. Tests miss many guards: 30 of 64 mutants survived (`A-work/mut.log`, nine summary and spelling test files).**
- Equivalent or dead: P2, P3, P11, P32, W1 and W2. The fetcher maps a 404 to "none" before the Wikipedia not-found branch.
- `summary-proof.ts`, guards with no test:
  - P9: product by P1672 alone;
  - P12: monotypic genus without the genus name;
  - P15: GBIF match with no species;
  - P17: Kew same-type epithet check removed;
  - P18: every row turned to some row;
  - P19: the accepted name's basionym author;
  - P20, P21: two accepted genera, and the status filter;
  - P23: HIGHERRANK;
  - P26: the word count;
  - P28: a species item not answered, read as no item (rule 2);
  - P29: Kew's rank filter;
  - P30, P33;
  - P36: a GBIF failure read as "GBIF holds no such name", which would let a sitelink past the other-species guard (rule 2).
- `wikipedia.ts`, `summary-fill.ts` and `epithet.ts`:
  - W3: disambiguation;
  - F1, F10: set-aside refusals not asked again;
  - F2;
  - F5: a proof not answered, silently not counted;
  - F7: the order of titles asked;
  - F8;
  - E7: `oe→e`;
  - E9: Greek -os/-on.

## Root causes of the open issues in my area

- **Rosa luciae / "Rosa lucieae":** no proof reads IPNI identifiers; the structured proof exists (finding 8).
- **"basionym of Q278283 and Q278283":** the species' own item matched as the title's item (finding 2). It also took Coryphantha macromeris.
- **The 232 "not checked":** a fill that gives up within 25 minutes under Wikidata's query-service lag and Wikimedia's throttling, never makes progress between runs, and names nothing (finding 4).

## Checked and sound

- Strombocactus, Matteuccia and Crossostephium drops (Kew via GBIF, live).
- Kew counts for Welwitschia, Fenestraria, Bowiea, Harpephyllum, Jeffersonia, Serissa and Dionaea, and for the 58 monotypic proofs of my run (all 1).
- The 21 older-name proofs written today (Loquat, Hedlundia, Melaleuca viminalis, Anacis, Chrysalidocarpus decaryi).
- Apple's and Coconut's P1582.
- Of the 278 names Wikipedia redirects, those reaching another reference species (Agave vivipara, Drosera felix, Mammillaria sonorensis) are refused.
- The Ceropegia ciliatior/ciliatioris fix.
- `titleItems` takes an entity only by its own sitelink.
- Each batch fails alone.

## Not done

- The Kew spelling survey stopped at about E (534 genera).
- I fetched 1,799 dossiers, not all 8,947, so "about 70" lead records is an extrapolation.
- The diff does not:
  - fix finding 5;
  - change `maxlag`;
  - add the IPNI proof;
  - change `spellingKey`;
  - update `/about/how`.
- No browser tests were run: my area is the corpus builder.
