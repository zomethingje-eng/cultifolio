# Round seventy-one, agent F: pages, search and the account (first pass)

Branch `r71` in `(scratch)`, on `r71base` (`cb05efd`). Three commits, `7f8f0d5` to `e9bc122`. I dropped my review's trial fix to `authors.ts`/`bulk.ts`, which is B's (S-F1). S-F2 is A's and S-F13 is B's and C's. Every file I changed is mine under the triage's table.

## Done

**S-F3. An older name that is another species' accepted name here.** `server/dossiers.ts`: `indexMaps` gains `byName` (each accepted name in lower case). `routes/species/[slug]/+page.server.ts` now does three things:
- It returns `namedElsewhere`: each name in the record's synonyms that another species of the reference is accepted under, with the record's authors (`authorsOf`).
- It returns `wasAcceptedBy`: the species accepted under a `?was=` name.
- It no longer counts those species among `wasShared`.

`+page.svelte` drops such names from "Also known as" and says them apart: "Annona muricata Vell. is an older name of this species, not Annona muricata, a species of the reference" (linked). With `?was=Annona%20muricata` the page now says "Annona muricata is the name of another species of the reference, Annona muricata; this species' GBIF record holds it only as an older name (Annona muricata Vell.), so it is not this species' name". On the base it said "the GBIF backbone accepts this species as Annona montana". Tests are in `r71f-names` (3 cases). On the base, `wasAcceptedBy` and `namedElsewhere` are undefined.

**S-F4. A range every record lies outside.** A new `noneInRange(outside)` in `ui/ref/head.ts`. The page's evidence line now reads: "No georeferenced record lies inside the stated native range, and all 1749 georeferenced records read lie outside it: the range and the records disagree. They are not used, and no map marker or climate is derived from them." The "Wild records" fact reads "none in range · 1749 outside it". With no records at all, the line is unchanged. Tests are in `r71f-page-words`; on the base, `noneInRange` is not a function.

**S-F5. The false "iNaturalist not asked" banner.** In `photoSourceGaps` (`ui/ref/photos.ts`), iNaturalist's taxon row no longer counts as a gap when its photograph rows answered (`ok` or `none`). Test: Pseudobombax calcicola's live record. On the base this failed with "iNaturalist was skipped (not asked)". The guard shows that photograph rows not asked are still said. The record row itself is B's file (see Needs).

**S-F6. Tile licences.** In `tileCreditOf` (`ui/ref/head.ts`), an iNaturalist CC0 line "no rights reserved" gives "CC0". On the base it gave null, so the tile said "Photo: iNaturalist". The 807 index entries take this at the next `--index`.

**S-F7. The group under the name.** The header line now ends "· listed by its genus as a cactus or succulent", linked to `#s-cultivation` (`groupLine` in `head.ts`; it uses the tier: by name, by its genus, by its family). It is now true of `/about/how`'s existing sentence "The page names the group as the table's listing … not as a claim about the plant". Tests: unit `r71f-page-words`, and browser `r71f-species-words.spec.ts` (Chromium). On the base the browser test failed: "element(s) not found" for `#group-chip`.

**S-F8. A redirect through a variety says why.** A new `cachedMatch(platform, name)` in `server/synonyms.ts` reads GBIF's match answer from the Worker's cache only. That is the answer the redirect stored a moment before. It never asks GBIF and never trusts the link. When the answer is an exact synonym whose `speciesKey` is this species and whose accepted usage is not, the page says: "Echinopsis pachanoi is, in the GBIF backbone, a synonym of a subspecies or variety of Trichocereus macrogonus; the reference files species, so it is shown here." Tests: `r71f-names`. The case fails on the base (`was` was null). The guards show that a link written by hand, or a cached answer for another species, says nothing.

