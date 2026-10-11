# Round sixty-nine: the needs applied at the merge

Done in the main checkout, `/home/claude/cultifolio`, after the agents' files were merged and M's needs applied. `/tmp/r69` was read, never written.

## 1. What was applied

### W: NASA POWER's failure recorded as `error` (W.md section 2, S-E7)
- **`src/lib/dossier/build.ts`.** W's patch was applied as written, with its comment. The `climate.extremes` upstream is now `error` when the provider's words begin "NASA POWER did not answer", and `refused` otherwise. Checked: `src/lib/climate/provider.ts` writes exactly those words.
- **New `tests/unit/r69w-power.test.ts`.** This is W's test, verbatim. It passes. I checked it fails with the patch's one expression reverted, then restored the file and compared it byte for byte.

### N: the pooled spellings in the index (N.md, for M)
- **`scripts/build-dossiers.ts`.** M's file had moved since N wrote the patch, so the intent was applied by hand:
  - `indexNames` is imported beside `englishNames`;
  - the script's `IndexEntry` type gains `spellings?: string[]`;
  - `indexEntry` spreads `indexNames(d.name.vernacular, { genus })`, with a comment.
- **`nameEntries` is unchanged,** as N said. The genera only reorder names (`setBack` changes a name's tier, and no name is dropped), so the set the spellings are pooled against is the same.

### N: the species route's 404 for an older name of two species (N.md, for P)
- **`src/routes/species/[slug]/+page.server.ts`.** N's patch applied cleanly, since P had not changed this file.
- **New `tests/unit/r69p-species-ambiguous.test.ts`.** This is N's test. One type-only change was needed for svelte-check: the helper `caught` takes `unknown` rather than `Promise<unknown>`, since `load`'s type is `MaybePromise`. No assertion changed.
- **`+page.svelte` and `+error.svelte` need nothing.** The error page already renders `species.suggest` as "Did you mean … or …?", and the genus line it shows stays true.

### P: `requestPersistence` and the labels cell (P.md section 2)
- **`src/lib/db/vault.ts`.** `requestPersistence` only reads `persisted()` now, as P's patch says. The one caller passes `ask` false, so no caller changes. With this, `r69p-about-seams`' "no persist() call anywhere but keep-ask.ts" passes.
- **`src/routes/labels/+page.svelte`.** `careCell` says "the sheets could not be read just now" for `unread`, with P's comment.
- **The fold guard (`tests/unit/fold-rules.test.ts`).**
  - I diffed the merged `vault.ts` and `collection.svelte.ts` against R's copy:
    - `collection.svelte.ts` is R's, unchanged;
    - `vault.ts` adds X's pending-replace flag (`replaceWaitingSeen`, `replaceWaiting()`) and the `requestPersistence` change, beside R's `requireMeta`;
    - `log.ts`, `hlc.ts`, `engine.svelte.ts` and `limits.ts` equal R's.
  - The source hash was re-recorded under `FOLD_RULES` 7, as `62babe022098fab52c95f9ad308d4538`, after R's entry, following R's convention. The added reason reads: "re-recorded at the merge of round sixty-nine for vault.ts: the seed's requireMeta, the pending-replace flag (X4) and requestPersistence no longer asking (P5): no fold behaviour change, and the behaviour hashes hold".
  - Both behaviour hashes (`RECORDED_FOLDS`, `RECORDED_PARKS`) pass unchanged. `FOLD_RULES` was not raised.

### R: the refused database on three more pages (R.md section 2)
These were not in my list, but they are needs for files R did not own, and without them triage R3 ("Every page shows a refused database") was not true.
- **The pages.** R's patch was applied to `places/+page.svelte`, `places/[id]/+page.svelte` and `labels/+page.svelte`. Each waiting line is now `<Opening />`.
- **The test.** `AT_MERGE` in `tests/unit/r69r-opening.test.ts` is emptied, as R said it may be. The test is now stricter: no page is excused.

### K: the seam test, NOTICE and the export (K.md)
- **`tests/unit/r69k-index-seam.test.ts`.** Copied from K's copy. It passes against the merged `build-dossiers.ts` and `build.ts` without change.
- **`NOTICE` and `scripts/export-corpus-lib.ts`.** K's two patches applied cleanly.
- **`scripts/build-dossiers.ts`.** As K asked, the `--prune-uncredited` usage comment now also names Commons' "Own work", "See above", "Unknown author", a bare "(talk)" and an address.

## 2. The about pages

**How they were edited.** One script made 49 replacements, each required to match exactly once. Replaying it on the pre-edit copies gives the final files byte for byte. The pages remain free of em dashes, and their spelling is British.

**How the agents' sentences were combined:**
- **W's sentences replace P's own wording** of S-E 1, 2 and 5 and of the cached 404 and 302, as P3 says:
  - how line 90's sentence and list item;
  - how line 95's server copies clause, the old-name key and the 404/302 clause;
  - the network parenthesis, moved to W's place among the address keys;
  - formats' listing budget.
- **K and M both rewrote the photographs sentence on how line 36.** It is now one sentence with both meanings:
  - K's order and licences;
  - M's "whose files are not counted towards the six" and "a GBIF photograph whose own media item states no licence is not published under its record's".
- **The Commons host clause on line 95** names K's widths, as P.md asked.
- **On formats#sample, X's seed sentence keeps P's "one commit (one transaction of the database, holding every change of the example)".** X's claim clause is added to it, reworded to match the merged code. The seed's commit always requires that no seed's mark is present; it requires the claim only without Web Locks (`demo-seed.ts`).

**Where I changed an agent's wording so that it is true of the merged code:**
- **The not-found answer's five minutes.** W's "an address the reference does not hold is answered 'not found' … for five minutes" now adds "(not when GBIF could not be asked)". The code answers `no-store` then. P's own clause had said so.
- **N's 404 in the cache list.** On line 95, the cached not-found item also names N's case: "or with the two species or more that hold it as an older name".
- **N's request-list parenthesis** is merged with the existing "(the answer is kept at the edge for a day)".
- **W2 and W5's hourly counts** sit after the storage allowance's removal note, so that note still reads as the size's. "(two numbers and the hour)" became "(each a number and its hour)", because the two counts are two `{ h, n }` records.
- **X's Keep sentence** says "on the propagation form, all but the parent plant, which is the example's". This follows `propagation/new`'s `draftOf`. The first wording, "a batch's form", tripped r62bw's "log batch" rule.
- **The intro clause of W's line-95 sentence** says "a hash group's sheets", not "figure sheets". r62w's lifetime check reads "a hash group's figure sheets" as the start of an item.
- **X's generation sentence** reads "Every Leave that is not called off, and every deletion of the example", which is what `demo.ts` does.
- **X's empty definition, the top bar's "Example", the one-use token, Keep, the leftover's 30 days and "a page with something typed on it is not sent away"** were each checked against `example.svelte.ts` (`ownEmpty`), `app.html`, `keep-draft.ts`, `DemoBar.svelte` and `demo.ts`.
- **M's Wikidata sentence** says "when Wikidata finds no item that does". This is the code's own comment, and it keeps "the one item … which carries the species' GBIF key" from contradicting itself.
- **M's request paths were not added.** The how page does not list the corpus build's requests by path, which is the condition M gave.

**Checked against the code:**
- every worker cache key (`workerKey` in the five files);
- the lifetimes (`max-age` 300, 3600 and 86400);
- the 404's `no-store` when GBIF is unchecked;
- `storeOnce`'s early answer (200 "already there", 409, 403);
- `VAULT_WRITES_PER_HOUR`;
- the engine pulling past a push's Retry-After;
- `listAsk`'s reserve;
- `COMMONS_PX` (120, 250, 500, 960) and where each size is used;
- `ENGLISH_USE`;
- the search's `commonTie`, `olderOrder` and `FAMILY_START`;
- the licence tags (`cc0`, `pd`, `by`, `by-sa`);
- `fn:` in the counters;
- `clockStored` as the snapshot key.

**Not re-derived:** R's import and clock sentences, and K's kind list. Both rest on the agents' own tested code; I checked that they match their reports.

### Every sentence changed, before and after

#### /about/how

- **N naming: tie-break.**
  - Before: then a name GBIF marks preferred (a flag one dataset sets, so it only breaks a tie), then GBIF's own order;
  - After: then a name GBIF marks preferred (a flag one dataset sets, so it only breaks a tie), then the alphabet, as GBIF lists a species' names (capitalised spellings before lower-case ones);

- **N naming: genus words English uses.**
  - Before: (agave, aloe, amaryllis, cereus, crocus, haworthia, iris, lotus, mimosa and yucca: "Lace aloe", "Autumn crocus" and "Zebra haworthia" stay,
  - After: (acacia, agave, aloe, amaryllis, anemone, aralia, cereus, crocus, geranium, haworthia, iris, lotus, mimosa, petunia, verbena and yucca: "Lace aloe", "Autumn crocus", "Zebra haworthia", "Tree anemone" and "Rose geranium" stay,

- **N naming: spellings.**
  - Before: Of a name's spellings, one without a full stop at the end is shown before one with it, then, where some source writes it open, a name ending in plant, tree, lily, daisy, palm, fern, cactus or orchid is shown open ("Zebra plant", not "Zebraplant"), then the one more sources give (so "Milkweed" and "Nannyberry" stay whole), its hyphens chosen the same way, then GBIF's first.
  - After: Of a name's spellings, one without a full stop at the end is shown before one with it, then, where some source writes it open or hyphenated, a name ending in plant, tree, lily, daisy, palm, fern, cactus or orchid is shown so ("Zebra-plant", not "Zebraplant"), then the one more sources give (so "Milkweed" and "Nannyberry" stay whole), then, given by as many, one written open or hyphenated before one written closed ("Swamp-mahogany", not "Swampmahogany"), its hyphens chosen by their sources too, then GBIF's first. A name's other spellings are not shown, but the search reads them, so "blue mink" finds Ageratum houstonianum, shown as "Bluemink".

- **M range under older names.**
  - Before: A name Kew holds no entry for is looked up under the species' older names (Kew files GBIF's Bisnaga glaucescens as Ferocactus glaucescens, and spells Aeonium tabulaeforme tabuliforme); a range found so is taken only when those names lead to exactly one accepted Kew entry, and the page names the entry it came under.
  - After: Names are compared without the hybrid sign, so GBIF's Lantana strigocamara is Kew's Lantana × strigocamara. A name Kew holds no entry for at all is looked up under the species' older names (Kew files GBIF's Bisnaga glaucescens as Ferocactus glaucescens, and spells Aeonium tabulaeforme tabuliforme); a name Kew holds with no native range is Kew's answer, and is not looked up further. An older name counts only where its author is the author of Kew's entry for it, and a synonym GBIF marks pro parte is not used. A range found so is taken only when the older names lead to exactly one accepted Kew entry, with a range or without, at species rank; the page names that entry and the older name that reached it ("Kew's entry Erythrina afra Thunb., reached by Chirocalyx pubescens Walp."), and older names that lead to more than one entry are said as not taken.

- **M iNaturalist and GBIF synonyms.** Added after "and the answer is taken only when it is one item or one taxon.":
  > From iNaturalist a taxon is taken only when its own name is the species' name or one of those older names, and never one this reference holds as another species; its name search is limited to plants. GBIF's synonyms are read to the end of the list; a list cut short, refused or failed is no answer for these older names, and the page says they were not asked.

- **M Wikidata by name, iNaturalist ids, kept identifiers.**
  - Before: from the item that carries the species' GBIF key, or, when no item does, the one whose label is the name exactly.
  - After: from the item that carries the species' GBIF key, or, when Wikidata finds no item that does, the one item whose label is the name exactly and which carries the species' GBIF key or that of an older name with the same type, or, carrying no GBIF key, gives the name as its taxon name. Every iNaturalist taxon id, from Wikidata or kept from the previous build, is checked with iNaturalist; an id iNaturalist has made inactive is followed to the one current taxon it names, and otherwise the name is searched. When Wikidata does not answer, the identifiers of the build that last read them are kept, for at most 90 days, and the page names that build.

- **M Wikipedia redirects.** Added after "t, quoted as written, kept visibly separate and credited, with a link where more followed.":
  > An article Wikipedia reaches through a redirect is quoted only when its title is the Wikidata item's own English sitelink, the species' name or one of its older names; otherwise the page records that Wikipedia redirects the one title to the other, and quotes nothing.

- **K order, licences, credits, kinds and lead; M order and GBIF licence.**
  - Before: then from Wikimedia Commons, and last, for a species the download does not hold and the others gave fewer than six, from GBIF's records under an open licence (CC0 or CC BY); every photograph is restricted by its own licence to CC0, CC BY and CC BY-SA, whatever dataset it came through, and each carries its licence, and its author where the source names one (a CC0 photograph without one says so; under CC BY and CC BY-SA a photograph without an author is not published).
  - After: then, for a species the download does not hold and iNaturalist gave fewer than six, from GBIF's records under an open licence (CC0 or CC BY), and last from Wikimedia Commons, whose files are not counted towards the six; every photograph is restricted by its own licence to CC0, public domain, CC BY and CC BY-SA, whatever dataset it came through (a GBIF photograph whose own media item states no licence is not published under its record's), and each carries its licence, and its author where the source names one (a CC0 or public-domain photograph without one says so; under CC BY and CC BY-SA a photograph without an author is not published). A photograph in the public domain is labelled "Public domain", never CC0, which is a waiver only an author can make. Commons' licence is read only from its short names CC0, CC BY, CC BY-SA, Public domain and PD; a file under any other, such as Commons' own "Attribution", is not shown. A Commons file's author is its Artist field, with its first line taken, never its source ("Own work"); "See above", "Unknown author", a bare "(talk)", an address and a derivative work's maker alone are not authors, and Commons' "No machine-readable author provided. X assumed" names X. A Commons file is shown only as a JPEG or WebP photograph whose name, or on a new answer whose categories, marks it as none of these: a map, a herbarium sheet or specimen, a plate or drawing, seeds, resin, a stamp, a book or a label, an unknown or unidentified plant, a hybrid, a plant named "aff." or "cf.", or another species of its genus or of an older name's genus. Of the rest, files whose name holds the species' epithet come first. The lead photograph is iNaturalist's wild one first, then GBIF's, then iNaturalist's cultivated, then Commons', so a Commons file leads only a page with no photograph from iNaturalist or GBIF.

