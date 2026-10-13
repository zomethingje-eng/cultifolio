# Self-review 69, reviewer A: Wikipedia summaries and the redirect rule

Area: `redirectIsThisSpecies`, `sameEpithet`, `speciesBinomials`, `summary` and `summaryTitleFits` (src/lib/dossier/sources/wikimedia.ts), `checkSummaries` and its restore path (src/lib/dossier/corpus-fills.ts), the build's call (build.ts:419), the about-page sentence (src/routes/about/how/+page.svelte:36), and the three test files.

Working copy /tmp/claude-0/rev69/A, source unchanged. Reproductions are in `scripts/tmpA/` (untracked; `npx tsx scripts/tmpA/<name>.ts <dir>`), with the trial fix in `proposed-fix.diff` and the collisions in `epithet-pairs.txt`.

Wikipedia and Wikidata answered 429 for most of the session (six reviewers, one address), so I checked redirects in batches (`action=query&redirects`, about 1,300 index names), read the REST leads the live dossiers hold (59 species) and fetched 18 REST summaries directly.

Summary: none of the 88 restored summaries is about another plant. The rule as written would quote the wrong article in four cases that real Wikipedia leads produce. None of the four is live today, because no species in my sample is redirected that way yet. The rule does wrongly drop three monotypic species on the live site. The about-page sentence is false in three of its clauses. Most mutations of the rule survive the tests.

## Findings

### 1. A genus page that is its sole or type species' article is quoted for another species of that genus (confirmed on real leads, latent)

wikimedia.ts:293-295. For a title that is not two words, the rule keeps the article when the lead names this species. Otherwise it keeps it when the lead "does not open as a genus's". It never asks whether the lead names *another* species of this species' own genus. Wikipedia often files a genus under its type species' article:

- `GET https://en.wikipedia.org/api/rest_v1/page/summary/Strombocactus` returns "Strombocactus disciformis is a rare species of cacti and the only species of the genus Strombocactus."
- `.../summary/Arundina` returns "Arundina graminifolia, also called bamboo orchid, is a species of orchid and the first sole accepted species of the genus Arundina, followed by A. caespitosa…"

`npx tsx scripts/tmpA/strombo.ts <dir>` runs the rule on those leads. It gives `redirectIsThisSpecies('Strombocactus', lead, 'Strombocactus corregidorae', [...]) === true` and the same for Arundina caespitosa. Strombocactus corregidorae is in the index (key 7590102). It has its own article today (`/api/dossier/7590102`, title "Strombocactus corregidorae"), so this is not live. But if Wikipedia ever turns that article into a redirect to the genus, or the build asks a sitelink-less name that redirects there, the page quotes S. disciformis' article. The about page says "Another species of the species' own genus is never quoted". The code does not keep that promise on this branch.

Fix (in `proposed-fix.diff`): when the one-word title is one of this species' genera and the lead names a species of that genus but not this one, drop. Over the 108 stored leads it still keeps 88, and the three test files still pass. The only collateral I found is "Asparagus" for Asparagus officinalis, which the item's sitelink already covers.

### 2. `sameEpithet` treats different epithets as one, so another species of the same genus is kept (confirmed, latent)

wikimedia.ts:256-265 and line 287. Two epithets count as "the same" when:

- they share a stem after one ending is stripped, with no length floor; or
- they are up to two edits apart, for words of six letters or more.

The two-word branch returns true on this at line 287, before the own-genus guard at line 290. `namesUs` (line 284) uses the same test. `scripts/tmpA/pairs.ts` runs the rule over every pair of species in the live index (`/api/index`, 8,947 names). It finds 178 pairs of *distinct accepted species in the same genus* that the rule calls one epithet. They include Acer saccharinum and Acer saccharum, Ceropegia coddii and woodii, Conophytum minimum and minutum, Crassula perfoliata and perforata, Crassula alpestris and rupestris, Nepenthes gracilis and abgracilis, Mammillaria anniana and hahniana, Gymnocalycium horstii and mostii, and Agave hurteri and turneri. Across genera, it pairs 3,101 of 5,934 epithets ("glauca" with "glabra", "pumila" with "pusilla", "rosea" with "rosei", "chinensis" with "chilensis"). So `redirectIsThisSpecies('Acer saccharum', <sugar maple lead>, 'Acer saccharinum', [])` is true (`scripts/tmpA/demo.ts`).

