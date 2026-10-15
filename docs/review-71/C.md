# Round seventy-one, agent C: photographs

Branch `r71` in `(scratch)`, on `r71base` (`cb05efd`). Commits `bd39c11` and `458fe1b`.

- **Files changed:** `dossier/photo-kind.ts`, `photo-credit.ts`, `schema.ts`, `commons-fill.ts` and `sources/commons.ts`.
- **Tests updated to the new rules:** `r69k-commons-kind`, `r70c-photo-kind`, `r70c-second-pass` and `r70c-commons-kind-fill`. Each change is marked "round 71".
- **New tests:** `tests/unit/r71c-photographs.test.ts` (22 cases) and `r71c-mutants.test.ts` (30).
- **Checks:** `tsc --noEmit` is clean. No Svelte file changed, so neither `svelte-check` nor a browser run was needed.
- **Whole unit suite:** 3,398 passed and 3 failed. All three failures are in F's about-page tests, and each is listed under F's needs.

## Done

Each item below is a finding of `self-C.md`. "Base" means what `r71base` gives for the same test.

**S-C1. Maps in any language.** `MAP_WORDS` now includes Areale, areali, areaal, mapa, carte, kaart, karta, ареал, карта, verspreiding, rozšíření, rozmieszczenie, utbredning, distribuição and levinneisyys. Boswellia papyrifera's lead ("Areale …") is now left out. Tested in r71c, S-C1. Base: `expected true to be false`. Guard: "Carter road" is not a map.

**S-C2. A Commons herbarium sheet known by its source or description.**
- I read Commons for the live lead on 15 October. Its Credit is `collections.nmnh.si.edu/search/botany/…` and its description reads "Commiphora myrrha specimen from the Smithsonian National Museum of Natural History".
- `sourceKind(credit, description)` reads herbarium and museum hosts in the source, and "herbarium/pressed/type specimen" or "specimen … from the … museum" in the description.
- The build and `--fill commons-kind` store the result as `Photo.kind`, and the read obeys it.
- Base: `sourceKind is not a function`, and a new answer gave `'ok'` where it should give `'none'`. Guard: "a specimen in the Lyman Plant House" is not a sheet.

**S-C3. A comparison of two plants.** A capitalised word, then a Latin epithet, then a rank word and another epithet, is read as another plant's name, even in a genus the reference does not hold. This catches Zanthoxylum beecheyanum's lead, which names "Osteomeles anthyllidifolia var. subrotunda". Base: `expected true to be false`.

**S-C4. GBIF media that is not a photograph of the plant.**
- `shownPhotos` drops any GBIF photograph marked `specimen` or served from a herbarium's host. Before, these were only ranked last.
- The index count follows automatically, since it reads `shownPhotos`.
- The schema now defines `specimen` as "the record is not an observation of the living plant". B sets it (see Needs).
- Base: Adenia lobata's drawing and Talinella grevei's pollen micrographs were shown (`expected [2 items] to deeply equal []`), and a `specimen` photograph was shown (`['1:0','2:0']`).
- See Measured: the host rule is needed whatever B does with basisOfRecord.

**S-C5. A Commons copy of an iNaturalist photograph is shown once.**
- Commons' `Credit` names the iNaturalist photograph for every copy I read. All eight I asked for on 15 October did, including the numberless "Echinocereus adustus schwarzii 1.jpg", which is iNaturalist's 34674713.
- The build and the fill store that photograph's id as `Photo.inat` (`inatSource`), and `shownPhotos` drops the copy when the page holds the original.
- The file-name number rule now reads "(cropped)" and refuses a camera timestamp ("…20220416_120706").
- Base: `expected [4 items]` where the right answer is the two originals, and `expected null to be '23242119'`.

**S-C6. The group exemption needs a real name.**
- A group file is now exempt only if its title names this species as a binomial (`readings` gives "own"). Before, the epithet's first letters at the start of any word were enough.
- `epithetRank` now matches whole words: the epithet in another spelling, a word beginning with the whole epithet, or, for a stem of five letters or more, a word beginning with the stem and adding at most three letters. Words run together with the genus ("Nepenthesdubia1") still count.
- An epithet written with a capital ("Gibbaeum Dispar", "Mammillaria Matudae") is read as the species' own when it is, and as another species when the reference holds it in that genus ("Lithops Karasmontana").
- Base: "Vertical garden" on Aloe vera and "Milk bottle plants" on Euphorbia milii were shown.

