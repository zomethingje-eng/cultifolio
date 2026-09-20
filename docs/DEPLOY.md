# Deploying Cultifolio

The app is a SvelteKit Worker on Cloudflare. The corpus (one JSON per species plus an index) lives in R2 and is read by the Worker; encrypted sync vaults live in the same bucket under `vault/`; KV holds the small counters (storage allowance, rate limit, vaults per address). Nothing else runs anywhere. The climate grid is a build-time input only and is never uploaded.

Every command below runs from the project folder in cmd or PowerShell. `npx wrangler` uses the project's own copy.

## 1. Once: the Cloudflare side

```
npx wrangler login
npx wrangler r2 bucket create cultifolio
npx wrangler kv namespace create QUEUE
```

The last command prints an `id`. Paste it into `wrangler.jsonc` in place of `PASTE_KV_ID_HERE`. Do not skip this: the Worker fails closed without the binding and refuses every vault creation, which is the right behaviour and also a site where sync does not work.

Set an R2 spend alert now, before anything is uploaded: Cloudflare dashboard → Notifications → add a notification of type "Billing usage" (or the R2 storage/operations alert your plan offers) at a threshold you would want to hear about. The storage allowance in the Worker caps each vault at 2 GB and each address at 3 GB a day, but a cap in code is not a bill you have seen.

## 2. Once per corpus: the upload

The corpus on disk is `static\s\v2\` (8,947 files plus `index.json`, `report.txt`). It is gitignored and, with `static/.assetsignore`, excluded from the Worker's static assets, so the only way it reaches the site is R2. Uploading nine thousand objects one `wrangler r2 object put` at a time takes hours; rclone does it in minutes and is Cloudflare's own recommendation for bulk R2 work.

Install rclone once (`winget install Rclone.Rclone`), then make an R2 API token in the dashboard (R2 → Manage R2 API tokens → Create, permission "Object Read & Write", scoped to the `cultifolio` bucket) and configure a remote:

```
rclone config create r2 s3 provider=Cloudflare access_key_id=<key> secret_access_key=<secret> endpoint=https://<accountid>.r2.cloudflarestorage.com acl=private
```

The account id is on the R2 overview page. Then, after `npm run dossier -- --index` has written a fresh `index.json`:

```
rclone copy static\s\v2 r2:cultifolio/s/v2 --transfers 32 --checkers 32 --exclude report.txt --s3-no-check-bucket
```

`copy` is incremental: a second run after a fill or a rederive uploads only the files whose size or time changed, so a daily `--fill inat` followed by `--index` and this command is the whole refresh. Check it landed:

```
npx wrangler r2 object get cultifolio/s/v2/index.json --pipe | more
```

The Worker caches the index for a minute per isolate, so a new index is live within a minute of the upload finishing.

Never upload `static\s\v1` (the old schema; the Worker reads only `s/v2/`), and never upload `bulk\`, `climate\` or `static\s\v2\report.txt`.

## 3. Every deploy

```
npm run deploy
```

That runs `svelte-check`, the unit tests, the build and `wrangler deploy`, in that order, and stops at the first failure. The first deploy creates the Worker at `cultifolio.<account>.workers.dev`; the custom domain is added once in the dashboard (Workers → cultifolio → Settings → Domains & Routes → add `cultifolio.com`), after which every deploy serves both.

`SYNC_OPEN` is `"1"` in `wrangler.jsonc`: any vault can sync, no licence. Leave it until licensing is wired in; removing the variable closes new-vault creation and says so to the client.

## 4. After the first deploy, once, by hand

Open the site in a private window and walk it: a species you know (the climate, the marker caption, the photographs and their credits), search for a species, add a plant, follow another, `/` shows your list, export a backup, `/about/how`. Then on a phone: the same species page, the climograph legible, no horizontal scroll. Then sync: create a vault on one device, join from the other with the key, edit on both, watch them agree. Then check `npx wrangler tail` for a minute while doing it; the only errors should be the ones you caused.

Then the two things the code cannot do for you: confirm in the dashboard that the R2 bucket is private (no public bucket URL, no r2.dev subdomain), and that the KV namespace holds `bytes:` and `rl:` keys after the sync test, which proves the binding is the real one.

## 5. Refreshing the corpus later

The order of operations for a corpus refresh is always: build or fill on the PC, `npm run dossier -- --index`, `rclone copy` as above. A schema bump (`DOSSIER_V` in `src/lib/dossier/schema.ts`) changes the prefix to `s/v3/`, needs a rederive (`--offline` is the fast one), an upload to the new prefix, and a deploy; the old prefix can be deleted from the bucket afterwards (`rclone purge r2:cultifolio/s/v2`), never before.

## 6. If something is wrong after a deploy

`wrangler deploy` is atomic and the previous version is kept: Workers → cultifolio → Deployments → roll back. HTML is cached for at most a minute and open pages reload on their next navigation after a deploy, so a rollback is live within a minute too. The corpus is not versioned by the deploy; a bad corpus upload is fixed by uploading the previous `static\s\v2` again (keep the last good one zipped somewhere before a rederive).
