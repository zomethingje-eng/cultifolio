# Round 78, agent I: pages keyed by Kew's plant_name_id

## Design (written before the code)

**The id.** A page's id is a string: `k<plant_name_id>` when Kew's file gives the page one accepted taxon that no other page holds, else `g<GBIF backbone key>`. It is checked by one pattern, `^[kg][1-9][0-9]{0,9}$`, and typed `PageId` (`` `k${number}` | `g${number}` ``), so the compiler finds every place a GBIF number was a page's identity.

- A bare number cannot be the id: Kew's ids run from 1 to 3,331,952 (wcvp_names.csv of 2026-06-04) and GBIF's backbone keys from 1 to about 12 million, so `/api/dossier/326701` or a number on a device could be either. The letter names the namespace.
- **Dossier:** `key` is the id and the file is `s/v3/<id>.json`. The shape changed, so the dossier version is 3 and the corpus moves to `s/v3/` (rule of `schema.ts`: a shape change is a version bump).
- **Index entry, card, row item, featured item, sheet:** `key` is the id; a new `gbif` field carries the page's GBIF key; `near` lists ids.
- **API path:** `/api/dossier/<id>`. A bare GBIF key there answers a 302 to its page's id, kept by no cache since an id can move by the rule (an alias, below), else 404.
- **Device records:** unchanged. A plant's `taxonKey` and a followed species' `gbifKey` stay GBIF keys, which is what the picker and the name service give and what `/about/formats` documents. Every place that compared them with a page's `key` compares them with its `gbif`. Compare's tray, follow state, labels and links are by slug already.

**Where the GBIF key stays.**

- In the dossier: `ids.gbif` (already there on every page), `name.acceptedKey`, `classification[].key` and `occurrences.keys[]`: GBIF's identifiers, never page ids.
- As a lookup alias: each card file also holds `@<gbif>` → id for every page's own GBIF key. The species route's GBIF answers (an older name GBIF resolves), `/api/dossier/<gbif>`, the picker's GBIF rows and a plant's `taxonKey` find their page through it.
- For the build: GBIF's records and photographs are still fetched by `ids.gbif`; `--keys`, `scripts/extra-keys.txt` and `scripts/merged-pages.txt` still name GBIF keys for what is fetched, and a `--keys` line may name a page by its id.

**A page with no unambiguous Kew id** keeps a GBIF-namespaced id, `g<key>`, and `--index` lists each in `ids-gbif.txt` with its reason (rule 3: no guess at which page is Kew's). On the real corpus copy (8,947 dossiers):

- 15 pages whose Kew rows do not decide (`name.kew.entry` is ''): Harpephyllum caffrum, Aphelandra squarrosa and 13 more;
- 7 pairs (14 pages) that hold one Kew entry each (Ceropegia melanops and C. nigra; Copiapoa calderana and C. boliviana; ...): merge candidates for the owner, as round 73's two were;
- the 2 pages merged away (`merged-pages.txt`) while they are still on disk; their kept pages take the Kew id.

That is 31 here and 29 on the live corpus of 8,945 (the two merged pages pruned). 8,916 pages take `k<id>`. Six of these take an accepted infraspecific or hybrid row of Kew's (Ceropegia keithii is Kew's Orbea carnosa subsp. keithii); they are listed too, but the id is unambiguous.

**When ids are given.** By one rule in one place, `--index`, which every build step ends with: each dossier's id is worked out again and a file under the wrong name is written under the right one (the other's references to it, `distribution.via.page` and `photos[].shared`, follow). A second run renames nothing. A new dossier written by a build gets its id by the same rule at once.

