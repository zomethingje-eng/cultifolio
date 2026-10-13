# Round seventy, agent A: Wikipedia summaries (A1)

Item A1 of `REVIEW-TRIAGE-69.md` (S-A1 to A7, S-F5, IND-2). Commits `a3aec7f` and `4ddfdde` on `base`.

## Done

**The rule.** A new module, `src/lib/dossier/summary-proof.ts`, holds it; `redirectIsThisSpecies`, `sameEpithet` and `speciesBinomials` are gone from `sources/wikipedia.ts`, and no lead is read. A title Wikipedia gives in place of the one asked is taken only on a positive proof, named in the record (S-A6), tried in this order:

1. `name`, `older-name`, offline: the title is the name or an older name at species rank as stored, genus as written, epithet by `spellingKey`, no edit distance, older names below species skipped ("Ariocarpus scaphirostris").
2. `item`: the title is the English sitelink of the species' Wikidata item ("Venus flytrap").
3. `name`, `older-name` through the title's item: its taxon name (P225) is the name or an older name ("Date palm"; "Loquat", Eriobotrya japonica, an older name of Rhaphiolepis bibas).
4. `older-name` by type: the title's item, a species, and the species' item share a type in Wikidata's basionym statements (P566), one the other's basionym or both with the same ("Huernia zebrina", "Anemonoides nemorosa").
5. `product`: the title's item names the species' item in P1582, or the species' item names it in P1672, and it names no taxon but this species and its parent ("Apple" names Malus domestica and Malus; a "Plum" naming several species does not count).
6. `monotypic-genus`: the title's item is a genus in which Kew's WCVP holds exactly one accepted species, and either the species' item names it as parent (P171) and it is the species' genus by name ("Fenestraria"), or Kew's one species is this species' name or an older name ("Serissa", whose one species is Serissa japonica, an older name of Buchozia japonica).

Without one of these proofs the answer is "none: Wikipedia redirects X to Y". If Wikidata, or GBIF serving Kew's data, does not answer while the proof is being read, the result is `refused` or `error` and the record says: "Wikipedia redirects X to Y; whether it is this species' article was not checked: Wikidata refused (…)". That follows rule 2, and the species page shows it as "Not checked".

**Where each fact comes from (S-A5).** The build and the fill make exactly the same requests through one function, `titleProof`:

- **The species' item:** `wbgetentities&ids=` with claims and the enwiki sitelink. This is the same URL `crossIds` already uses.
- **The title's item:** `wbgetentities&sites=enwiki&titles=`. An entity counts only if its own sitelink is that title.
- **Kew's count:** WCVP as Kew publishes it through GBIF (dataset `f382f0ce-323a-4091-bb9f-add557f3a9a2`). The requests are `/species?datasetKey=…&name=<genus>` to find the one accepted genus row, then `/species/search?…&highertaxonKey=…&rank=SPECIES&status=ACCEPTED&limit=2`.

Kew's own API (`powo.science.kew.org/api`) answers a script with a Cloudflare challenge, and the WCVP files are read only by a build that has them, never by the fill. GBIF's backbone is not Kew: it gives Strombocactus three accepted species, one a misspelling. `summary()` now takes the species' `item` (and facts already fetched) and returns the proof in `data.proof`.

**The fill (`checkSummaries`, `summary-fill.ts`).** A title that is the name or an older name, with no redirect recorded, stands unasked; one the name settles offline stands with its record naming the proof. Online, the species' items are asked fifty a request and a title that is the item's sitelink stands. Every other title, and every summary set aside (`none`, or a redirect not checked), is asked of Wikipedia again as the build asks it (sitelink, else the title the record says was asked, else the name), and the build's own `summary()` answer is stored, so the build and the fill cannot disagree and nothing flips between fills (tested with the reviewer's 1,754-character case). Records saying "whose lead is this species'" are rewritten to name the proof, each change reported (`changed`, `changedLines`, `proofs`). Offline only the name is read and nothing is dropped. `byLead` stays, always 0, until the script's line changes (Needs).

**Tests.**

