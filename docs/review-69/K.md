# Round sixty-nine, agent K: Commons, and every photograph's licence, credit, kind, size and order

Copy: `/tmp/r69/K`. Items K1 to K5 of `docs/REVIEW-TRIAGE-68.md`, and R46-31's green revert of `COMMONS_SHOWN`.

New files: `src/lib/dossier/photo-kind.ts` (the kind test, the order, `shownPhotos`, `leadOf`), `src/lib/dossier/photo-credit.ts` (Commons' licence and author, read strictly; `uncreditedPhoto` for the prune; kept apart from `sources/commons.ts` so the Worker's read imports no source), `scripts/audit-commons-photos.ts` (a read-only report for the owner), and three test files: `tests/unit/r69k-commons-kind.test.ts`, `tests/unit/r69k-credit-licence.test.ts`, `tests/unit/r69k-sizes-lead.test.ts`.

All three test files were run against a copy of `/tmp/r69/base` (node_modules linked, nothing else changed). Of their 96 cases, 26 pass on the base, and every one of the 26 is marked "guard" in its name (a good file kept, GBIF untouched, iNaturalist and GBIF sizes); the other 70 fail there.

## 1. Per item

### K1. Commons files that are not photographs of the species

- **The test** (`photo-kind.ts`, `commonsKind(id, names, categories?)`): returns why a file is not a photograph of the species, or null. Read from the stored title and type, and, for a new answer, Commons' categories. It rejects:
  - a type other than JPEG or WebP (PNG is gone);
  - maps (distribution, range of, range map, map, Verbreitung, distribuzione, areal);
  - herbarium sheets (specimen, herbari, holotype and the other types, exsiccata, "(GBIF n)", a title starting "COI" and digits);
  - plates and drawings (Curtis, Botanical Magazine or Register, "Tab. n", plate, illustration, drawing, engraving, lithograph, watercolour, painting, Biodiversity Heritage Library);
  - seeds, resin, stamps, postage, books, labels;
  - unknown, unidentified, indet., "sp." and "spp.";
  - "aff." and "cf.";
  - hybrids: "×", or " x " between two names, once the species' own name is set aside (so Lantana ×strigocamara keeps its files);
  - a title naming another species of the genus, or of an older name's genus, that is neither the species nor an older name. Epithets are compared by stem, so "mihanovichi" and "mihanovichii" are one name. A short list of words that follow a genus without being an epithet ("in", "flower", "garden" and so on) is not read as one.
- **Categories:** `Categories` is added to `iiextmetadatafilter`. The category deny-list is narrow, because Commons files every geotagged photograph under "Pages with maps": only "distribution maps", "range maps", "locator maps", "Media from GBIF", herbarium and specimen categories, illustrations, plates, stamps, seeds, resin, books, unidentified and hybrids.
- **The "unknown plant" in a garden:** "Bahá'í Terraces unknown plant 1" is not shown. R46 notes it may still be Crassula socialis. But its title says its photographer did not know the plant, and only a later editor's filing says it is. Under rule 3 a match is taken only when it is unambiguous.
- **New answers** (`sources/commons.ts`, `commonsPhotos(f, category, max, names?)`):
  - `gcmlimit` is 50 (`COMMONS_READ`), so up to 12 survive.
  - Titles holding the species' epithet come first, then an older name's, then the rest (`commonsFirstByEpithet`), before the cut to 12.
  - `names` (the species and its older names) is a new optional argument; without it, the category's name stands for the species. `fillCommons` passes `d.name.synonyms`; the build's call is M's (Needs).
- **At read time** (`schema.ts`, `safeUrls`): `shownPhotos(photos, d.name)` drops what the test rejects, re-reads each Commons credit and licence (K2, K3), and orders Commons files by epithet within their places. Every page is corrected by the deploy.
- **Exports for the index:** `shownPhotos(photos, names)` and `leadOf(photos, names)`. The index entry is M's (Needs).
- **Tests:** `r69k-commons-kind.test.ts`, 74 cases:
  - every title in the brief, through `commonsPhotos` and through `safeUrls`;
  - the good files kept (guards);
  - the categories, with "Pages with maps" kept;
  - the epithet order, `gcmlimit=50`, `Categories` and `iiurlwidth=960`. This last is R46-31's green revert: `COMMONS_SHOWN = 800` now fails;
  - `--fill commons` keeping Brachystelma attenuatum under Ceropegia attenuatula and dropping Brachystelma foetidum.
  All non-guard cases fail on the base.
