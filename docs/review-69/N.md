# Round sixty-nine: agent N (names and search)

Copy: `/tmp/r69/N`. Files changed: `src/lib/core/search.ts`, `src/lib/core/postings.ts`, `src/lib/dossier/index-entry.ts`, `src/lib/server/dossiers.ts`, `scripts/audit-common-names.ts`. Tests: new `tests/unit/r69n-older-names.test.ts` (12), `tests/unit/r69n-search-ties.test.ts` (20); edited `tests/unit/r67n-search-route.test.ts` (builds the index with `indexNames`, a round sixty-nine case added, the Opuntia longispina expectation changed, see N1).

Every "FAILED on the base" below was checked by running the test file in a copy of `/tmp/r69/base` (`.../scratchpad/N69/basecopy`): r69n-older-names 10 of 12 fail there (the 2 that pass are the guards), r69n-search-ties 15 of 20 fail (the 5 that pass are the guards).

## 1. Per item

### N1. An older name of two species (S-F1, R46-3)

- **Redirects** (`dossiers.ts`, `indexMaps` and a new `synonymMaps`). `bySynonym` is filled from the shown older names (`syn`) first. A name one species shows goes to that species even when others hold it among their search-only names (`older`). A name only one species holds goes there, as before. A name two or more species show, or that two or more hold only among their search-only names, is put in a new `ambiguous` map and never in `bySynonym`, so `synonymInIndex` (W's file, unchanged) answers null for it.
- **Export for P:** `ambiguousSynonym(index, name): IndexEntry[] | null` returns every species that holds the name, those that show it first, in index order. The name can be in any case, and runs of spaces are closed up.
- **Search** (`search.ts`, `olderOrder`, `olderTyped`). Within the "older name typed as one" group:
  1. a species whose epithet is the typed epithet, its ending aside, comes first; a last word still being typed counts as a prefix;
  2. then, either way, a species that shows the name, before one that holds it only for the search.

  The epithet compared is the query's own second word, not a word of the older name held, so a species is never put first for a variety of its own whose epithet happens to match.
- **The live cases** on the 11 October live index (`scratchpad/live/index.json`):
  - `/species/aloe-variegata` now goes to Gonialoe variegata, which shows the name. The search lists Gonialoe variegata, then Aloe vera.
  - `/species/cereus-undulatus` now goes to Selenicereus undatus (shown), not Acanthocereus tetragonus (search-only). The search lists Selenicereus first.
  - `/species/cotyledon-mammillaris`: both Adromischus show it, so it is ambiguous and does not redirect. The search lists A. mammillaris (keeps the epithet), then A. filicaulis.
  - `/species/mammillaria-sulcata`: both hold it only for the search, so it is ambiguous. The search lists Coryphantha sulcata, then Ariocarpus.
  - Also: "Euporteria senilis" now lists Eriosyce senilis first and "Agave spectabilis" lists Agave applanata first. "Murraya exotica" lists Aglaia odorata first, as before: it shows the name, and neither species keeps "exotica". No rule in the triage would put Murraya paniculata first.
- **Scale** on the live index:
  - 522 names are older names of two or more species. 191 now redirect to the one species that shows them, and for 120 of those the target changes from the base's first-in-index holder.
  - 331 are ambiguous: 220 shown by two or more, 111 held by two or more for the search only. 309 of these are reachable addresses (the other 22 are also an accepted name in the index).
- **A consequence to know:** "Opuntia longispina" is held by Airampoa corrugata (Haworth's name, in its search-only list) and by Opuntia orbiculata (Pfeiffer's homonym, shown). By the rule, the address and the search now go to O. orbiculata first. r67n-search-route expected Airampoa first; the case now expects O. orbiculata first with Airampoa among the hits, with a comment. The `/about/how` example built on it changes (see N3).
- **The 404** is P's file. The patch is in Needs, with a test that fails on the base and passes with my files and the patch (checked by applying the patch to my copy and then reverting it). Without P's patch, an ambiguous name is not redirected by the index, but the route still asks GBIF. For these names GBIF usually answers at a higher rank, which gives the plain 404 with both species among the suggestions.
- **Tests:** `r69n-older-names.test.ts`, all FAILED on the base except the two marked guard.

### N2. Search ties and spellings (R46-4, S-F2, S-F3)

- **Ties** (`search.ts`, `commonTie`, `collect`). Among the common names' hits, a tie after closeness is broken by:
  1. the place in `[common, ...commons]` of the name that holds the query (pooled spellings come after every shown name);
  2. a name written as typed (folded, apostrophes out, spaces closed up). This step is my addition, needed for "bleeding heart": Dicentra formosa's "Bleeding-heart" and Lamprocapnos' "Bleeding heart" are both headlines, and Dicentra has more photographs;
  3. more photographs (`photos`, added to `Searchable` as optional);
  4. the alphabet.

  These steps apply only to the common-name group: a name typed as a name keeps the alphabet, so "c" is not reordered by photographs (a guard test). An index without `photos` orders as before.
- **The checks:**
  - "jade plant" gives Crassula ovata first.
  - "hen and chicks" gives Sempervivum tectorum first (its 4th name against Chlorophytum's 7th).
  - "bleeding heart" gives Lamprocapnos spectabilis first.
  - "ponytail palm" still puts Beaucarnea recurvata third. Not done: its headline is "Bottle-palm", and "Ponytail Palm" is its sixth name, while B. gracilis and B. hiriartiae have it as their headline. The dossier gives recurvata "Ponytail Palm" from one source only. No ordering by place then photographs can put it first; only photographs ahead of headlines would, and that breaks "hen and chicks" and "bleeding heart".
- **Apostrophes** are stripped before splitting, in both `search.ts` (new export `APOSTROPHES`, the set `nameKey` strips) and `postings.ts` `words`, so the postings read the same words.
  - "devils backbone" gives Kalanchoe daigremontiana first, as an exact match, not a near one.
  - "St Johns wort" gives Hypericum perforatum first.
  - "bishops cap" gives Astrophytum myriostigma, then A. capricorne (photographs).
  - "mother in laws tongue" gives Dracaena trifasciata.
- **Pooled spellings** (`index-entry.ts`):
  - The new `IndexEntry.spellings?: string[]` holds the other spellings of shown names whose search words differ from every shown name's ("Blue Mink" beside "Bluemink").
  - It is made by the new `indexNames(vernacular, scope)`, which is `englishNames` plus `spellings`, and `pooledSpellings`. `englishNames` (the species page's) is unchanged, so nothing new is shown.
  - Searched as common names (`prepare`) and posted (`entryWords`). An index without the field is read as before.
  - On the Oct 9 dossiers (`/tmp/rev66/corpus/v2`): 756 spellings on 569 species, and the index grows by 21.5 kB (0.5%).
  - "blue mink" gives Ageratum houstonianum, "corn cockle" Agrostemma githago, and "velvet leaf" Abutilon theophrasti among the hits.
  - "porcelain flower" still finds nothing: the Oct 9 dossier of Hoya carnosa has only "Porcelainflower" and "porcelainflower", with no open spelling to pool. If the live dossier has one, the rebuilt index finds it.
- **Open spelling on a tie** (`casedSpelling`). In the open-or-closed choice, on a tie of sources, the form in more words wins before GBIF's order. "Swampmahogany" becomes "Swamp-mahogany": the hyphens are then chosen by sources as before, so it is hyphenated, not "Swamp mahogany". "Milkweed" stays whole, since more sources write it so (a guard test).
- **Families** (`FAMILY_START = 6`, `familyMatch`). A family matches from its start once the typed word has six letters or more: "cactace", "aizoac" and "asparagac" find their families. "plant" still does not reach Plantaginaceae, and "snake plant" is still Dracaena trifasciata alone (a guard test, and on the real corpus).
- **ENGLISH_USE** gains acacia, anemone, aralia, geranium, petunia and verbena (chrysanthemum and hibiscus left off, as S-F3 advised).
- **Headlines changed by the naming rules** (ENGLISH_USE plus open-on-tie), measured on the Oct 9 dossiers with the base rules and with mine: 39 of 4,082. Among them:
  - Carpenteria "Tree anemone" (was "Tree-anomone");
  - Polyscias fruticosa "Ming aralia";
  - Pelargonium graveolens "Sweet scented geranium";
  - Vachellia farnesiana "Sweet acacia";
  - Eucalyptus robusta "Swamp-mahogany";
  - Thalictrum thalictroides "Rue-anemone".

  Some to know about:
  - Robinia pseudoacacia "False acacia" (was "Black locust", as S-F3 foresaw);
  - Robinia hispida "Rose acacia";
  - Madia elegans "Showy tar weed";
  - Gomphocarpus physocarpus "Balloon cotton bush".

  The full list is in `scratchpad/N69` (reproduce with `rebuild.mts`).
- **The headline searches** (each of the 4,082 headlines typed as written, top ten compared, base against this copy):
  - **Live index as it is** (search rules only): the first hit changes for 66 searches, the top ten for 257. The species found first by its own headline rises from 4,012 to 4,026: 36 gained, 22 lost. Every loss is a headline two species share, now decided by photographs where it was the alphabet (Crassula arborescens' "Jade Plant" now gives C. ovata).
  - **Names rebuilt from the Oct 9 dossiers** (with spellings and the new naming rules): the first hit changes for 67, the top ten for 281, and found-first rises from 4,012 to 4,027.
- **Tests:** `r69n-search-ties.test.ts`, all FAILED on the base except the five guards. The real-corpus cases are in `r67n-search-route.test.ts`: jade plant, hen and chicks, bleeding heart, devils backbone, blue mink, corn cockle, Aloe variegata, Mammillaria sulcata, the three families and snake plant.
- **Audit** (`scripts/audit-common-names.ts`). New causes "the open spelling on a tie (triage-68 N2)" and "a genus English uses as a noun (triage-68 N2)". `--dossiers` now reports the pooled spellings the search gains, with a sample.

### N3. The about pages (S-F4)

The sentences for P are in Needs.

### The Worker's search cache key

Not in my files: `src/routes/api/search/+server.ts:57` (W's) keys `search6?c=<corpus>&n&q`. This round changes answers under the same corpus id, so a deploy before the next `--index` would serve day-old answers. If W's round keys the edge caches by build, nothing more is needed. If not, the fallback patch for W is in Needs. Two more things only `--index` refreshes:
- the build's `short.json` answers for one- and two-letter queries (made by `products.ts` with `search`);
- the postings for words whose apostrophe falls in the first three letters, and for the new spellings.

Until then those keep the old order. M's rebuild (M12) runs `--index` anyway.

## 2. Needs

### For M (`scripts/build-dossiers.ts`): write the pooled spellings

`indexEntry` calls `indexNames` instead of `englishNames`. The one-line need is the third hunk; the other two are the import and the type. `nameEntries` needs no change: it replaces only `common` and `commons`, and the spellings do not depend on the genera.

```diff
--- a/scripts/build-dossiers.ts
+++ b/scripts/build-dossiers.ts
@@ -63,7 +63,7 @@
 import { buildDossier, NETWORK_EXTRAS, photosFromMedia, mergeGbifPhotos, type SkippableSource } from '../src/lib/dossier/build';
 import { mendGbifThumb, mendCommonsThumb } from '../src/lib/dossier/md5';
 import { heroOf } from '../src/lib/dossier/dedupe';
-import { englishNames, generaOf, olderNamesOf, type VernacularName } from '../src/lib/dossier/index-entry';
+import { englishNames, indexNames, generaOf, olderNamesOf, type VernacularName } from '../src/lib/dossier/index-entry';
 import * as gbif from '../src/lib/dossier/sources/gbif';
 import { literature } from '../src/lib/dossier/sources/openalex';
 import * as inat from '../src/lib/dossier/sources/inat';
@@ -154,7 +154,7 @@
   };
 }
 
-type IndexEntry = { key: number; slug: string; name: string; family?: string; common?: string; commons?: string[]; origin: string[]; thumb?: string; credit?: string; photos: number; open: number; climate: string; near?: number[]; syn?: string[]; older?: string[]; changed?: number };
+type IndexEntry = { key: number; slug: string; name: string; family?: string; common?: string; commons?: string[]; spellings?: string[]; origin: string[]; thumb?: string; credit?: string; photos: number; open: number; climate: string; near?: number[]; syn?: string[]; older?: string[]; changed?: number };
 type Dossierish = { key: number; slug: string; name: { scientific: string; family?: string; status?: string; vernacular: VernacularName[]; synonyms?: string[] }; distribution: { native: Array<{ name: string }> }; photos: Array<{ id: string; url: string; thumb: string; width?: number; captive?: boolean; attribution: string; licence?: string }>; occurrences: { nOpenInRange: number; nRestrictedInRange?: number; nOutsideRange?: number }; climate: { status: string; months?: Array<{ tmax: number; tmin: number; precipMm: number }> }; changed?: Changed };
 /**
  * Each species' English vernacular names, kept from its dossier while the index is made: the common name is chosen by
@@ -188,7 +188,7 @@
   // changed in substance, for the sitemap (round sixty-three; REVIEW-TRIAGE-61's deferred list).
   const credit = hero ? tileCreditOf(hero as Parameters<typeof tileCreditOf>[0]) : null;
   const changed = dayNumber(d.changed?.on);
-  return { status: d.name.status, key: d.key, slug: d.slug, name: d.name.scientific, family: d.name.family, ...englishNames(d.name.vernacular, { genus }), origin: d.distribution.native.map((n) => n.name), thumb: hero ? mendCommonsThumb(mendGbifThumb(hero.thumb, hero.id, hero.url), hero.width) : undefined, ...(credit ? { credit } : {}), photos: d.photos.length, open: d.occurrences.nOpenInRange, climate: d.climate.status, ...(syn.length ? { syn } : {}), ...(older.length ? { older } : {}), ...(changed ? { changed } : {}) };
+  return { status: d.name.status, key: d.key, slug: d.slug, name: d.name.scientific, family: d.name.family, ...indexNames(d.name.vernacular, { genus }), origin: d.distribution.native.map((n) => n.name), thumb: hero ? mendCommonsThumb(mendGbifThumb(hero.thumb, hero.id, hero.url), hero.width) : undefined, ...(credit ? { credit } : {}), photos: d.photos.length, open: d.occurrences.nOpenInRange, climate: d.climate.status, ...(syn.length ? { syn } : {}), ...(older.length ? { older } : {}), ...(changed ? { changed } : {}) };
 }
 
 /** Every dossier on disk, as index entries. The corpus is the files; the index is derived from them. */
```

### For P: the species route's 404 for an older name of two species

Checked by applying it to my copy (the test below passes), then reverting.

```diff
--- a/src/routes/species/[slug]/+page.server.ts
+++ b/src/routes/species/[slug]/+page.server.ts
@@ -1,5 +1,5 @@
 import { error, redirect } from '@sveltejs/kit';
-import { getDossier, resolveSlug, corpusNow, getGenus, indexMaps, searchAnswer } from '$lib/server/dossiers';
+import { getDossier, resolveSlug, corpusNow, getGenus, indexMaps, searchAnswer, ambiguousSynonym } from '$lib/server/dossiers';
 import { synonymAsk, synonymInIndex, nameFromSlug } from '$lib/server/synonyms';
 import generaList from '../../../../scripts/specialist-genera.txt?raw';
 /** The genera the species list takes whole (the file the derivation reads), for the 404 to say so. */
@@ -37,6 +37,19 @@
       const g = params.slug[0].toUpperCase() + params.slug.slice(1);
       if (indexMaps(c.idx).byGenus.get(g)?.length) redirect(302, `/?by=genus&open=${slugify(g)}`);
     }
+    // An older name of two species or more of the reference answers neither (rule 3), and GBIF is not asked: the 404 says
+    // so and names them (round sixty-nine; triage-68 N1, S-F1, R46-3: "Cotyledon mammillaris" went to Adromischus
+    // filicaulis, the first holder in the index's order, and the page said GBIF accepted it as that species).
+    const asName = nameFromSlug(params.slug);
+    const holders = asName ? ambiguousSynonym(c.idx, asName) : null;
+    if (holders) {
+      setHeaders({ 'cache-control': 'public, max-age=300' });
+      const g = asName.split(' ')[0];
+      const list = holders.map((e) => e.name);
+      const named = list.length === 2 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
+      const count = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][list.length - 2] ?? String(list.length);
+      error(404, { message: `${asName} is an older name of ${count} species of the reference, ${named}, so this address leads to neither`, species: { name: asName, genus: g, inGenus: indexMaps(c.idx).byGenus.get(g)?.length ?? 0, wholeGenus: WHOLE_GENERA.has(g), suggest: holders.map((e) => ({ slug: e.slug, name: e.name })) } });
+    }
     // An old name: the index's own synonym lists first (no request), then the backbone is asked whether it is a synonym,
     // and the page moves to the accepted species when the reference holds it, saying so; otherwise the 404 says what the
     // name is now (round thirty, R2-8; round thirty-two, 2). The move is temporary (a 302, cached for the day the
```

With its test (fails on the base: 302 to Adromischus filicaulis, and to Aloe vera):

```diff
--- /dev/null
+++ b/tests/unit/r69p-species-ambiguous.test.ts
@@ -0,0 +1,37 @@
+/**
+ * Round sixty-nine, triage-68 N1 (S-F1, R46-3), the species route: an address under an older name two species of the
+ * reference hold answers neither, and its 404 names both, without asking GBIF; an address under a name one species
+ * shows goes there. FAILED on the base (Cotyledon mammillaris went to Adromischus filicaulis, Aloe variegata to Aloe vera).
+ */
+import { describe, it, expect } from 'vitest';
+import { load } from '../../src/routes/species/[slug]/+page.server';
+import type { IndexEntry, Loaded } from '$lib/server/dossiers';
+
+const entry = (key: number, name: string, syn: string[] = [], older: string[] = []): IndexEntry => ({ key, slug: name.toLowerCase().replace(/ /g, '-'), name, photos: 0, open: 0, climate: 'ok', ...(syn.length ? { syn } : {}), ...(older.length ? { older } : {}) });
+const idx: IndexEntry[] = [
+  entry(2, 'Adromischus filicaulis', ['Cotyledon mammillaris']),
+  entry(3, 'Adromischus mammillaris', ['Cotyledon mammillaris']),
+  entry(5, 'Aloe vera', ['Aloe a', 'Aloe b', 'Aloe c', 'Aloe d', 'Aloe e', 'Aloe f'], ['Aloe variegata']),
+  entry(8, 'Gonialoe variegata', ['Aloe variegata'])
+];
+const corpus = { at: Date.now(), idx, bySlug: new Map(idx.map((e) => [e.slug, e.key])), corpus: 'r69n', etag: null, fromStore: false, manifest: null, buckets: 32 } as unknown as Loaded;
+const noGbif = (async (u: string | URL) => { throw new Error(`asked ${String(u)}`); }) as typeof fetch;
+const event = (slug: string) => {
+  const url = new URL(`http://x/species/${slug}`);
+  return { params: { slug }, platform: undefined, fetch: noGbif, setHeaders: () => {}, cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => '1.2.3.4', locals: { corpus } } as never;
+};
+const caught = async (p: Promise<unknown>) => { try { await p; } catch (e) { return e as { status: number; body?: { message: string; species?: { suggest?: Array<{ slug: string }> } }; location?: string }; } throw new Error('no error'); };
+
+describe('N1: the species route under an older name', () => {
+  it('Cotyledon mammillaris is a 404 that names both Adromischus, and GBIF is not asked', async () => {
+    const e = await caught(load(event('cotyledon-mammillaris')));
+    expect(e.status).toBe(404);
+    expect(e.body?.message).toBe('Cotyledon mammillaris is an older name of two species of the reference, Adromischus filicaulis and Adromischus mammillaris, so this address leads to neither');
+    expect(e.body?.species?.suggest?.map((s) => s.slug)).toEqual(['adromischus-filicaulis', 'adromischus-mammillaris']);
+  });
+  it('Aloe variegata goes to Gonialoe variegata, which shows it', async () => {
+    const e = await caught(load(event('aloe-variegata')));
+    expect(e.status).toBe(302);
+    expect(e.location).toBe('/species/gonialoe-variegata?was=Aloe%20variegata');
+  });
+});
```

### For P: `/about/how` (N3), the naming paragraph

- Replace "then a name GBIF marks preferred (a flag one dataset sets, so it only breaks a tie), then GBIF's own order;" with "then a name GBIF marks preferred (a flag one dataset sets, so it only breaks a tie), then the alphabet, as GBIF lists a species' names (capitalised spellings before lower-case ones);".
- Replace "(agave, aloe, amaryllis, cereus, crocus, haworthia, iris, lotus, mimosa and yucca: "Lace aloe", "Autumn crocus" and "Zebra haworthia" stay," with "(acacia, agave, aloe, amaryllis, anemone, aralia, cereus, crocus, geranium, haworthia, iris, lotus, mimosa, petunia, verbena and yucca: "Lace aloe", "Autumn crocus", "Zebra haworthia", "Tree anemone" and "Rose geranium" stay,".
- Replace "Of a name's spellings, one without a full stop at the end is shown before one with it, then, where some source writes it open, a name ending in plant, tree, lily, daisy, palm, fern, cactus or orchid is shown open ("Zebra plant", not "Zebraplant"), then the one more sources give (so "Milkweed" and "Nannyberry" stay whole), its hyphens chosen the same way, then GBIF's first." with: "Of a name's spellings, one without a full stop at the end is shown before one with it, then, where some source writes it open or hyphenated, a name ending in plant, tree, lily, daisy, palm, fern, cactus or orchid is shown so ("Zebra-plant", not "Zebraplant"), then the one more sources give (so "Milkweed" and "Nannyberry" stay whole), then, given by as many, one written open or hyphenated before one written closed ("Swamp-mahogany", not "Swampmahogany"), its hyphens chosen by their sources too, then GBIF's first. A name's other spellings are not shown, but the search reads them, so "blue mink" finds Ageratum houstonianum, shown as "Bluemink"."

### For P: `/about/how`, the search paragraph

- Replace "then an older name typed as one ("Opuntia longispina" is Airampoa corrugata, before the species that has a variety of that name);" with "then an older name typed as one ("Ferocactus glaucescens" is Bisnaga glaucescens), the species that keeps the name's epithet first, then the one that shows the name among its six ("Aloe variegata" is Gonialoe variegata before Aloe vera);".
- Replace "(a family is matched only by a whole word, so "plant" is never the start of Plantaginaceae)" with "(a family is matched by a whole word, or from its start by a word of six letters or more, so "aizoac" finds the Aizoaceae while "plant" is never the start of Plantaginaceae)".
- Replace "Within each, a name that is exactly the query comes first (the common name shown before the others), then a match of whole words, then the alphabet, so "fig" is Ficus carica, "Fig", before Colchicum figlalii." with: "Within each, a name that is exactly the query comes first (the common name shown before the others), then a match of whole words, then a match whose shown common name holds every word; among the common names' matches, a tie goes to the species whose matching name comes earlier among its names, then to a name written as typed, then to the species with more photographs ("jade plant" is Crassula ovata before Crassula arborescens, both "Jade plant", and "bleeding heart" is Lamprocapnos spectabilis, "Bleeding heart", before Dicentra formosa, "Bleeding-heart"); then the alphabet, so "fig" is Ficus carica, "Fig", before Colchicum figlalii. Apostrophes are taken out of a word before it is read, so "devils backbone" is "Devil's backbone"."
- After "Every older name the backbone gives a species at species rank is searched, though its entry carries six to show." add: "A species address under an older name goes to the species that shows it among its six, or to the one species that holds it; a name two species show, or that two hold only for the search, goes to neither, and the page says it is an older name of those species and names them."
- In the list of requests, after "a species address the reference does not answer to, which the server asks the backbone about once, in case it is an older name for a species that is there" add "(never an older name two species of the reference hold, which the page names without asking)".

### For P: `/about/formats`, the search sentence

Replace "within each, a name that is exactly the query, then whole words, then the alphabet." with: "within each, for an older name the species that keeps its epithet and then the one that shows it; a name that is exactly the query, then whole words, then a match whose headline holds every word; among common names, the matching name's place among the species' names, then a name written as typed, then more photographs; then the alphabet. Apostrophes are taken out before a name is split into words, and a family is matched whole, or from its start by a word of six letters or more."

### For W (only if the edge caches are not keyed by build): the search cache key

```diff
--- a/src/routes/api/search/+server.ts
+++ b/src/routes/api/search/+server.ts
@@ -54,7 +54,7 @@
   // Kept only under the corpus and the build it was asked under (round sixty-seven; triage-66 S7: `forBuild`).
   const headers = (corpus: string) => ({ 'cache-control': asked === corpus ? forBuild(url, `public, max-age=${CACHE_S}`) : 'no-store' });
   const edge = platform?.caches?.default;
-  const key = new Request(`https://cache.cultifolio/search6?c=${encodeURIComponent(c.corpus)}&n=${n}&q=${encodeURIComponent(q)}`); // the case kept: an author citation is read by its capitals; search6: answers kept before round sixty-seven's reading and order (triage-66 N1, N2, N8) are not served
+  const key = new Request(`https://cache.cultifolio/search7?c=${encodeURIComponent(c.corpus)}&n=${n}&q=${encodeURIComponent(q)}`); // the case kept: an author citation is read by its capitals; search7: answers kept before round sixty-nine's order and words (triage-68 N1, N2: ties, apostrophes, families typed in part) are not served
   const shaped = url.searchParams.get('shape') === '2';
   // `near`: the hits came by a similar spelling, so the picker can say "similar spelling" (round sixty-two; A7, B2).
   // `relaxed.left`: the reading matched and left these typed words out (an author, a cultivar, "sp."), where a relaxed
```

## 3. Not done, and why

- **"ponytail palm" to Beaucarnea recurvata first.** Not reachable by the decided rule (see N2). The data gives recurvata "Ponytail Palm" from one source, as its sixth name.
- **"porcelain flower".** The Oct 9 dossier holds no open spelling to pool (see N2).
- **"Murraya exotica" to Murraya paniculata.** Aglaia odorata shows the name and M. paniculata holds it only for the search, so the rule sends it to Aglaia, as before.
- **"Bear´s breech".** An acute accent used as an apostrophe is not in `nameKey`'s set, and I kept the search's set equal to it.

## 4. Corpus step

Not mine; M runs `--index` after applying the need above. To see the names change before uploading:

1. `npx tsx scripts/audit-common-names.ts --dossiers static/s/v2 --sample 40`

   It prints the headlines and lines under titles that change, by cause, with the two new triage-68 N2 causes, then "The search reads N pooled spellings never shown, of M species: …". On the Oct 9 corpus: 41 headlines by the open spelling on a tie, 15 by a genus English uses as a noun, and 756 spellings of 569 species.

2. `npx tsx scripts/audit-common-names.ts static/s/v2/index.json --before <live index.json>`, after `--index`.

   It prints the species that show another common name (about 39 from this round), and fails if photographs or climate were lost.

## 5. Runs

- Owned and new tests: 23 files, 228 passed (this count includes the r69n files). These are r69n-* (2 files, 32 tests), r67n-*, r68b-range-photos-search, r63n-*, r62q-*, search*, postings, synonyms.
- Whole unit suite (`npx vitest run`): 276 files, 2,372 passed, 1 skipped, 0 failed.
- svelte-check --threshold error: 1,003 files, 0 errors, 0 warnings.
- No Playwright (P's).
