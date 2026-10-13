# Round seventy, agent C: every photograph

Working copy `(scratch)`, two commits on `base`. Files changed: `dossier/photo-kind.ts`, `photo-credit.ts`, `dedupe.ts`, `schema.ts`, `commons-fill.ts`, `sources/commons.ts`, `scripts/audit-commons-photos.ts`, and `tests/unit/r69k-commons-kind.test.ts` (one helper and the slip cases now pass the reference's names). New tests: `tests/unit/r70c-photo-kind.test.ts`, `r70c-credit.test.ts`, `r70c-commons-kind-fill.test.ts`. `epithet.ts`, `photo-size.ts` and `core/licence.ts` are unchanged; `spellingKey` keeps its meaning. The live site, Commons and the index were read on 12 October. Commons answered 429 for most of the afternoon, so only one Commons request and seven thumbnails were read.

## Done

**C1. Names as pairs.** `photo-kind.ts` reads every binomial in a title whose genus is one of the species' own genera, or a capitalised genus the reference holds (`HeldNames`). Each is compared with the species' own names as genus and epithet together, through `spellingKey`. "Euryops abrotanifolius" on Othonna daucifolia is another plant. These also count as the species' name:
- the epithet written as two words ("Titanopsis hugo schlechterii");
- a note after a hyphen ("Sinningia leucotricha-caudex", "Aeonium gomerense-anna");
- an own genus run on into the epithet ("Agavecocui").

These are read as another plant:
- an own genus run on into anything else ("Nepentheslamiiplant");
- an own genus's initial ("N. albomarginata"), or an initial run on into an epithet the reference holds for another species ("Nlamii2rosette").

A family ("Crassulaceae") is not read as a run-on. An English word or a word with no Latin ending after a genus is not an epithet ("before", "cones", "growing", "trap2", "budding", "germination").

**Misspellings.** `slip()` reads one letter added, dropped, changed, or moved up to three places, with a floor of five letters. A slip is the species' only when the reference holds no name of that spelling in that genus for another species. Without the reference's names, no slip is the species'. "Mammillaria mabudae" and "matuadae", "Aeonium dodantrale" and "Cyphostemma jutae" are shown. "Echinocereus schereri", "Drosera microphylla", "Stephania tuberosa" and "Ledebouria ovatifolia" are another species.

**Older names below species.** "Babiana stricta var. purpurea" (or "v.") is Babiana purpurea's whole name. "Babiana stricta" alone is another species.

**Kinds.**
- "hybrid" in a title hides the file.
- "PSM V…", "Popular Science Monthly", "Illustrations…" and a paper's figure ("phylogeny", "peerj") are printed illustrations.
- "NMNH" is a herbarium sheet, and so is the category "Museum of Natural History".
- "specimen" in a title is a sheet unless the title says the plant is living (cultivated, garden, greenhouse), and always when it says pressed, mounted, dried, preserved or type.
- Among categories, only "preserved, pressed, dried, type or museum specimens" hide a file. "Specimens in the Lyman Plant House" and "Plant specimens at Lotusland" are living plants.

**Group and non-plant files.** A file Commons files under two or more species is hidden. The species' own names count as one species, and so do names the index files under one key. An animal, by title ("nymphs", "bugs", "beetles") or by category, is hidden. A description that strikes out a name (`<s>`, `<del>`, line-through) hides the file, read at a new answer and stored as `struck` by the fill.

**Museum files.** I looked at all five Auckland Museum files on Ceropegia radicans (AK289461-1, -2; AK289462-1, -2, -3). Each shows fresh, green cut stems or flowers lying loose on brown card or white paper, with a 5 cm scale. None is pressed or mounted. Their categories are "Photographs of plants in Auckland Museum" and "Images from Auckland Museum". By the rule they are shown, as IND read them; no rule hides them.

**Fruit.** "Seed Pod" is not seed: "Tecomanthe Speciosa Seed Pod" is shown, and loose seeds are not.

**Queued misreadings.** Each is a test case. Shown: Wollemia cones, Lithops before Repotting, Drosera growing, Ceropegia trap2, Cranberry hibiscus budding and full bloom, Sinningia leucotricha-caudex, Aeonium gomerense-anna, Colchicum serpentinum-ku, Titanopsis hugo schlechterii, Nepenthes argentii cultivated specimen, and Lithops specimens at the UC Botanical Garden. "Azalea branca en Oleiros" stays hidden. Azalea is an older name's genus and "branca" reads as an epithet; the file shows a white garden azalea, and its title does not name the species (rule 3).

**C2. `--fill commons-kind`.** `fillCommonsKindAll(store, fetcher, held?)` is in `commons-fill.ts`. It asks Commons, up to fifty titles a request (fewer if the address would pass 6,000 characters), for `Categories|ImageDescription`. It stores `categories` (and `struck`) on each Commons photograph. `schema.ts` now keeps both fields. A file on several pages is asked for once. A photograph already holding categories is passed by, so a stopped fill resumes. A refusal stops the fill, and every file not yet answered stays as it was, counted as not checked. A file Commons no longer has is left as it is and listed. `readKindReply` maps Commons' normalised titles back. A new build answer now also stores the file's categories.

**C3. Credits.** `commonsAuthor` now does the following:
- drops `<sup>` and `<small>`;
- reads every other tag as a space;
- takes off a talk link ("(talk · contribs)", "(messages)"), a signature time "19:48, 25 September 2008 (UTC)", "Uploaded by …", "[n]" and e-mail addresses;
- reads "The original uploader was X at … Wikipedia" and "Taken by X." as X.

An unfilled template ("(MiNombre", "MyName") is no author. `uncreditedPhoto`, and so `--prune-uncredited`, reads the same function. The "Taken by X" reading goes slightly beyond the triage's list; it belongs to the same class of credit wrapping.

**C4. One count.** `shownPhotos` itself drops photographs whose address or thumbnail is not a web address, and counts an iNaturalist photograph stored again from GBIF once (`oneCopyEach`). The index's `shownPhotos` call therefore counts what the page shows. `dedupePhotos` keeps its signature.

**C5, the lead width.** Among Commons files of one epithet rank, files at least 500 pixels wide go first. A file whose width was not kept is not set back. Nepenthes spectabilis now leads with its 512-pixel file, and Mammillaria laui with a 4,000-pixel one.

**Mutation survivors (S-C13).** I wrote tests for each of these: the shared-start reading (Crassula perforata against perfoliata); the length gap; the floor (vira/vera, jutae/juttae); hyphens (purpureo-coerulea; purpureo-caeruela); `NOT_EPITHET` (cones, before); PNG in a stored dossier; plate, "sp.", "aff" without a dot, map and label; specimens and hybrids among categories; and `<br>`. Two mutation runs of my own over the new rules (57 mutants) left three survivors. Two are equivalent: the length-gap guard is implied by the insertion test, and the removed `-NMNH-` and autonumber patterns were redundant, so I deleted them. The third now has a test.

**Base failures.** I ran the three new files on `(scratch)`, using a copy that stubs the new exports, then deleted it.
- `r70c-photo-kind`: 35 of 45 cases fail on the base. Examples: `expected [ 'File:Euryops abrotanifolius 160732946.jpg', … ] to deeply equal []`; the Nepenthes spectabilis lead `expected 'File:Nepenthes spectabilis1.jpg' to be 'File:Nepenthes spectabilis3.jpg'`; Pachyphytum viride `expected [6 items] to have a length of 3`.
- The 10 that pass on the base are marked guards. They are the own-name, initial and family guards; the width guards; the no-group guards; Auckland; Azalea branca and the four specimen or seed guards; and the mutation-kill block.
- `r70c-credit`: all but the `<br>` guard fail. For example, `expected 'Dwight Sipler [2]Uploaded by uleli, C…' to be 'Dwight Sipler, CC BY 2.0, via Wikimed…'`, and `expected '(MiNombre, CC BY 3.0, via Wikimedia C…' to be null`.
- `r70c-commons-kind-fill`: all five fail with `TypeError: fillCommonsKindAll is not a function`.

## Needs

**N, `src/lib/server/dossiers.ts`, `getDossier`:** pass the reference's names to the read. Without this, slips stay hidden on pages; that is safe, but the index and the pages will disagree once B's need below is in.
```ts
import { heldNamesOf } from '$dossier/photo-kind';
…        return parseDossier(await obj.json(), heldNamesOf(c.idx));
…      return parseDossier(stat, heldNamesOf(c.idx));
```
`heldNamesOf` is memoised by the index array, so it runs once per loaded index.

**B, `scripts/build-dossiers.ts`, the index (C4 with C1):** `indexEntry` must read the same names as the Worker. Collect each dossier's `{ key, name, photos }` in `scanDossiers`. After the loop, set `const held = heldNamesOf(out)`, then recompute each entry's `thumb`, `credit` and `photos` with `shownPhotos(d.photos, { scientific: d.name.scientific, synonyms: d.name.synonyms ?? [], key: d.key, held })`. The simpler alternative, `heldNamesOf` of the previous `index.json`, is off only for names new to this build.

**B, `scripts/build-dossiers.ts`, the CLI:** add a usage line and a step.
```ts
 *   npx tsx scripts/build-dossiers.ts --fill commons-kind       # Commons' categories for every stored Commons photograph, fifty files a request, kept with it; then the index
async function fillCommonsKindStep(): Promise<void> {
  const idx = `${outDir}/s/v${DOSSIER_V}/index.json`;
  const held = existsSync(idx) ? heldNamesOf(JSON.parse(readFileSync(idx, 'utf8'))) : null;
  const c = await fillCommonsKindAll(diskStore(), makeFetcher(), held, (n) => process.stdout.write(`\r  ${n.requests} requests, ${n.read} files read…   `));
  console.log(`\r  ${c.files} Commons photographs: ${c.before} had their categories; ${c.asked} asked in ${c.requests} requests, ${c.read} answered${c.missing ? ` (${c.missing} no longer on Commons)` : ''}; ${c.dossiers} dossiers written; ${c.hidden} photographs now left out${c.lines.length ? `:\n${c.lines.map((l) => `    ${l}`).join('\n')}` : '.'}`);
  if (c.unchecked) console.log(`  ${c.unchecked} not checked${c.refused ? ` (Commons refused: ${c.refused})` : ''}; run --fill commons-kind again: it picks up where it stopped.`);
  writeIndexFromDisk();
}
  if (fill === 'commons-kind') return fillCommonsKindStep();
```
Add "commons-kind" to the `--fill` error message as well.

**B, `src/lib/dossier/build.ts`:** add `held?: HeldNames | null` to `BuildOptions`. Pass `{ scientific, synonyms: …, key: <gbif key>, held: o.held }` to `commonsPhotos` (line 488) and `parseDossier(dossier, o.held)` (line 549). The build parses before it writes, so without this a slip file of a new answer is left out of the stored dossier. `build-dossiers.ts` passes `held: heldNamesOf(onDisk)`.

**Unowned, `corpus-run.ts`:** `fillCommonsAll` could take `held` and pass it to `fillCommons(d, f, undefined, held)`, which accepts it now. This is not needed for the round's step.

**P, `/about/how`:**
- Replace "A Commons file's author is its Artist field … names X." with: "A Commons file's author is its Artist field, with its first line taken, never its source ("Own work"); "See above", "Unknown author", a bare "(talk)", a web or e-mail address, a template's unfilled "MyName" and a derivative work's maker alone are not authors; "No machine-readable author provided. X assumed" and "The original uploader was X at … Wikipedia" name X; and a signature's talk link and time, "Uploaded by …" and a footnote mark are taken off, keeping the person. An e-mail address is never published."
- Replace "A Commons file is shown only as … for Othonna cakilefolia)." with: "A Commons file is shown only as a JPEG or WebP photograph whose name, and its categories as Commons gave them to the build or to the fill that asks for them, mark it as none of these: a map; a pressed, mounted or museum specimen, or a file Commons files as media from GBIF (a living plant in a garden is shown, whatever its category calls it); a plate, drawing or other printed illustration, or a paper's figure; seeds (a pod on the plant is the plant), resin, a stamp, a book or a label; an animal; an unknown or unidentified plant; a hybrid ("hybrid" in its name, or the sign); a plant named "aff." or "cf."; a photograph Commons files under two or more species; one whose description strikes out a name; or another plant. Every binomial in the name, of the species' own genera or any genus the reference holds, is compared with the species' own names as genus and epithet together: an older name's epithet counts only with that name's genus, and an older name below species only whole ("Babiana stricta var. purpurea" is Babiana purpurea's; "Babiana stricta" is not). Another spelling of the species' epithet is the species' (gender endings, hyphens and spaces, "ae" or "oe" for "e", "ii" for "i"), and so is an uploader's slip of five letters or more (one letter added, dropped, changed or moved), but only where the reference holds no species of that name in that genus: "Mammillaria mabudae" is Mammillaria matudae; "Echinocereus schereri" is a species of its own."
- Replace "Of the rest, files whose name holds the species' epithet come first." with: "Of the rest, files whose name holds the species' epithet come first, and of those, files at least 500 pixels wide."
- Replace "It is never loaded as the original upload, unless the upload is 960 pixels wide or narrower, when it is shown at its own width. One whose page holds no such version is not shown." (S-F9d: no code does the second sentence) with: "It is never loaded as the original upload, unless the upload is 960 pixels wide or narrower, or Commons gave no smaller version of it, when it is shown as uploaded."

**P, `/about/formats`, after the `licence` parenthesis:** "A Commons photograph carries `categories`, Commons' categories for the file as the build or `--fill commons-kind` read them (absent where not yet read), and `struck` where its description strikes out a name; the site reads both to decide whether it is shown." The sentence "`photos`, which counts the photographs the species page shows" (S-F9g) is true once B's index need is in.

## The corpus step

Run `npx tsx scripts/build-dossiers.ts --fill commons-kind` after the deploy, before `--prune-uncredited`. It reads every `s/v2/<key>.json` and `index.json`. It asks Commons for about 4,450 files, about 90 requests paced by `fetch.ts` with `maxlag`, and writes `categories` (and `struck`) into the Commons photographs, then the index. A run should list at least the stamp (Colchicum macedonicum), the Curtis plate (Cyphostemma adenopodum), the two unidentified files (Colchicum raddeanum, Adenia subsessilifolia), and "Parodia Liberec 1" on three pages. A 429 stops it, and nothing unanswered changes; run it again. Each dossier it writes gets a new `changed` day once, since the fingerprint includes the new fields. Then `--prune-uncredited` removes Agave cocui's "(MiNombre" file and the two "manfred.sause@…" files.

## Measured

- **The 300-line audit:** 289 lines name a file. Of those, 29 are now shown, all good:
  - the queued misreadings;
  - the slips of Mammillaria matudae (2), Aeonium dodrantale, Cyphostemma juttae and Mammillaria herrerae ("herreae", 2);
  - "Muiria mousehead" (2) on Gibbaeum hortenseae;
  - Dipcadi montanum-semmadu.

  The other 260 stay hidden for the same reasons.
- **198 live dossiers** (the audit's species and the cases; 839 shown Commons files): 47 are now hidden.
  - Rightly hidden: 20 are the review's cases, with their categories applied where Commons answered. They are the stamp, the Curtis plate, two unidentified files, PSM, the nymphs, the struck Centaurea nutallii, rhombicaulis hybrid, NMNH ×2, Liberec ×3, lamii ×5 and Euryops ×2.
  - Also rightly hidden: 11 more. They are two paper figures on Pachypodium windsorii, three "hybrid" titles, four group photographs (Nepenthes clipeata with N. albomarginata, Mammillaria sartorii with Parodia magnifica, Conophytum with Lithops, "Cactus mix"), and Eriosyce heinrichiana dimorpha and Pachypodium baronii (other taxa, by S-C6).
  - The cost of names as pairs: eight "Greenovia dodrantalis" on Aeonium dodrantale and eight "Morella cerifera" on Myrica cerifera. Both are older combinations that GBIF's synonym list lacks.
  - Of the Commons-only species, 23 change their lead. Five are left with no photograph: Colchicum macedonicum, both NMNH species, Adenia subsessilifolia and Pachypodium windsorii.
- **All 576 Commons-led tiles, by title alone:** 10 change. Eight are rightly hidden, among them Hesperaloe chiangii with Yucca. Two are costs: Conophytum francoiseae "= C. wettsteinii" and "Eriosyce napina v duripulpa".
- **"Mammillaria herreae":** round sixty-nine's list kept it hidden on purpose. It is one letter from herrerae, and the reference holds no such name, so the triage's rule shows it.
- **Credits:** on the tiles, 2 e-mail credits (Echeveria turgida, Parodia hausteiniana, whose page loses both its files), 3 "[1]", 1 signature, 1 "(MiNombre" (Agave cocui), and 2 "original uploader".
- **Counts:** Albuca paradoxa (16 in the index against 8 on the page) and Polyscias guilfoylei (13 against 9) agree by construction. My test reproduces Pachyphytum viride (6 → 3).

## Not done, and departures

- **"Whatever the genus"** is read as the species' own genera and every genus the reference holds (1,321). A capitalised word outside them is not read: "Mountain aloe" and "Cranberry hibiscus" show how often such a word is English. Euryops is in the reference.
- **"Two swapped"** is read as one letter moved up to three places, because "dodantrale" moves the r three places, and the triage names it the species'.
- **The cost of pairs** (Greenovia, Morella, Eriosyce napina, Conophytum "=") would end with older names from Kew. That is B's area or a later round, so I set no exception.
- Stamps, Curtis plates, unidentified files and groups are hidden only after the corpus step. Their titles do not say what they are.
- **Full unit suite:** 2,763 passed and 4 failed under a load average near 40. All four failures were time-outs outside my area (`products`, `sync-engine`, `r62bh-predeploy`, `r63fs-harness`), and they pass when run again on their own (81 of 81). `tsc --noEmit` is clean. No Svelte file changed.

## Second pass (R47; REVIEW-TRIAGE-69 C6, C7)

The commit is `20263ef`. It changes `photo-kind.ts`, `photo-credit.ts`, `photo-size.ts`, `dedupe.ts`, `schema.ts`, `sources/commons.ts` and `epithet.ts`, and adds `tests/unit/r70c-second-pass.test.ts`. On the base, 13 of its 14 cases fail; the one that passes is the marked guard. Examples: `expected true to be false` for Asclepias syriaca on A. curassavica, and `size.photoOf is not a function`. My 233 photograph tests pass and `tsc` is clean.

**C6.**
- An older name of species rank is the species' own only where no species of the reference holds it as its accepted name. The check is `HeldNames.accepted` and `olderNameIsOwn`. Asclepias curassavica no longer takes "Asclepias syriaca", nor Aloe vera "Aloe maculata". Without the reference's names, every older name is read, as before.
- An older name below species counts only whole, with its infraspecific epithet: "Pachypodium baronii" is not Pachypodium windsorii's.
- `epithetRank` reads a joined name ("Nepenthesdubia1", "Nepspectabilis").
- **Departure, flagged:** under C6 with B7, Nepenthes tenuis on N. dubia and N. amabilis on N. sumagaya are shown, against R47's reading. GBIF lists both as synonyms, and no species of the reference holds either. The test is a guard, so the decision is visible; reverse it if the owner holds them to be other species.
- **B7 hook:** `olderNameIsOwn` in `photo-kind.ts`, marked "B7 hook". B's rule (held by no species, accepted or older) replaces its body at the merge. I asked B nothing.
- The cost note stands: C6 recovers none of Greenovia or Morella. Those names are not in GBIF's synonym list, so B7 will not recover them either. One more tile joins that cost: "Odontophorus angustifolius" on Cheiridopsis angustifolia.

**C7.**
- A credit with "del.", "delin.", "lith.", "pinx." or "sculp." is a plate. A credit naming a post office ("почта", "пошта", "pošta", "poczta", "postal") is a stamp. Both are read before any category is kept, so the Cyphostemma adenopodum plate and the Colchicum macedonicum stamp go at the deploy, not after the fill.
- A year from 1500 to 1899 in a title is a printed work (Dasylirion graminifolium "Zuccarini 1843", Nepenthes bongso "Korthals 1839"). A camera's, a catalogue's or a collector's number is not a year ("VG 1815", "VoS1791", "IMG 1834"). Over all 576 tiles, the year rule hides only Dasylirion graminifolium's.
- "N rajah" is read where the reference holds the epithet in that genus, so "A pair of…" is not read.
- "Neoporteria(eriosyce) villosa" is read as both names.
- Another genus of the reference named alone in a title is another plant ("Aloe Dichotoma & Cyphostemma Juttae"). A word that is the species' own epithet is not a genus: "Pachyphytum 120221" on Dudleya pachyphytum stays.
- **Commons originals:** `shownPhotos` gives an original no wider than 500 pixels a tile at Commons' largest width below its own (250 or 120), so no row or tile loads the whole file. `photo-size.ts` gains `photoOf(p, size)`, which knows the width, for the lead.
- **Herbarium media:** GBIF media of a preserved specimen ranks below Commons as a lead. It is known by a new `specimen` flag, and in dossiers built before by the herbaria's image hosts (oxalis.br.fgov.be, collections.nmnh.si.edu, specimens.kew.org, sweetgum.nybg.org, mediaphoto.mnhn.fr, herbarium.bgbm.org, any host naming a herbarium).
- **Credits:** "(talk)" anywhere, and a signature's time without "(UTC)". "Photo by X" and "Photograph by: X" name X.

**`spellingKey` (for A and B).** It now reads an -er adjective that keeps its e as one name: stolonifer, stolonifera and stoloniferum share the key "stolonif"; asper and aspera share "asp". Niger, nigra and nigrum stay "nig". Over the index this joins no two accepted names of one genus. A and B: a title or name in -er now matches its -era or -erum form.

**Measured (198 live dossiers, 839 Commons files).** 51 are now hidden (47 before). The four new ones are the "Aloe Dichotoma" group, Neoporteria(eriosyce), Korthals 1839, and one more "Morella Cerifera". Credits changed on 34 files, 17 of them "Photo by David J. Stang". Nepenthes dubia's lead changes from "Nepenthes tenuis1" to "Nepenthesdubia1".

**Needs, second pass:**
- **N, species page:** the lead's sources use `photoOf(hero, 'medium')` and `photoOf(hero, 'large')`, from `$dossier/photo-size`, in place of `photoAt(heroSrc, …)`. The srcset stays as it is for thumbnails. Without this, a 501 to 960 pixel original loads whole on a phone.
- **B, `gbif.ts` and `bulk.ts`:** set `specimen: true` on a GBIF photograph whose occurrence's basisOfRecord is PRESERVED_SPECIMEN. The schema keeps the field.
- **P, `/about/how`:**
  - Add after the kinds list: "A credit naming a lithographer or draughtsman ("lith.", "del.") or a post office, and a year from 1500 to 1899 in the file's name, mark a printed work or a stamp; another genus of the reference named alone in the name marks another plant."
  - Add to the older-names clause: "an older name counts only where no species of the reference holds it as its own accepted name."
  - Replace the lead sentence with: "The lead photograph is iNaturalist's wild one first, then GBIF's, then iNaturalist's cultivated, then Commons', then GBIF's photographs of preserved specimens."
  - Add to the sizes sentence: "an original no wider than 500 pixels is loaded at Commons' 250 or 120 where the place needs no more."