- **Not caught, said plainly:**
  - Nepenthes dubia's "Neptenuis.jpg" and "Neptenuis2.jpg" name no genus, so they stay in the stored strip. A new answer puts the twelve N. dubia files first and cuts at 12, so they would not reach a rebuilt dossier.
  - A plate titled only "Agave spicata 01.jpg" is caught on a new answer by its category, but not in a stored dossier, which keeps no categories.

### K2. Commons credits

- **The author** (`photo-credit.ts`, `commonsAuthor`):
  - `Artist` only; `Credit` is no longer asked.
  - `<br>` and block ends become line breaks, tags are stripped, entities (named and numeric) are decoded, the first line is taken and its whitespace made single.
  - "No machine-readable author provided. X assumed" gives X, and the same sentence with no X gives no author.
  - "This photo has been taken by X and released under…" gives X.
  - A trailing "(talk)" is dropped.
- **Not an author:** "Own work", "See above", "Unknown author" (and "Unknown authorUnknown author"), "anonymous", a bare "(talk)", an address, "Transferred from…" and "derivative work: …".
  - The derivative-work line is my decision. It names the maker of the derivative and leaves the original's author unsaid, so under CC BY-SA it is not a full credit (Commiphora myrrha's resin file, which K1 would not catch by its title "IncenseWikiVers.jpg").
  - "Collector: Bolus, H.M.L." is kept as written on one line. K1 drops those sheets anyway.
- **At read time:** `readCommonsPhoto` splits the stored line `<author>, <short licence>, via Wikimedia Commons` at the rightmost part that reads as a licence (a version list such as "CC BY-SA 2.5,2.0,1.0" holds commas), cleans the author by the same rule, and drops a CC BY or CC BY-SA file left with none. A CC0 or public-domain file with none says "author not stated".
- **The tile** (`head.ts`, `tileCreditOf`): it now splits a Commons line the same way, so a version list no longer turns the tile back to the source's name.
- **The prune:** `uncreditedPhoto(p)` is exported for `--prune-uncredited`. It is the old pattern plus Commons' rule, and leaves GBIF and iNaturalist lines to the old pattern only. M's need is one import and one line.
- **Tests:** `r69k-credit-licence.test.ts`, the K2 blocks: every credit in the brief, new and stored, the tile, the prune's predicate, and a GBIF line with `&amp;` left as it is (guard). Non-guard cases fail on the base (the prune's case because the module is new).

### K3. Public domain, and "Attribution"

- **`core/licence.ts`:**
  - A new tag `pd`, open, labelled "Public domain".
  - "publicdomain/zero", "cc0" and "public domain dedication" stay CC0. Any other "publicdomain", "pdm", "public domain" or "PD-…" is `pd`.
  - The bare `/attribution/` rule is gone: only "Creative Commons Attribution" (and the URL and code forms) is CC BY. "Attribution", "Attribution only license", "Copyrighted, attribution-only" and "Data licence Germany – attribution" are `other`. This is everywhere, not only Commons, since none of the four is CC BY from any source.