- **K Commons sizes.**
  - Before: A Commons photograph is loaded at its 960-pixel version (its 500-pixel one on a tile), never the original upload, unless the upload is narrower than that; one whose page holds no such version is not shown.
  - After: A Commons photograph is loaded at whichever of Commons' own versions the place needs: 960 pixels wide for the lead (500 on a phone, or where the screen needs no more), 500 on a gallery tile, 250 on a front-page tile and 120 in a catalogue row or beside a genus. It is never loaded as the original upload, unless the upload is 960 pixels wide or narrower, when it is shown at its own width. One whose page holds no such version is not shown.

- **M not taken: two items answered.** Added after "or a source a build did not ask, is "not asked".":
  > A source that answered with two records where the rule takes one (two Wikidata items, two iNaturalist taxa, two Kew entries reached by older names) is said as "not taken: two items answered", and nothing is taken from it.

- **N search: an older name typed.**
  - Before: ("Opuntia longispina" is Airampoa corrugata, before the species that has a variety of that name);
  - After: ("Ferocactus glaucescens" is Bisnaga glaucescens), the species that keeps the name's epithet first, then the one that shows the name among its six ("Aloe variegata" is Gonialoe variegata before Aloe vera);

- **N search: families from their start.**
  - Before: (a family is matched only by a whole word, so "plant" is never the start of Plantaginaceae)
  - After: (a family is matched by a whole word, or from its start by a word of six letters or more, so "aizoac" finds the Aizoaceae while "plant" is never the start of Plantaginaceae)