- `tests/unit/r70a-summary-proof.test.ts` (new, 25 cases; it imports only modules the base has, so a base failure is the rule's): IND-2 (Persea americana and Avocado for Agave americana, Drosera microphylla for D. macrophylla, Rose for Rosa rubiginosa, "Sundews in cultivation"); S-A (Acer saccharum for A. saccharinum, Conophytum minutum for C. minimum, Strombocactus for S. corregidorae, the "genera" leads of Peperomia and Mammillaria); S-A4 and A7 (Fenestraria, Bowiea, Harpephyllum asked by its sitelink "Harpephyllum afrum", Venus flytrap); rule 2 (Wikidata, and GBIF for Kew, refusing); S-A6 (records rewritten for Welwitschia and Ariocarpus, Strombocactus disciformis dropped and reported); S-A5 (four fills in a row; build against fill over seven species); six of the 88 kept by a named proof (Date palm, Loquat, Anemonoides, Chrysalidocarpus, Serissa, Coconut); a build test through `buildDossier` on the Welwitschia fixture; a made "Plum" naming two species; three guards (an older name below species, a basionym below species, a genus of one species that is neither parent nor holder).

  On the base 22 cases fail. The three guards pass on both. Sample failure lines: `expected { status: 'ok', …(2) } to deeply equal { status: 'none', …(1) }` (Persea); `expected [ false, true, false, true ] to deeply equal [ false, false, false, false ]` (the flip); `expected [ 'Examplea rara', true, false ] to deeply equal [ 'Examplea rara', true, true ]` (build against fill).

  The build test fails until B's need is applied, because without the item the build proves Welwitschia by Kew's one species and not by the parent: `Received: "…, the genus Welwitschia (Q15044266), whose one accepted species in Kew's WCVP is this species"`. I checked that it passes with the need applied.
- `tests/unit/r69-summary-leads.test.ts`, rewritten to the new rule with real Wikidata facts from 2026-10-12. Kept as guards: Kopsia, Crassula, Weingartia canigueralii, Mammillaria standleyi, and no lead. Added: Strombocactus as a type-species page, Jeffersonia (see departures), and a pure-rule guard that a family is not a genus.
- `tests/unit/r70a-summary-world.ts`: serves Wikipedia, Wikidata and GBIF answers in their real shapes.
- `tests/unit/r69m-corpus.test.ts` has two assertions changed, because they pinned the old request shape and the old offline drop. Its fake now answers Wikipedia's redirects, and offline it expects `dropped: 0, unchecked: 2`.
- **Mutations.** Thirteen, one at a time, to `summary-proof.ts`, all killed: the infraspecific skip, the product's "no other taxon" filter, the basionym's species rank, the P171 parent, count `>= 1` for `=== 1`, exact epithet for `spellingKey`, an added near-name match, the genus equality, the P225 proof, the sitelink proof, the genus rank, the name read for Kew's one species, and the sitelink check in `titleItems`.
- Full unit suite on my final commit: 2,733 pass, 1 skipped, 1 failing, the build test above, which waits on B's need. `tsc --noEmit` shows nothing in `src`, `scripts` or `tests`.

## Needs

**B, `src/lib/dossier/build.ts` line 419.** The proofs need the species' Wikidata item. The build must also read the older names as stored, as the fill reads them (S-A5):

```diff
-  const w = skip('wikipedia') ? ({ status: 'skipped' } as const) : await wm.summary(f, enTitle, [enTitle, ...titles], { name: scientific, synonyms: titles.slice(1) });
+  // The proofs read the species' Wikidata item and its older names as stored, as `--fill summaries` reads them (round seventy, A1; S-A5).
+  const w = skip('wikipedia') ? ({ status: 'skipped' } as const) : await wm.summary(f, enTitle, [enTitle, ...titles], { name: scientific, synonyms: syn.status === 'ok' ? syn.data : [], item: ids.wikidata });
```

With this applied, the ten test files that call `buildDossier` pass (115 tests).

**B, `scripts/build-dossiers.ts`, `fillSummaries()` (lines 584 to 588).** Replace the two `console.log` lines and the comment with:

```ts
  console.log(`  ${c.kept + c.confirmed} summaries are this species' article (${c.kept} by name, with no redirect; ${c.confirmed} proved under another title: ${Object.entries(c.proofs).map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}); ${c.dropped} dropped${c.unchecked ? `; ${c.unchecked} not checked, Wikipedia, Wikidata or GBIF not answering (run again)` : ''}${c.lines.length ? `:\n${c.lines.map((l) => `    ${l}`).join('\n')}` : '.'}`);
  // Round seventy (A1): the lead proves nothing; each record names its proof, and each record changed is listed.
  if (c.changed) console.log(`  ${c.changed} records now name another proof:\n${c.changedLines.map((l) => `    ${l}`).join('\n')}`);
  if (c.restored) console.log(`  ${c.restored} set aside earlier taken back on a proof:\n${c.restoredLines.map((l) => `    ${l}`).join('\n')}`);
```

Once this is in, the merge can delete `byLead` from `SummaryCounts` in `summary-fill.ts`. Also change the usage line at line 56 to: `--fill summaries  # every stored summary under another title proved again, or dropped; those set aside asked again`.

**C, `src/lib/dossier/epithet.ts` (a finding, not needed for my tests).** `spellingKey` reads "stolonifer" as `stolonif` but "stolonifera" and "stoloniferum" as `stolonife`. That is because `-ra` and `-rum` are stripped before `-er`, so the adjectives in -fer, -ger and -er that keep their "e" (asper/aspera, stolonifer/stolonifera) do not meet. Adding `era|erum|erus` ahead of `ra|rum` in `GENDER` fixes it: niger, nigra and nigrum still give `nig`, and stolonifer, stolonifera, stoloniferum and stoloniferus all give `stolonif`. It is C's to decide.

**P, `/about/how` (`src/routes/about/how/+page.svelte`, line 36).** Three sentences are now untrue: "An article Wikipedia reaches through a redirect is quoted when … ("Apple").", "Another species of the species' own genus is never quoted, and neither is a genus whose opening does not name the species." and "A summary quoted from under another title says so in the page's record of its sources; one not quoted is recorded as Wikipedia redirecting the one title to the other." Replace all three with:

> An article Wikipedia reaches through a redirect is quoted only when its title is shown to be this species' article: the title, or the taxon named by the title's Wikidata item, is the species' name or one of its older names, spelt another way at most (a gender ending, a hyphen, "ae" for "e", "ii" for "i"); the title is the English article of the species' Wikidata item; the title's item has the same type as the species' item by Wikidata's basionym statements ("Huernia zebrina" for Ceropegia zebrina); the title's item is a product of this species and of no other plant ("Apple"); or the title is a genus in which Kew's World Checklist of Vascular Plants, as Kew publishes it through GBIF, holds one accepted species, and that species is this one by Wikidata's parent taxon or by name ("Welwitschia"). What the article's opening says is never taken as proof. A summary quoted from under another title names its proof in the page's record of its sources; one not quoted is recorded as Wikipedia redirecting the one title to the other, and one whose proof could not be read because Wikidata or GBIF did not answer is recorded as not checked.

No sentence of `/about/formats` changes.

## The corpus step

Run `npx tsx scripts/build-dossiers.ts --fill summaries`, online, as step 3 of section 6. It needs no reordering: the P225 proof keeps the summaries whose stored Wikidata item is a stray, so it does not wait for B's item re-read.

**What it reads and writes.** It reads every stored dossier. It writes only the dossiers whose summary or record changes, then the index.

**What it asks.** Wikidata once per fifty species whose title the name does not settle; then, for each title still unsettled, one Wikipedia summary, one Wikidata request, and two GBIF requests for a genus. The 108 took 145 requests.

**What it should report on the 108** (see Measured): 77 proved, their 77 records changed from "whose lead is this species'" to a named proof; 11 dropped, each listed; 4 taken back. Other summaries under another title are read too; those that are the item's sitelink stay as they are.

**How it fails safe.** If a source refuses, that summary is left exactly as it was and counted as "not checked (run again)". `--offline` asks nothing and drops nothing.

## Measured

I ran the real `checkSummaries` over the 108 dossiers as the owner's run left them (88 restored with "whose lead is this species'", 20 set aside), each with its stored item and synonyms, against real Wikidata and Kew answers at about one request a second per host. Wikidata's action API answered 429 to the shared address, so its entities came from `Special:EntityData` and `Special:ItemByTitle` (the same data); Wikipedia's REST API answered 429 for most titles, so the redirect target the owner's run recorded stood in (the rule reads only the title).

**Of the 88 restored, 77 keep a proof:**

- 53 as genera of one species at Kew that Wikidata names as parent. Examples: Welwitschia, Wollemia, Cephalotus, Blossfeldia, Obregonia, Geohintonia, Yavia, Zamioculcas, Arundina.
- 1 as a genus whose one species at Kew is an older name: Serissa.
- 8 through the title item's taxon name: Onion, Borage, Pomelo, Date palm and Pomegranate under the name itself; Aristaloe, Loquat and Hedlundia intermedia under an older name. The five crops have stray stored items. Allium cepa's stored item, for example, is an onion variety in Catalonia.
- 12 by a basionym in common: Huernia zebrina and H. guttata, Anemonoides nemorosa, Anacis verticillata, Melaleuca viminalis, Chrysalidocarpus decaryi, Echinopsis tarijensis, Matucana borchersii, Oreomecon nudicaulis, Piper excelsum, Scabiosa atropurpurea, Chayote.
- 2 as products: Apple, Coconut.
- 1 as another spelling: Ariocarpus scaphirostris.

**11 lose their summary:**

- Crossostephium chinense and Reicheocactus famatimensis: no item, and Kew holds neither genus as accepted.
- Matteuccia struthiopteris: Kew does not hold one species in Matteuccia.
- Sprekelia formosissima ("Zephyranthes formosissima" is Wikidata's genus item): Kew sinks Sprekelia.
- Echeveria kimnachii ("Reidmorania"): the genus is not accepted at Kew.
- Lathyrus oleraceus ("Pea", taxon Pisum sativum): this name is not among the stored synonyms.
- Oroya peruviana and Ceropegia hystrix: no shared basionym in Wikidata.
- Strombocactus disciformis: Kew holds two species.
- Rosa luciae ("Rosa lucieae"): one letter apart, which is not `spellingKey`.
- Echinocereus stoloniferus ("Echinocereus stolonifer"): lost only on the owner's recorded redirect. The reviewer found that Wikipedia now answers under the asked title, so the live fill keeps it with no redirect.

**Of the 20 set aside, 4 come back:** Fenestraria, Bowiea, Harpephyllum (asked by its sitelink "Harpephyllum afrum") and Jeffersonia. The other 16 stay out: Agave vivipara, Pittosporum pentandrum, Tagetes lunulata, Baccharis latifolia, Callistemon lanceolatus, Drosera felix, Schinus areira, Nepenthes pectinata, Acer serrulatum, Weingartia pulchra, Kopsia fruticosa, Pinguicula macrophylla, Sedum burrito, Mammillaria sonorensis, Crassula deltoidea and Ranunculus ficaria.

That makes 77 kept, 11 dropped and 4 restored, with 0 not checked.

## Not done, and the decisions I departed from

- **Jeffersonia is no longer a guard.** The triage's own rule takes it. Kew's WCVP (and GBIF's backbone) holds one accepted species in Jeffersonia on 2026-10-12, because Kew puts J. dubia in Plagiorhegma. Its Wikipedia article speaks of two species. The lead asked me to keep it as a guard; doing so would need a rule that reads the lead or Wikipedia's taxonomy, and the triage forbids reading the lead. The test now pins both directions: taken while Kew holds one species, out if Kew holds two. I found no structured rule that keeps Jeffersonia out and keeps Fenestraria, Bowiea and Harpephyllum; if the owner wants it out, that is a new decision.
- **Three readings beyond the triage's four proofs, all from structured identity:**
  - the title item's taxon name (P225), which I read as "the title is this species' name or older name";
  - same type by Wikidata's basionym statements;
  - a genus whose one species at Kew is this species, with no P171 required.

  Together they keep 21 of the 88 (32 would be lost instead of 11), among them Date palm, Pomegranate, Onion, Loquat, the Huernias, Anemonoides and Serissa. Each has a test, a guard and a killed mutation, and P's sentence states all of them.
- **Kew's count is read through GBIF**, not from Kew's API or the bulk files. I give the reasons under Done.
- **An older name that another species of the reference also holds** still proves under proof 1, as the triage's rule does. F1's "a name two or more species hold" test needs the index, which `summary()` does not have.
- **I did not run the browser tests.** My change touches no page.

## Second pass (R47; REVIEW-TRIAGE-69 section 7, A2)

**A2 (R47-4), done.** Drosera montana's item Q5308558 has the English sitelink "Drosera tomentosa", but its taxon name (P225) is Drosera montana. That left two holes. The sitelink proof took the title unread, and if the item had been closed, its P225 would have proved the title by name. The new `foreignBinomial(title, who)` in `summary-proof.ts` marks a title as another species' name when it is a binomial in this species' genus, or in the genus of one of its older names, and is not its name or an older name. Such a title gets no `item` proof and no P225 proof. Only a shared type, read from Wikidata's basionym statements, can prove it.

- **In the build.** `summary()` now runs the rule even when Wikipedia does not redirect, if the title asked is a foreign binomial. That covers the item's sitelink and a title carried from the last build while Wikidata lags. With no proof the record reads "Wikipedia's article Drosera tomentosa is under a name that is neither this species' nor one of its older names", and the status is `none`.
- **In the fill.** The sitelink shortcut no longer takes a foreign binomial, so the stored Drosera tomentosa summary is asked again and dropped. A summary set aside in this way is asked again on later runs.
- **What it does not catch.** It reads the genus because a two-word common name ("Venus flytrap", "Date palm") has the same shape as a binomial. A binomial in a genus this species was never placed in is still not recognised as a name. No such case is known.
- **Measured.** Re-running the 108 gives the same results as before, all 108 unchanged: 77 kept, 11 dropped, 4 back.

**R47-7 cases. Each is `none` under the rule, and each is tested with Wikidata's items of 2026-10-12.**

- **Orbea ciliata for Ceropegia ciliata (Wight).** It is not an older name, and Orbea ciliata's basionym (Q38446813) is not shared.
- **Mezcal and Sotol.** Their items state no P1582, so neither counts as a product of any species.
- **Teak for another Tectona.** Its item's taxon name is Tectona grandis. Teak stays Tectona grandis' own article, as its sitelink.
- **"List of Drosera species".** The item is a list, with no taxon name.
- **A genus page "including Ceropegia linearis".** Kew holds far more than one species in Ceropegia.

**R47-8.** Callistemon lanceolatus → Melaleuca citrina and Ranunculus ficaria → Ficaria verna stay out. In each pair:

- the title is not among the stored older names;
- the title item's taxon name is not one of them either;
- Wikidata states no shared type: Melaleuca citrina's basionym is Q50844320, and the other three items state none.

That is the rule's answer: same plant, but no proof. B7's replacement-name rule, as decided, covers iNaturalist and Commons, not summaries. Extending it to summaries would bring Ficaria verna back if GBIF lists it under Ranunculus ficaria, which it does not today.

**R47-19's §13 reverts.** None of the code they name still exists: the same-genus refusal, the two-word branch, the group wording, `byLead` and the lead-reading in `checkSummaries` are all gone. I tested the behaviour each revert describes anyway:

- a lead saying "Weingartia pulchra is now included here";
- Melaleuca citrina with a lead that does not name the species;
- "a common name for several species";
- a stored summary with no item whose lead names the species, now dropped.

The build passing `who` is the Welwitschia build test, which still waits on B's need.

**Tests.** `r70a-summary-proof.test.ts` now has 36 cases, 11 of them new. On the base 30 fail and 6 pass; the 6 are the guards. Base failure lines:

- Drosera montana, build: `expected { status: 'ok', …} to deeply equal { status: 'none', … }`;
- Drosera montana, fill: `expected { …(5) } to be undefined`.

Four new mutations are killed: `foreignBinomial` always false, `foreignBinomial` true for any binomial, the P225 skip removed, and the sitelink proof's foreign check removed. Re-running the earlier mutations kills all of them. The related unit files give 88 pass and 1 fail; the failure is the build test that waits on B's need. `tsc` shows nothing in `src`, `scripts` or `tests`.

**For P.** One more clause for the `/about/how` sentence, after "the title is the English article of the species' Wikidata item": "(but not when that title is another species' name: a binomial in the species' genus, or the genus of one of its older names, that is neither its name nor an older name)". Also, a not-proven sitelink is recorded as "Wikipedia's article X is under a name that is neither this species' nor one of its older names".