- **`commonsLicence`:** reads only `CC0`, `CC BY n`, `CC BY-SA n` (a version list or a country allowed), `Public domain` and `PD-…`.
- **`schema.ts`:** `Photo.licence`, and `OccPoint`'s licence, accept `pd`. The `OccPoint` change is only so the build's type holds, since `isOpen` now admits `pd`; GBIF's occurrence licences never map to it.
- **At read time:** a stored Commons photograph's licence is re-read from the short name its credit keeps. A `cc0` file whose credit says "Public domain" or "PD-…" is `pd`, and one licensed "Attribution" is dropped. GBIF and iNaturalist photographs are untouched.
- **`head.ts`:** `lineTag` reads "Public domain" and "PD-…" as `pd`. A CC0 tag beside a "public domain" author's line is now said to disagree, which is true.
- **`Photos.svelte`:** the empty state says "CC0, public domain, CC BY or CC BY-SA".
- **Tests:** `r69k-credit-licence.test.ts`, the K3 blocks: the tag and label, the generic strings, the strict short names, and a stored `cc0` "Public domain" file shown as "Public domain" on the hero, the gallery and the tile.
- **Two existing tests changed, both testing `head.ts`:**
  - `r63c-credit.test.ts`: "PD-self" tagged CC0 gave "CC0, J. Smith". Now `pd` gives "Public domain, J. Smith", and a `cc0` tag gives none.
  - `r62bw-words.test.ts`: "public domain" against `cc0` no longer agrees, and against `pd` it does.

### K4. Commons sizes (`photo-size.ts`)

- **`photoAt`:** a Commons thumbnail is given at Commons' standard widths, never wider than the one kept: `square` 120, `small` 250, `medium` 500, `large` 960. Only the width in the last part changes, so Commons' own name for a long file ("960px-thumbnail.jpg") is kept. An original upload is left as it is.
- **`srcsetOf`:** gives the lead's 960 thumbnail `500w, 960w`. No change to the species page is needed: it already calls `photoAt(heroSrc, 'medium'|'large')` and `srcsetOf(heroSrc, ['medium','large'])`.
- **`shownAt`:** a file 501 to 960 pixels wide (its stored `url` is the original, since Commons makes no smaller 960) leads at its own width. The triage says 959; 960 is included because Commons gives the original itself at that width.
- **Tests:** `r69k-sizes-lead.test.ts`, the K4 block. The 120 and 250, the srcset, the long name and the mid-width lead fail on the base. Never widening, the original, and iNaturalist and GBIF sizes are guards.

### K5. The lead photograph (`dedupe.ts`)

- **`heroOf`** ranks by `leadRank`:
  - 0: wild iNaturalist;
  - 1: GBIF, and any unflagged photograph without a source;
  - 2: anything flagged cultivated;
  - 3: Commons.
  The first of the best rank leads, and a still image beats a GIF as before.
- **The build's order and its count of six are M's** (Needs).
- **Tests:** `r69k-sizes-lead.test.ts`, the K5 block:
  - a Commons file never leads beside GBIF or cultivated iNaturalist, whatever the order;
  - GBIF beats cultivated iNaturalist;
  - a Commons-only page leads with the epithet file, not the map or the camera name;
  - `leadOf` and `shownPhotos` agree with the page.
  The non-guard cases fail on the base.

### Existing test adjusted

`corpus-r60.test.ts`: a Commons fixture had id "c1" and credit "A. Grower (CC BY-SA)", a form the build never writes. The read now checks the title and credit, so the fixture uses the build's form ("File:Copiapoa cinerea.jpg", "A. Grower, CC BY-SA 4.0, via Wikimedia Commons"). What the test checks is unchanged.

## 2. Needs

Each patch was applied to a scratch copy of my copy. It type-checks (`svelte-check` 0 errors), and the 23 dossier, build and corpus test files pass (242 tests) with it, plus the seam test below.

### For M: `scripts/build-dossiers.ts`

Why: the index's lead, tile credit and count, and `--prune-uncredited`, must use the read's rules (K1, K2, K3, K5).

