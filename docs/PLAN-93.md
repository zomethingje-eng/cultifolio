# Round 93: the names GBIF files apart, matched by rule

Round 92's first flowering run (docs/REVIEW-ROUND-92.md, 15 November 2026) read the 25 pages sharply apart from
iNaturalist's API, asking GBIF where iNaturalist's observations under each name are filed. Four kinds. The record left
two for a round of their own. This is that round.

## What changes

1. **A species GBIF holds as a synonym of another page's species** (`speciesFromHolder`, src/lib/dossier/extra-keys.ts).
   Round 86's rule (review D's D6) gives a page with no GBIF key the varieties and subspecies GBIF files under another
   page's species, where Kew's synonymy places them, same type, in this page's plant; the other page leaves their records
   out (`givenAway`). It took no species: "never a species". But iNaturalist files observations under the species' own
   name, which GBIF holds as a synonym, so the page read a few records and the other page kept the rest. Oxalis smalliana
   read GBIF's Oxalis oregana var. smalliana, while its 7,996 observations annotated flowering, under GBIF's Oxalis
   smalliana R.Knuth (3626515, a synonym of Oxalis oregana), were counted on Oxalis oregana. The same for Opuntia
   cespitosa, azurea and bonaerensis, Vaccinium fuscatum and Leucopogon parviflorus. `scripts/extra-keys-kew-none.txt`
   lists 650 pages "lumped" with a usage of the entry's own type (334 of them read a variety's key since round 86).
   - The rule takes a species only where GBIF's status for it is a synonym (an accepted species is no other page's to
     give), GBIF files it under exactly one page here, and the type rule holds (Kew's entry itself, an orthographic
     variant, or a name Kew marks homotypic): a heterotypic synonym stays where GBIF files it, the owner's decision of
     round 73.
   - Written into `scripts/extra-keys-infra.txt` with round 86's lines (`scripts/kew-extra-keys.ts --infra-from-holder`;
     `--no-species` makes round 86's list alone, to prove its lines unchanged).
   - Rule 3: matched by identifier and Kew's file, never by the words alone. This is the site's standing reading: Kew's
     accepted name heads every page (round 84), and where Kew splits what GBIF lumps, the records GBIF identifies by the
     split species' own name are that species'.

2. **The same name spelt with its epithet in another gender** (`genderForms`, `kewReading`'s `how: 'gender'`). GBIF's
   backbone holds "Rhus copallina L." (3190557, accepted) apart from Kew's Rhus copallinum L. (a page with no GBIF key),
   and iNaturalist's 32,285 observations of it sit under GBIF's spelling. An adjectival epithet agrees in gender with its
   genus, and the other gender's spelling is the same name corrected (ICN Art. 23.5, 32.2), as Kew's own orthographic
   variants are. A GBIF usage whose words Kew does not hold is read as Kew's row of the words in another gender only by
   the same author, and only where one form of the words gives such a row. For every page, keyed or not.
   - These keys' records are not in the occurrence download of 21 October (asked by the list's keys before the rule), so
     the build asks GBIF's search for them, as for any key the download does not hold. The next occurrence download asks
     for them, as it asks for every key in the lists.

3. **The holder's words**: the record of a page that leaves another page's records out names that page's plant
   (`kewPlantWords`); for an accepted species the old words cut "(accepted)" to "(accepted" and for an illegitimate name
   kept the whole reading. Three lines of round 86's file were of the second kind.

## Not changed

- **Names GBIF matched only to a genus or a family** (Peucedanum palustre and alsaticum under Apiaceae, Veronica umbrosa,
  Lespedeza frutescens, Varronia globosa, Apocynum venetum). The download holds those observations under the family's or
  genus's key, shared with every other species of it, so no key separates them. Counting them would need iNaturalist's
  verbatim name in the download, matched to Kew's names: a name matched, which rule 3 allows only by a rule of its own.
  The page says it found none under its own GBIF keys (round 92's wording).
- **A homonym GBIF reads to another plant** (Metrosideros angustifolia: iNaturalist's name matched to GBIF's
  "Metrosideros angustifolia Dum.Cours.", a synonym of Callistemon lanceolatus, by another author than Kew's (L.) Sm.).
  By the author rule those records are the other name's. Left as GBIF files them.
- **Libanotis pyrenaica**: GBIF's Seseli libanotis subsp. libanotis is Kew's Libanotis pyrenaica subsp. pyrenaica, a
  taxon Kew accepts below the entry: "another type below the entry", the owner's decision of round 73.
- **Names iNaturalist does not use** (Nicoteba betonica, Morinda pubescens): nothing to read.

## Steps

1. Code and tests (tests/unit/r93a-name-keys.test.ts). The lists made again offline from Kew's file and GBIF's backbone,
   each compared with the committed list: every line added or dropped must be the new rule's.
   - `npx tsx scripts/kew-extra-keys.ts --bulk bulk --backbone bulk/backbone/simple.txt.gz` (extra-keys-kew.txt and
     extra-keys-kew-none.txt: the gender rule on the pages without a GBIF key).
   - `npx tsx scripts/kew-extra-keys.ts --bulk bulk --backbone bulk/backbone/simple.txt.gz --infra-from-holder` (the
     species rule), and with `--no-species --out <scratch>` (round 86's lines, unchanged).
   - `npx tsx scripts/build-dossiers.ts --list-extra-keys --bulk bulk --backbone bulk/backbone/simple.txt.gz` (the
     gender rule on keyed pages).
   - The pages whose keys changed, and the pages that give them away: scripts/rebuild-r93.txt.
   - As done (16 November 2026): the committed lists were made on 20 to 22 October and rounds 82 to 87 changed the rule's
     code since, so a list made again on the round's code differs from the committed one by those rounds too (pages a
     list never held, lines read since by another round's step). The round's own difference was taken alone: each list
     made on f382389's code and on the round's, from the same files (f382389's made round 86's infra list line for line,
     so the files are the same), and only the lines that differ applied to the committed list. What the other rounds'
     code would change in the lists is not this round's, and is left for a round of its own.
2. The gate, the commit.
3. The corpus plan (scripts/corpus-plan-r93-names.txt): a backup; an offline dry run of the pages (records and climates
   before and after, page by page); a review stop; the online `--keys` build; the flowering fill from round 92's download
   (offline: the counts move with the keys); the index; the upload; the live check.
4. The deploy, after the upload, so /about/how's new sentences are true of the site as served (rule 5).
