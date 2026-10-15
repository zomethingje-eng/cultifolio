# Round seventy-one, agent A: summaries and spelling

Branch `r71` in `(scratch)`, commit `6e9a558` on `r71base`. Files changed: `summary-proof.ts`, `summary-fill.ts`, `sources/wikipedia.ts`, `epithet.ts`, and A's own tests and test world. New tests: `tests/unit/r71a-summaries.test.ts` (38 cases), `tests/unit/r71a-spelling.test.ts` (6).

Checks:
- Full unit suite: 3,393 passed, 8 skipped. The base had 3,349; the new tests and cases add the rest.
- `tsc --noEmit -p .`: clean.
- No Svelte file changed.

On `r71base`, 22 of the 44 new cases fail and the rest are marked guards. Each failure is noted against its test ("base: …").

## Done

**A1 and S-F2: the live corpus and Drosera montana.**
- The fill now drops Drosera montana's "Drosera tomentosa" and Coryphantha macromeris's "Pelecyphora macromeris".
- It rewrites every record that still cites "whose lead is this species'".
- Run over my 228 asked dossiers today, with live sources and `again`: 0 not checked, 3 dropped (Coryphantha macromeris, Drosera montana, Echeveria kimnachii), Rosa luciae restored, 159 records rewritten.

**A2: the basionym proof needs another item.**
- `proofByItem` requires `ti.id !== sp.id`. The species' own item is the item proof, refused when the sitelink is another species' name.
- A stored record reading "the basionym of Qx and Qx" no longer counts as a proof, so the fill reads it again.
- Base failure: Coryphantha macromeris took Pelecyphora macromeris as "older-name".

**A3: another species needs GBIF and Kew.** A binomial is another species only when GBIF holds it so and Kew's WCVP holds a row of it, other than as a synonym of this species. Kew's rows of the title are asked only for a binomial GBIF refuses.
- Kept as the item's article: Echinocereus ferreiranus, Nepenthes burbidgei, Stenocactus ochoterenanus, Tetragonia tetragonoides and Ariocarpus agavioides.
- Still refused: Drosera tomentosa, which Kew accepts.
- Base failure: Echinocereus ferreiranus "none".

**A4: why the fill left about 232 not checked.**
- Read-only Wikidata calls no longer send `maxlag`.
- The retry waits are 10, 30 and 70 minutes, so the last round falls past the hour in which the fetch layer cools a throttled host again.
- Each not-checked species is listed with its source (`uncheckedLines`).
- A record that names a proof in this rule's words, and a title set aside ("none"), are settled and not asked again. `opts.again` asks everything, as a rule change needs.
- A plain second run over the same 228 asked nothing (228 settled).
- Base failures: `maxlag=5` sent; no unchecked list; settled records asked again; 20 minutes of waits.

**A5: a summary whose proof was not read.**
- `summary()` (`wikipedia.ts`) now requires a proof for any title other than the name or an older name. This covers a sitelink, a common name, and a title carried while Wikidata lagged, and the record names the proof.
- When the fill cannot read a proof after every round, a summary whose record names none is taken off the page. It is recorded as refused or error, "…; whether it is this species' article was not checked: <source> …", and the next run asks it again.
- A summary whose record names a proof stays.
- Base failures: a carried "Strombocactus" was taken with no record; Drosera montana's summary stayed.
- The build's half is B's (need 3).

**A6: the product proof.** The product's item must name this species (P1582); the genus is passed over only beside it, so "Apple" still stands. A product naming no plant, or only the genus (Wikidata's Mezcal, Pulque, Nopal), proves nothing. Base failure: "product".

**A7: the monotypic-genus proof.** The item's parent proves a genus only when Kew's one species in it is this species by name. Base failure: the Jeffersonia dubia case.

**A8: Rosa luciae, by an IPNI rule.**
- The rule: the title's Wikidata item proves the title when it carries this species' IPNI identifier, or an identifier whose IPNI record is these words by an author `plainlyAnother` does not reject. This is B's reading for an item's IPNI, applied to a title. A record of the same words by another author is a homonym's and proves nothing.
- IPNI is asked last, only for identifiers other than the species' own, at most two, and only when nothing else proved the title. IPNI not answering is "not checked: IPNI …".
- **Rosa luciae:** "Rosa lucieae" is Q17246292, carrying 60464116-2, IPNI's record of Rosa luciae Franch. & Rochebr. ex Crép. Restored live.
- **Ariocarpus scaphirostrus:** "Ariocarpus scaphirostris" is Q135017, carrying 19065-2, IPNI's record of Ariocarpus scaphirostrus Boed. Proved live, which finding 9's key change would otherwise have lost.
- New proof name: `ipni`.