```diff
@@ -63,6 +63,8 @@
 import { buildDossier, NETWORK_EXTRAS, photosFromMedia, mergeGbifPhotos, type SkippableSource } from '../src/lib/dossier/build';
 import { mendGbifThumb, mendCommonsThumb } from '../src/lib/dossier/md5';
 import { heroOf } from '../src/lib/dossier/dedupe';
+import { shownPhotos } from '../src/lib/dossier/photo-kind';
+import { uncreditedPhoto } from '../src/lib/dossier/photo-credit';
 import { englishNames, generaOf, olderNamesOf, type VernacularName } from '../src/lib/dossier/index-entry';
@@ -155,7 +157,7 @@
-type Dossierish = { ...; photos: Array<{ id: string; url: string; thumb: string; width?: number; captive?: boolean; attribution: string; licence?: string }>; ... };
+type Dossierish = { ...; photos: Array<{ src?: string; id: string; url: string; thumb: string; width?: number; captive?: boolean; attribution: string; licence?: string }>; ... };
@@ -178,7 +180,10 @@
 function indexEntry(d: Dossierish): IndexEntry & { status?: string } {
-  const hero = heroOf(d.photos);
+  // The photographs a page shows, by the Worker's rule: a Commons file that is not a photograph of the species, or whose
+  // licence or author is not read, neither leads a tile nor is counted (round sixty-nine; triage-68 K1-K3, K5).
+  const shown = shownPhotos(d.photos, { scientific: d.name.scientific, synonyms: d.name.synonyms ?? [] });
+  const hero = heroOf(shown);
@@ -188,7 +193,7 @@
-  ... photos: d.photos.length, open: d.occurrences.nOpenInRange, ...
+  ... photos: shown.length, open: d.occurrences.nOpenInRange, ...
@@ -465,12 +470,14 @@
-  const uncredited = (p: { licence: string; attribution: string }) => p.licence !== 'cc0' && /^(unknown|Wikimedia Commons|iNaturalist user|no author stated|author not stated),/.test(p.attribution);
+  // The read's own rule (`uncreditedPhoto`): the build's fallback words, and Commons' "Own work", "See above", "Unknown
+  // author", a bare "(talk)" or an address, under CC BY or CC BY-SA (round sixty-nine; triage-68 K2).
+  const uncredited = uncreditedPhoto;
@@
-    let d: { photos: Array<{ licence: string; attribution: string }>; upstream?: Up };
+    let d: { photos: Array<{ src?: string; licence: string; attribution: string }>; upstream?: Up };
```

The full unified diff, with unshortened lines, is in `/tmp/r69/K/docs/review-69/k-needs/build-dossiers.patch`. The usage comment for `--prune-uncredited` (line 45) should also name "Own work" and "See above".

### For M: `src/lib/dossier/build.ts`

Why: K5's build order (GBIF before Commons, Commons not counted towards six); K1's names passed to `commonsPhotos`; a GBIF `pd` photograph with no author kept, as CC0 is. Full diff: `/tmp/r69/K/docs/review-69/k-needs/build.patch`.

```diff
-  return rows.filter((im) => im.creator || im.rightsHolder || im.licence === 'cc0').slice(0, 24).map((im) => {
+  return rows.filter((im) => im.creator || im.rightsHolder || im.licence === 'cc0' || im.licence === 'pd').slice(0, 24).map((im) => {
@@
-  /* ---- 6. Photographs: iNat (open licences only), then Commons, then GBIF media ---- */
+  /* ---- 6. Photographs: iNat (open licences only), then GBIF media, then Commons ---- */
@@
-  if (skip('commons')) skipped('commons');
-  else if (!o.quick && photos.length < 12) {
-    const cat = x.status === 'ok' && x.data.commonsCategory ? x.data.commonsCategory : scientific;
-    const c = await commons.commonsPhotos(f, cat, 12);
-    mark('commons', c);
-    if (c.status === 'ok') photos.push(...c.data);
-  }
+  // GBIF's open-licence photographs before Commons', and asked when iNaturalist gave fewer than six: Commons' files are
+  // not counted towards the six, so its category no longer keeps GBIF's observation photographs from being asked
+  // (round sixty-nine; triage-68 K5, S-B2). The lead is chosen by source either way (`heroOf`).
   if (skip('gbif.media')) skipped('gbif.media');
   else if (!o.quick && (o.mediaFirst || photos.length < 6)) {
     const m = await gbif.media(f, key);
     mark('gbif.media', m);
     if (m.status === 'ok') photos.push(...photosFromMedia(m.data));
   }
+  if (skip('commons')) skipped('commons');
+  else if (!o.quick && photos.length < 12) {
+    const cat = x.status === 'ok' && x.data.commonsCategory ? x.data.commonsCategory : scientific;
+    // The species' own and older names, by which a file named as another species is left out (triage-68 K1).
+    const c = await commons.commonsPhotos(f, cat, 12, { scientific, synonyms: syn.status === 'ok' ? syn.data : [] });
+    mark('commons', c);
+    if (c.status === 'ok') photos.push(...c.data);
+  }
```

