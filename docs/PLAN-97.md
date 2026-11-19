# Round 97: the gate's flaky test, a quicker review, and the Commons count round 96 left (the plan and record)

Written 19 November 2026, after round 96 went live (a8bb7e8, corpus 7795f8106d47dff3). The owner: "yes, write PLAN-97 and
start". A round of upkeep: nothing a reader sees changes. Corpus tier (a test and the corpus script; the app is not
changed, so no deploy).

## The answer

1. r76p strip 4, the test that failed once in each of rounds 93, 94 and 95 and passed on its retry, measures a catalogue
   tile before the browser has drawn it. It now waits two frames, as the same test's hero check already did.
2. A review or stop compared all 48,375 dossiers with the backup, reading the corpus three times; it now reads each once
   and the backup's copy only where the dossier was written since the backup began. The same words, 73 s to 20 s with the
   files in memory, and a third of the reading after a build.
3. The Commons count PLAN-96 left open: 16 pages besides Heberdenia bahamensis hold an empty P373 category while their
   item's Commons sitelink holds files, so round 96's code reads the sitelink's category for them once they are built
   again, where a page asks Commons at all (built 19 November: five gained Commons photographs, three of them their first
   photograph; section 5); and 14 pages with no P373 read their name's empty category while the sitelink's holds files,
   which round 96's rule does not reach (5 of them hold no photograph), a later round.

## 1. r76p strip 4

The failure: "tile 'Photo: CC BY-SA, Dilrukshan Priyantha Wijesinghe' outside its card", at 320 px or at 390 px with 200%
text, in Chromium, once a gate, gone on the retry.

The cause, measured: a catalogue tile is `content-visibility: auto` with a 260 px placeholder (`contain-intrinsic-size`,
src/lib/ui/theme.css). Until the frame in which the browser finds it on screen, its contents are skipped and it stands
260 px high whatever they hold. Measured frame by frame from load in Chromium (a8bb7e8), the opened row's first tile was
260 px with its long credit below its bottom in frames 0 and 1, then 383 px (377 at 390 px, 200% text) with the credit
inside from frame 2 on, in two of four page loads; in the other two the tile was drawn before the first measure. Strip 4
wrote the long credits and measured at once, so it failed when the page load fell in those two frames, which the gate's
load makes more likely: run alone twenty times at four workers it passed 20 of 20 before the change as after.

Not a fault a reader meets: a tile is drawn before it is shown, and a tile drawn once keeps its height when scrolled away
(measured: 383 px off screen above and below). So the test, not the app, is changed: `fit` waits two animation frames
before it measures, as strip 4's hero check already did ("requestAnimationFrame twice").

## 2. A quicker review

Round 96's stop after a one-page build took about ten minutes. `facts` (scripts/corpus-step.mjs), which every review that stops
appends, read every dossier for its error rows, then every dossier again and its backup copy to name the dossiers
that differ: the 4.9 GB corpus three times. After a build has streamed the 62 GB GBIF download, little of the corpus is
in memory. Its checks (`expect`) were not the cost: they read only their own steps' output (round 89).

