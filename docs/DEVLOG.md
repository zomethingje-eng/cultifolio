# Development log

Milestone-by-milestone notes on how Cultifolio was built and why. The public README is at the repo root; this file is the history.

Cultifolio v3 is a rebuild of an earlier app ("Herbarium v2"), which stays deployed on its own Worker until this one replaces it at cultifolio.com.

## Milestone 1 — walking skeleton (this build)

What works:

- **Species dossiers.** One JSON per taxon (`s/v1/<gbifKey>.json`), built once by `src/lib/dossier/build.ts` from GBIF (backbone, WCVP distributions, occurrences), iNaturalist (photos, `photo_license=cc0,cc-by,cc-by-sa` only), Wikidata (cross-IDs, CC0), Wikipedia (lead paragraph, CC BY-SA, kept segregated), Wikimedia Commons (per-file licence), OpenAlex (CC0). Every upstream's answer is recorded as `ok / none / refused / error`; only `none` is ever rendered as an absence. Occurrence records are filtered to CC0/CC-BY before anything is derived from them, and the page says how far the restricted records would have moved the habitat centre.
- **Server-rendered species pages** at `/species/<slug>` with meta tags and JSON-LD, readable with JavaScript off.
- **Front page** in the Bench look: featured species plus a grid grouped by native region.
- **Collection core**: accessions, timeline events (with measurements, treatments, death causes), per-plant notes and per-species notes, in an append-only IndexedDB change log with hybrid logical clocks and field-level last-writer-wins merge. Numbers are never reused. The numbering scheme is a vault setting (year-prefixed by default, organisation prefix later).
- **v2 importer** (`/plants/import`): takes a v2 backup JSON, keeps your numbers, writes nothing back.
- **Export**: the whole change log as JSON.
- **Still maps** from Natural Earth coastlines, referenced as one cached static SVG.
- **Self-hosted fonts** (OFL, via @fontsource).

## Milestone 2 — data tier

- **Habitat climate** from a packed 0.05° grid: CHELSA V2.1 1981–2010 monthly normals (tasmax, tasmin, tas, pr, rsds→DLI, hurs, vpd, sfcWind; CC0) plus ETOPO 2022 elevation, 97 int16 layers interleaved per cell so a lookup is one 194-byte range read (`src/lib/climate/`). Extremes (absolute and 1st-percentile minimum, 99th-percentile maximum, frost nights per year) from NASA POWER's daily MERRA-2 series 1981–2024, lapse-corrected from POWER's cell elevation to the grid cell's at 6.5 °C/km, cached forever per POWER cell.
- **Frost watch** at `/frost` and `/api/forecast`: MET Norway Locationforecast (CC BY 4.0, worldwide) reduced to daily min/max, NWS frost/freeze alerts for US points, edge-cached an hour per 0.01° cell.
- Corpus script flags: `--grid climate` (use the packed grid), `--only-refused` (rebuild only species whose last build had refusals or pending climate).

## Milestone 3a — benches

- **Location tree** (`location` records, any depth: room › bench › shelf › tray). Conditions (indoor, floor °C, PPFD, light hours, coordinates, altitude) are inherited: a shelf with nothing set reports its nearest ancestor's values and says which ancestor they came from. `/benches` lists the tree with plant counts; `/benches/[id]` edits one place.
- **Whole-bench actions**: water all / feed all record one event per plant in a single commit; **audit mode** ticks off what is physically present and stamps `audit` events, so each plant carries a "last seen" date and the bench page flags plants not seen recently.
- **Frost watch per place** for outdoor locations with coordinates; the floor temperature of a protected place is added to the forecast before the risk level is computed.
- v2 benches import as locations (`l-v2-…` ids); plants whose v2 bench text matches no bench keep the free text and can be converted to a location from `/benches` in one click.
- `id`, `kind` and `_t` are reserved record fields; the log refuses a change that sets them.

## Milestone 3b — sowings and propagation