**S-C7. Commons' diffused categories.** `categorySpecies` now strips these forms before matching: "Flowers of", "fruits of" and similar, a trailing "(…)", "- fruits", "in <Place>" and "in cultivation". Base: "Lithops in a pot.jpg" filed under "Lithops karasmontana in cultivation" was shown.

**S-C8. A year hides a file only with other print evidence (the triage's rule).**
- A year from 1500 to 1899 now hides a file only together with one of:
  - words of a book or plate in the title (tab, plate, fig, vol, Flora …);
  - a category of scans or old works;
  - a licence for old works ("PD-old", "PD-Art", …).
- A protologue citation's year after its page number ("- 19 (1827)") is never read as a year.
- Motohiro Sunouchi's living-bulb photographs are shown again. Base: `expected false to be true`.
- Dasylirion "Zuccarini 1843" is hidden only with print evidence. The old test now passes that evidence explicitly: the PD-old licence, a scan category, or "tab.".

**S-C9 with S-B7 and S-F13. The slip guard, one rule for Commons and iNaturalist.**
- `slipStanding(name, own, kewRows, gbifMatch)` is pure. It returns `{ own, why }`:
  - another plant when Kew accepts the name as a species, or holds it as a synonym of something other than this species;
  - this species' when Kew holds it as this species' synonym;
  - on a strict exact GBIF match: this species' when GBIF files it under this species' key, or when GBIF's record is this name by the species' own author spelt otherwise (GBIF's "Othonna cakilifolia DC." and "Echinocereus chisosensis W.T.Marshall" are accepted beside the right spellings); another species otherwise;
  - this species' slip when neither source holds the name.
- `askSlip(f, name, own)` makes two requests (GBIF's copy of WCVP, then GBIF's backbone with `strict=true`) and returns any refusal as it came.
- **The read cannot ask, so it stays safe.** `readBinomial` shows a slip only when the name is in `Photo.slips`, which the build (`commonsPhotos`) and the fill write after asking. An unasked slip is read as another plant. `slipsToAsk(id, names)` lists the names to ask about.
- Answers on 15 October: hurreliana, cakilifolia, chisosensis, mabudae, ehlersae and villetti are each the species'. Ceropegia mariae (Kew's synonym of Echidnopsis), Salvia aurea (Kew accepts it) and Conophytum auctum (Kew's synonym of C. bilobum) are refused.
- **Departure, flagged:** GBIF's same-author second spelling counts as one name, not another species. Without this, both of 70c's cases would be refused again.

**S-C10.** The code is unchanged. A title's animal words ("nymphs", "bees", "beetles") still hide a file even when the title names the species, because "Leaf-footed Bug nymphs … on Centaurea americana" is a photograph of the nymphs. The about sentence is wrong, so it is a need for F.

**S-C11. Derivative-work credits.** `commonsAuthor` turns "N._andamana2.jpg: Marcello Catalano / derivative work: Mgiganteus (talk)" into "Marcello Catalano; derivative work: Mgiganteus". A stored credit loses the file name ("Marcello Catalano"), and the fill reads the Artist field again and rewrites the credit with both authors. Base: `'N._andamana2.jpg : Marcello Catalano'`.

**S-C12. The fill counts by every rule the read uses.** Its before and after checks now pass the credit, the slips and the source kind. The stamp left out by its credit is no longer counted as new.

**S-C13. Mutation survivors.**
- The second run over the new code had 150 mutants. Every non-equivalent survivor is now killed by `r71c-mutants`: the group mapping (cs-*), bracketed genera, the held-name guards, the run-on and capitalisation guards, the struck description, the animal exemption by epithet, the year bounds, the copy digits and each step of `slipStanding` and `askSlip`.
- Left as equivalent, with the reason:

| Survivor | Why it is equivalent |
|---|---|
| `slip-gap2` | A length gap of 2 can never pass the insertion test |
| `slip-same` | Equal strings are caught earlier by `spellingKey` |
| `english-ing` | Such words end in g, so `LATIN_END` already refuses them |
| `stem-on`, `nameof-hyphen-genus` | No case in the reference |
| `older-heldself` | A name held by this species is its own either way |
| `rb-short`, `rd-adjacent`, `rd-x-break`, `rd-initial-run4`, `rd-initial-run-own` | Reach no different verdict |
| `held-acc-infra` | The reference holds no accepted infraspecific name |

- In `r71c-mutants`, 25 cases pass on the base (guards of round seventy's rules). Five fail there: the capital epithet, the cited year, the group exemption, `slipStanding` and `askSlip`.

## Needs

**B, `sources/inat.ts` (the shared slip rule):**
1. Add `authorship?: string` to `JudgeFor` and set it wherever `JudgeFor` is built.
2. At line 262, replace the body of `if (slipped) { … }` with:

```ts
if (slipped) {
  const near = s.reference.byEpithet(ep, s.family).filter((e) => e.key !== s.key);
  if (near.length) return ok(false, `${where}, and ${near.map((e) => e.name).join(', ')} here ${near.length === 1 ? 'has' : 'have'} its epithet`);
  const a = await askSlip(f, name, { scientific: s.scientific, authorship: s.authorship, key: s.key, synonyms: [...s.own.own] });
  if (a.status !== 'ok') return a;
  return ok(a.data.own, a.data.own ? `${where}: this species' epithet, spelt one letter otherwise (${a.data.why})` : `${a.data.why}: not taken`);
}
```

Import `askSlip` from `'../photo-kind'`. Signature: `askSlip(f: JsonFetcher, name: string, own: { scientific: string; authorship?: string | null; key?: number; synonyms?: readonly string[] | null }): Promise<FetchResult<{ own: boolean; why: string }>>`. Code that already holds Kew's rows and GBIF's exact match can call `slipStanding(name, own, kewRows, gbifMatch)` instead.

**B, `build.ts` line 559:** pass the author, so GBIF's same-author spelling can count:
`{ scientific, synonyms: …, key, held: o.held, authorship: u(s.authorship) }`.

**B, `gbif.ts`, `bulk.ts` and the basis-of-record fill:**
- Set `specimen: true` on any GBIF photograph whose record's basisOfRecord is not HUMAN_OBSERVATION or OBSERVATION. The read drops these.
- Note that 22 of the 100 GBIF-led tiles are Meise herbarium drawings recorded as HUMAN_OBSERVATION, so basisOfRecord alone does not catch them. The host rule in `dedupe.ts` does, and it stays.

**B, `scripts/build-dossiers.ts`, `fillCommonsKindStep`:** after the existing first `console.log`, add:

```ts
console.log(`  ${c.slipsAsked} slips asked of Kew and GBIF, ${c.slipsOwn} the species'${c.slipsUnchecked ? `, ${c.slipsUnchecked} not answered (run again)` : ''}; ${c.copies} Commons copies of iNaturalist photographs found by their source; ${c.credits} credits read again; ${c.shownAgain} photographs shown again.`);
```

**F, `/about/how`:**
- In "A Commons file is shown only as …":
  - "a map;" → "a map (in any language: "Areale", "mapa", "carte", "ареал");"
  - "a pressed, mounted or museum specimen (…)" → add "or one whose source is a herbarium's or museum's specimen record, or whose description calls it one"
  - "an animal, unless the name names the species (a flower with an insect on it is the plant)" → "an animal named in the file's name ("nymphs", "bees"), or a file Commons files under an animal unless its name names the species (a flower with an insect on it is the plant)"
  - "unless its name names this species and none of the others" → "unless its name names this species as a name and none of the others ("Vertical garden" names no Aloe vera)"
- Replace "A Commons copy of an iNaturalist photograph the page shows, known by the photograph's number at the end of its name, is shown once." with: "A Commons copy of an iNaturalist photograph the page shows, known by the photograph Commons names as its source or by the number at the end of its name, is shown once."
- Replace "A credit naming a lithographer or draughtsman ("lith.", "del.") or a post office, and a year from 1500 to 1899 in the file's name, mark a printed work or a stamp;" with: "A credit naming a lithographer or draughtsman ("lith.", "del.") or a post office marks a printed work or a stamp, and so does a year from 1500 to 1899 in the file's name with other print evidence (a plate's or a book's words in the name, a category of scans, a licence for old works); a year cited after a page ("- 19 (1827)") is no year;"
- Replace "and so is an uploader's slip … but only where the reference holds no species of that name in that genus: "Mammillaria mabudae" is Mammillaria matudae; "Echinocereus schereri" is a species of its own." with: "and so is an uploader's slip of five letters or more (one letter added, dropped, changed or moved), but only where the reference holds no species of that name in that genus and neither Kew nor GBIF accepts it as a species (the same name by the same author spelt otherwise is one name), as the build or the fill asked them; until then the file is not shown: "Mammillaria mabudae" is Mammillaria matudae; "Echinocereus schereri" is a species of its own, and "Ceropegia mariae" Kew's synonym of Echidnopsis scutellata."
- The lead sentence: replace ", then Commons', then GBIF's photographs of preserved specimens, so" with ", then Commons'; GBIF's media of a record that is not an observation of the living plant, or on a herbarium's own host, is not shown, so".
- The Commons author sentence: add "a derivative work names both, the original's author and its maker, and never the file's name;".

**F, `/about/formats`:**
- Replace "a GBIF photograph of a preserved specimen carries specimen" with "a GBIF photograph whose record is not an observation of the living plant carries specimen, and is not shown".
- After struck, add: "a Commons photograph may carry slips (the uploader's slips in its name that Kew and GBIF were asked of and hold as no species), inat (the iNaturalist photograph its source names), kind (what its source or description says it is, when not a living plant) and sourceRead (set once the fill has read them)".

**F, tests:**
- `r70p-about-rules.test.ts:150` and the slip case: drive the new sentences.
- `r69p-about-seams.test.ts:83`: change the fixture host `example-herbarium` to one without "herbari", such as `images.example-dataset.org`. The host rule now drops it.

## The corpus step

1. **Deploy.**
   - The read at once hides Boswellia's map and the herbarium-host GBIF media, shows Sunouchi's bulbs, and applies the group fixes.
   - It also hides every slip not yet asked. That is about 3% of Commons files, 14 of the 468 sampled, including Nepenthes hurrelliana's three and Othonna cakilefolia's six.
2. **B's basis-of-record fill**, which sets `specimen`.
3. **`npx tsx scripts/build-dossiers.ts --fill commons-kind`** (after B's print line).
   - What it reads: every stored Commons photograph without `sourceRead`. At first that is all of them, about 4,450.
   - What it asks: Commons, fifty titles a request (about 90 requests: Categories, ImageDescription, Credit, Artist), and GBIF twice for each distinct slip name.
   - What it writes: `categories`, `struck`, `inat`, `kind`, `slips`, the credit when the Artist field reads differently, and `sourceRead`.
   - What a run should report: slips asked and the species' (expect most of them), copies found (at least Echinocereus adustus ×2, Melocactus mazelianus ×2, M. azureus, Echinocereus primolanatus, Matucana charlesiorum and Othonna's crop), and "now left out" lines including Commiphora myrrha's sheet. It should also report "shown again" lines for the slips.
   - How it fails safe: a 429 stops it, and nothing unanswered changes. A slip whose source did not answer keeps its photograph without `sourceRead` and out of view, and a rerun asks again.
4. **`--index`.**

## Measured

- **468 live Commons files** (99 pages): 15 change. One is the map; 14 are slips held back until the fill. Of the 173 live category candidates, only the three Nepenthes hurrelliana slips change.
- **100 GBIF-led tiles:** 42 lead with Meise or NMNH herbarium sheets, drawings or micrographs. I looked at four, three of them HUMAN_OBSERVATION. Dropping them removes 81 photographs and leaves 42 species with none, which is true: they had no photograph of the plant. Across the 440 sampled dossiers, 46 species hold 88 such files.
- **Copies:** the Credit field of all 8 copies I read names the iNaturalist original.

## Not done or departed from

- **Mirra nos Olivais**, Commons' misfiled herb on Commiphora myrrha: no rule can catch it.
- **"Notocactus wasarii"**, two letters swapped around a third, stays out as another name.
- **Fungus categories** (Rhinacanthus leaf spots) are still shown.
- **Sunouchi's files** were not counted, because Commons refused the search.
- **The GBIF author departure** in S-C9, explained above.
- **The four-species group** "Lithops collection lesliei" stays exempt. A size limit would undo 70b's Adenia globosa decision.
- **A slip on a Commons file is hidden until the fill runs.** This is the safe read the brief asks for.
