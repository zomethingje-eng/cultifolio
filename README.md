# Cultifolio

A species reference that shows its sources, and a collection record that stays on your device.

Cultifolio is for people who grow plants seriously: cacti, succulents, bulbs, caudiciforms, whatever you keep under a number. Each species page is built from public data (GBIF, Kew's World Checklist, CHELSA, NASA POWER, iNaturalist, Wikipedia) and every figure on it says where it came from and how it was derived: the native range, a habitat centre found from the records, the climate at that point month by month, the growing season and the cold floor worked out from that climate, and a cultivation sheet assembled by rule from those figures. Nothing on a species page is written by a person or a language model, and a number the app cannot derive is left out and said to be missing, never filled in.

Your own collection is the other half: every plant under its own accession number with its timeline, photographs, provenance and place; benches with conditions; sowings that mint numbered plants when you pot them up; labels with QR codes; frost watch. It lives in your browser's storage and nowhere else. There are no accounts and no analytics. Sync between your devices is end-to-end encrypted with a key only you hold; the server stores ciphertext and cannot read a plant name.

Source: https://github.com/zomethingje-eng/cultifolio. `/about/how` in the running app is the methodology. `/about/formats` documents the backup file, the change log and the sync wire format so you can read your data without this app.

## Running it

Node 22, npm.

```
npm install
npm run build && npm run preview     # http://127.0.0.1:8787 (wrangler dev, with a local R2 and KV)
npm test                             # unit tests (vitest)
npm run e2e                          # Playwright, against the preview server
```

Out of the box the app serves a three-species fixture corpus (`fixtures/dossiers/`), enough to run everything and to test with no network. A real corpus is built on your own machine from a names list:

```
npm run dossier -- names.txt --grid climate
```

`npm run reconcile` retries the names a build refused under the other spellings WCVP knows them by. `npm run export` packages a built corpus as a dataset bundle (the species JSON, `species.csv`, `climate.csv`, a README and the licence terms per source) so the reference data can be published and cited without the app.

Literature comes from OpenAlex, whose free key allows about 1,000 species a day: build with `--skip openalex`, then `npm run dossier -- --fill openalex` (with `OPENALEX_KEY` set) once a day until every dossier has its papers.

`docs/DEVLOG.md` has the full account: the climate grid (a one-time pack of CHELSA with `scripts/pack-climate.py`), the bulk path for thousands of species (`npm run bulk`), and how to derive a large names list from what people actually grow (`npm run derive -- --inat 2500`, after `npm run bulk -- wcvp`).

## Deploying

It is a SvelteKit app on Cloudflare Workers with R2 for the corpus and encrypted vaults, and KV for small queues. Once:

```
npx wrangler r2 bucket create cultifolio
npx wrangler kv namespace create QUEUE        # paste the id into wrangler.jsonc
```

then `npm run deploy`. `SYNC_OPEN=1` in `wrangler.jsonc` lets any vault sync; remove it when licensing is wired in.

## Layout

```
src/lib/core/       pure logic: the change log and merge rule, HLC, geography, the growing year, the sheet, names
src/lib/dossier/    building a species dossier from its sources; the bulk path; the fetch layer
src/lib/climate/    the packed climate grid and NASA POWER
src/lib/db/         the local vault (IndexedDB) and the reactive collection
src/lib/sync/       vault keys, sealing, the sync engine
src/lib/server/     what runs in the Worker: dossier lookup, zero-knowledge sync storage
src/routes/         the pages
scripts/            corpus tooling (MIT)
tests/              unit (vitest) and e2e (Playwright)
fixtures/           a synthetic corpus and upstream responses for tests
```

## Licence

The app is AGPL-3.0 (see `LICENSE`). The data tooling under `scripts/` is MIT (see `scripts/LICENSE`). The data the reference is built from carries its own licences, listed in `NOTICE` and on every page that shows it.
