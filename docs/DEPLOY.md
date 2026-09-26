# Deploying Cultifolio

The app is a SvelteKit Worker on Cloudflare. The corpus (one JSON per species plus an index) lives in R2 and is read by the Worker; encrypted sync vaults live in the same bucket under `vault/`; KV holds the small counters (storage allowance, rate limit, vaults per address). Nothing else runs anywhere. The climate grid is a build-time input only and is never uploaded.

Every command below runs from the project folder. In cmd, `npx` works as written. In Windows PowerShell 5 the `npx.ps1` shim is blocked by the default script policy: either write `npx.cmd` in place of `npx`, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once. PowerShell 5 also has no `&&`; separate commands with `;`.

## 1. Once: the Cloudflare side

R2 has to be enabled in the dashboard before the API will create a bucket (R2 Object Storage → the one plan on offer; it asks for a payment method even though the corpus fits the free allowance, and the CLI reports `code: 10042` until it is done). Then:

```
npx wrangler login
npx wrangler r2 bucket create cultifolio
npx wrangler kv namespace create QUEUE
```

Both create commands offer to add a binding to `wrangler.jsonc`. For the bucket say no: the binding is already there as `STORE`, which is the name the code uses, and wrangler would add a second one. For the namespace say yes, binding `QUEUE`, and no to "connect to the remote resource for local dev" (local dev must not write real counters); check afterwards that `kv_namespaces` holds exactly one entry and that the placeholder id is gone. Do not skip the id: the Worker fails closed without the binding and refuses every vault creation, which is the right behaviour and also a site where sync does not work.

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

That runs `svelte-check`, the unit tests, the build and `wrangler deploy`, in that order, and stops at the first failure. The first deploy creates the Worker at `cultifolio.<account>.workers.dev`; the custom domain is added once in the dashboard (Workers → cultifolio → Settings → Domains & Routes → add `cultifolio.com`), after which every deploy serves both.

`SYNC_OPEN` is `"1"` in `wrangler.jsonc`: any vault can sync, no licence. Leave it until licensing is wired in; removing the variable closes new-vault creation and says so to the client.

## 4. After the first deploy, once, by hand

Open the site in a private window and walk it: a species you know (the climate, the marker caption, the photographs and their credits), search for a species, add a plant, follow another, `/` shows your list, export a backup, `/about/how`. Then on a phone: the same species page, the climograph legible, no horizontal scroll. Then sync: create a vault on one device, join from the other with the key, edit on both, watch them agree. Then check `npx wrangler tail` for a minute while doing it; the only errors should be the ones you caused.

Then the three things the code cannot do for you: confirm in the dashboard that the R2 bucket is private (no public bucket URL, no r2.dev subdomain), that the KV namespace holds `bytes:` and `rl:` keys after the sync test, which proves the binding is the real one, and that the `cloudflareinsights` check in section 1 prints `0`.

## 5. Refreshing the corpus later

The order of operations for a corpus refresh is always: build or fill on the PC, `npm run dossier -- --index`, `rclone copy` as above. Since round twelve `--index` also writes `static/s/v2/sheets/00.json` … `1f.json`, the 32 sheet buckets the plant pages and labels read (`/api/sheets?b=`), and the copy carries them up; without them the Worker derives a bucket from a few hundred dossier reads on first ask, which is slow, so do not skip the index step. The upload needs no deploy: `/api/corpus` reports the index object's etag and every reference request from a device carries it, so the edge cache, each device's worker cache and the browser cache turn over on their own once the new `index.json` is in the bucket (the index is re-read by the Worker within a minute). Upload the dossiers and the sheet files before `index.json`, so no device sees a new id before the files behind it are there (a bucket fetched under the new id is kept at the edge for a day, and it must be the new bucket): run the copy once with `--exclude index.json` added, then once more without it, which uploads only the index. A schema bump (`DOSSIER_V` in `src/lib/dossier/schema.ts`) changes the prefix to `s/v3/`, needs a rederive (`--offline` is the fast one), an upload to the new prefix, and a deploy; the old prefix can be deleted from the bucket afterwards (`rclone purge r2:cultifolio/s/v2`), never before.

**Round sixteen's corpus step, once.** 2,935 photographs in 702 dossiers were published credited "unknown" under CC BY or CC BY-SA, which those licences do not allow (round sixteen, 3). The build no longer produces them; the ones on disk are removed with

```
npm run dossier -- --prune-uncredited
npm run dossier -- --index
rclone copy static\s\v2 r2:cultifolio/s/v2 --transfers 32 --checkers 32 --exclude report.txt --exclude index.json --s3-no-check-bucket -P
rclone copy static\s\v2\index.json r2:cultifolio/s/v2 --s3-no-check-bucket -P
```

No API calls; a minute on the PC. 53 species are left without a photograph by it; the next `--fill inat` or `--fill gbif` gives them a credited one where one exists. Round sixteen also adds a dev dependency (`fake-indexeddb`, for tests that run the real vault on an in-memory IndexedDB), so `npm install` once before `npm run deploy`.

## 6. If something is wrong after a deploy

`wrangler deploy` is atomic and the previous version is kept: Workers → cultifolio → Deployments → roll back. HTML is cached for at most a minute and open pages reload on their next navigation after a deploy, so a rollback is live within a minute too. The corpus is not versioned by the deploy; a bad corpus upload is fixed by uploading the previous `static\s\v2` again (keep the last good one zipped somewhere before a rederive).