**A9: `spellingKey` (`epithet.ts`).** The decision, by rule:
- Gender is read within one declension. -us, -a, -um and the Greek -os, -on are one adjective; -is, -e another. Across the two, the key gives two names, as Kew's Euphorbia peplus and E. peplis are two species. A source proves a cross-declension pair where the key no longer does (scaphirostrus, above).
- An -er adjective is read with its r: niger, nigra, nigrum; stolonifer and stoloniferus; afer and afra.
- A genitive in -ae is its own ending, never a gender.
- "oe" is "e" only before a consonant and not in -oensis.

Against Kew's accepted species in 534 genera, it now joins two pairs, down from fifteen:
- Anthurium lanceum and lancea: a noun in apposition and an adjective in one declension, which no spelling rule can tell apart;
- Kew's own Epidendrum itacolomiense and itacolomiensis, one name.

Among the reference's names and their older names:
- no two accepted species share a key;
- three older names still key onto another species' accepted name, each the same word: Cistus creticus's "Cistus ladanifera"/"ladaniferus" as Cistus ladanifer, Echinocereus nicholii's "llanuraensis" as llanurensis, Geissorhiza eurystigma's "monantha" as monanthos;
- Schinus aroeira and S. areira are no longer joined.

The key now also joins, rightly:
- multiflora with multiflorus, and obscura with obscurus (round seventy split every stem ending in r);
- afer with afra.

Six pairs of a species and its own listed older name lose their join: sandersonii/sandersoniae, lathyris/lathyrus, chiloensis/chilensis, murielae/muriele, parahyba/parahybrum and quitoense/quitense. Each older name is still matched exactly.

No B or C test changed result. Base failures: peplus/peplis, chrysantherum, formosae, aroeira, and the -er cases.

**A10: `/about/how`.** The new sentences are needs for F, below.

**A11: mutants.** I re-ran 23 of round seventy's survivors and 11 new mutants with the new tests. 30 are killed. Four survive, each equivalent: P12 and P18 are now implied by another guard; P29 cannot occur in GBIF's rows; N8 is covered by the declension split, and its own case is the `theresae` test. Log: `(scratch)`.

## Needs

**For B, `scripts/build-dossiers.ts`, `fillSummaries`:**
- pass `--again`: `checkSummaries(diskStore(), f, undefined, { again: args.includes('--again') })`;
- print `c.settled` ("N settled, not asked again");
- print each of `c.uncheckedLines`;
- print `c.withdrawn` ("N taken off until read").

Without this, the corpus step cannot ask again and prints no names.

**For B, `build.ts` line 444:** the Who passed to `wm.summary` should also carry `ipni: ids.ipni, authorship: u(s.authorship)`. Otherwise the build cannot take Rosa luciae's article and the fill can, which breaks S-A5.

**For B, `build-dossiers.ts` `carry('wikipedia')`:** carry a previous summary only when its title is the name or an older name, or its record names a proof:

```ts
carry('wikipedia', () => {
  const t = prev.summary?.title;
  if (t && !proofByName(t, { name: prev.name.scientific, synonyms: prev.name.synonyms ?? [] }) && !recordedProof(prev.upstream?.wikipedia)) return false;
  d.summary = prev.summary;
  return true;
});
```

`proofByName` is exported from `summary-proof.ts`, `recordedProof` from `summary-fill.ts`. Reason: S-A5 and the triage's "the carried one goes with it". `keepPrevIds` needs no change, because `summary()` now proves a carried title.

Cost to note: `summary()` now asks Wikidata for the species' item for a common-name title. That is one request for about 4% of species in a full build, unless B passes `pre: { species }`.