None of the 333 names in those pairs redirects to its partner on Wikipedia today, so nothing is live. The rule still contradicts:

- section 15 of the round, whose `misspelt` (photo-kind.ts:84) holds "two letters away stays another species (Conophytum minimum and minutum)";
- the about page ("spelt another way"; "another species of the species' own genus is never quoted").

The ending list also includes "er", which strips "stolonifer" to "stolonif". That is why the edit distance had to reach two to keep Echinocereus stoloniferus.

Fix (in `proposed-fix.diff`): use photo-kind's normalisation (hyphens dropped, "ae" read as "e"). Treat as one epithet a stem match without the "er" ending, or one letter changed, added or left out at five letters or more. The 108 still give 88 (scaphirostrus, stoloniferus, luciae/lucieae, burbidgei/burbidgeae all held), the tests pass, and the same-genus collisions fall from 178 to 14, all one letter apart (Drosera macrophylla and microphylla, Stephania suberosa and tuberosa). That residue is the cost the Commons rule already accepts.

### 3. The genus-or-group test misses common leads, so a group, product or genus page is quoted (confirmed on real leads, latent)

wikimedia.ts:295. These current REST leads fall through `/\b(is|was|are) an? (small |large |monotypic )?genus\b|\bgenus of\b|…/`, so the rule keeps them for any species redirected there (`npx tsx scripts/tmpA/groups.ts <dir>`; each is KEEP):

- Mammillaria: "Mammillaria is one of the largest genera in the cactus family" (133 index species).
- Drosera: "Drosera … is one of the largest genera of carnivorous plants" (204 index species).
- Rose: "A rose is either a woody perennial flowering plant of the genus Rosa … There are over three hundred species".
- Oak, Plum ("a fruit of some species in Prunus subg. Prunus") and Cherry ("the fruit of many plants of the genus Prunus").
- Banana ("several kinds of … plants in the genus Musa").
- Sandalwood ("a class of woods from trees in the genus Santalum"), Myrrh ("a gum-resin extracted from a few small, thorny tree species") and Mahogany ("timber produced by three tropical hardwood species").

Of 736 index names in Mammillaria, Drosera, Nepenthes, Commiphora, Prunus, Rosa, Musa, Santalum and Swietenia, nine redirect, all to a species article (Peach, Almond, Rosa pimpinellifolia and others). A scan of 526 live dossiers in these and other risky genera found no summary under a genus or group title. So nothing is live. The about page's "neither is a genus whose opening does not name the species" is still false for Mammillaria and Drosera.

Smallest fix: add `\bgenera\b`. With that, the 108 still give 88, Mammillaria and Drosera drop, and the tests pass. Regex tightening cannot reach the common-name group pages. I tried `(of|in) the genus`. It also drops Onion, Apple, Garlic, Cherimoya, Asparagus, Sesame and Jujube, whose leads read the same ("Garlic is a species … in the genus Allium"). The sound rule is Wikidata's: the REST answer carries `wikibase_item`, and a crop or product item names its taxon with P1582 ("natural product of taxon"). Keep a non-binomial title without the name in its lead only when that item is the species' item, or names the species' item alone in P1582. That rule is **suspected**: I designed it but could not run it with Wikidata refusing.

### 4. Three monotypic species lose their own article on the live site, and the round's account of them is wrong (confirmed)

`/api/dossier/7410371` (Harpephyllum caffrum, rebuilt 13:04 today) has no summary. Its record is `{"status":"none","detail":"Wikipedia redirects Harpephyllum caffrum to Harpephyllum"}`. The lead (`.../summary/Harpephyllum`) is "Harpephyllum is a genus of trees … The sole species is Harpephyllum afrum". Wikipedia now files the "caffr-" epithets under "afr-" (Erythrina caffra redirects to "Erythrina afra"; this follows the 2024 congress vote to replace them). `sameEpithet('caffrum','afrum')` is false, because "afrum" has five letters, so the genus test drops the page. Meanwhile the doc comment at wikimedia.ts:277-278 cites exactly this lead as a case the rule *keeps* ("a near spelling of one in the same genus ('The sole species is Harpephyllum afrum')"). Erythrina caffra (`/api/dossier/5349557`: title "Erythrina afra", no detail) survives only through its Wikidata sitelink. Asked by name, it would be dropped: "Erythrina afra" is another epithet in its own genus (line 290).