**S-F9. About-page sentences no other agent touches**, fixed now:
- /how, iNaturalist under older names: "From iNaturalist, asked under these older names, a taxon is taken only when…". This scopes it, so it no longer reads against the follow rule.
- /how: "A taxon GBIF holds as another species of this reference is never taken, however it was found (…), nor one Kew holds so, except a taxon iNaturalist's own name search files the species under, for which Kew is not asked; and…". The old sentence said Kew too, without exception, but `judgeTaxon`'s lenient path never asks Kew. B's r71 leaves that path as it was, which I checked in B's branch.
- /how, the lag: "When Wikidata does not answer (while it lags it is asked again: the first species of a run to find it lagging waits the lag out, and one after a species that stayed lagged does not), …". This is what `lagSpell` does, and B left it unchanged. B's need 8 rewrites this sentence's last clause; the second pass composes the two.
- /how, the species address: it adds the same-author case (S-F11), the redirect through a variety (S-F8) and the older name that is another species' name (S-F3).
- /how, the records paragraph: "the page counts those it discards, and where every record lies outside the range it says the range and the records disagree".
- /formats, search order: it adds the exact older name before a genus reached by its start (S-F12).

The other sentences of my S-F9 list are touched by A, B or C, and wait for the second pass:
- Kew's family (B's need 1).
- The summary record (A).
- The slip wording (B's need 7, C).

**S-F10. The seam method drives the sentences of 70b and 70c.** `tests/unit/r71f-about-70bc.test.ts` has 20 cases over all fourteen sentences that 70b and 70c wrote. Each finds its sentence, reads its example out of it with `claim`, and asks the code with the sources' recorded answers:
- the Kew author readings: the Hook.f., W.Heering, ı, (Engelm.) and "ex" pairs;
- Datura metel's two rows by one author;
- Ceropegia macrocarpa's other author;
- Ixora coccinea on Kew's own file rows;
- the download's uncovered species asked of GBIF;
- the Commons kinds: map, seeds and pod, "Media from GBIF" not read, the garden category, the two-species group;
- the iNaturalist copy;
- the spelling key: stolonifer, kanehirai, caffra;
- Sprekelia by Kew's basionym;
- Scilla siberica by alias and Kew's IPNI;
- Hibiscus acetosella "Welw. ex";
- Parrycactus flavovirens;
- Sprekelia, Echinocereus chisosensis, Pinguicula antarctica and Tricyrtis through `fillInatIds`;
- the lag rule.

The three mutations that survived round seventy's seam files are now killed: the slip clause in `inat.ts`, the alias match in `wikimedia.ts`, and the family rule. The family rule is killed once B's fix is merged; until then the Ixora case is `it.fails`. Also killed: the caffr and -ai rules (`epithet.ts`), Datura's accepted-entry choice (`bulk.ts`), the autonym rule (`inat.ts`) and the copy-number pattern (`photo-kind.ts`).

On the base, two cases fail, both on wording: the lag sentence, and the "nor one Kew holds so" clause. Every other case guards a rule the round kept. I checked the Ixora case with B's kind of fix applied: it then passes, so `it.fails` reports, as it should.

**S-F11. One author under two holders.** `sharedNameMessage` adds: "GBIF files Vernonia praealta (L.) Michx. under both Vernonia gigantea and Vernonia noveboracensis: one name, not two". Test `r71f-names`. The old two-author wording is unchanged (guard).

**S-F12. Search.** In `collect` (`core/search.ts`), when a query of two words or more is an older name that some species holds exactly, a name reached only by its genus's start goes after it. "Tecoma speciosa" now finds Campsis radicans first, then Tecomanthe speciosa. Guards: "Nepenthes mira" is still Nepenthes mirabilis first, because its genus was typed whole. "Stramonium datura" is still Datura stramonium, words in another order, as round seventy decided. "tecom spec" still finds Tecomanthe speciosa.

**B's need for F (S-B2), done now.** Under the name, the page shows the `gbif.species` record when it says the name "is cited as Kew accepts it" (`kewCitedNote`, test in `r71f-page-words`).

**Runs.** Unit, whole suite: 353 files passed, 1 skipped; 3,388 tests passed, 1 expected fail, 8 skipped. `tsc --noEmit -p .` and `svelte-check --threshold error`: no errors in source. Browser (Chromium, port 4406): `r71f-species-words` and `r70n-tiles` passed.

## Needs

1. **B, `corpus-fills.ts` `fillInatIds`.** Where a carried id is checked and kept (the two `if (carried && …) continue;`), write the row before continuing:
   `d.upstream['inat.taxon'] = { status: 'ok', at: now(), detail: \`iNaturalist's taxon ${id}${got.name ? \` (${got.name})\` : ''}, kept from an earlier build, checked ${day(now())}: active and this species' own\` }; store.write(file, d);`
   The reason: 25 of 32 live pages say "iNaturalist taxon: not asked" although the fill checked every id, while `/about/how` says every id is checked (S-F5, S-F9).
2. **The merge.** In `r71f-about-70bc.test.ts`, once B's `inFamily` change is in, turn the Ixora case's `it.fails` into `it`.
3. **F, second pass.** Apply A's, B's (1 to 9), C's, D's and E's sentences, then drive each against the merged code in the same file. C and E each report an `r70p-about-rules` test of mine that their change breaks; I take those then. B's need 8 and my lag sentence share one sentence.

## The corpus step

My changes are read where a dossier and the index are read, so nothing of mine needs a fill. Run `npm run dossier -- --index` after the deploy (it is in every agent's step already). `tileCreditOf` then writes "CC0" for the 807 thumbnails whose iNaturalist line is "no rights reserved". Expect the index's `credit` count to rise from 5,555 to about 6,362. The step reads the stored dossiers only and asks nothing; a failure leaves the old index in place. The rest takes effect at deploy:
- the "Under another author" line (169 pages);
- the evidence line (every page with no record in range and records outside);
- the banner;
- the group label;
- the 404's same-author sentence (about 5 in 30 shared names sampled).

## Measured

I ran the search harness over the live index (fetched once on 15 October) again with the new rule. All 8,947 accepted names still find themselves first. The 4,082 headlines answer exactly as before: 55 go first to another species with the same headline. Of the 36,435 older names held by one species, typed exactly, one more now finds its holder first (Tecoma speciosa), and none finds it first that did not before. Live, before: 169 pages listed another species' accepted name under "Also known as"; 807 index thumbnails had no credit; 8 of 32 sampled pages carried the false banner; 5 of 30 sampled shared-name 404s gave one author under two holders.

## Not done or departed from

- **Generic headlines in search** ("cactus" answers two Copiapoas whose headline is "Cactus"). Left as is. The headline rule says such a word is shown when no source gives a fuller name. A search demotion would also put "Fig" or a "Cherry" headline behind longer names. This is the owner's call on the headline rule itself.
- **"Echinopsis pachanoi" in search** still finds nothing. The index holds no variety's synonyms, and S-F8 makes the address say why instead.
- **The variety notice depends on the Worker's cache.** When the redirect and the page are served from different caches, the page says nothing, as on the base; it never says what it has not read.
- The about-page sentences other agents' changes touch wait for the second pass, as instructed.

## Second pass

Work is in ``, branch `r71`, on the merge `a48726b`. I checked each supplied sentence against the merged code before applying it. Every changed sentence is now found and driven in `tests/unit/r71f-about-71.test.ts` (28 cases) or in an existing seam file. That new file fails on the base pages, because its openings are absent there.

**Applied to `/about/how` as supplied:**
- B1, Kew's rows by the entry each is filed under, with Fragaria virginiana.
- B2, the range through a synonym's entry (Ceropegia mixta).
- B3, Kew's author on a homonym key. I made one word change: "the page's record says so" became "the page says so under the name", because F's `kewCitedNote` shows it there.
- B4, Kew's IPNI and POWO links.
- B5, the POWO proof, both clauses.
- B6, the genitive only (Parodia ritteriana).
- B8, 90 days from the build that first kept them.
- B9, human observations only.
- A1, the summary sentence: "A summary under any title but the species' name …", through "is not shown until it is read".
- A2, the spelling list in the Commons sentence.
- A3, IPNI asked for a title item's identifiers.
- C1, maps in any language.
- C2, the specimen record or description.
- C3, an animal named in the file's name.
- C4, "Vertical garden".
- C5, a copy known by its source.
- C6, the year with other print evidence, and a citation's year.
- C8, the lead sentence: media that is not an observation is not shown.
- C9, the derivative-work credit.
- E5, sixty-one minutes of counts.
- E6, all of Alaska, St Lawrence Island and the Pribilofs.
- E7, both keep-data parentheses.

**Applied to `/about/formats` as supplied:**
- C10, `specimen`, not shown.
- C11, `slips`, `inat`, `kind` and `sourceRead`.
- D2 (a) to (e), the import's dates and keys.
- D3, an unreadable change not sent.
- D4, the page that waits whatever another tab holds.
- E2, the listing settled by the server.
- E3, the writes over any sixty minutes, "61 minutes at most".

**Supplied sentences I corrected:**
- **B7 (the iNaturalist slip).** B's words described B's rule: a name GBIF accepts is taken when Kew holds no row of it and accepts this species. The merge made C's `slipStanding` the rule, and it refuses that case unless GBIF's record is this species' name by its own author. The sentence now reads: "a name Kew accepts as a species, or holds as a synonym of another, is never a slip, nor one GBIF holds otherwise than as this species, unless GBIF's record is this species' name by its own author spelt otherwise (GBIF's Othonna cakilifolia DC., which Kew spells cakilefolia: one name); and a name in another genus is never taken when Kew accepts both (Lupinus longifolius is not Acacia longifolia)."
- **C7 (the Commons slip).** "neither Kew nor GBIF accepts it as a species" became "neither Kew nor GBIF holds it as a species or as a name of another species". `slipStanding` also refuses a Kew synonym of another plant (C's own example, Ceropegia mariae) and a GBIF synonym of another species. The rest is C's, including "until then the file is not shown".
- **E4 (the kept 429).** "such a batch" became "such a log batch". The words review's test (`r62bw-words`) allows no bare "batch" in the sync section.

**My own sentences.** The first pass's six sentences carry over unchanged. The lag sentence now also has B8's tail.

**Tests changed to drive the merged rules:**
- `r70p-about-rules`:
  - The slip case now drives `Photo.slips`: not shown until asked, shown once asked, "Echinocereus schereri" refused, Ceropegia mariae by Kew, and Othonna's same-author and other-author cases.
  - The year case: a year alone is shown; with a book's word or a PD-old licence it is hidden; past 1899 it is shown; the "- 19 (1827)" citation is no year. These were the two red tests.
  - The POWO and IPNI clauses, the Apple wording, and the hour of uploads' opening, clause and "61 minutes at most" (driven against `Counters.take`'s `retryAfter`).
- `r70p-alerts` now reads the new place list, and asks the NWS rule of every place in it.
- `r71f-about-70bc` follows the new wording of the copy sentence and the "ai" clause.

**Runs (second pass):**
- Whole unit suite: 379 files passed, 1 skipped; 3,643 tests passed, 8 skipped, none failed.
- `svelte-check --threshold error`: 1,140 files, 0 errors. `tsc --noEmit -p .`: clean.
- Browser, Chromium, port 4406, under the lock: 45 passed. The specs were `r62bw-pages`, `r62w-pages`, `r69p-disclosure`, `r63v-visitor`, `r63u-fonts`, `r63fv-guard` and `r71f-species-words`.

**Not driven here, and why.** A few sentences have rules that need a database or a sync engine:
- D's key, backup and clock sentences;
- E's listing, kept 429 and keep-data sentences.

For these, the new file reads the sentence's words. The rule itself is driven by the agent's own test: `r71d-import-bare`, `r71d-backup-unsent`, `r71d-clock`, `r71e-server`, `r71e-sync` and `r71e-keep-ask`. I did not repeat those harnesses.