The change: the backup step records when its copy began (`state.backupAt`). `facts` reads each dossier once, for its
error rows, and reads the backup's copy only where the dossier's file was written since then; a file not written since
the copy began is the copy, byte for byte (nothing in the builder or the fills keeps a file's old time; checked for
`utimes` and `preserveTimestamps`). Where the moment is not known (`--compare`; a backup already there before the run;
round seventy-eight's version-2 backup), every dossier is compared, as before.

Measured on round 96's corpus against its backup (eb2c790bb6785f8a): the same text, word for word, "3074 dossiers differ"
both ways; 72.8 s before, 20.0 s after, with the corpus in memory. The 3,074 are the one page built and the 3,073 pages
the morning's BHL fill wrote, which the build's index stamped (as it says: "3073 dossiers changed since their last
stamp"). Test: tests/unit/r97a-review-since.test.ts.

## 3. The Commons count

`node scripts/dev/r97-commons-count.mjs`: every page's Wikidata item asked of Wikidata's query service for its P373 and
its Commons sitelink, then Commons for the file count of each category where the two differ. Four groups:

- A: P373's category empty, the sitelink's with files: what round 96 reads now, once a page is built again.
- B: P373's and the sitelink's differ, P373's not empty: P373 read, as before (rule 3: the item's own statement).
- C: no P373; the name's category (what the build reads then) empty, the sitelink's with files.
- D: no P373; the two differ, the name's with files or neither.

Read 19 November 2026 (r97-commons-count.txt, in the project folder, lists every case): 47,748 pages with a Wikidata
item; 32,718 with P373; 33,253 with a Commons sitelink, 20,686 of them to a category. 109 pages' sitelink names another
category than the one the build reads first:

- A, 17: Heberdenia bahamensis (built in round 96) and 16 more, among them Dioscorea oppositifolia (P373 "Dioscorea
  opposita", 0 files; sitelink 33), Stenocactus phyllacanthus (P373 "Echinofossulocactus phyllacanthus", 0; sitelink 21),
  Lysimachia linum-stellatum (0; 18). Three hold no photograph from any source: Dichotomanthes tristaniicarpa,
  Acanthocladium dockeri, Nageia fleuryi. The other 13 hold iNaturalist's or GBIF's (8 to 97). Several were last built
  offline, their Commons row "carried from build of …", so the walk of round 95 did not ask Commons again.
- B, 74: P373 read, as before. P373 is often the older name's category and the sitelink the newer's, or the other way;
  where P373's holds files they are this item's by its own statement, and nothing changes.
- C, 14: the build reads the name's category, which is empty. The sitelink is often the name under another genus
  (Marginatocereus marginatus: Lophocereus marginatus, 90 files; Prunus brachypetala: Cerasus brachypetala, 12) or
  another spelling (Quercus eduardi: Quercus eduardii, 4). Five hold no photograph from any source (Eriosyce
  caliginiphila, Prunus brachypetala, Solanum ajanhuiri, Drynaria pleuridioides, Pachylecythis zabucajo). But one shows
  why this needs its own rule and test: Silene macrophylla's item links "Silene multifida", a name Kew's file holds twice,
  once as this plant (Silene multifida (Adams) Rohrb., nom. illeg., under Silene macrophylla) and once as another
  (Silene multifida Edgew., a synonym of plant 2487047). A category is named without an author, so it cannot say which
  (rule 3).
- D, 4: no P373, the name's category read; in two of them both categories are empty.

What follows, for the owner (a later round):

- A: the 16 pages built again online on round 96's code (scripts/rebuild-r97-commons-a.txt), as round 96 built
  Heberdenia: one plan, a stop to read their Commons rows, the fills, the index, the upload.
- C: a change of code before a build: where an item has no P373 and the name's category holds no files, read the
  sitelink's category only where every name of those words in Kew's file is this plant (the accepted name or its
  synonyms), so a name Kew holds for two plants, as Silene multifida, is not read. With its test.

## 4. The gate and the commit

`node scripts/predeploy.mjs --tier=corpus` (unit tests, then Chromium desktop and phone); commit and push. No deploy: the
app is not changed.

Passed 19 November 2026, first run: 698 files, 6,294 unit tests passed (10 skipped); Chromium 1,027 passed, 7 skipped,
every test first time, strip 4 among them.

## 5. Group A built (19 November 2026)

The owner: "Yes, rebuild them". `node scripts\corpus-step.mjs --plan scripts\corpus-plan-r97-commons-a.txt`, begun about
15:50 UTC, every step done at 17:17 UTC: "16 built, 0 kept of 16"; the fills, the index (48,375 species), the review's
checks (flowering 32,284 counted), the upload (0 differences, 122,053 files) and the live check (23 of 23). The site
serves corpus afd3bc24bf475457. The stop's facts named the 16 dossiers and no other.

What the pages read (each against the backup of corpus 7795f8106d47dff3):

- Five pages ask Commons and read the sitelink's category, each record saying so ('read Commons category "…", the item's
  (Q…) Commons sitelink, since its P373 category "…" holds no files'): Dichotomanthes tristaniicarpa 0 to 11 Commons
  photographs, Acanthocladium dockeri 0 to 1, Nageia fleuryi 0 to 1 (the three had no photograph from any source), Magnolia
  jardinensis 0 to 2, Eleiodoxa conferta 0 to 2.
- Eleven ask Commons nothing: each shows 25 to 72 iNaturalist photographs of its own, and Commons is asked only below
  twelve (`COMMONS_BELOW`, round 69). Section 3's "16 more … give them Commons photographs" counted the category's files,
  not whether a page asks: corrected above. Their old Commons row ("skipped", carried from a build of October) is gone, as
  for any page built online with twelve or more.
- GBIF's photographs fell on nine pages (Gastrochilus formosanus and Erythronium tuolumnense 24 to 0, Persicaria runcinata
  24 to 6): every one was an iNaturalist photograph GBIF carries, and every one is still shown, once, as iNaturalist's
  (checked by photograph number on each page). None lost.
- drops.txt, one line: Scorzonera cana's item Q15552799 to Q15594569. Expected: Q15552799 carries IPNI 243102-1, which
  Kew's file does not hold; Kew's number for Scorzonera cana (C.A.Mey.) Griseb. is 77362646-1, which no item carries; so
  the build takes the item that carries Kew's 239017-1 for Podospermum canum C.A.Mey., which Kew holds as its basionym
  (round 85, H, as /about/how says). The old item was carried from a build of 22 October.