Fenestraria rhopalophylla (`/api/dossier/7329187`: `none`, "Wikipedia redirects Fenestraria rhopalophylla to Fenestraria") and Bowiea volubilis (`/api/dossier/7386178`, likewise) are dropped as "genus pages of many species" in REVIEW-ROUND-69 section 13. GBIF's backbone holds one accepted species in each. `api.gbif.org/v1/species/search?datasetKey=d7dddbf4…&highertaxonKey=7503567&rank=SPECIES&status=ACCEPTED` gives count 1, Fenestraria rhopalophylla, and key 2768050 gives Bowiea volubilis alone; Bowiea gariepensis is among its stored synonyms. Their genus articles are these species' articles.

Fix (**suspected**, not built): when the one-word title is this species' genus, ask GBIF for the genus's accepted species (one request). Keep the page when there is exactly one; drop it when there are more and the lead names another (finding 1). Also correct the doc comment and section 13's list.

### 5. The build reads the whole extract, the fill reads the stored 1,500 characters, so a summary flips on every fill (confirmed with a stub)

wikimedia.ts:239 runs the rule on `r.data.extract` in full. Line 242 then stores `extract.slice(0, 1500)`. `checkSummaries`' `byLead` (corpus-fills.ts:151, 163) reads the stored text, while the restore path (line 169) asks Wikipedia again and reads the full extract. `npx tsx scripts/tmpA/flip.ts` uses a genus lead of 1,754 characters that names the species at character 1,740:

```
build: ok Wikipedia redirects Examplea rara to Examplea, whose lead is this species'
fill 1: dropped 1 restored 0 -> no summary
fill 2: dropped 0 restored 1 -> summary present
fill 3: dropped 1 restored 0 -> no summary
fill 4: dropped 0 restored 1 -> summary present
```

The restore path cannot overwrite a good summary or loop within a run (it reads only dossiers without one, collected before the drops), but across runs it alternates. The about page also says "whose opening names the species", but the build reads past what it quotes. Fix: run the rule in `summary()` on `extract.slice(0, 1500)`, the text it stores.

### 6. A summary the fill keeps by its lead is not recorded as coming from another title (confirmed with a stub)

corpus-fills.ts:151 and 163: `if (byLead(d)) { c.byLead++; continue; }` writes nothing. `npx tsx scripts/tmpA/bylead.ts` keeps "Welwitschia" for Welwitschia mirabilis with the record unchanged: `"detail":"carried from build of 2026-09-29; this build: skipped"`. The about page says "A summary quoted from under another title says so in the page's record of its sources", and the build and restore path do say so. Fix: in both branches, write `upstream.wikipedia.detail = redirected(d.name.scientific, title) + ", whose lead is this species'"` (or append it to the carried detail) and `store.write`.

### 7. A two-word common name is read as a binomial, so the species' own article is dropped where "Apple" is kept (confirmed on stored leads)

wikimedia.ts:266 and 285-291. "Venus flytrap", "Sweet potato", "Black pepper", "Spanish moss" and "Lemon balm" match `BINOMIAL`. Their leads ("The Venus flytrap is a carnivorous plant…", "Lemon balm is a perennial herbaceous plant in the mint family") do not name the binomial, so the rule returns false (`scripts/tmpA/live57.ts`: "rule false" on the leads stored for Dionaea muscipula, Ipomoea batatas, Piper nigrum, Tillandsia usneoides and Melissa officinalis). A one-word title with the same kind of lead is kept. Today all five are kept through their sitelinks. When Wikidata lags and no previous title is carried, the build asks by name and records "none: Wikipedia redirects Dionaea muscipula to Venus flytrap". The same branch drops Ficaria verna for Ranunculus ficaria and Melaleuca citrina for Callistemon lanceolatus, which are the same plants. Those drops are defensible under rule 3 (no guessing).

Fix: treat a two-word title as a binomial only when its second word is lower case *and* the title appears in the lead followed by no article ("Huernia zebrina, the little owl…"). Otherwise send it to the one-word branch, keeping the own-genus guard.

### 8. The tests let most of the rule change unnoticed (confirmed)

I mutated wikimedia.ts and corpus-fills.ts one change at a time and ran `npx vitest run tests/unit/r69-summary-leads.test.ts tests/unit/r69m-corpus.test.ts tests/unit/r69m-names.test.ts` (52 tests). These all **survived**:

- deleting the own-genus guard (line 290);
- edit distance 2 to 1, and 2 to 4;
- length floor 6 to 2;
- removing the stem;
- removing every regex alternative after the first (`genus of`, `several species`, `common name`, `group of`);
- letting `namesUs` ignore the genus;
- always keeping a two-word title in another genus;
- letting `speciesBinomials` keep infraspecific names;
- removing either `byLead` branch of `checkSummaries` (lines 151, 163);
- dropping the restore path's error count.

Caught: restricting the epithet match to the same genus (1 failure), skipping `namesUs` for one-word titles (3), dropping the "whose lead is this species'" detail (2), and restoring without a title check (1).

The guards pass for another reason: without line 290, Weingartia canigueralii and Mammillaria standleyi still drop because neither lead names the species. Add cases for:

- a same-genus near epithet (Acer saccharinum given "Acer saccharum");
- a two-word title in another genus whose lead does not name the species (Ficaria verna);
- a lead caught only by each later alternative: Euphorbia's "a very large and diverse genus of", Yam's "common name for", Bamboo's "group of", and Drosera's "genera" once added;
- an infraspecific synonym (Rebutia canigueralii subsp. pulchra);
- the fill keeping by lead, online and offline.

## Checked and sound

- **The 88 restored summaries.** I fetched every dossier (`/api/dossier/<key>`, keys from summaries-108-before.json) and compared each with its stored lead. All 88 have a summary with status `ok`. 85 carry "Wikipedia redirects X to Y, whose lead is this species'". Allium cepa ("Onion") and Anemone nemorosa were rebuilt this morning and now come by the item's sitelink, so no redirect happened. Echinocereus stoloniferus' article has moved to the asked title. I read every lead, and each is about the species. The closest calls are right: Echeveria kimnachii's is "Reidmorania occidentalis", a stored synonym; Rhaphiolepis bibas' "Loquat" is Eriobotrya japonica; Arundina's lead is A. graminifolia's own.
- **The 20 still dropped.** All are status `none` with the redirect detail. Fifteen are rightly dropped: genera of several species (Kopsia, Crassula, Pinguicula, Tagetes, Baccharis, Pittosporum, Jeffersonia) and lumps into separate species (Agave angustifolia, Schinus molle and others). Fenestraria, Bowiea and Harpephyllum are wrong (finding 4). Ranunculus ficaria and Callistemon lanceolatus are the same plants, but their leads do not say so (finding 7).
- **The restore path.** It takes only dossiers with no summary and status `none` with a redirect detail. A refusal or error counts as unchecked and writes nothing, and a `none` leaves the record as it was. It runs once per fill, after the drops, and cannot loop within a run (but see finding 5). Offline, it asks nothing (tested).
- **Rule 2.** `summary()` returns `none` only for Wikipedia's not_found, a disambiguation page, an empty extract, or a redirect it declines (said as "Wikipedia redirects X to Y"). An error type is `error`, and a fetch failure passes through. The species page renders a missing summary as "Not checked" only for refused, error or skipped (`+page.svelte:450-452`), and Provenance says "nothing to report: Wikipedia redirects…" for a declined redirect.
- **The 57 crops and ornamentals** in my candidate list that redirect (Okra, Sisal, Blue agave, Garlic, Chives, Peyote, Saguaro, Taro, Cardoon and others). Every stored lead is the species' own article. The rule keeps 51 and drops only the two-word common names of finding 7 (the remaining two fit by title). Lawsonia inermis and Euphorbia antisyphilitica have their own articles, so "Henna" and "Candelilla wax" are never reached.
- **The live sample of 526 dossiers** in Mammillaria, Drosera, Rosa, Prunus, Iris, Opuntia, Ficus, Acer, Citrus, Euphorbia and others: 16 summaries are under another title, and all are the species' article or an older name's.

## Not done

- Wikidata refused every request after the first, so I could not:
  - confirm which carried other-title summaries (Date-plum, Spanish moss, Citron, Poinsettia, Kaffir lime, Trifoliate orange) are the item's sitelink rather than an old title kept without a check;
  - try the P1582 rule of finding 3.
- Drosera montana quotes "Drosera tomentosa", which GBIF holds as its variety (D. montana var. tomentosa). That is a sitelink matter outside this rule, and I did not pursue it.
- My redirect sample of single-genus species stopped after 50 names (six redirects, all monotypic genera or crops, all fine).
- I did not run the about-page seam tests or the browser tests.
