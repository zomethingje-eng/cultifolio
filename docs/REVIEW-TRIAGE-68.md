# Triage of the reviews of rounds sixty-seven and sixty-eight

Three reviews of commit `1609c19`:

| Short name | What it is | Findings | How it was run |
|---|---|---|---|
| **S** | `REVIEW-SELF-68.md`, six internal reviewers | 41 | The owner's corpus read on his PC; Commons and the live site from there |
| **IND** | Independent review (`review-68/outside-ind.md`) | 13 | Windows; WebKit and Firefox run; live site sampled |
| **R46** | Outside review "round forty-six" (`review-68/outside-r46.md`) | 32 | Linux; live site, GBIF and iNaturalist reached; 74 reverts; WebKit and Firefox run |

A finding is cited by its review and number: S-B1 is the self-review's B1, and R46-6 is round forty-six's 6.

The owner's instruction is to fix everything worth fixing. Each item is owned by one agent of round sixty-nine, and no file is changed by two agents. A change one agent needs in another's file is written as a need and applied at the merge.

| Agent | Area | Files it owns |
|---|---|---|
| **K** | Commons and every photograph's licence, credit, kind, size and order | `sources/commons.ts` (split out of `wikimedia.ts` before the round), `core/licence.ts`, `dossier/md5.ts`, `dossier/schema.ts`, `dossier/dedupe.ts`, `dossier/photo-size.ts`, `dossier/commons-fill.ts`, `dossier/open-gbif-fill.ts`, `ui/ref/head.ts`, `ui/ref/photos.ts`, `ui/Photos.svelte`, `ui/PhotoImg.svelte`, `ui/Lightbox.svelte`, a new `dossier/photo-kind.ts` |
| **M** | Matching across sources and the corpus builder | `dossier/build.ts`, `dossier/bulk.ts`, `dossier/drops.ts`, `sources/gbif.ts`, `sources/wikimedia.ts`, `sources/inat.ts`, `scripts/build-dossiers.ts`, `dossier/rederive.ts` |
| **X** | The example collection | `db/demo.ts`, `ui/grow/*` (demo-seed, example, DemoBar, ExampleAddLine, ExampleOffer, PlantsEmpty, TrySample), `src/app.html`, the add forms (`plants/new`, `propagation/new`), `places/+page.svelte`, `wanted`/`labels` add links |
| **R** | Records, the clock, the import, backups and the vault | `core/hlc.ts`, `core/log.ts`, `db/collection.svelte.ts`, `db/vault.ts`, `backup/*`, `import/*`, `sync/engine.svelte.ts` |
| **W** | The server | `server/sync.ts`, `server/counters.ts`, `server/caps.ts`, `server/sheets.ts`, `server/synonyms.ts`, `routes/api/**`, `hooks.server.ts` |
| **N** | Names and search | `core/search.ts`, `core/postings.ts`, `dossier/index-entry.ts`, `server/dossiers.ts`, `scripts/audit-common-names.ts` |
| **P** | Pages, words, the service worker, engines and the harness | `routes/+layout.svelte`, `routes/species/[slug]/*`, `routes/places/[id]/*`, `routes/today/*`, `routes/about/**`, `ui/index.svelte.ts`, `ui/SpeciesPicker.svelte`, `ui/keep-ask.ts`, `ui/take-over.ts`, `service-worker.ts`, `playwright.config.ts`, `tests/e2e/**` (new and failing specs), the seam tests |

Each agent writes the tests for its own fixes, each of which must fail on `1609c19`, and adds the reverts R46-31 found green in its area.

## 1. Before the launch