- A **sowing** is any propagation batch (`sowing` records, numbered `S2026-001` per year): seed, cuttings, offsets, leaf cuttings, divisions, bulbils, grafts. It records what was started, from where (seed source and lot, or the parent plant for vegetative material), medium, container, pre-treatment, bottom heat, cover, and where it sits.
- Its timeline takes **germination counts** (cumulative: "up so far"), **losses** with a cause, notes, and **pot up**, which mints one accession per plant potted in a single commit: the batch as `sowingId`, provenance derived from the seed's (wild seed → F1 plants; vegetative → veg), the parent's field number and cultivar carried, an acquire event each, and a potup event on the batch naming them. `/sowings` lists batches with day count, germination rate and potted count; `/sowings/[id]` is the batch page; `/plants/[acc]` links back and offers **Propagate** (a vegetative batch from that plant, recorded on its timeline).
- Fixed: event ids were derived from the last 14 characters of the HLC, which on a real device collided on nearly every write (a later event silently replaced an earlier one). Ids are now wall time + counter in base 36 plus a device tag, with a regression test.

## Milestone 3c — the user's path, and photographs

- **Flow.** Species → "Add one to my plants" / "Sow seed" arrive prefilled (species, GBIF key, last-used place or the bench you came from). The species page shows what you grow of it and holds your own notes. The plant page has **Move** (inline new place), **Habitat versus here** (the species' DLI range and cold floor against the bench's figures; a missing figure hands off to the bench's edit form with `?edit=1`), and an **Its year** tile that says whether the plant should be growing or resting this month in your hemisphere. Bench pages offer "Add a plant here" and "Sow here".
- **Photographs** of your own plants and sowings. Camera or file; resized on the device (long edge 1600 px, 320 px thumbnail, JPEG q0.85) so the original never leaves the phone and is not kept; the date comes from EXIF `DateTimeOriginal` when present (`src/lib/photo/exif.ts` reads that tag and orientation and nothing else — no GPS, no camera model), else the day it was added. Metadata is a `photo` record in the change log (so it syncs and sits on the timeline); the pixels live in the vault's `photos` store under the same id, with a SHA-256 so sync can tell a blob is already there. A plant's **cover** is its chosen photo, else its newest; it is the hero on the plant page and the thumbnail in lists. The lightbox captions, redates, sets the cover and removes; arrow keys and swipes move through the set. The species page shows *Your photographs* ahead of the open ones.

## Milestone 3d — backup

- `/backup` (the old `/plants/import` redirects there). **Take a backup** downloads one zip, `cultifolio-YYYY-MM-DD.cultifolio.zip`: `manifest.json` (format, version, device, counts, numbering scheme), `changes.json` (the whole change log), `photos/<id>.jpg` and `photos/<id>.t.jpg` (stored, not deflated), and `plants.csv` (one row per plant with the location path resolved, BOM for Excel; for people, not for import). The last backup time is kept in vault meta and shown on the page.
- **Restore** reads a backup zip, the older changes-only JSON, or a v2 Herbarium backup (detected when the zip/JSON parse fails and the file is JSON with accessions), and shows what is in it and what merging would do before anything changes. **Merge** appends only changes this device has not seen (by HLC) and photos it lacks, so restoring an old file over a newer collection loses nothing and restoring twice changes nothing. **Replace** wipes the device first and reloads. `src/lib/backup/backup.ts` is pure (build/read/preview/CSV, unit-tested with a round trip); `io.ts` wires the vault.

## Milestone 3e — cultivars and hybrids

- A plant is one of three things, recorded as `nameKind` on the accession (and sowing): a **species** (`taxonName` a binomial), a **cultivar** of a known species (binomial + `cultivar`), or a **hybrid** (`taxonName` is the genus or nothogenus; `parentage` holds the cross when known). Named `nameKind` because `kind` is the log's record type. Old records read as species, or cultivar when a cultivar is set (`kindOf()`).
- `parseName()` reads what a label says: "Haworthia truncata 'Lime Green'" → cultivar; "Echeveria 'Blue Curls'" → hybrid of unstated parentage under *Echeveria*; "Ariocarpus retusus x A. trigonus" → hybrid under *Ariocarpus* with parentage "Ariocarpus retusus × Ariocarpus trigonus" (abbreviated genera expanded); "Echeveria × imbricata" → a nothospecies the backbone may know; "× Graptoveria 'Fred Ives'" → nothogenus. The picker matches a genus-only name at genus rank in GBIF and offers no species suggestions for it.
- The plant page shows a hybrid/cultivar pill, the parents linked to their species pages where the corpus has them, "A hybrid: no habitat of its own" in place of the climate tiles (no Habitat-versus-here, no species-page button), and a parentage row. Lists show the pill. The species page's "you grow N" counts cultivars of the species, not hybrids of it. Hybrids never enter the corpus; there is no cultivar registry and the app does not pretend to one.

## Corpus at scale: the bulk path and the derived list

Per-species API calls are the wrong shape past a few hundred species. Two downloads replace the two slowest legs; `buildDossier()` is unchanged, because `bulkFetcher()` (`src/lib/dossier/bulk.ts`) answers the distribution and occurrence URLs from the files and passes everything else through, so a dossier built either way is the same dossier.

```
npm run bulk -- wcvp                       # Kew's WCVP checklist → bulk/wcvp_names.csv, bulk/wcvp_distribution.csv (~1 GB unpacked)
set GBIF_USER=… GBIF_PASSWORD=… GBIF_EMAIL=…   (a free gbif.org account; PowerShell: $env:GBIF_USER="…")
npm run bulk -- gbif names.txt --wait      # matches every name, requests ONE occurrence download for all their keys, waits, unpacks → bulk/occurrence.csv
npm run dossier -- names.txt --grid climate --bulk bulk   # the build, reading from bulk/; photos, Wikipedia and literature still per species
```

- WCVP is streamed in two passes (every genus in the list is kept, so a synonym resolving within the genus still finds its range); occurrences are sampled per species as the file streams (≤4,000 each, chosen by a stable hash of the record id, so a rebuild finds the same habitat centre). `bulk/keys.json` caches name → key; `bulk/unresolved.txt` lists what the backbone could not place.
- A species the files lack falls through to the API, so a fresh name still builds. The build prints how many requests each path served.

**Deriving the 5,000-name list** (`npm run derive -- --target 5000 --out names-5000.txt`): iNaturalist "captive/cultivated" observation counts under Plantae (the head of what people grow, across every kind of grower), resolved against the backbone, minus the families in `scripts/excluded-families.txt` (cereals, turf, timber), plus every accepted species of the `scripts/specialist-genera.txt` genera (the collector genera, taken whole because a Namaqualand bulb never out-observes a pothos). The target bounds the iNat share; the genera come whole. `names-5000.txt.csv` says why each name is there, with its family and count, for pruning. Everything is cached under `bulk/derive/` so a rerun with a different target is instant.

## Milestone 3f — the note in short, and labels

- **In short** (`src/lib/core/note.ts`, `generatedNote()`): the cultivation sheet condensed to one paragraph by rule, one sentence per card, in the sheet's own figures, with the months shifted to the reader's hemisphere (from the first bench with coordinates; north otherwise, and the card says so). The card lists which rows each sentence came from. Nothing is written by a model; the dossier's `note` field stays reserved for that if it ever happens and is shown in preference when present.
- **Labels** (`/labels`, from the plants list, a plant's ID card, or a bench's quickbar with `?acc=` / `?loc=`): pick plants, pick a sheet (Avery 5160, 5163, 5167 pot-rim, L7160 A4, or strips to cut), skip the cells already used on a part sheet, and print. The preview is at true size in mm and `@page` follows the sheet, so the printer gets the sheet. Each label: number, field number, name (cultivar, parentage for a hybrid), optional source and date, an optional **care line** from the sheet (`careLine()`: "winter grower Nov–Feb · >4 °C · full sun · dry between"), and a QR code (the `qrcode` package, SVG) that opens the plant's page on this site. Choices are remembered per browser.

## Milestone 3g — first run and phones

- A one-time card on the front page for a browser that owns nothing yet: what the reference is, what the collection is, where it lives, and three ways in (add a plant, make a place, restore or import). Dismissable; gone for good once a plant exists.
- Phone pass at 390 px: every button, chip and tab is at least 40 px tall; the climate table scrolls sideways; species tiles whose photograph fails to load say so instead of showing a broken image; the plant timeline keeps its remove control on the row; notes-card headers wrap.

## Milestone 4 — sync (end-to-end encrypted)

- **One vault key**, made on the first device (`newVaultKey()`: 30 symbols from an unambiguous alphabet, six groups of five, ~147 bits, drawn without bias). HKDF splits it into an AES-256-GCM key (never leaves the device, non-extractable) and an auth token; the vault id is a hash of the token. The server stores a hash of the token and ciphertext, and can neither read a byte nor recover a lost key. `src/lib/sync/crypto.ts`, WebCrypto only, unit-tested (round trip, wrong key, wrong purpose, tampering, photo packing).
- **Server** (`src/lib/server/sync.ts`, `/api/sync/*`): zero-knowledge storage on R2 under `vault/<id>/` — `meta.json`, `log/<hlc>.bin` (one sealed batch per push, named by its last change's HLC so a list is a pull), `photo/<id>.bin`. Nothing is rewritten or deleted. Joining requires an existing vault (`create: false`), so a mistyped key cannot quietly become a fresh empty vault. `SYNC_OPEN=1` lets any vault sync (dev and pre-launch); the licence check lands on `entitlement`.
- **Engine** (`src/lib/sync/engine.svelte.ts`): first push sends the whole log; after that only changes stamped by this device's clock. Pull lists batches after a cursor, skips its own, ingests through the same merge as backups (per field, latest HLC wins). Photos by id, immutable, both ways. Runs on app load, 2.5 s after any local write, and when the browser comes back online; the topbar shows a ⟳ that spins while it works and turns red on an error.
- **Page** (`/sync`): set up (key shown once with a QR, must tick "I have saved it"), join (type, paste, or scan the QR with the camera where `BarcodeDetector` exists), status tiles, "Add another device", stop syncing here (nothing deleted). The e2e test runs two isolated browsers through create → join → edits both ways → a concurrent edit of one field resolving the same way on both → a wrong key refused.

## About pages

- `/about/how`: the methodology, in prose, for a reader who wants to check the claims: sources and licences, "a refusal is not an absence", the habitat centre (range test, densest cluster at 1°/2°/4°, densest 1° sub-cluster, nearest real record; restricted records inform the centre and are never published), climate at the centre (CHELSA, DLI conversion, POWER extremes with lapse correction and the 20-year/95% rule), the growing year (70% rule, fog branch, even years, hemisphere shift), the cold floor, archetypes, the note, the collection model, and what the site knows about you (nothing). Prerendered; readable without JavaScript.
- `/about/formats`: the change log (shape, HLC, the merge rule), the backup zip, the sync wire format (key alphabet, HKDF parameters, sealed-blob layout, object keys, endpoints), and the dossier document. Both linked from the footer.

Not yet: payments (Polar) and the entitlement check; the repo; the dataset export.

### Building the climate grid (once, on your PC)

```
pip install rasterio numpy requests
python scripts/pack-climate.py
```

Downloads 96 CHELSA GeoTIFFs (~20 GB, deleted as they are packed) and one ETOPO file, resamples each to 0.05° by mean, writes `climate/climate.grid` (5.0 GB) and `climate/climate.json`. Resumable; a crash costs one layer. Probe a cell afterwards:

```
python scripts/pack-climate.py --probe -24.877 -70.504
```

Then rebuild the corpus with climate:

```
npx tsx --tsconfig tsconfig.scripts.json scripts/build-dossiers.ts names.txt --grid climate
```

Upload the grid to R2 when the bucket exists (the Worker reads it with ranged GETs):

```
npx wrangler r2 object put cultifolio/climate/v1/climate.grid --file=climate/climate.grid
npx wrangler r2 object put cultifolio/climate/v1/climate.json --file=climate/climate.json --content-type=application/json
```

## Run it

```
npm install
npm run dev            # Vite dev server with the fixture corpus
npm run build && npm run preview   # the real Worker runtime (wrangler dev)
npm test               # unit tests (vitest)
npm run e2e            # Playwright against wrangler dev (needs: npx playwright install chromium)
npm run check          # svelte-check
```

## Build a real corpus

The sandbox this was built in cannot reach api.gbif.org, so the fixture corpus is synthetic. On your PC:

```
npx tsx --tsconfig tsconfig.scripts.json scripts/build-dossiers.ts names.txt --quick
```

`names.txt` is one scientific name per line (your 59 to start). Output lands in `static/s/v1/*.json` plus `static/s/v1/index.json`, which the app serves directly. Read the report line per species: it names every upstream that refused. Add `--upload` once the R2 bucket exists to push them with wrangler. Drop `--quick` to also consult Commons, GBIF media and OpenAlex.

## Cloudflare setup (once)

```
npx wrangler r2 bucket create cultifolio
npx wrangler kv namespace create QUEUE      # paste the id into wrangler.jsonc
npx wrangler deploy
```

The Worker is named `cultifolio`. Move the custom domain when v3 is ready.

## Layout

```
src/lib/core       pure TypeScript, unit-tested: licence, names, hlc, log (merge), accession, geo, extremes
src/lib/dossier    schema (valibot), fetch layer, sources/, tdwg boxes, build.ts
src/lib/db         IndexedDB vault, reactive collection store, domain types
src/lib/climate    packed grid format, sources (R2/HTTP/memory), NASA POWER, the climate provider
src/lib/weather    MET Norway + NWS reducers and the frost-risk verdict
src/lib/import     v2 importer
src/lib/map        still SVG maps
src/lib/server     where dossiers come from (R2, then fixtures)
src/routes         SvelteKit routes; /plants/* is client-only
scripts            offline corpus builder, climate grid packer (Python), Node grid reader
fixtures           synthetic upstream responses and the dossiers built from them
tests/unit, tests/e2e
```

## Rules carried over from v2

- A refusal is not an absence. A source that did not answer is never rendered as "none".
- Unknown is not open. A record whose licence nobody stated is not usable.
- Every derived number says where it came from.
- Anything whose shape can change carries a version in its path (`s/v1/`), and the schema refuses to serve what does not parse.
- Accession numbers are never reused; dead plants keep theirs.
- A field number is not a provenance.

## Licences

Client: MIT. Worker/server code: AGPL-3.0 (to be split when sync lands). Data: see the footer on every page and each photograph's credit.

**Dataset bundle** (`npm run export -- --dir static --version 2026.09 --out cultifolio-corpus-2026.09.zip`): everything the build wrote, packaged for people who are not running the app. `species/<slug>.json` verbatim; `species.csv` one row per species with the habitat centre, growing season, cold figures and counts, empty where the build could not derive; `climate.csv` twelve rows per species; `index.json`; `build-report.txt`; a README saying how it was derived and a LICENSE.md that gives the derived figures CC BY 4.0 and lists which fields keep their source licence (Wikipedia summaries are CC BY-SA; occurrence rows carry their own code; photos are links and credits only). `scripts/export-corpus-lib.ts` is the pure builder, `tests/unit/export.test.ts` runs it on the fixtures.