One effect to know: Commons is now asked only while iNaturalist and GBIF together gave fewer than 12. If M4 renames `syn`, use the paged list.

### The seam test that goes with M's patches

Add it at the merge as `tests/unit/r69k-index-seam.test.ts`. It fails on the base (3 of 3) and passes with the patches. The file is at `/tmp/r69/K/docs/review-69/k-needs/r69k-index-seam.test.ts`. It checks:
- `indexEntry` builds `shown` with `shownPhotos` and leads with `heroOf(shown)`;
- `photos: shown.length`;
- `const uncredited = uncreditedPhoto;`;
- in `build.ts`, `gbif.media` is called before `commons.commonsPhotos`, and with the names.

### For P: `/about/how`, paragraph at line 36

- **Licences.** Replace "every photograph is restricted by its own licence to CC0, CC BY and CC BY-SA, whatever dataset it came through, and each carries its licence, and its author where the source names one (a CC0 photograph without one says so; under CC BY and CC BY-SA a photograph without an author is not published)" with:
  > every photograph is restricted by its own licence to CC0, public domain, CC BY and CC BY-SA, whatever dataset it came through, and each carries its licence, and its author where the source names one (a CC0 or public-domain photograph without one says so; under CC BY and CC BY-SA a photograph without an author is not published). A photograph in the public domain is labelled "Public domain", never CC0, which is a waiver only an author can make. Commons' licence is read only from its short names CC0, CC BY, CC BY-SA, Public domain and PD; a file under any other, such as Commons' own "Attribution", is not shown. A Commons file's author is its Artist field, with its first line taken, never its source ("Own work"); "See above", "Unknown author", a bare "(talk)", an address and a derivative work's maker alone are not authors, and Commons' "No machine-readable author provided. X assumed" names X.
- **Order.** Replace "then from **Wikimedia Commons**, and last, for a species the download does not hold and the others gave fewer than six, from GBIF's records under an open licence (CC0 or CC BY)" with:
  > then, for a species the download does not hold and iNaturalist gave fewer than six, from GBIF's records under an open licence (CC0 or CC BY), and last from **Wikimedia Commons**
  This holds once M applies the build need.
- **Kinds and lead.** Add after the order sentence:
  > A Commons file is shown only as a JPEG or WebP photograph whose name, or on a new answer whose categories, marks it as none of these: a map, a herbarium sheet or specimen, a plate or drawing, seeds, resin, a stamp, a book or a label, an unknown or unidentified plant, a hybrid, a plant named "aff." or "cf.", or another species of its genus or of an older name's genus. Of the rest, files whose name holds the species' epithet come first. The lead photograph is iNaturalist's wild one first, then GBIF's, then iNaturalist's cultivated, then Commons', so a Commons file leads only a page with no photograph from iNaturalist or GBIF.
- **Sizes.** Replace "A Commons photograph is loaded at its 960-pixel version (its 500-pixel one on a tile), never the original upload, unless the upload is narrower than that; one whose page holds no such version is not shown." with:
  > A Commons photograph is loaded at the one of Commons' own versions the place needs: 960 pixels wide for the lead (500 on a phone, or where the screen needs no more), 500 on a gallery tile, 250 on a front-page tile and 120 in a catalogue row or beside a genus. It is never loaded as the original upload, unless the upload is 960 pixels wide or narrower, when the lead shows it at its own width. One whose page holds no such version is not shown.
