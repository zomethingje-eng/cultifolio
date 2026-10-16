# Round 73, K: other GBIF keys, and two merged pages

Working copy `/tmp/claude-0/rev73/K`, branch `r73`, commits `b2ed853`, `022d2eb` and `752ce7b` (the narrower rule, L's hunk and the corpus step). Evidence is in `/tmp/claude-0/rev73/K-work/`. The dry-run copies are `/tmp/claude-0/rev73/K-s2/` (the narrower rule) and `/tmp/claude-0/rev73/K-s/` (the first one).

## Done

**The rule (`src/lib/dossier/extra-keys.ts`, new; the owner's narrower decision).** A page reads another GBIF key's records and photographs only when all of these hold:

- The key's name and author read (by `ownByAuthor`, the reading the ranges use) to a Kew row of the page's own name and type:
  - the entry itself, or another row of its name and author;
  - an orthographic variant filed under it;
  - a name Kew files under it and marks homotypic (`homotypic_synonym`). An invalid or illegitimate name counts only when so marked;
  - an autonym of one of those.
- A citation that is only a shorter abbreviation of Kew's one row of the words is read as that row: "Dehn." of "Dehnh.", at least four letters, ending in a full stop.
- GBIF does not already file the key under the page's key.
- The key is not another page's key, is not filed by GBIF under one, and holds no other page.
- GBIF does not call the key a pro parte synonym.

Within a key that passes, names GBIF files under it that Kew holds as another plant, or as another type of this one, are left out record by record (`except`, read by each record's own `taxonKey`). A name Kew does not hold at all is left to GBIF, as under the page's own key.

A heterotypic synonym, or a taxon Kew accepts below the entry (and the names filed under it), goes to `extra-keys-refused.txt` with the reason. For example: "heterotypic: the owner's decision (Kew holds X as a heterotypic synonym of Y)", or "another type below the entry: the owner's decision (…)". `KewRow` now carries Kew's `homotypic_synonym`.

**The list.** `scripts/extra-keys.txt` (regenerated) holds 332 keys on 305 pages. `--list-extra-keys --bulk bulk --backbone simple.txt.gz` made it offline from Kew's file of 2026-06-04 and GBIF's backbone export. Without `--backbone`, the command writes `rebuild-extra.txt`.

**The build (`build.ts`).**

- Every build reads the list.
- Each listed key's records are joined to the page's own, each record once.
- If any key does not answer, the occurrence source counts as not answering, and the previous snapshot is carried (rule 2).
- Photographs: the page's own key's come first, then the other keys', up to 24.
- The record names each key, its Kew reading and its source. The new field `occurrences.keys` (`{key, name, kew, n, from, slug?}`, schema optional) holds the same, for rule 1.
- `bulk.ts` keeps each row's `taxonKey` and indexes `acceptedTaxonKey`. `gbif.ts` carries `taxonKey` on media. `--fill gbif` leaves pages with other keys alone.

**The merges (`scripts/merged-pages.txt`).** Coryphantha macromeris 3084426 joins Pelecyphora macromeris, and Rebutia fidana 7906297 joins Weingartia fidaiana. Both of the old names are Kew homotypic synonyms of the kept entries.

- On the kept page, the removed page's name, synonyms and common names join (sourced). The old name redirects as an older name does.
- `--prune-followed` deletes the removed dossier only once the kept page records its key and old slug.
- The products file the kept page's entry and sheet under the old slug, so a grower's plant, label or followed species under the old name finds the kept page.
- `/api/dossier/<old key>` answers 404.
- `markSharedPhotos` (L's need) now takes L's `name` hunk. It also leaves out a page leaving by `merged-pages.txt`: Weingartia fidaiana's tile counted 5 photographs live, and counts 20 on the dry run.

**The corpus step (`scripts/corpus-step.mjs`, D's file).** `mergedAway(output)` reads "N dossiers of pages merged into another deleted". The run then lowers the expected species by N, says so, and saves it. Any other shrink still blocks.

**Tests.**

- `tests/unit/r73k-extra-keys.test.ts`, 28 cases. New ones:
  - Lonicera pileata reads no Lonicera ligustrina;
  - a heterotypic synonym under the entry is refused;
  - a heterotypic name under a key that is read is excepted;
  - Myrica cerifera, Ixora coccinea, Eucalyptus camaldulensis, Ranunculus ficaria (Ficaria verna Huds.) and both merges still read theirs.
- `tests/unit/r73k-corpus-step.test.ts`, 2 cases.
- Both files fail on `r73base` (module missing; `mergedAway` missing).
- Full suite: 3,856 passed, 8 skipped. `tsc` and `svelte-check`: clean.

**Ficaria verna Huds. and Kew's flag.** Kew row 2809356 is a Synonym under Ranunculus ficaria L. (2523483), with `homotypic_synonym` T. Its basionym is 2523483 itself, with replaced-synonym author "L.": it is the replacement name for Ranunculus ficaria L., of the same type. So the key 9094061 is read. The subspecies GBIF files under it that Kew accepts as other subspecies of R. ficaria (other types) are left out record by record (24 keys), and so is subsp. ficariiformis, which Kew holds as Ranunculus ficariiformis.

**Device and sync (rule 6).** Nothing rewrites a grower's `taxonName` or `taxonKey`. The alias sheet makes the plant page find the kept species and show its existing "Use the reference's key" notice. Sync never sees keys. The two displays that miss the old key are need 2.

## Needs

1. (Done above: `corpus-step.mjs`.)
2. **`src/routes/species/[slug]/+page.svelte`.**
   - (a) For each `d.occurrences.keys` entry, beside the records: "Records also from GBIF's key {key} ({name}): {kew}; {n} records, from {GBIF's download | GBIF's search API on the day of the build}." Link `https://www.gbif.org/species/{key}`. Nothing when the field is absent.
   - (b) "Your plants" (line 190) also joins on `a.taxonKey` equal to any `keys[].key`, and `speciesSlug(a.taxonName)` equal to any `keys[].slug`.
   - (c) Taxon notes and follow state are shown under each `keys[].slug` too.
3. **`/about/how`.**
   - Replace "Occurrence records come from <b>GBIF</b>, as GBIF held them on the day it made the download, which the page states." with: "Occurrence records come from <b>GBIF</b>, under the page's own backbone key as GBIF held them on the day it made the download, which the page states. Where GBIF files the same plant under another key too, that key's records and photographs are read as well, asked of GBIF on the day of the build (up to 900 records a key), and the page names each key. A key is read only when Kew's file holds its name and author as the page's own name or as a name of the same type: the same name by the same author, an orthographic variant, a synonym Kew marks homotypic, or an autonym of one. It must also be a key GBIF does not already file under the page's key, neither another page's key nor filed by GBIF under one, and not one GBIF holds as a pro parte synonym. A heterotypic synonym's key is not read. Within a key that is read, a record GBIF identifies as a name Kew holds as another plant, or as another type, is left out."
   - Add: "Two pages that were one plant, the one's name a synonym of the other's in Kew's file with the same type (Coryphantha macromeris and Pelecyphora macromeris; Rebutia fidana and Weingartia fidaiana), are one page under the name Kew accepts: the other's key is read as above, its names are listed there, and its old address and a plant recorded under it lead there."
   - In the photographs sentence, after "asked of GBIF instead,", add: "and the other GBIF keys' photographs after the page's own key's,".
4. **`/about/formats`.** Add: "<code>occurrences.keys</code> ({`{ key, name, kew, n, from, slug }`}), present when the records also come from other GBIF keys than the page's own (round seventy-three): each key, GBIF's name for it, how Kew's file holds it as this page's name or type, the records it added, <code>download</code> or <code>api</code>, and, for a page merged into this one, the old address."

## The corpus step

Plan (`scripts/corpus-plan.txt`; DEPLOY.md section 5 rewritten to match):

```
backup
dossier --list-extra-keys
review rebuild-extra.txt … about 305 lines …
if-exists rebuild-extra.txt dossier --keys rebuild-extra.txt --rederive --grid climate --bulk bulk
dossier --prune-followed
dossier --list-extra-keys
dossier --index
review … 8,945 species …
upload
live-check
```

The `--keys` list is `rebuild-extra.txt`: the 305 page keys of `scripts/extra-keys.txt`, the two kept pages among them.

Dry run on a fresh copy of the live corpus (`K-s2`):

- `--list-extra-keys` gave 305 pages.
- `--keys` (six pages) `--rederive --bulk bulk`, one request a second. Records open/restricted before and after:

  | Page | Before | After | Other key |
  |---|---|---|---|
  | Myrica cerifera | 55/14 | 155/653 | 3168995 gave 819, after 31 names left out |
  | Ixora coccinea | 74/327 | 198/174 | 2905493 gave 891 |
  | Eucalyptus camaldulensis | 422/63 | 682/293 | 3176197 gave 900 |
  | Pelecyphora macromeris | 39/50 | 216/602 | 3084426 gave 900; Coryphantha macromeris joins its older names, and 8 common names |
  | Stapelia grandiflora | 2/48 | 88/59 | 9438978 gave 141 |

  Weingartia fidaiana gains Rebutia fidana's two names; that key has no georeferenced record.
- `--prune-followed`: "2 dossiers of pages merged into another deleted (3084426, 7906297)"; index 8,945; "2 old addresses … answered by the kept page"; corpus `bec76ebdbaecb866`.
- Second run: `--list-extra-keys` gave 299 (none of the six, nor the merged two). `--prune-followed` deleted 0, and the corpus was unchanged (0 files written).

## Measured

**Kept, by Kew's relation.** Records are GBIF's with the build's filters, minus exceptions (`K-work/counts3.txt`). In all, 960,762 records; 109 pages gain records; 219 keys hold none.

| Kew's relation | Keys | Pages | Records |
|---|---|---|---|
| The entry's name itself (another usage) | 247 | 237 | 89,022 |
| Synonym marked homotypic | 68 | 61 | 871,545 |
| Illegitimate or invalid marked homotypic | 15 | 14 | 195 |
| Orthographic | 2 | 2 | 0 |

**The named cases.**

| Page | Key read | Records |
|---|---|---|
| Myrica cerifera | Morella cerifera | 17,677 |
| Myrica rubra | Morella rubra | 1,919 |
| Ranunculus ficaria | Ficaria verna | 837,971 |
| Stapelia grandiflora | Ceropegia grandiflora | 141 |
| Stapelia gettliffei | Ceropegia gettliffei | 39 |
| Piaranthus punctatus | Ceropegia punctata | 59 |
| Ixora coccinea | Ixora coccinea L. | 1,030 |
| Eucalyptus camaldulensis | E. camaldulensis Dehn. | 45,418 |
| Rubus parviflorus | Rubus parviflorus Nutt. (2989557) | 3,062 |
| Rubus parviflorus | three homotypic synonyms | 90 |
| Pelecyphora macromeris | Coryphantha macromeris | 1,362 |
| Weingartia fidaiana | Rebutia fidana | 0 |

Adenia gummifera reads nothing (filed under Adenia cissampeloides, a page). Rubus nutkanus is refused as heterotypic.

**Refused for the owner** (`extra-keys-refused.txt`; record counts overlap where GBIF files one refused key under another):

- **Heterotypic:** 1,066 keys on 316 pages, up to 77,377 records.
- **Another type below the entry:** 1,225 keys on 192 pages, up to 412,657 records. Lonicera pileata on Lonicera ligustrina is 43,703 of these: Kew files it, homotypic, under L. ligustrina var. pileata. Plantago uliginosa on Plantago major is 51,809, and Ficaria ambigua on Ranunculus ficaria 54,746.
- **Other refusals:** 444 filed under another page, 362 pro parte, 118 read to two Kew rows of one name and author, and 14 another page.

**`occurrence.zip`.** It lacks all 332 keys. The build asks GBIF's search API: about 1,000 requests.

**What the owner's PC run adds that this cannot show:**

- each page's own records from the download (here the API);
- the climate (no grid here);
- the other keys' photographs (a re-derivation reads GBIF photographs only with the download's media). A direct API check gave 24 publishable each for Morella cerifera, Coryphantha macromeris, Ixora coccinea L. and Ficaria verna, and 5 for Ceropegia grandiflora;
- `drops.txt` (the build's index stage ran out of memory here at 2 GB, after writing; the step uses 8 GB).

## Not done, with why

- **iNaturalist photographs of the merged pages** are not carried. The rule covers GBIF's records and photographs.
- **Page and about-page changes** are needs.
- **`schema.ts`** gained one optional field. It is a shared file; the hunk is small.