- **N search: ties.**
  - Before: Within each, a name that is exactly the query comes first (the common name shown before the others), then a match of whole words, then the alphabet, so "fig" is Ficus carica, "Fig", before Colchicum figlalii.
  - After: Within each, a name that is exactly the query comes first (the common name shown before the others), then a match of whole words, then a match whose shown common name holds every word; among the common names' matches, a tie goes to the species whose matching name comes earlier among its names, then to a name written as typed, then to the species with more photographs ("jade plant" is Crassula ovata before Crassula arborescens, both "Jade plant", and "bleeding heart" is Lamprocapnos spectabilis, "Bleeding heart", before Dicentra formosa, "Bleeding-heart"); then the alphabet, so "fig" is Ficus carica, "Fig", before Colchicum figlalii. Apostrophes are taken out of a word before it is read, so "devils backbone" is "Devil's backbone".

- **N search: an older name of two species at a species address.** Added after "ackbone gives a species at species rank is searched, though its entry carries six to show.":
  > A species address under an older name goes to the species that shows it among its six, or to the one species that holds it; a name two species show, or that two hold only for the search, goes to neither, and the page says it is an older name of those species and names them.

- **W cache summary (replaces P's wording).**
  - Before: Cloudflare's edge keeps copies of public answers, linked to no address, each under its full web address; the requests the app's pages make name the app's version in that address, and the server's own copies of a search, a hash group's sheets, a name, an old-name check and a forecast are kept under the app's version too, so a new version is never answered from an old one's copies.
  - After: Cloudflare's edge keeps copies of public answers, linked to no address, each under its full web address, and the server keeps its own copies of searches, figure sheets, name lookups, forecasts and old-name checks under keys that name the app's version; the requests the app's pages make name the app's version in their address, so a new version is never answered from an old one's copies, except two answers to a species address, which names no version: an address the reference does not hold is answered "not found" from the edge's copy for five minutes (not when GBIF could not be asked), and an older name's redirect to its species for a day.

- **W cache summary list (replaces P's wording).**
  - Before: a species address that is an older name, as its move to the species' page, for a day, and one the reference does not hold, as its "no species page", for five minutes;
  - After: a species address the reference does not hold, answered "not found", for five minutes, and the redirect from an older name to its species' page for a day;

- **N requests: an older name of two species is not asked.**
  - Before: which the server asks the backbone about once, in case it is an older name for a species that is there (the answer is kept at the edge for a day);
  - After: which the server asks the backbone about once, in case it is an older name for a species that is there (never an older name two species of the reference hold, which the page names without asking; the answer is kept at the edge for a day);

- **K Commons host clause.**
  - Before: Wikimedia Commons (upload.wikimedia.org, at the 960- and 500-pixel sizes, or at a file's own size when it is narrower)
  - After: Wikimedia Commons (upload.wikimedia.org, at its 120-, 250-, 500- and 960-pixel sizes, or at a file's own size when it is narrower)

- **W1 the network beside each vault's place.** Added after "recorded once half the day's places are taken, for the operator, in that object and in KV;":
  > for each vault that takes a place, the network (/24 or /48) it was counted to, beside the vault's id, kept with the day's counts, so a place given back on its day is given back to that network, and dropped with them;

- **W1 replaces P's parenthesis on the network.**
  - Before: so a vault is counted once (the network the upload that took its place came from is kept apart, under that day, and dropped with the address keys, so a place given back that day is given back to that network's count) and a place left unused
  - After: so a vault is counted once and a place left unused

- **W2, W5 the hourly counts.**
  - Before: with a note of each removed object for two days so its size is given back once, and when each photograph's name was last claimed
  - After: with a note of each removed object for two days so its size is given back once, how many objects it stored and how many pages of its log were listed in the current hour (each a number and its hour) for the hourly limits, and when each photograph's name was last claimed

- **W3 the server's own copies (replaces P's wording).**
  - Before: which on the requests the app's pages make names the app's version, and the server's own copies under the app's version as well, so a new version is never answered from an old one's copies:
  - After: which on the requests the app's pages make names the app's version, and the server's own copies of a search, a name, a forecast, an old-name check and a hash group's sheets are kept under the app's version too, so a new version is never answered from an old one's copies, except the two answers to a species address below, whose address names no version:

- **W3 the old-name check's key.**
  - Before: a species address the backbone was asked about for a day, keyed by the app's version and the address;
  - After: a species address the backbone was asked about for a day, keyed by the app's version and the name in lower case;

- **W the cached 404 and 302 (replaces P's clause).** Removed:
  > the page's answer to such an address, a move to the species' page for a day when it is an older name, and "no species page" for five minutes when the backbone answered that it is not;

- **W the cached 404 and 302, before the sitemaps.**
  - Before: keyed the same way; the sitemaps, robots.txt and the two world maps for a day;
  - After: keyed the same way; a species address the reference does not hold, answered "not found" (with what the old-name check found, or with the two species or more that hold it as an older name), for five minutes (public, max-age=300; not kept when GBIF could not be asked), and the redirect from an older name to its species' page for a day (public, max-age=86400), each under the page's address alone, which names no version, so for that long a new version can give the answer the version before it gave; the sitemaps, robots.txt and the two world maps for a day;


#### /about/formats

- **R3 unreadable changes kept apart.** Added after "while there are any, no snapshot is written.":
  > It stays in the log: a backup carries it apart, as it is, in unreadable.json, and the restore preview, the sheets and sync's push leave it out, so a backup made or opened on the device, and every batch it sends, holds every change that can be read.

- **R3 the backup file block.** Added after "changes.json a JSON array of changes, the whole log, as above":
  > unreadable.json the changes in the log this version cannot fold (a kind it does not know, a broken stamp, a field the record owns), as they are; absent when none

- **R3 a change a backup cannot read.** Added after "This version reads all three.":
  > A change in either file that this version cannot read is left out and named; a merge leaves it in the file, and a replace is refused, as it would lose it. A file none of whose changes can be read is refused.

- **R4 a resumed replace announced.** Added after "finishes at a later load when there is room.":
  > The other open tabs are then told, and reload onto it.

- **R2 the slow clock (1).**
  - Before: While unconfirmed, a positive correction of more than two days is not in force: the device stamps by its own clock until the first reading confirms it (one refold then), so an edit made offline after a slow clock was set right lands behind, which parks nothing.
  - After: At a page load, and after a move of the device clock forward past it, a positive correction of more than two days is not in force until a reading confirms it: the device stamps by its own clock (one refold when the reading comes), so an edit made offline after a slow clock was set right lands behind, which parks nothing. Meanwhile the clock does not count as confirmed, so another device's change far past it is held, never parked, and an edit made in sight of a field is placed past the field's newest stamp, a held change included, up to a day past the device's clock plus the stored correction. A reading that disagrees, or a move of the clock shorter than the correction (a sleep), never takes a confirmed correction out of force.

- **R2 the slow clock (2).**
  - Before: (a device still slow then stamps behind until the reading, and an edit made in sight of a field is placed past the field's stamp as always).
  - After: (a device still slow then stamps behind until the reading, and an edit made in sight of a field is placed past the field's newest stamp, another device's held change included, so it still wins once the reading comes).

- **R2 the slow clock (3).**
  - Before: the correction stays in force and stored meanwhile, so every tab and the next page load stamp alike.
  - After: the correction stays in force and stored meanwhile, so every open tab stamps alike (a page loaded meanwhile holds a positive correction of more than two days out of force until its own reading, as every load does).

- **R2 the snapshot's key.**
  - Before: or under another clock correction or with the clock confirmed where it is now not, or the reverse (every hold was judged by the old clock, and whether it was confirmed decided which verdicts were kept).
  - After: or under another stored clock correction, or with that correction confirmed by a reading where it is now not, or the reverse (the stored correction, not the one in force: a snapshot written once a large correction was confirmed is read by the next page load, which holds that correction out of force until a reading, and what that load holds it judges afresh by its own clock).

- **R1 the import key.**
  - Before: each plant an import adds carries its line's import key, and running the same sheet again, or the sheet saved again by a spreadsheet or given a column, leaves out every line whose plants are all here, removed plants included, and offers only the missing plants of a line partly added, numbered on in the sheet's pattern; a line whose number a plant here holds under the same name (the number compared without its leading zeros) looks already imported, and is skipped unless you add it anyway;
  - After: each plant an import adds carries its line's import key, and running the same sheet again, or the sheet saved again by a spreadsheet or given a column, leaves out every line whose plants are all here, removed plants included, and offers only the missing plants of a line partly added, numbered on in the sheet's pattern; the key reads a date by its exact day (2024-01-05 and 2024-05-01 are two lines), and a date cell that reads either way round (09/03/2024) by its year with day and month in either order, which also finds a plant filed under either reading; it reads the notes as the plant gets them, the columns no field takes included, and a price as its amount (12.50 and 12.5 are one); a column added to the sheet leaves a line found when no other line of the sheet differs from it only there; a plant an earlier version's import filed is found by that version's key only when its own date acquired and notes agree with the line; a line whose number a plant here holds (the number compared without its leading zeros) under the same name, or under any name when an import filed that plant (a name corrected since), looks already imported, the line naming that plant when its name differs, and is skipped unless you add it anyway;

- **W2 the listing budget (replaces P's wording).**
  - Before: (1,200 pages of a thousand log batches an hour, counted in the vault's counter object, which sets fifty pages aside as each listing begins and gives back what it did not use, so listings made at once are counted before they run)
  - After: (1,200 pages of a thousand log batches an hour, counted in the vault's counter object, where each listing's most pages, 50, are counted when it is asked and what it did not use is given back, so listings under way at once count too)

- **W5 a vault's writes an hour.** Added after "the device receives again then, and its uploads go on meanwhile.":
  > A vault that has stored 3,600 log batches and photographs in an hour (counted in its counter object) has its next upload answered 503 with Retry-After to the end of the hour and "Uploading is refused for now: …"; the device keeps every change, sends it then, and keeps receiving meanwhile.

- **W4 a proof that does not match takes no hold.** Added after "t lands after another device removed the record is removed once its claim is two days old.":
  > An upload whose proof does not match is answered at once (200 for the same bytes, 409 for others, 403 for a removed photograph) and holds the photograph's name for no time at all, so it cannot keep a removal waiting.

- **K licence tags in a dossier.**
  - Before: extremes, photographs with author and licence, the summary
  - After: extremes, photographs with author and licence (licence is cc0, pd, by or by-sa; pd, public domain that is not a CC0 waiver, since October 2026, and a dossier built before tags a Commons file "Public domain" cc0, which the site reads as pd), the summary

- **K the index's photos count.**
  - Before: (absent when they cannot be said short and true), and changed
  - After: (absent when they cannot be said short and true), photos, which counts the photographs the species page shows, and changed

- **K rule 4 for the corpus.**
  - Before: The corpus is built from public data under CC0, CC BY and CC BY-SA;
  - After: The corpus is built from public data under CC0, public domain, CC BY and CC BY-SA;

- **N the search order.**
  - Before: within each, a name that is exactly the query, then whole words, then the alphabet.
  - After: within each, for an older name the species that keeps its epithet and then the one that shows it; a name that is exactly the query, then whole words, then a match whose headline holds every word; among common names, the matching name's place among the species' names, then a name written as typed, then more photographs; then the alphabet. Apostrophes are taken out before a name is split into words, and a family is matched whole, or from its start by a word of six letters or more.

- **X empty excludes a pending replace and unreadable changes.**
  - Before: no change waiting for this device's date or parked; and no sync set up;
  - After: no change waiting for this device's date or parked; no replacement from a backup waiting to finish, and no change this version could not read; and no sync set up;

- **X3 Keep carries everything typed.**
  - Before: leaves for the same form in your own collection, with the species or the place's name typed.
  - After: leaves for the same form in your own collection, with everything typed on it: every field (on the propagation form, all but the parent plant, which is the example's), kept for that one move in the tab's session storage (read once by the form and taken off; nothing typed goes in the address), and the place by its name and kind (your own place of that name is picked, or the place picker's New… opens with it filled in); the form's own "Leave site?" is not asked.

- **X8 the top bar says Example.** Added after "The example's bar says that nothing added in it is kept.":
  > While a page shows the example, its top bar says Example.

- **X1 the one-use token.**
  - Before: (?left=sample, read by the page's first script and then taken off the address), and the first page there deletes the example, once every other example tab has let it go; the address only takes a tab out of the example, and only Leave itself marks the example for deletion, so a copied link, a bookmark or the history deletes nothing,
  - After: (?left= and a one-use token Leave writes in the tab's session storage, read by the page's first script and then taken off the address), and the first page there deletes the example, once every other example tab has let it go; the address takes a tab out of the example, and marks the example for deletion only when its token matches the one Leave wrote in that same tab, so a copied link, a bookmark, the history or another tab's address deletes nothing,

- **X6 the seed's commit checks its claim and mark (with P's "one commit").**
  - Before: by one tab at a time (a browser lock named cultifolio-sample-seed; without these locks, a claim in its own database that lapses after a minute), and that same commit marks it as set out
  - After: by one tab at a time (a browser lock named cultifolio-sample-seed; without these locks, a claim in its own database that lapses after a minute and that only the tab holding it clears), and the commit is refused, setting out nothing, when the example already holds a seed's mark or, without the locks, when the claim is no longer that tab's; that same commit marks it as set out

- **X2 the leftover offered until answered, deleted after 30 days.**
  - Before: offered back once on the next page ("You left an example collection with 3 records you added or changed there", with Open it and Delete it; noted in its database as demoOfferedSeq).
  - After: offered back on each page until it is answered ("You left an example collection with 3 records you added or changed there", with Open it, Delete it and Not now; Not now is noted in its database as demoOfferedSeq, and it is not offered again until it changes); one in which nothing has changed for 30 days is deleted, answered or not.

- **X2 the generation.** Added after "a tab that learns it from the database instead does the same.":
  > Every Leave that is not called off, and every deletion of the example, also writes a new generation to local storage (cultifolio.sampleGen); a tab that was away when another left (another site in it, a page kept in the browser's history, a tab the browser put away) compares it with the one it opened the example under and opens your own collection on its next load, saying why.

- **X9 a page with something typed is not sent away.**
  - Before: never opens the example's database again: if it asks "Leave site?" and is answered Cancel, it stays as it was drawn,
  - After: never opens the example's database again; a page with something typed on it is not sent away: it stays as it was drawn,

## 3. Tests changed, and why

Each update follows a change the triage decided. No test was deleted, and no assertion was loosened without a reason given here.

- **`tests/unit/fold-rules.test.ts`.** The source hash was re-recorded under 7, with its reason (section 1). The behaviour hashes are unchanged.
- **`tests/unit/r69r-opening.test.ts`.** `AT_MERGE` is emptied now that R's three page patches are in, so the test is stricter.
- **`tests/unit/r67v-seed.test.ts`.** X's version pinned X's own `putWith` options (`requireAbsent`) and a stand-in `putWith` that resolved to nothing. The merge put X6 on R's API (`requireMeta`, resolving to `PutResult`), and `demo-seed.ts` reads `put.ok`.
  - The stand-in now resolves `{ ok: true }`.
  - The expected sixth argument is `{ meta, markLast, requireMeta: [{ key: SEED_MARK, absent: true }] }`. With Web Locks there is no claim, so there is no claim condition.
  - Same checks, in the merged API's form. Triage X6 (with R).
- **`tests/unit/r62w-words.test.ts`.** The Provenance footer now reads "refused, failed, not been asked, or answered twice where one answer is taken". This is M's need (4), for M8's `ambiguous` status. The test still requires "not been asked".
- **`tests/unit/r67p-about-seams.test.ts`.** The pinned "What comes from where" Wikidata sentence is M7's new rule, written out whole. A code check is added that a name hit is proved by its key, a same-type key, or its taxon name (P225). The old code check stays.
- **`tests/unit/r61w-about-seams.test.ts`.** The snapshot-key assertion pinned "with the clock confirmed where it is now not". R2 changed the key to the stored correction (`clockStored`), and R's sentence says so. The test now matches R's wording, and it also checks that `collection.svelte.ts` keys the snapshot by `clockStored()`. Triage R2.
- **`tests/unit/r69p-about-seams.test.ts`.** The two Commons fixtures had ids "c1" and "c2" and bare authors, a form the build never writes. K's read-time rule (K1, K2) drops such files, so the sizes test found no Commons photograph ("expected 0 to be greater than 0").
  - They now use the build's form: the file title as id, and "<author>, <short licence>, via Wikimedia Commons". K made the same change to `corpus-r60`.
  - What is asserted is unchanged. The image-policy test now covers Commons addresses again.
- **`tests/unit/r69p-species-ambiguous.test.ts`.** The helper parameter type was changed for svelte-check only (section 1).

**New test files:**
- `r69w-power.test.ts` (W);
- `r69p-species-ambiguous.test.ts` (N);
- `r69k-index-seam.test.ts` (K).

## 4. Runs

- **Before the needs:** 301 files, 2,661 passed, 7 failed, 1 skipped. The failures:
  - `r69p-about-seams`: 3 (sizes and persist);
  - `r67v-seed`: 3;
  - `r62w-words`: 1.
- **Final unit suite** (`npx vitest run`): 304 files, 2,674 passed, 1 skipped, 0 failed.
- **`npx svelte-check --threshold error`:** 1,047 files, 0 errors, 0 warnings.
- **Playwright:** not run.

## 5. Not resolved

- N's fallback search-key patch for W was not needed, since W keys every Worker cache by the build.
- X's need for P on `tests/e2e/r67v-example.spec.ts` (the Keep URL) came in with the merge from X's copy. It was not run here: no Playwright.
