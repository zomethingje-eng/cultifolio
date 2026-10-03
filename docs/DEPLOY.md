# Deploying Cultifolio

The app is a SvelteKit Worker on Cloudflare. The corpus (one JSON per species plus an index) lives in R2 and is read by the Worker; encrypted sync vaults live in the same bucket under `vault/`; KV holds the small counters (storage allowance, rate limit); a Durable Object counts new vaults per address, per day and in all. Nothing else runs anywhere. The climate grid is a build-time input only and is never uploaded.

Every command below runs from the project folder. In cmd, `npx` works as written. In Windows PowerShell 5 the `npx.ps1` shim is blocked by the default script policy: either write `npx.cmd` in place of `npx`, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once. PowerShell 5 also has no `&&`; separate commands with `;`.

## 1. Once: the Cloudflare side

R2 has to be enabled in the dashboard before the API will create a bucket (R2 Object Storage → the one plan on offer; it asks for a payment method even though the corpus fits the free allowance, and the CLI reports `code: 10042` until it is done). Then:

```
npx wrangler login
npx wrangler r2 bucket create cultifolio
npx wrangler kv namespace create QUEUE
```

Both create commands offer to add a binding to `wrangler.jsonc`. For the bucket say no: the binding is already there as `STORE`, which is the name the code uses, and wrangler would add a second one. For the namespace say yes, binding `QUEUE`, and no to "connect to the remote resource for local dev" (local dev must not write real counters); check afterwards that `kv_namespaces` holds exactly one entry and that its id is your namespace's: the id in the repository's `wrangler.jsonc` is the author's, which no other account can deploy under. Do not skip the id: without the namespace the Worker refuses every vault creation (a 503, "not taking new vaults for now"), with or without the counter object, since KV is also where the per-address byte allowance and the request windows live; that is the right behaviour and also a site where sync does not work.

Set an R2 spend alert now, before anything is uploaded: Cloudflare dashboard → Notifications → add a notification of type "Billing usage" (or the R2 storage/operations alert your plan offers) at a threshold you would want to hear about. The storage allowance in the Worker caps each vault at 2 GB and each address at 3 GB a day, but a cap in code is not a bill you have seen.

## 2. Once per corpus: the upload

The corpus on disk is `static\s\v2\` (8,947 files plus `index.json`, `report.txt`). It is gitignored and, with `static/.assetsignore`, excluded from the Worker's static assets, so the only way it reaches the site is R2. Uploading nine thousand objects one `wrangler r2 object put` at a time takes hours; rclone does it in minutes and is Cloudflare's own recommendation for bulk R2 work.

Install rclone once (`winget install Rclone.Rclone`, then a new terminal window so it is on the path), then make an R2 API token in the dashboard (R2 → Manage R2 API tokens → Create Account API token, permission "Object Read & Write", "Apply to specific buckets only" → `cultifolio`, no TTL). The token page shows the two keys once and the endpoint URL with the account id in it. Configure a remote:

```
rclone config create r2 s3 provider=Cloudflare access_key_id=<key> secret_access_key=<secret> endpoint=https://<accountid>.r2.cloudflarestorage.com acl=private
```

A token scoped to one bucket cannot list buckets, so `rclone lsd r2:` answers 403; the check is `rclone ls r2:cultifolio`, which is silent on an empty bucket. Then, after `npm run dossier -- --index` has written a fresh `index.json`:

```
rclone copy static\s\v2 r2:cultifolio/s/v2 --transfers 32 --checkers 32 --exclude report.txt --s3-no-check-bucket -P
```

`copy` is incremental: a second run after a fill or a rederive uploads only the files whose size or time changed, so a daily `--fill inat` followed by `--index` and this command is the whole refresh. Check it landed:

```
npx wrangler r2 object get cultifolio/s/v2/index.json --pipe | more
```

The Worker caches the index for a minute per isolate, so a new index is live within a minute of the upload finishing.

Never upload `static\s\v1` (the old schema; the Worker reads only `s/v2/`), and never upload `bulk\`, `climate\` or `static\s\v2\report.txt`.

Turn off Cloudflare's own page-view beacon for the zone: the dashboard's Web Analytics "automatic setup" injects `static.cloudflareinsights.com/beacon.min.js` into every HTML response at the edge, which is analytics under a site that says it has none (round eight, 1). Dashboard → Analytics & Logs → Web Analytics → the site → Manage site → disable automatic setup (or remove the site). The Content Security Policy blocks the script from running either way, but it must not be served at all. Check from outside, with an HTML Accept header (a bare `curl` does not get the injection):

```
curl -sH 'accept: text/html' https://cultifolio.com/ | grep -c cloudflareinsights
```

must print `0`.

## 3. Every deploy

```
npm run deploy
```

That runs `svelte-check`, the unit tests, the build, `wrangler deploy` and then `scripts/live-check.mjs` against `https://cultifolio.com` (another deployment sets `LIVE_CHECK_ORIGIN=https://your.site` in the environment, or passes the origin as the script's argument; the species page it checks is the first in the site's own sitemap unless `LIVE_CHECK_SPECIES=<slug>` names one; a deploy whose `/api/corpus` answers the fixture id fails the check, because that is a Worker with no corpus in R2), in that order, and stops at the first failure. The live check is the set of requests made by hand after every deploy since round fifteen: the name service three times (200 each, and it says whether the edge answered), the two headers on a prerendered page, a species page, the offline page and an API route, the beacon check, the reference under a stale corpus id (must be `no-store`), a forecast, and the vault route's 400 on a JSON null. It can be run alone with `npm run live-check`, or against a preview with `node scripts/live-check.mjs https://<worker>.workers.dev`. A failure after `wrangler deploy` means the new version is live and wrong: roll back (section 6) before reading further. The first deploy creates the Worker at `cultifolio.<account>.workers.dev`; the custom domain is added once in the dashboard (Workers → cultifolio → Settings → Domains & Routes → add `cultifolio.com`), after which every deploy serves both.