**K1. Commons files that are not photographs of the species.** S-B1, IND-1, R46-1.
- **One test of a file's kind** (`photo-kind.ts`), read from what the dossier already stores (the file title, its type) and, for new answers, Commons' categories, which the same request returns (`Categories` in `iiextmetadatafilter`). The test rejects:
  - maps;
  - herbarium sheets and specimens: "specimen", "herbari", "holotyp", "isotyp", "(GBIF n)", "COI000…";
  - plates and drawings: Curtis's Botanical Magazine, "Tab. n", illustrations, engravings;
  - seeds, resin, stamps and books;
  - "unknown" and "unidentified" plants;
  - hybrids ("×" or " x " between epithets);
  - "aff." and "cf.";
  - a title naming another species of the genus, or of a same-type older name's genus, that is not the species or one of its older names (Nepenthes tenuis under N. dubia, N. junghuhnii under N. singalana, Uebelmannia pectinifera under U. buiningii).
- **Formats.** JPEG and WebP only; PNG is dropped (maps and drawings, and R46-9's 600 to 750 kB tiles).
- **Order and lead.**
  - Within Commons' answer, titles that hold the species' epithet come first.
  - A Commons file never leads when the dossier has any photograph of its own, from iNaturalist or GBIF (S-B2, R46-16).
  - `gcmlimit` rises from 24 to 50 in the same request, so filtering still leaves up to 12.
- **No P180.** Depicts statements are not used as a gate: R46 measured that they catch 16 of the 40 bad leads and are missing from 55% of good files.
- **Applied at read time** in `safeUrls`, and in the index's lead and count, so the deploy corrects every page and `--index` every tile, with no rebuild. `/about/how` says which files are not shown.

**K2. Commons credits.** S-B3, S-B4, R46-2.
- **The author.** Read `Artist` only, never `Credit`. "Own work", "See above", "Unknown author", a bare "(talk)" or a URL is not an author, so under CC BY or BY-SA the photograph is not published.
- **Cleaning.**
  - Decode entities and take the first line.
  - "No machine-readable author provided. X assumed" becomes X.
  - "Collector: X" on a herbarium sheet is moot, because K1 drops the sheet.
- **Applied at read time** too, with a matching rule in `--prune-uncredited`.

**K3. Public domain is not CC0, and "Attribution" is not CC BY.** S-B5, S-B7, IND-3, R46-2.
- **A `pd` tag.** A new tag, shown as "Public domain", allowed alongside CC0, CC BY and CC BY-SA. The about pages and rule 4 say so.
- **Commons' short names.** Only `CC0`, `CC BY n`, `CC BY-SA n`, `Public domain` and `PD-…` are read.
- **The generic rule.** `licenceTag`'s `/attribution/` rule no longer gives CC BY for Commons' free text.
- **Stored photographs.** Those already tagged `cc0` whose credit says "Public domain" are read as `pd`.

**M1 (owner M, with K). A GBIF photograph takes its record's licence.** S-B6. `licenceTag(m.license)` only, as the bulk path does. A new `--fill gbif-licence` re-asks `occurrence/<key>` for each stored GBIF photograph that is not iNaturalist's, and drops those whose own licence is missing.

**M2. Kew's range under older names gave Lantana ×strigocamara another plant's range.** S-A1, IND-9, R46-11.
- **The hybrid sign.** "× " is removed before WCVP names are compared.
- **When the fallback runs.** Only when Kew has no row at all for the name. An accepted Kew entry with no range ends the lookup ("Kew holds this name, with no native range"). It is never a reason to look under older names.
- **Authors.** An older name's author must agree with the WCVP row's, with no single-row bypass.
- **Pro parte synonyms** are skipped.
- **Rank.** Every accepted entry reached is counted, with or without a range, and exactly one is required, at species rank.
- **The record.** The resolved WCVP id is carried into the distribution lookup (IND-9), and the older name it came by is kept: "Kew's entry Erythrina afra Thunb., reached by Erythrina fissa C.Presl".
- **Same-type names are not required here.** S-A found that Erythrina caffra and Conophytum tomasii reach the right entry only through names on another type; R46 would restrict the fallback to same-type names. The decision is S-A's, because the author and rank checks close the Lantana path.
- **The page.** Its note "Kew holds no entry under this page's name" says what was found.
- **The corpus.** The 17 are rebuilt.

**M3. A Wikipedia redirect brings another taxon's summary.** R46-12.
- **The rule.** A summary is kept only when Wikipedia's final title is the item's own sitelink, the species' name, or one of its older names. Otherwise the record is "none: Wikipedia redirects X to Y".
- **The corpus.** An offline pass drops stored summaries whose title is none of those (Weingartia pulchra, Kopsia fruticosa).

**N1. An older name of two species.** S-F1, R46-3.
- **Redirects.** `bySynonym` is filled from shown older names first. A name that two species hold among their search-only older names, or that two species show, is ambiguous and does not redirect.
- **The 404.** It says the name is an older name of two species of the reference, and names them.
- **Search** ranks a hit that keeps the older name's epithet first.

**P1. A US place page says "All clear." when the National Weather Service did not answer.** R46-6. The place page reads `refused` and `unanswered` apart, with Today's two sentences, and the pill says "alerts not checked" for both. A test drives both statuses on both pages.

**W1. Each vault's place keeps its owner's network.** S-E1. The network is kept in a day-dated key swept with the address keys, and `unfill` reads it from there. A test checks that no long-lived record holds an address-shaped string after the sweep.

## 2. The species reference

- **M4. GBIF synonyms are read 50 at most.** S-A3, IND-2, R46 (Portulaca retusa). Synonyms are paged until `endOfRecords`, with a marked truncation; a truncated list counts as no answer for the fallbacks; the bulk fetcher reuses the builder's reading. The species whose stored list has exactly 50 synonyms are listed for a `--keys` rebuild.
- **M5. Inactive iNaturalist ids.** R46-13.
  - **At build.** Every iNaturalist id, from Wikidata or carried from the previous build, is checked with `/v1/taxa/<ids>`, 30 a request. An inactive id follows `current_synonymous_taxon_ids` when it names one taxon; otherwise the name search runs.
  - **The corpus.** A `--fill inat-ids` does the same, and `--fill inat` then takes the photographs.
  - **Carried identifiers** keep the date of the build that read them, and are not carried past 90 days.
- **M6. The iNaturalist older-name fallback.** R46-14, S-A5.
  - A taxon is taken only when its own name is the accepted name or a same-type name, and never when the index holds it as another species.
  - The search is limited to plants (`taxon_id=47126`).
- **M7. The Wikidata name fallback.** IND-8.
  - A name hit is taken only when it is the one exact label among the results.
  - Its P846 must be the species' key or a same-type key. Without P846, its P225 must be the name.
  - `srlimit` is the number of keys plus one (R46-16).
- **M8. Provenance and "ambiguous".** S-A6, R46-15.
  - A new `ambiguous` status is said as "not taken: two items answered".
  - Every older-name answer names the older name.
  - Kept identifiers name the build they come from.
  - A refused synonyms request says the older names were not asked.
- **M9. The drops audit.** S-A2. It flags:
  - a lost identifier, summary or range;
  - `ok` turning to `none` for Wikidata, Wikipedia, iNaturalist's taxon or WCVP;
  - photographs falling by more than half;
  - identifiers kept for a second build in a row.
- **M10. A lag spell.** S-A7. After ten species in a row that end lagged, the script stops waiting and keeps the previous identifiers at once. The stale "tail build" comments go.
- **M11. Script wiring tests.** S-F5, R46-31: the mwWait seam, both resume skips, the homonym guard and the range-only rule.
- **M12. Search's synonyms in the index.** The index carries older names from the paged list after the rebuild (M4). Nothing else changes in N1's index.
- **K4. Commons sizes.** R46-9.
  - Small slots (catalogue rows, genus thumbnails) use Commons' 120- or 250-pixel thumbnail.
  - A file between 501 and 959 pixels wide leads at its own width, not its 500-pixel tile.
  - The lead gets a 500w/960w `srcset`.
  - `/about/how` says the sizes.
- **K5. The lead photograph.** S-B2, R46-16.
  - `heroOf` ranks by source as well as by flag: wild iNaturalist, then GBIF, then cultivated iNaturalist, then Commons.
  - The build orders GBIF before Commons (owner M), and counts only non-Commons photographs towards "fewer than six".
- **N2. Search ties and spellings.** R46-4, S-F2, S-F3.
  - A tie is broken by the name's place in `[common, ...commons]`, then by photo count.
  - Apostrophes are stripped before splitting.
  - Pooled spellings are indexed in a search-only field, and the open spelling wins a tie for the headline.
  - A family matches from its start once the typed word is six letters or more.
  - The genus words allowed as English nouns gain anemone, aralia, geranium, acacia, verbena and petunia.
- **N3. The about page's naming rules.** S-F4. The tie-break is said as the alphabet, unless N2 replaces it, and the "Zebra plant" example and the missing search step are corrected.
- **Not done:**
  - **R46-16, Gonialoe variegata.** The P566 rule picks the stub Tulista variegata over Aloe variegata. It never picks another plant, and Wikidata's links are its data.
  - **R46-16, duplicate pages** (Weingartia fidaiana and Rebutia fidana). The backbone holds both as accepted. Noted for the corpus's next audit.

## 3. The example collection

- **X1. `?left=sample` deletes too much.** S-C1. The delete mark is honoured only in the tab that pressed Leave, by a one-use token that Leave writes and the address carries.
- **X2. A tab that was away when another tab left never closes, and re-seeds.** R46-19, R46-28.
  - Leave writes a generation to localStorage, which `app.html` compares before paint.
  - A tab whose example generation is stale opens the grower's own collection.
  - `sampleClosedHere` does not navigate a page whose fields have input.
  - Places and the picker's typed place count as dirty.
  - The leftover offer is noted only when answered, and leftovers past 30 days are deleted.
- **X3. "Keep it as my own" keeps only the species.** S-C2, IND-4, R46-5.
  - Every field of the form, the place included, goes into one sessionStorage key, which the grower's form reads once.
  - Notes and prices never go in the address.
  - `saved` is set before leaving, so the browser does not ask "Leave site?".
  - Propagation and Places do the same.
- **X4. "Empty" and a pending Replace.** S-C3. A pending replacement is not empty (with R).
- **X5. The places-only grower's banner.** IND-7. A still-loading collection is unknown, not empty. The bar waits for the settled test, and never reads the plants-only hint as proof of absence.
- **X6. The seed without Web Locks.** IND-6. The claim's owner and the unseeded state are checked in the transaction that appends the seed (a `putWith` option, owner R). A stale claimant aborts, and a claim is cleared only by its owner.
- **X7. Add links that lead into the example.** S-C4, R46-27. "Sow seed", Wanted's "Got it", a place's "Add a plant here", Labels, Today's "Add one" and search's "add it as a plant" all lead out first.
- **X8. The example chip.** R46-26. An "Example" chip sits in the top bar while the page is in the example.
- **X9. The closed state's words.** S-C5. Its refusal says the example closed, never "free space", and pages without an unload guard keep what was typed.

## 4. Records

- **R1. The import key.** S-D1, IND-5, R46-20.
  - A parsed date is keyed by its exact day. Day and month are swapped only when the cell was ambiguous.
  - The key includes the final notes text, so unmapped columns count.
  - Price is compared as a number.
  - A numbered line matches on its number alone.
- **R2. The slow clock.** S-D2, R46-17. R46's four steps are adopted:
  - While unsure with a stored positive correction over two days, a peer's changes are held rather than parked.
  - Local edits are stamped past the field's newest stamp, held ones included.
  - A confirmed correction is never taken out of force on one reading.
  - The snapshot is keyed by the stored offset.

  The suspected photo removal is checked. `hlc.ts` and `/about/formats` say the rule as it now is.
- **R3. A malformed change.** S-D3, S-D4, R46-18.
  - `exportChanges`, the outbox fill and `previewMerge` skip what `changeError` refuses.
  - A backup carries skipped rows as `unreadable.json`.
  - Every page shows a refused database, not "Opening your collection…".
- **R4. A resumed Replace is announced to other tabs.** R46-21.
- **R5. A non-string `t` is skipped in the tail read.** R46-29.
- **R6. Renumber's notes after a hand change.** S-D5.

## 5. The server

- **W2. The listing budget.** S-E2, IND-10, R46-22. Fifty pages are reserved at the check, and what was not used is given back.
- **W3. The Worker's own caches.** S-E3, R46-8, S-F6.
  - Search, sheets, names, the forecast and the old-name check are keyed by the build.
  - The cached 404 and 302 are listed on `/about/how`.
- **W4. A replayed photograph takes the hold.** S-E4, R46-23. With a proof that does not match, the answer is `same` and no hold is taken.
- **W5. Small batches.** R46-24. A vault may write 3,600 batches an hour, counted in `vault.take`.
- **W6. Wording.**
  - **S-E5, R46-7.** A 503 with Retry-After reads "could not be read just now", and a 5xx without a body "did not answer". This is client wording, owner P.
  - **S-E6.** "Tries again within the hour", not "tomorrow".
  - **S-E7.** NASA POWER's failure is recorded as `error`.
  - **R46-25.** The network limit says another network may work now.
- **Not done:**
  - **S-E8, the removal proof as a static header.** It predates these rounds, and replacing it needs a protocol change. It is noted in the backlog.
  - **S-E9, the keep-data ask in Chrome and Safari.** The monthly gate stays, because a browser that answers without asking gives the same answer on every load.

## 6. Pages, the service worker, engines and the harness

- **P2. The reload after a deploy.** IND-11. The layout no longer assigns `location.href` in `beforeNavigate`. The navigation finishes, and the new page reloads in `afterNavigate` when nothing is typed there.
- **P3. The about pages.**
  - S-E's seven sentences, R46-10 ("in one commit"), and the Commons sizes and kinds (K).
  - The HTTP cache list gains the year-long cache of sealed batches and photographs.
  - The seam tests gain what R46-31 lists: photograph addresses against the image policy, the sizes sentence, the cache keys, and a direct `persist()` call outside the gate.
- **P4. Engine tests.**
  - **IND-12, R46-30.** The Firefox second-tab test sets its tab up explicitly.
  - **IND-13.** The fixture home reserves the heading and count's height.
  - **IND and the WebKit persistence test.** It is investigated; if its cause is the test, it is fixed there, and if not, it is reported.
  - **R46-19.** The WebKit second-tab-closes test follows X2.
  - **R46-30.** Firefox's service-worker control waits for control before going offline.
- **P5. The harness.** R46-31.
  - Green reverts get tests, each in its owner's area.
  - The S5 test that hangs is given a timeout.
  - The disclosure check covers every `<details>`.
  - The webServer's inspector port is set apart.
- **The documents.**
  - `REVIEW-ROUND-67.md` section 3 and `REVIEW-PROMPT-68.md` are corrected on Workers Logs.
  - The stale tail-build comments go (M).

## 7. The corpus step after the deploy

In this order, with the corpus backed up first:

1. `--fill gbif-licence` (M1).
2. `--prune-uncredited` with the new rule (K2).
3. `--fill inat-ids`, then `--fill inat` (M5).
4. An offline pass over stored summaries (M3).
5. `--keys` for the 17 ranges taken under older names and for the species with 50 stored synonyms (M2, M4).
6. `--index`, the audit, and the upload.

K1, K3 and K4 need no step: they act where a dossier is read.
