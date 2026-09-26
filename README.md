# Cultifolio

A species reference that shows its sources, and a collection record that stays on your device.

Cultifolio is for people who grow plants seriously: cacti, succulents, bulbs, caudiciforms, whatever you keep under a number. Each species page is built from public data (GBIF, Kew's World Checklist, CHELSA, NASA POWER, iNaturalist, Wikipedia) and every figure on it says where it came from and how it was derived: the native range, every georeferenced record inside it, the climate read across the grid cells those records fall in (the median year and the 10th to 90th percentile across cells, drawn as a climograph), the growing season and the cold floor worked out from that climate by two fixed rules, a cultivation sheet assembled by rule from those figures, and the six species whose habitat climate is nearest (one stated distance, computed when the index is built). Species can be put side by side (`/compare`), and a page's climate can be shared as one picture with its sources drawn in. Nothing on a species page is written by a person or a language model, and a number the app cannot derive is left out and said to be missing, never filled in.

Your own collection is the other half: every plant under its own accession number with its timeline, photographs, provenance and place; benches with conditions; sowings that mint numbered plants when you pot them up; labels with QR codes; frost watch. Its records live in your browser's storage and are sent nowhere unless you turn on sync, which is end-to-end encrypted with a key only you hold; the server stores ciphertext and cannot read a plant name. What your own pages send the server is a short list, stated in full on `/about/how`: the hash bucket of each species you grow (one of 32, so a species is narrowed to one in about 280), your site's or a place's coordinates and altitude for the frost watch (rounded on the device), a units cookie and a one-letter hemisphere cookie on species pages, the name you type in the species picker, and the species page you click through to; no referrer, nothing preloaded on hover, and those pages ask no third-party host for anything unless you switch the reference's photographs on for them. There are no accounts and no analytics.

Source: https://github.com/zomethingje-eng/cultifolio. `/about/how` in the running app is the methodology. `/about/formats` documents the backup file, the change log and the sync wire format so you can read your data without this app.

## Running it

Node 22, npm.

```
npm install
npm run build && npm run preview     # http://127.0.0.1:4173 (wrangler dev, with a local R2 and KV; the port the e2e tests use)
npm test                             # unit tests (vitest)
npm run e2e                          # Playwright, against the preview server
```

Out of the box the app serves a three-species fixture corpus (`fixtures/dossiers/`), enough to run everything and to test with no network. A real corpus is built on your own machine from a names list:

```
npm run dossier -- names.txt --grid climate
```

`npm run reconcile` retries the names a build refused under the other spellings WCVP knows them by. `npm run export` packages a built corpus as a dataset bundle (the species JSON, `species.csv`, `climate.csv`, a README and the licence terms per source) so the reference data can be published and cited without the app.

Sources with a daily allowance are filled in afterwards rather than during the long run: `npm run dossier -- --fill openalex` for literature (about 1,000 species a day on a free `OPENALEX_KEY`), `--fill inat` for iNaturalist photographs (about 3,000 a day), and `--fill gbif --bulk bulk` for the photographs a GBIF Darwin Core download carries, which costs no API calls at all. When a derivation rule changes, `npm run dossier -- static/s/v2/index.json --offline --grid climate --bulk bulk` re-derives the whole corpus from the files and the grid in about an hour, carrying the name block, photographs, summary and literature from the previous build and asking no upstream.

`docs/DEVLOG.md` is the engineering log, and `docs/REVIEW-ROUND-4.md` and `REVIEW-ROUND-5.md` are the two full adversarial reviews with what was done about each finding. The log has the full account: the climate grid (a one-time pack of CHELSA with `scripts/pack-climate.py`), the bulk path for thousands of species (`npm run bulk`), and how to derive a large names list from what people actually grow (`npm run derive -- --inat 2500`, after `npm run bulk -- wcvp`).

## Deploying

It is a SvelteKit app on Cloudflare Workers with R2 for the corpus and the encrypted vaults, and KV for small counters. `docs/DEPLOY.md` is the checklist: the bucket and namespace once, the corpus uploaded to R2 with rclone, `npm run deploy` for every release, and what to check by hand after the first one. Sync is open (`SYNC_OPEN` is `1` in `wrangler.jsonc`: any vault can sync); remove the variable when licensing is wired in, and new vaults will need an entitlement.

## Layout

```
src/lib/core/       pure logic: the change log and merge rule, HLC, geography, the growing year, the sheet, names
src/lib/dossier/    building a species dossier from its sources; the bulk path; the fetch layer
src/lib/climate/    the packed climate grid and NASA POWER
src/lib/db/         the local vault (IndexedDB) and the reactive collection
src/lib/sync/       vault keys, sealing, the sync engine
src/lib/server/     what runs in the Worker: dossier lookup, end-to-end encrypted sync storage (the server sees sizes and activity, never content)
src/routes/         the pages
scripts/            corpus tooling (MIT)
tests/              unit (vitest) and e2e (Playwright)
fixtures/           a synthetic corpus and upstream responses for tests
```

## Licence

The app is AGPL-3.0 (see `LICENSE`). The data tooling under `scripts/` is MIT (see `scripts/LICENSE`). The data the reference is built from carries its own licences, listed in `NOTICE` and on every page that shows it.