- **Rule 4,** wherever the about pages state it: "only under CC0, CC BY or CC BY-SA" becomes "only under CC0, public domain, CC BY or CC BY-SA".

### For P: `/about/formats`, line 67

- After "photographs with author and licence", add:
  > (`licence` is `cc0`, `pd`, `by` or `by-sa`; `pd`, public domain that is not a CC0 waiver, since October 2026, and a dossier built before tags a Commons file "Public domain" `cc0`, which the site reads as `pd`)
- "The corpus is built from public data under CC0, CC BY and CC BY-SA" becomes "under CC0, public domain, CC BY and CC BY-SA".
- The index's `photos` count and thumbnail are of the photographs a page shows: add "(`photos` counts the photographs the species page shows)".

### Unowned: `NOTICE` and `scripts/export-corpus-lib.ts`

Not in anyone's list. Diffs at `/tmp/r69/K/docs/review-69/k-needs/notice.patch` and `export.patch`:
- **NOTICE:** "iNaturalist and GBIF photographs" and "Wikimedia Commons photographs" become "CC0, public domain, CC BY, CC BY-SA".
- **The export's licence row:** "iNaturalist, GBIF and Wikimedia Commons, per photo"; "CC0, public domain (`pd`, not a CC0 waiver), CC BY or CC BY-SA".

## 3. Not done, and why

- **P180** is not used, as decided.
- **Setting `captive` on Commons files from garden categories** (S-B2's option 3) was not taken up by the triage.
- **B8, the long-name tile in `mendCommonsThumb`,** was not triaged. K4's resizing keeps Commons' own thumbnail names, so it adds no new case.
- **Stored dossiers keep no categories.** The category test acts on new answers only. A re-ask of about 90 requests would find the rest, and the triage did not ask for it.
- **"Neptenuis.jpg"** (no genus in the name) stays in Nepenthes dubia's stored strip (see K1).
- **Fold guards:** no fold changed. `FOLD_RULES` and the database version are untouched.

## 4. The corpus step (K's part)

K1, K3, K4 and K5 act where a dossier is read: the deploy corrects every page, and `--index` (with M's patch) every tile and count. In order, after M's step 1 (`--fill gbif-licence`), with the corpus backed up:

1. Optional, before and after the deploy: `npx tsx scripts/audit-commons-photos.ts`. It reads `static/s/v2`, changes nothing, and asks nothing. It prints one line per Commons file not shown (`key, species, reason, title`), then: "N of M Commons photographs not shown, across D dossiers; L leads change (by K1 and K5); P read as public domain, not CC0", and the count per reason. On the owner's corpus I expect about the 145 suspect titles and the 31 to 40 bad leads, plus the PNGs; P should be near the 217.
2. `npm run dossier -- --prune-uncredited` (with M's patch). It prints "X uncredited photographs removed, Y CC0 credits reworded, Z photo sources reopened for the next fill, across T dossiers of F; now run --index and upload". X now includes the Commons "Own work", "See above", "Unknown author" and address credits under CC BY or CC BY-SA (S-B3's count from the 108).
3. After M's steps 3 to 5: `npm run dossier -- --index`. It prints "index: N species" and the corpus line ("corpus …: N species in B buckets, …"). Tiles then lead and count by the read's rules, and credits read "Public domain" and the cleaned author.
4. Upload as usual.

## 5. Runs

- `npx vitest run` in `/tmp/r69/K`, in two shards because the shared machine's load stopped one long run: 277 files, 2,435 passed, 1 skipped, 0 failed (139 files with 1,206 passed and 1 skipped; 138 files with 1,229 passed). An earlier unsharded run showed one timing failure, `r61g-import-attack` "10,000 rows parse in well under a second", taking 1,667 ms under a load average near 9; it passed in the sharded run.
- `npx svelte-check --threshold error`: 1006 files, 0 errors, 0 warnings.
- My three test files: 74 + 11 + 11 = 96 cases, all passing; on the base, 70 fail and the 26 that pass are all guards. The seam test for M's patches fails 3 of 3 on the base and passes on the patched scratch copy.
- No Playwright.
