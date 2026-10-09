# Cultifolio

A species reference that shows its sources, and a collection record that stays on your device.

Cultifolio is for people who grow plants seriously: cacti, succulents, bulbs, caudiciforms, whatever you keep under a number. Each species page is built from public data (GBIF, Kew's World Checklist, CHELSA, NASA POWER, iNaturalist, Wikimedia Commons, Wikipedia, OpenAlex) and every figure on it says where it came from and how it was derived: the native range, the georeferenced records inside it, and, where the sources answered, the climate read across the grid cells those records fall in (the median year and the 10th to 90th percentile across cells, drawn as a climograph in the habitat's months), the cold floor (the 1st-percentile night at a typical spot in the range, from NASA POWER's 1981–2024 daily series), the season two fixed rules read from the curves, shown again in the reader's own months, and up to six species whose habitat climate is nearest (one stated distance, computed when the index is built). The sheet states figures and rules and gives no advice. A small table of care groups names a convention for four groups (an indoor minimum, with no source); it is shown apart and never changes a habitat figure. Species can be put side by side (`/compare`), and a page's climate can be shared as one picture with its sources drawn in. Nothing about a species is written for its page by a person or by AI, apart from credited quotations (the sentence templates were written once for every species, by the author with Claude, as the code was), and a number the app cannot derive is left out and said to be missing ("not checked" when a source did not answer, "pending" when it is not derived yet), never filled in.

Your own collection is the other half: every plant under its own plant number with its timeline, photographs, provenance and place; places (a greenhouse, a bench, a shelf) with conditions; propagation batches that mint numbered plants when you pot them up; labels with QR codes; frost watch. Its records live in your browser's storage and are sent nowhere unless you turn on sync, which is end-to-end encrypted with a key only you hold; the server stores ciphertext and cannot read a plant name. A sample collection, in a database of its own on the device, lets a visitor try the record without typing anything. What your own pages send the server is a short list, stated in full on `/about/how`: the hash bucket of each species you grow (one of 32 at the present size, so a species is narrowed to one in about 280), your site's or a place's coordinates and altitude for the frost watch (rounded on the device), a units cookie with every request and a one-letter hemisphere cookie with species and compare pages, the name you type in the species picker and the names in a list you import, the service worker's check for a new version (once per full page load), and the species page you click through to; no referrer, nothing preloaded on hover, and those pages ask no third-party host for anything unless you switch the reference's photographs on for them. There are no accounts and no analytics.

Source: https://github.com/zomethingje-eng/cultifolio. `/about/how` in the running app is the methodology. `/about/formats` documents the backup file, the change log and the sync wire format so you can read your data without this app.

## Running it

Node 22, npm.

```
npm install
npm run build && npm run preview     # http://127.0.0.1:4173 (wrangler dev, with a local R2 and KV; the port the e2e tests use)
npm test                             # unit tests (vitest)
npm run e2e                          # Playwright, against the preview server
```

Out of the box the app serves a four-species fixture corpus (`fixtures/dossiers/`), enough to run everything and to test with no network. A real corpus is built on your own machine from a names list:

```
npm run dossier -- names.txt --grid climate
```

`npm run reconcile` retries the names a build refused under the other spellings WCVP knows them by. `npm run export` packages a built corpus as a dataset bundle (the species JSON, `species.csv`, `climate.csv`, a README and the licence terms per source) so the reference data can be published and cited without the app.

Sources with a daily allowance are filled in afterwards rather than during the long run: `npm run dossier -- --fill openalex` for literature (about 1,000 species a day on a free `OPENALEX_KEY`), `--fill inat` for iNaturalist photographs (about 3,000 a day), and `--fill gbif --bulk bulk` for the photographs a GBIF Darwin Core download carries, which costs no API calls at all. When a derivation rule changes, `npm run dossier -- static/s/v2/index.json --offline --grid climate --bulk bulk` re-derives the whole corpus from the files and the grid in about an hour, carrying the name block, photographs, summary and literature from the previous build and asking no upstream.

`docs/DEVLOG.md` is the engineering log. `docs/REVIEW-ROUND-4.md` onward are the adversarial reviews the build has been through, one file per round: each finding as the reviewer put it, whether it was real when checked against the source, and what was done, with the tests that hold it. From round fifty-seven the findings live apart from the round's account: `docs/REVIEW-SELF-<n>.md` is the author's own review of a round, `docs/REVIEW-TRIAGE-<n>.md` the decisions taken from it, `docs/review-60/` and `docs/review-61/` the reviews' reports and their tests (the latter with the two outside reviews of round sixty-one, `outside-a.md` and `outside-b.md`), and `docs/REVIEW-ROUND-<n>.md` the account of what the round fixed. Rounds four and five were passes over a checkout (round four with an outside model's review of the commit alongside); round six is the author's own; from round seven on, one or two outside language models reviewed each deployed build against the live site and the source, to a written brief, except round nineteen, which asked two of them what they would improve rather than what was broken. Every finding was verified in the source before anything was changed, and the ones that were wrong are marked as such. The code itself has been written largely with AI coding agents (Claude) working to the author's briefs and under the author's review; `docs/DEVLOG.md` says which rounds. The species pages contain no generated text, by design: what is on them is derived by the scripts and rules described in `/about/how`. The log has the full account: the climate grid (a one-time pack of CHELSA with `scripts/pack-climate.py`), the bulk path for thousands of species (`npm run bulk`), and how to derive a large names list from what people actually grow (`npm run derive -- --inat 2500`, after `npm run bulk -- wcvp`).

## Deploying

It is a SvelteKit app on Cloudflare Workers with R2 for the corpus and the encrypted vaults, KV for the request-rate counters, and a Durable Object (`Counters`) for the bytes each vault and address stores and the count of vaults. `docs/DEPLOY.md` is the checklist: the bucket and namespace once, the corpus uploaded to R2 with rclone, `npm run deploy` for every release, and what to check by hand after the first one. Sync is open (`SYNC_OPEN` is `1` in `wrangler.jsonc`: any vault can sync); set it to `"0"` in the file and a new vault is still made (and still counts toward an address's five a day) but its sync is refused with a 402, while vaults made before keep syncing (with `keep_vars` on, deleting the variable leaves the deployed value in place).

## Layout

```
src/lib/core/       pure logic: the change log and merge rule, HLC, geography, the growing year, the sheet, names
src/lib/dossier/    building a species dossier from its sources; the bulk path; the fetch layer
src/lib/climate/    the packed climate grid, NASA POWER and the climograph
src/lib/db/         the collection's store on the device (IndexedDB), the reactive collection, the sample collection
src/lib/sync/       vault keys, sealing, the sync engine
src/lib/server/     what runs in the Worker: dossier lookup, end-to-end encrypted sync storage (the server sees sizes and activity, never content)
src/routes/         the pages
scripts/            corpus tooling (MIT)
tests/              unit (vitest) and e2e (Playwright)
fixtures/           a synthetic corpus and upstream responses for tests
```

## Licence

The app is AGPL-3.0 (see `LICENSE`). The data tooling under `scripts/` is MIT (see `scripts/LICENSE`). The data the reference is built from carries its own licences, listed in `NOTICE` and on every page that shows it.