**For F, `/about/how`:**
- Replace "An article Wikipedia reaches through a redirect is quoted only when … is recorded as not checked." with:

  > A summary under any title but the species' name, whether Wikipedia reached it through a redirect or it is the title of the species' Wikidata item, is quoted only when that title is shown to be this species' article: the title, or the taxon named by the title's Wikidata item, is the species' name or one of its older names at species rank, spelt another way at most (a gender ending within one declension, -us, -a, -um or -is, -e; an adjective in -er in any gender; a hyphen; "ae" for "e" within a word and "oe" for "e" before a consonant; "ii" for "i"; "ai" for a genitive "ae" after a consonant; "afr-" for "caffr-"; a genitive in -ae is never read as a gender); the title is the English article of the species' Wikidata item (but not when that title is a binomial, neither its name nor an older name, that GBIF holds as another species or under a variety or subspecies of this one and that Kew's World Checklist holds too); another item has the same type as the species' item by Wikidata's basionym statements ("Huernia zebrina" for Ceropegia zebrina); GBIF holds the title as a synonym of this species; Kew's World Checklist holds the species' name under the title, both combinations of one basionym ("Zephyranthes formosissima" for Sprekelia formosissima); the title's item carries the species' IPNI identifier, or one whose record at IPNI is the species' name by its author ("Rosa lucieae" for Rosa luciae); the title's item names this species as the plant it is a product of, and no other plant but its genus ("Apple"); or the title is a genus in which Kew's World Checklist of Vascular Plants, as Kew publishes it through GBIF, holds one accepted species, and that species is this one by name ("Welwitschia"). What the article's opening says is never taken as proof. A summary quoted from under another title names its proof in the page's record of its sources; one not quoted is recorded as Wikipedia redirecting the one title to the other; one whose proof could not be read because Wikidata, GBIF, Kew or IPNI did not answer is recorded as not checked, and is not shown until it is read.

- In the Commons sentence, replace "(gender endings, an adjective in -er that keeps its e ("stolonifer", "stolonifera"), hyphens and spaces, "ae" or "oe" for "e", "ii" for "i", "ai" for "ae" after a consonant, and "afr-" for the "caffr-" the Code replaced in 2024)" with:

  > (a gender ending within one declension, -us, -a, -um or -is, -e, so "Euphorbia peplis" is not Euphorbia peplus; an adjective in -er in any gender ("stolonifer", "stolonifera"); hyphens and spaces; "ae" for "e" within a word and "oe" for "e" before a consonant; "ii" for "i"; "ai" for a genitive "ae" after a consonant; and "afr-" for the "caffr-" the Code replaced in 2024)

- Replace "(the build asks IPNI itself, www.ipni.org, for the record of an identifier Kew does not hold, at most once a second)" with:

  > (the build asks IPNI itself, www.ipni.org, for the record of an identifier Kew does not hold, and of the identifiers a Wikipedia title's Wikidata item carries, at most once a second)

## The corpus step

1. **After deploy and B's needs:** `npm run dossier -- --fill summaries --again`.
   - It reads every dossier's summary and its `upstream.wikipedia` record.
   - It asks about 370 species (my estimate from 1,579 random dossiers): every summary under another title and every title set aside.
   - It asks Wikidata (items, fifty a request, no `maxlag`), Wikipedia's REST summary, GBIF's match, Kew's WCVP through GBIF, and IPNI (rarely).
   - It writes summaries and records.
   - It should report: Drosera montana, Coryphantha macromeris and Echeveria kimnachii dropped (and few others); Rosa luciae restored; Ariocarpus scaphirostrus proved by IPNI; some 250 records rewritten (most common-name records gain "the English article of this species' Wikidata item"); 0 not checked.
   - **Fail-safe:** what is not answered is asked again after 10, 30 and 70 minutes, then named with its source. A summary with no recorded proof is taken off and recorded as not checked, never left on the page unproved.
2. **Then `npm run dossier -- --fill summaries`** (no `--again`). It should ask only what step 1 left not checked and report the rest as settled. Run it again until it names none.
3. **`--index`, then upload.**

## Measured

- **Deployed fill, today, on the 228 asked dossiers of my 1,799:** 5 dropped, of which 3 were wrong drops: Echinocereus ferreiranus, Nepenthes burbidgei, Stenocactus ochoterenanus. It kept Coryphantha macromeris on its own item as basionym.
- **This fill with `again`:** 3 dropped, all right; Rosa luciae restored; 0 not checked.
- **This fill a second time:** 0 requests, 228 settled.

## Not done or departed from

- The Kew spelling survey covers 534 genera (A to about E). The rest were not read.
- "Settled" is read from the record's words, because the record schema (C's) keeps no rule version. So a rule change needs `--again`, and the corpus step says so.
- Echeveria kimnachii ("Reidmorania") and Crossostephium chinense stay out by rule: Kew sinks both genera. Reicheocactus famatimensis stays out: Kew's species is famatinensis, a one-letter slip, and the triage's slip decision (S-B7) forbids reading it. Its dossier also has no IPNI identifier.
