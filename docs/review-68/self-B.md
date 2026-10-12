# Self-review B, rounds sixty-seven and sixty-eight: photographs, sources, licences, credits

Copy: `/tmp/rv68/B` at 1609c19. Reproductions: `tests/unit/zz-rv-b-photos.test.ts` in that copy (7 cases, all passing, each printing what the page would say). GBIF findings were checked against the live API from the sandbox; Commons refused the sandbox (429, as expected), so Commons facts are the owner's corpus evidence plus fixtures in Commons' answer shape.

Rules 1 and 4 are the ones at stake. The owner's corpus counts (894 species, 4,450 Commons photographs, 145 suspect titles in 113 species, 31 of them leads, 217 "Public domain" tagged cc0, 108 odd attributions) are taken as given.

## Findings

### B1. Commons' category answer is published with no test that a file is a photograph of the plant (launch, confirmed)

- **Where:** `src/lib/dossier/sources/wikimedia.ts:183-222` (`commonsPhotos`). The only tests are an extension of jpg, png or webp (line 197) and the licence. `commons-fill.ts:41-44` appends whatever comes back, and the build does too (`build.ts:387-392`).
- **What it does:** every file in `Category:<name>`, in Commons' sort order, is a "photograph" of the species. A distribution map, a herbarium sheet, a plate from Curtis's Botanical Magazine, a stamp, a seed, "Unidentified flowers in Eswatini" and another species' map are all shown. The sort order also decides which file leads a page that had no photograph: "1 Gasteria species - Distribution map" sorts first in three Gasteria categories. 31 of the 145 are leads.
- **Against the rules:** the hero's alt says "<species>; photograph <credit>" (`species/[slug]/+page.svelte:65`), and `og:image` sends the map to link previews (line 329). Rule 1 needs every element on the page to be a labelled reading of a fixed rule, and "a photograph of Nepenthes platychila" is false of a map. Under rule 3, a file another species' name is filed under (Nepenthes junghuhnii's map under N. singalana; "Manfreda aff. jaliscana") is a match the rule never made.
- **Reproduction:** in the zz test, "a distribution map PNG is taken, and leads a page that has only cultivated iNaturalist photographs" passes: a CC BY-SA file named "Nepenthes platychila distribution.png" comes back as a photograph and wins `heroOf`.
- **The options weighed:**

| Test | Extra requests | Catches | Costs |
|---|---|---|---|
| Extension or MIME: JPEG (and WebP) only, no PNG | none (`iiprop=mime` rides on the same request) | 50 of the 145, including 4 leads in the brief | a few real PNG photographs |
| Deny-list on the title, word-bounded | none; works offline on stored titles (`Photo.id` is `File:…`) | every example in the brief | "specimen" also names live specimens, and "seed" photographs are true photographs; misses a drawing named "Agave spicata 01.jpg" |
| Title names another binomial of the same genus that is not the species or a same-type synonym; or "aff." / "cf." | none, offline | junghuhnii under singalana, Manfreda aff. | needs the synonym list, already in the dossier |
| Commons categories: `Categories` added to `iiextmetadatafilter`, or `prop=categories&clshow=!hidden` | none on the same request; about 90 to re-ask the corpus (50 titles a request) | maps, herbarium, illustrations, stamps and books filed in categories with neutral file names; also garden and cultivation categories (see B2) | free-text category names, so it is a second deny-list, not proof |
| Structured data: P180 depicts the species' QID, P31 map or illustration | one `wbgetentities` a species (50 M-ids), about 900 to 3,200 more Commons calls at its rate limit | the few files that carry it | coverage is patchy, so a missing statement says nothing; it cannot be a gate |
| Require the species name in the title | none | "Unknown asphodelaceae", "Unidentified flowers" | drops camera-named files (DSC_…, IMG_…) and files named under synonyms: too strict for the gallery |

- **What I would adopt:**
  1. JPEG or WebP only.
  2. A title deny-list: `distribution|range of|range map|\bmaps?\b|herbari|specimen|isotype|holotype|museum|\bplate\b|\btab\.|curtis|botanical magazine|illustrat|drawing|engraving|lithograph|\bbook\b|stamp|\bseeds?\b|unknown|unidentified|\baff\.|\bcf\.|\blabel\b`.
  3. "Names another species": a `Genus epithet` in the title, for the species' genus or a same-type synonym's genus, whose epithet is not the species' or a synonym's.
  4. `Categories` in the extmetadata filter, with the same deny-list over category names. It costs no request.
  5. Name-in-title only as a condition for a Commons file to lead, never to be shown.
  6. Raise `gcmlimit` from 24 to 50 (same request), so filtering still leaves up to 12.
- **Not adopted:** P180, which costs the most requests and decides the least.
- **Cleaning the 4,450:** most of it can be done offline:
  - Put the title, extension and other-species tests in one function, `commonsKind(title, name, synonyms)`, applied in `commonsPhotos`, in `safeUrls` (`schema.ts:281`, where `mendCommonsThumb` already runs at read time) and in the index scan (`scripts/build-dossiers.ts:181-191`). The pages are then put right by the deploy, and the tiles and counts by `--index` and an upload, with no rebuild and no request.
  - The category test needs a re-ask of about 90 requests (`titles=` 50 at a time). Write its output as a list of file titles to drop, removed from the dossiers by a one-off script.
  - `/about/how` should then say that a Commons file whose name, type or category marks it as a map, drawing, herbarium sheet, stamp or another taxon is not shown.

### B2. Which photograph leads: a Commons file is read as "not captive", and the build puts Commons ahead of GBIF (should, confirmed)

- **Where:** `src/lib/dossier/dedupe.ts:27-30` (`heroOf`) and `build.ts:365-399`, against `commons-fill.ts:43` and `build.ts:92-97` (`mergeGbifPhotos`).
- **heroOf:** it keeps `!p.captive`, so a Commons or GBIF file, which carries no flag, counts as wild and leads over every iNaturalist photograph marked cultivated. That is not a true reading of a Commons photograph. Many are taken in botanic gardens: the fixture's own file, "Crassula socialis - Kaisaniemi, Helsinki", is from Helsinki's botanic garden. The page does not print "observed growing wild" for these (it tests `captive === false`, `+page.svelte:365`, `Photos.svelte:29`), so nothing false is printed. But the ordering acts on the false reading.
- **The ordering:** the fill appends Commons after GBIF, so the round's claim that "the lead photograph stays" holds for the fill. The build orders the array iNaturalist, Commons, GBIF, so at the next online build a species with no open iNaturalist wild photograph gets Commons' first file as its lead, ahead of GBIF's observation photographs.
  - That contradicts `/about/how` ("Photographs come first from the media that GBIF's occurrence download carries … then … Wikimedia Commons").
  - Outside the download, GBIF media is asked only when iNaturalist and Commons gave fewer than six (`build.ts:395`). So twelve uncurated Commons files can stop GBIF's research-grade photographs being asked at all.
- **Reproduction:** the zz test's "build order … gives a Commons file the lead" case:
  - `heroOf([commonsMap, gbifPhoto])` is the map.
  - `heroOf([gbifPhoto, commonsMap])` is the GBIF photograph.
  - So the lead depends on which path wrote the dossier.
- **Smallest fix:**
  1. In `heroOf`, rank by source as well as flag: `captive === false`, then GBIF, then iNaturalist cultivated, then Commons. A Commons file leads only when nothing else exists, and then only one that passes B1's lead test.
  2. In `build.ts`, push GBIF media before Commons, and count only non-Commons photographs towards the "fewer than six" that decides whether GBIF is asked.
  3. Optionally, set `captive: true` on a Commons file whose title or category names a botanic garden, a greenhouse, a nursery or cultivation. It costs nothing once `Categories` is fetched.
- **Trade-off:** a species with only cultivated iNaturalist photographs and one real habitat photograph on Commons leads with the cultivated one, labelled "in cultivation". That is true, which the current lead may not be.
- **GBIF media:** it carries no cultivated flag either. `degreeOfEstablishment` and `establishmentMeans` are on the record `media()` already reads (`gbif.ts:245-256`), and could set `captive` the same way. Pl@ntNet's observation dataset, made up largely of garden plants, is the second largest source of open media for Cactaceae, Crassulaceae and Amaryllidaceae (live facet: 40,719 records for those three families).

### B3. A CC BY or CC BY-SA Commons file with no author is published, credited "Own work" (launch, confirmed)

- **Where:** `wikimedia.ts:201-202`.
- **What it does:** `meta.Artist?.value ?? meta.Credit?.value`. Commons' `Credit` is the file's source, not its author, and is "Own work" when the uploader took it. When Artist is absent, Credit becomes the "author". The no-author test (`!artist && tag !== 'cc0'`) then passes.
- **What the page and tile say:** "Own work, CC BY-SA 4.0, via Wikimedia Commons" on the page; "Photo: CC BY-SA, Own work" on a tile.
- **The prune misses it:** `--prune-uncredited` (`scripts/build-dossiers.ts:468`) does not catch it either, because its pattern lists only "unknown", "author not stated" and the like.
- **Against the rules:** rule 4 and `/about/how` ("under CC BY and CC BY-SA a photograph without an author is not published") are broken. The other non-names in the 108 (a URL, "Transferred from …") come the same way when Credit stands in.
- **Reproduction:** the zz test's "Own work" case. With Credit `<span class="int-own-work">Own work</span>`, no Artist and CC BY-SA 4.0, the file is published, and the prune's pattern does not match its line.
- **Smallest fix:** read Artist only, never Credit. When Artist is empty, CC0 says "author not stated" and CC BY or BY-SA is dropped, as the rule says.
  - The alternative takes the original uploader as the author when Credit is "Own work". It needs the first revision's user (`iiprop=user` with the oldest revision, so a second request or `iidir`), because the latest uploader may be a bot that re-cropped the file. Not worth it before launch.
- **Corpus:** offline. Add `Own work` (and any line whose author part is a URL) to the prune's pattern for `licence !== 'cc0'`, run `--prune-uncredited`, then `--index`, then upload. The owner's grep of the 108 gives the count.

### B4. HTML entities and Commons' boilerplate reach credits as written (should, confirmed)

- **Where:** `wikimedia.ts:201`. Tags are stripped and nothing else is done: no entity decoding, no whitespace collapsing, no length cap.
- **What appears:** Svelte escapes text, so the visitor reads `Forest &amp; Kim Starr` on the species page. The tile reads `Photo: CC BY, Forest &amp; Kim Starr` (zz test, entity case).
- **"No machine-readable author provided. Qgroom assumed (based on copyright claims).":** the tile cuts this at 40 characters, so it reads "CC BY-SA, No machine-readable author…", which says there is no author.
- **Long free text:** "This photo has been taken by Matthieu Sontag (User:Mirgolth) and released under …" names its author, so rule 4 holds, but the tile is the first 40 characters of a sentence.
- **Smallest fix:**
  1. In `commonsPhotos`, decode the five named entities and numeric ones after stripping tags, and collapse whitespace.
  2. For the tile only (`tileCreditOf`), take `X` from Commons' "No machine-readable author provided. X assumed" form, and a `User:X` name where the line is longer than 40 characters and holds one.
  3. The species page keeps the source's words.
- **Corpus:** offline at read time. Apply the decoding in `safeUrls` to `attribution` (zero requests), and run `--index` for the tiles.

### B5. "Public domain" is labelled CC0 on the hero and the tile (should, confirmed)

- **Where:** `wikimedia.ts:199` (`'Public domain'` and `'PD…'` rewritten to `cc0`), `licence.ts:17` (`public domain` and `pdm` are CC0), `head.ts:150` (`lineTag`, the same rewrite).
- **What the page shows:** the 217 files tagged that way, and GBIF's Public Domain Mark media, show:
  - on the hero (`+page.svelte:365`): **"CC0"** followed by "author not stated, Public domain, via Wikimedia Commons";
  - on a tile: "Photo: CC0, author not stated";
  - in the gallery: only "author not stated, Public domain, via Wikimedia Commons". `photoCredit` sees a licence named and agreeing, so it adds nothing.
  - So the hero and the tile state a licence the file was never given, and the gallery states another. (The zz test's public-domain case prints all three.)
- **Why it matters:** CC0 is a waiver an author makes, worldwide. Commons' "Public domain" covers expired copyright, US government works and works ineligible for copyright, some of them public domain in one country only. Calling them CC0 is a false statement of the licence (rule 1, and rule 4's "carries its licence").
- **The rule itself:** read literally, rule 4 ("only under CC0, CC BY or CC BY-SA") excludes public-domain files altogether. The project should decide which it means and word rule 4 and `/about/how` to match.
- **Fix, if they stay:**
  1. Add a tag `pd` to `LicenceTag`, open under `isOpen`, labelled "Public domain".
  2. Add it to `Photo.licence` (`schema.ts:211`) and to the formats page.
  3. Map "Public domain", "PD…" and `publicdomain/mark` to it.
  4. Corpus, offline at read time: in `safeUrls`, a Commons photograph tagged `cc0` whose attribution ends ", Public domain, via Wikimedia Commons" becomes `pd`. Run `--index` for the tiles.
- **Smaller fix:** keep `cc0` internally, and make `creditParts` give "Public domain" as `lic` when the attribution's licence field says so. That is two lines, but the dossier and `/api/dossier` still say `cc0`.

### B6. A GBIF photograph with no licence of its own is published under its record's licence (launch, confirmed live)

- **Where:** `src/lib/dossier/sources/gbif.ts:252`: `licenceTag(m.license ?? o.license)`.
- **What it does:** the comment above that line says "a record's licence is not its photograph's", but when a media item states no licence the record's is taken. Since round sixty-eight the request asks only for CC0 and CC BY records (line 245), so every such item now passes as CC0 or CC BY.
- **The other path disagrees:** the download path does not do this (`bulk.ts:390` tests `m.license` only), so the two paths give different answers for the same record.
- **Live evidence:** `occurrence/search` for Cactaceae, Crassulaceae and Amaryllidaceae under the fill's filter, 20 records per dataset across the top 50 datasets. Media with no licence that pass `photosFromMedia`:
  - occurrence 1655981894 (ALA, "Map and report a single weed sighting"): published as "Michael Sim, CC BY, via GBIF";
  - 3498990568 (MNHNL "General recording"), the zobodat set (4511854237) and "Collections of Bioclass, School #179, Moscow": each "author not stated, CC0, via GBIF".
  - Many more such media are dropped only because they also lack an author.
- **Reproduction:** the zz test's GBIF case. Two records shaped as the live answers come out as `by | Michael  Sim, CC BY, via GBIF` and `cc0 | author not stated, CC0, via GBIF`.
- **Smallest fix:** `licenceTag(m.license)`, no fallback, as the bulk path already does.
- **Corpus:** the dossier keeps neither the dataset nor whether the licence was the media's own.
  - The candidates are GBIF photographs whose address is not iNaturalist's (iNaturalist media always carry their own licence). Re-ask `occurrence/<key>` for each (the key is the part of `id` before the colon, one request each) and drop those whose media item has no licence.
  - GBIF answers the sandbox, so this can run anywhere. The count is not known; list the candidates first.
- **Also:** the photograph id is `${o.key}:${out.length}`, a counter across all records, not the item's index in its record. It is harmless today (only the key is read back), but the comment in `md5.ts` describes it as `<key>:<n>`.

### B7. Commons' "Attribution" licence would be shown as CC BY (minor, suspected)

- **Where:** `licence.ts:19`. `BY` matches the bare word `attribution`, so `licenceTag('Attribution')` is `by`, labelled "CC BY" (zz test, licence strings).
- **Why it matters:** Commons' {{Attribution}} licence, which I believe carries the short name "Attribution", is a free licence that is not Creative Commons. A file under it would be published as CC BY.
- **Not confirmed:** whether any such file is in the corpus (Commons refused the sandbox).
- **Fix:** in `commonsPhotos`, accept only short names matching `^(CC0|CC[ -]BY(-SA)?\b|Public domain$|PD)`, before `licenceTag`.

### B8. `mendCommonsThumb` builds the tile name from the original file name (minor, suspected)

- **Where:** `md5.ts:80-84`.
- **What it does:** MediaWiki names the thumbnail of a long file name `<w>px-thumbnail.<ext>`, not `<w>px-<name>`. The mend applies only to originals 500 to 960 pixels wide, so a long-named narrow file would get a tile address that answers 404.
- **Not confirmed:** I could not reach Commons to check the exact length limit, and the owner's live check of three species did not cover it.
- **What the page does:** the page shows "did not load" for the tile; nothing false.
- **Fix:** leave the tile as the original when the name is longer than about 150 bytes, or ask Commons for `iiurlwidth=500` on those few.

## Checked and sound

- `commonsUrl` drops the query and fragment and moves `thumb.wikimedia.org` to `upload.wikimedia.org`. It keeps Commons' own percent-encoding (`%2C`, `%27`), so the stored, loaded and allowed addresses agree. The image policy (`svelte.config.js:45`) and `/about/how` name `upload.wikimedia.org`.
- GIF, SVG and TIFF never pass the extension test.
- `showable` and `shownAt` never load an original wider than 500 pixels. A file between 500 and 960 is shown at its 500 tile.
- NC and ND are refused before CC0 is tested. GFDL, FAL, "Copyrighted free use" and "No restrictions" are refused. A CC BY file with neither Artist nor Credit is refused.
- The page never says "observed growing wild" of a Commons or GBIF photograph (`captive === false` only).
- `tileCreditOf` puts the licence first and gives the source's name when the line disagrees (triage-66 N13, CSS at `+page.svelte:720`).
- No credit stands over a failed hero or strip photograph (triage-66 P7, `+page.svelte:352-356, 413`).
- The open fill and the Commons fill each leave a dossier untouched on a refusal, and each resumes (`askedOpen`, `askedCommons`).
- `mergeGbifPhotos` keeps an empty fresh set from erasing photographs.
- The download path reads each media item's own licence (`bulk.ts:390`).
- GBIF media strings such as "Copyright by the creator…", "© All rights reserved", "Usage Conditions Apply" and "All rights reserved; for terms…" are all refused (live).