**Merged pages and pages with other GBIF keys.** A page merged into another is not a holder of its Kew entry, so the kept page takes `k<entry>` (the merge follows Kew's accepted id) and the merged one keeps `g<key>` until it is pruned. `occurrences.keys` and the two lists stay GBIF keys: they say which GBIF keys' records are read.

**Order and safety.** The corpus goes to `s/v3/`, which the round 77 Worker never reads (every read it makes is under `s/v2/`). So:

- the order is: the corpus step (upload to `s/v3/`) first, then the deploy. The live site serves round 77's `s/v2/` corpus throughout, unchanged.
- **Checked:** the deploy command is `node scripts/corpus-ready.mjs && npm run deploy` (the merge kept `package.json` unchanged, so the check is in the command, not in `npm run deploy`): it reads `s/v3/manifest.json` from the bucket and stops the deploy unless it is a manifest this build reads.
- **And by the Worker:** a bucket holding round 77's `s/v2/` corpus and no `s/v3/` one is answered 503 ("could not be read"), never the fixture.
- No device data or old URL needs keeping: slugs do not change, and device records hold GBIF keys and slugs, as before.

**Proof of the order.** Round 77's code over a bucket holding both corpora made 0 reads under `s/v3/`; its 864,824 answers were byte for byte those over `s/v2/` alone. So the upload cannot break the live site. This round's Worker over `s/v2/` alone answers 503, and `corpus-ready` stops an early deploy (`r78i-order.test.ts`). `s/v2/` stays until purged, so a rollback to round 77 works.

## Done

Branch `r78`, working copy `/tmp/claude-0/rev78/I`, commits up to `fcb1fc5` (and the report commit after it).

- **The id:** `src/lib/core/page-id.ts` holds the type, pattern, `kewPage`, `gbifPage`, `gbifAlias` and `gbifKeyOf`. `src/lib/dossier/page-ids.ts` holds the rule, and `src/lib/dossier/rekey.ts` renames files and moves `distribution.via.page` and `photos[].shared`. It reads every change before writing any; an unreadable file or two files of one GBIF key stop it with no change. The day of `changed` stays, and its fingerprint is taken again only where it was current.
- **Schema and lookups:** `DOSSIER_V` is 3 and the path is `s/v3/<id>.json`. Index entries, cards and sheets carry `key` (the id), `gbif` and `near` (ids). The card files hold `@<gbif>` → id. `Lookup.gbif()` works over the files and over the index. `/api/dossier/<id>` answers 200; `/api/dossier/<gbif>` answers 302, `no-store`, to the id, or 404. Older names GBIF resolves find their page by the alias.
- **Device side:** a plant's `taxonKey` and a followed species' `gbifKey` stay GBIF keys. The picker, the add and follow links, the JSON-LD, the "key differs" notice, home-page ownership and the import check compare with `gbif`. Slugs are unchanged.
- **Builder:** `--rekey` writes version 2 as version 3. `--index` (and the end of every build) applies the rule in place and writes `ids-gbif.txt`. `--keys` lines take a GBIF key or an id. `build.ts` takes `pageIdOf`. Nearest climates are worked out in a fixed order, so `near` lists do not change between machines. Fill reports and rebuild lists name pages by GBIF key, as before: those files outlive a rekey.
- **Deploy:** `scripts/corpus-ready.mjs` is the deploy's first step. `corpus-step.mjs` uses `s/v3`, treats `static/s/v2` as the backup, and its review compares dossiers across ids (`withoutIds`). `scripts/corpus-plan.txt` is this round's plan. `docs/DEPLOY.md` has a new section, "Round seventy-eight's corpus step".
- **Fixtures:** `fixtures/dossiers/s/v3/` holds k2735933, k2735990, k339841 and g999, and the index carries ids.
- **Tests:** new unit tests `tests/unit/r78i-page-id`, `-rekey`, `-lookups`, `-order`, `-build` and `-merges` (44 cases), and the e2e spec `tests/e2e/r78i-ids.spec.ts` (3 cases, in Chromium and the phone). Each failed on the base. 67 older test files were moved to page ids, with no case dropped or weakened.
- **About pages, old and new:**
  - `/about/formats` was: "served at `/api/dossier/<gbifKey>` (… and a key the index does not list answers 404, whatever the bucket still holds)". It now says: "served at `/api/dossier/<id>`, the page's id (… ; a GBIF key in its place, `/api/dossier/<gbifKey>`, moves for the moment to the id of the page whose own GBIF key it is, and is a 404 where no page's is)".
  - `/about/formats` adds: "The document's `key` is the page's id (since round seventy-eight; dossier version 3): `k` and Kew's plant_name_id where Kew's file gives the page one accepted taxon that no other page holds, else `g` and its GBIF Backbone key, as where Kew's rows do not decide, where two pages hold one Kew entry (which of them is Kew's is not guessed: a merge decides it), and for a page merged into another until it is pruned; `ids.gbif` is its GBIF key."
  - In `/about/formats`, the index entry now "carries `key`, the page's id, and `gbif`, its GBIF key, which a plant's `taxonKey` is compared with"; `near` is "the ids of the six species"; `distribution.via.page` is "that page's id"; the paths are `s/v3/…`; the card records are `#<id>`, with `gbif`.
  - `/about/how` adds: "A species page's id is Kew's: `k` and the plant_name_id of the taxon Kew's World Checklist accepts for the page, where that taxon is the page's alone; otherwise `g` and the page's GBIF Backbone key. … A plant you record keeps the GBIF key the name service or the picker gave it, as before; the reference's files hold each page's GBIF key beside its id, so a plant, an older name GBIF resolves, and a GBIF key in an address all find their page."
  - The export README says that `key` is the page's id and `gbif_id` its GBIF key.

## Needs

- **B (build sources):**
  - New fills must ask GBIF by `d.ids.gbif`, never `d.key`.
  - List dossier files with `DOSSIER_FILE` (`src/lib/dossier/rekey.ts`) under `static/s/v3`.
  - A build passes `pageIdOf` to `buildDossier`, as `scripts/build-dossiers.ts` does.
  - Expect merge conflicts in `build-dossiers.ts`, `corpus-fills.ts` and `build.ts`. Mine are mechanical: `d.key` became `d.ids.gbif` wherever GBIF is asked.
  - `names-step` asks by `ids.gbif`.
- **Round 79 (the merges):** the first change moves the seven lines of `scripts/merged-pages-79.txt` into `scripts/merged-pages.txt` and removes the file. The full build's plan then runs `--list-extra-keys --bulk bulk --backbone <simple.txt.gz>` before the build, and `--prune-followed` after it. This adds no owner step to a plan that has these steps already.
- **S (selection):** round 79's list should leave out the GBIF keys that leave by a merge (the first column of `merged-pages.txt`, nine keys). Otherwise the build makes those pages only for the prune to delete them. S's added clause, "and every species already in the reference", keeps the 15 pages with no Kew match as `g` pages: that is what the id rule expects.
- **S (selection), also:** a selection list that carries `plant_name_id` lets a page be named by Kew from the start. A page with no GBIF key at all would need `ids.gbif` made optional (round 79): today every page has one, and the alias, the build's fetches and a plant's `taxonKey` rely on it.

## For the owner's PC

1. `node scripts/corpus-step.mjs`: backup, then `dossier --rekey` (offline, a few minutes), then a stop. Read the review line in `corpus-step.log`. It should say 8,916 pages by Kew's id and 29 by GBIF's, 0 dossiers differing apart from their ids, and about 13,900 product files.
2. `node scripts/corpus-step.mjs --go-on`: the upload, about 660 MB and about 24,000 files, to `s/v3/`. The site keeps serving `s/v2/`. Then it stops and says to deploy.
3. `node scripts/corpus-ready.mjs && npm run deploy`. Its first line must say "corpus-ready: the bucket holds corpus … under s/v3/". If it says the bucket holds no version 3 corpus, nothing was deployed: finish step 2.
4. `node scripts/corpus-step.mjs --go-on`: the live check.
5. Later, once happy, `rclone purge r2:cultifolio/s/v2`, which also ends the way back to round 77.
6. Nothing for the seven merges this round: they are applied by round 79's full build (below).

## Merges (the owner's decision: all seven pairs)

**Decided: round 79's full build, not this round's corpus step.** The reasons:

1. **The data isn't here.** A merge needs `--list-extra-keys` with GBIF's backbone export, then a re-derive from `occurrence.zip` and the climate grid. None of these is here, so the steps could not be dry-run.
2. **Round 79 redoes it anyway.** It re-derives every page, so a round-78 re-derive would be thrown away, after adding three steps to an offline corpus step of minutes.
3. **The proof stays clean.** "Every page the same apart from its ids" and the review's "0 dossiers differ" hold only while no content changes.
4. **Round 73's rule refuses six of the seven.** Kew holds six leaving names as heterotypic synonyms of the entry, and round 73's extra-key rule refuses those, so these merges would never complete with round 73's tools.

**Made ready and tested:**

- `scripts/merged-pages-79.txt` lists the seven, each kept page the one under Kew's accepted name. No build reads that file this round; a test checks that.
  - Leaving into kept: Echeveria peacockii into Dudleya pulverulenta (k2778991); Weingartia pulchra into W. canigueralii (k2465834); Drosera parvula into D. paleacea (k64497); Ceropegia nubica into C. cereiformis (k505095); C. melanops into C. nigra (k502875); Copiapoa boliviana into C. calderana (k2735922); Echeveria sessiliflora into E. pinetorum (k2781299).
- `extraKeysFor` (`src/lib/dossier/extra-keys.ts`) takes `into`: a key the owner merged into this page is read whatever its type, since the merge is the owner's claim. Every other key's type rule stands. `scripts/extra-keys-list.ts` passes it.
- `tests/unit/r78i-merges.test.ts` (8 cases): the list, and that nothing reads it this round; the ids (`g` for both without the merge, `k<entry>` for the kept page with it); the prune waiting for the kept page; and, on Kew's real rows, C. melanops read on C. nigra and C. nubica on C. cereiformis, with the guards that an unmerged heterotypic key, or one merged into another page, is still refused.

**Proof that the merges resolve as round 73's do** (`scripts/dev/scale/r78-merge-proof.mjs`, results in `results/r78i-merges.txt`). The 18 real dossiers of all nine merges (round 73's two and these seven) went through `--rekey`, a simulated re-derive (the old address in `occurrences.keys` and the old name among the older names, as `build.ts` writes them) and `--prune-followed`. Then each merge was asked of the Worker's functions:

- the kept page by its id (200) and by its GBIF key (302 to the id);
- the old address and the old name (both resolve as an older name of the kept page);
- a search for the old name (the kept page first);
- a plant under the old slug (the kept entry);
- the old GBIF key (404, as for round 73).

**9 of 9 answer as round 73's do.**

## Measured

On a copy of the real corpus (`real-s/v2`, 8,947 dossiers), work in `I-s`. Results are in `scripts/dev/scale/results/r78i-*.txt`.

- **Dossiers** (`r78i-dossiers.txt`): 8,947 of 8,947 are the same apart from their id fields. 8,916 have a `k` id and 31 a `g` id (29 live). The index has 8,947 entries, and `near` is the same for all 8,947. The `g` pages and why are in `r78i-ids-gbif.txt`.
- **Lookups** (`r78i-lookups.txt`): 864,824 answers the same: every slug, older name, GBIF key, card, row, catalogue, featured, sitemap and API answer. Round 77's code over both corpora gave 0 reads of `s/v3/`, byte for byte the same.
- **Search** (`r78i-search-proof.txt`, `r77-proof.ts` adapted): 69,021 queries the same as round 77's key-file run. Against the whole-index run there were 100 "narrow" differences, the same as round 77's, and 0 others.
- **Pages** (`r78i-page-proof.txt`): 9,010 pages (every species, the front page, two groupings and 60 opened genus rows) had the same HTML and page data, all 200.
- **Round 76 proof** (`r78i-r76-proof.txt`): every tally had 0 different.
- **Corpus step dry run:** "0 dossiers differ … apart from their ids". It wrote 13,899 product files (365 MB), 8,947 dossiers (289 MB) and 1,321 genus records (5 MB): about 660 MB and about 24,000 files to upload. A second `--index` wrote 0 files, and every file under `s/v3` was the same by md5.
- **Checks:** `tsc` and `svelte-check` are clean (0 errors, 0 warnings). The whole unit suite, run alone: 4,077 passed, 8 skipped, 0 failed (after the merge work). The affected e2e specs: 131 passed in Chromium and the phone. The whole Chromium and phone suite, run once with `CI_STRICT=1`: 518 passed, 5 skipped, 0 failed (19.4 min).

## Not done

- `--fixtures` regeneration gives `g` ids, because the fixture build reads no Kew file. The committed fixtures were rekeyed by hand to `k` ids, with `name.kew` added.
- `scripts/extra-keys.txt` and `scripts/merged-pages.txt` stay keyed by GBIF key, by design: they say which GBIF keys are fetched or merged.
- A `--keys` file of page ids is parsed and unit-tested, but has not been run end to end against a real build.
- Firefox and WebKit were not run here.
- Nothing was uploaded or deployed. The seven merges are not applied this round (see Merges).