`SYNC_OPEN` is `"1"` in `wrangler.jsonc`: any vault can sync, no licence. Leave it until licensing is wired in; to close new-vault creation set it to `"0"` in the file and deploy (never delete it: `keep_vars` keeps a deployed variable the file no longer names, and a dashboard value is replaced by the file's on the next deploy, so the file is the one place that decides `SYNC_OPEN`). The vault-creation counters live in a Durable Object (`COUNTERS`, class `Counters`; `scripts/attach-do.mjs` exports the class from the built worker after every build), so a burst of creations is counted exactly; without the binding the KV counters bound approximately. The binding and its migration are these two entries in `wrangler.jsonc`, after `kv_namespaces`:

```
"durable_objects": { "bindings": [{ "name": "COUNTERS", "class_name": "Counters" }] },
"migrations": [{ "tag": "v1", "new_sqlite_classes": ["Counters"] }]
```

New vaults are also bounded: 5 per address a day (a 429), 200 a day for everyone and 2,000 in all (a 503 whose sentence the sync page shows as it is: "Sync has taken all the new vaults it can today…" for the day, "Sync is not taking new vaults for now…" for the total, and "Sync could not count new vaults just now…" when the counter object cannot be reached); the last two can be raised without a deploy by setting `SYNC_VAULTS_PER_DAY` and `SYNC_VAULTS_MAX` on the Worker (dashboard → Settings → Variables; `wrangler.jsonc` has `keep_vars: true` so the next deploy does not wipe them), and the running totals live in the counter object (`Counters.totals(day)`; the KV keys `vaults:all:<day>` and `vaults:all` are the counts from before round twenty-one, and `vaults:all` seeds the object's total once). The object drops address keys older than two days by a daily alarm. Addresses are counted as an IPv4 address or an IPv6 /64.

## 4. After the first deploy, once, by hand

Open the site in a private window and walk it: a species you know (the climate, the marker caption, the photographs and their credits), search for a species, add a plant, follow another, `/` shows your list, export a backup, `/about/how`. Then on a phone: the same species page, the climograph legible, no horizontal scroll. Then sync: create a vault on one device, join from the other with the key, edit on both, watch them agree. Then check `npx wrangler tail` for a minute while doing it; the only errors should be the ones you caused.

Then the three things the code cannot do for you: confirm in the dashboard that the R2 bucket is private (no public bucket URL, no r2.dev subdomain), that the KV namespace holds `bytes:` and `rl:` keys after the sync test, which proves the binding is the real one, and that the `cloudflareinsights` check in section 2 prints `0`.

## 5. Refreshing the corpus later

The order of operations for a corpus refresh is always: build or fill on the PC, `npm run dossier -- --index`, `rclone copy` as above. Since round twelve `--index` also writes `static/s/v2/sheets/00.json` … `1f.json`, the 32 sheet buckets the plant pages and labels read (`/api/sheets?b=`), and the copy carries them up; without them the Worker derives a bucket from a few hundred dossier reads on first ask, which is slow, so do not skip the index step. The upload needs no deploy: `/api/corpus` reports the index object's etag and every reference request from a device carries it, so the edge cache, each device's worker cache and the browser cache turn over on their own once the new `index.json` is in the bucket (the index is re-read by the Worker within a minute). Upload the dossiers and the sheet files before `index.json`, so no device sees a new id before the files behind it are there (a bucket fetched under the new id is kept at the edge for a day, and it must be the new bucket): run the copy once with `--exclude index.json` added, then once more without it, which uploads only the index. A schema bump (`DOSSIER_V` in `src/lib/dossier/schema.ts`) changes the prefix to `s/v3/`, needs a rederive (`--offline` is the fast one), an upload to the new prefix, and a deploy; the old prefix can be deleted from the bucket afterwards (`rclone purge r2:cultifolio/s/v2`), never before.

**The manifest and the build's products (rounds fifty-three and fifty-six; read this before the next refresh).** `--index` also writes `static/s/v2/manifest.json` and, under `static/s/v2/p/`, each of the build's products as a file named by the md5 of its content: the index again, the entries and the sheets of every bucket, the search's postings (64 files that say which species each short key of a word can match; `src/lib/core/postings.ts`) and the nine catalogues' rows: everything the Worker used to derive from the index in memory, derived once on the PC. The manifest maps each product's name to its hash and so to its file. The Worker reads the manifest first and takes the corpus id, the bucket count and the index from it; a bucket with no manifest (the live one until the first refresh after round fifty-six) is read as before. A file under a hash never changes, so the upload order is: everything but the manifest, then the manifest alone, which names a corpus whose files are all there whatever order the copy landed in:

```
npm run dossier -- --index
rclone copy static\s\v2 r2:cultifolio/s/v2 --transfers 32 --checkers 32 --exclude report.txt --exclude manifest.json --exclude manifest.prev.json --s3-no-check-bucket -P
rclone copy static\s\v2\manifest.json r2:cultifolio/s/v2 --s3-no-check-bucket -P
```

A file already on disk under its hash is not written again, so the copy carries only the files whose content changed: a refresh that touched a few dossiers uploads the index (4 MB at nine thousand species), the entries and sheets buckets those species are in, and the postings (3 MB) only when a species was added, removed or renamed; nothing at all when nothing changed. (Round fifty-three wrote every product under a directory per corpus id, 72 MB at nine thousand species, most of it a search split by first character in which the "c" file alone was larger than the index; that layout never reached the bucket, since no `--index` was run between round fifty-three and round fifty-six.) The corpus id is a hash of every product's hash, so any change makes a new id, and the Worker does not adopt a manifest until the index it names is there: a copy that lands the manifest first is harmless, the corpus held before stands until the file arrives. The bucket count is chosen for the corpus's size (32 up to about ten thousand species, doubling past that; `src/lib/core/bucket.ts`) and announced by `/api/corpus` as `buckets`, which every device reads before it hashes; the sheet files beside the index (`sheets/00.json` … `1f.json`) are still written for a Worker that finds no manifest.

Pruning: `--index` keeps the manifest before the current one as `manifest.prev.json` and deletes from `static\s\v2\p` any file neither of the two names, so the folder holds two corpora at most. The bucket keeps what was uploaded until it is told otherwise. Once a refresh has been up for a day (the edge keeps answers under the old id that long, and no device asks under it after its next `/api/corpus`), make the bucket's `p/` match the folder:

```
rclone sync static\s\v2\p r2:cultifolio/s/v2/p --transfers 32 --checkers 32 --s3-no-check-bucket -P
```

`sync` deletes from the bucket's `p/` what the folder no longer has; it never touches anything outside `p/`. Run it only from the folder the last refresh was uploaded from.

**Rollback below round fifty-three is not possible on a device that has opened it.** Round fifty-three opens the vault at version 3 (the `order` store); the previous builds open version 2 and get a `VersionError` on a v3 vault. A rollback to an older build, or an older build's shell kept by the service worker, cannot open the collection on such a device until the current build is deployed again. Roll forward. The `order` store grows one row per change stored and is not pruned (about thirty megabytes at four hundred and fifty thousand changes); pruning needs a frontier every open tab agrees on, and is left for the round that needs it.

**Round sixteen's corpus step, once.** 2,935 photographs in 702 dossiers were published credited "unknown" under CC BY or CC BY-SA, which those licences do not allow (round sixteen, 3). The build no longer produces them; the ones on disk are removed with

```
npm run dossier -- --prune-uncredited
npm run dossier -- --index
rclone copy static\s\v2 r2:cultifolio/s/v2 --transfers 32 --checkers 32 --exclude report.txt --exclude index.json --s3-no-check-bucket -P
rclone copy static\s\v2\index.json r2:cultifolio/s/v2 --s3-no-check-bucket -P
```

No API calls; a minute on the PC. 53 species are left without a photograph by it; all 53 have iNaturalist and Commons recorded as having nothing for them, so no fill can give them one until a source does (round seventeen, 13: the pass reopens a dossier's photo sources for the next fill only where a source had answered). Round seventeen's version of the pass also rewords the CC0 credits that read "unknown" to "author not stated" (1,018 photographs), so it is run once more, with `--index` and the two uploads after it. Round sixteen also adds a dev dependency (`fake-indexeddb`, for tests that run the real vault on an in-memory IndexedDB), so `npm install` once before `npm run deploy`.

**Round thirty-one's corpus step, once.** Four rules changed in the builder and take effect only when the dossiers are rederived: a record with no stated accuracy counts for the climate only as a human observation with coordinates to three decimals (round thirty, R2-11); a species with records on both sides of the equator in strength takes its envelope from the larger side alone and says so (round thirty-one, 1); the typical cell for the daily extremes is the nearest-to-median cell whose NASA POWER cell is mostly land, and the fraction is written when none is (round thirty-one, 2); and the index carries each species' older names, so the search and the picker find a species under a name it no longer has (round thirty-one, 3). The rederive is offline (the range, the records, the centre and the climate from the bulk files and the grid; no API calls), then the index, then the two uploads. Zip the current `static\s\v2` first, as section 6 says.

```
npm run dossier -- static\s\v2\index.json --offline --grid climate --bulk bulk
npm run dossier -- --index
rclone copy static\s\v2 r2:cultifolio/s/v2 --transfers 32 --checkers 32 --exclude report.txt --exclude index.json --s3-no-check-bucket -P
rclone copy static\s\v2\index.json r2:cultifolio/s/v2 --s3-no-check-bucket -P
```

The rederive rereads the climate grid for every species (about nine thousand envelopes, each now sampling the grid around its typical cell), so expect it to take a while longer than the photograph pass; `report.txt` says what changed. The first two rederives with these rules (2026-09-29) found every POWER cell 100% land and no in-range cell at sea. The land sample first tested whether the grid had a cell at each point, and the file grid has one for every point in its extent; then whether the cell held figures, and CHELSA has temperatures and rain over the ocean (a probe at 30°N 40°W reads 20 °C days). Land is now the elevation layer, which the packer masks to land pixels, so a cell with no land has none: that rule is in `readCell`, so it also takes a record placed at sea out of the envelope (the source line says how many cells were left out), which had never happened before. Rederive once more with all four lines: the index carries each species' climate status and its "grows like" neighbours, and the sheets are built with it, so a rederive without `--index` and the index copy leaves the site disagreeing with itself (the first upload here did exactly that, and a reviewer caught it: round thirty-three, 6). Sanity counts afterwards: `(Select-String -Path static\s\v2\*.json -Pattern '"landFraction":0\.[0-4]' -List | Measure-Object).Count` was 89 on the rederive that went up (island and coastal species; Melocactus intortus 0.16); `-Pattern 'with records at sea'` 1,483 (a coastal species with a record a little offshore; Copiapoa cinerea lost one cell of 53, Yucca glauca none); `'"hemispheres"'` 210. A later rederive should land near these, not at zero and not at thousands for the first. After the upload, `/species/rhipsalis-baccifera` should carry the hemisphere line, `/species/melocactus-intortus` the sea-cell line under its cold floor, and a search for "haworthia attenuata" on the front page should list Haworthiopsis attenuata. No deploy is needed for the corpus; the deploy for the round's code changes goes first, since the pages that show the new fields must be live before the fields arrive.

**Round thirty-two's corpus step, once, after `npm run deploy` (round thirty-three's build rules ride with it: the typical cell within 2 °C of the median, the hemisphere split by cells poleward of 10°, the record count per cell, decimals on the raw coordinate).** GBIF's image cache stopped answering the bare address form, so every GBIF thumbnail in the corpus is written again in the occurrence form (the Worker mends a dossier's as it reads it, but the index's tile thumbnails and the sheets carry no occurrence key and need the rebuild), and a species the download has no observation photographs for drops the herbarium sheets an older build gave it. The same three commands as round thirty-one's, with `--index` this time, which is never skipped after a rederive (the front page said 5,523 with climate against a corpus of 5,521 when it was):

```
npm run dossier -- static\s\v2\index.json --offline --grid climate --bulk bulk
npm run dossier -- --index
rclone copy static\s\v2 r2:cultifolio/s/v2 --transfers 32 --checkers 32 --exclude report.txt --exclude index.json --s3-no-check-bucket -P
rclone copy static\s\v2\index.json r2:cultifolio/s/v2 --s3-no-check-bucket -P
```

Before the upload: `(Select-String -Path static\s\v2\index.json -Pattern 'image/cache/fit-in/400x/https' -SimpleMatch -Quiet)` should print `False` (no bare-form thumbnail left; the first run printed `True` because 1,407 species with no coordinated record kept an old set, fixed in round thirty-three) and `(Select-String -Path static\s\v2\*.json -Pattern 'iiif.rbge.org.uk|medialib.naturalis.nl|sweetgum.nybg.org|oxalis.br.fgov.be' -List | Measure-Object).Count` should be far below its value before (herbarium hosts). After: the front page's tiles for Haworthiopsis attenuata and Acharagma aguirreana show photographs, `/species/albuca-yerburyi` has no herbarium sheet, and the live check's thumbnail check passes (`npm run live-check`).

**Round thirty-seven's corpus step, once, after `npm run deploy`: the index alone.** The sheet buckets were built before round thirty-five's sea rule and carry a sea cell's extremes raw, so plant pages and labels still printed them (round thirty-seven, R1-3). `sheetOf` reads a parsed dossier, which the rule is applied to, so rewriting the sheets is enough; no rederive, so the first of the four lines is left out:

```
npm run dossier -- --index
rclone copy static\s\v2 r2:cultifolio/s/v2 --transfers 32 --checkers 32 --exclude report.txt --exclude index.json --s3-no-check-bucket -P
rclone copy static\s\v2\index.json r2:cultifolio/s/v2 --s3-no-check-bucket -P
```

The copy uploads the 32 sheet files and the index; the dossiers are unchanged and skipped. Before the upload: `(Select-String -Path static\s\v2\sheets\*.json -Pattern '"extremesStatus":"sea"' -SimpleMatch -List | Measure-Object).Count` should be above zero (89 species have a cell under half land, spread over the buckets). After: a plant of Melocactus intortus on `/plants/<number>` says the daily extremes were read at a weather cell that is mostly sea and set aside, and its label prints no habitat night. A later full rederive writes `hemispheres.equatorial` and cuts the carried-row chains in the files themselves; until then the pages do both as they read.

## 6. If something is wrong after a deploy

`wrangler deploy` is atomic and the previous version is kept: Workers → cultifolio → Deployments → roll back. HTML is cached for at most a minute and open pages reload on their next navigation after a deploy, so a rollback is live within a minute too. The corpus is not versioned by the deploy; a bad corpus upload is fixed by uploading the previous `static\s\v2` again (keep the last good one zipped somewhere before a rederive).
