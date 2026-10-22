# Deploying Cultifolio

The app is a SvelteKit Worker on Cloudflare. The corpus (one JSON per species plus an index) lives in R2 and is read by the Worker; encrypted sync vaults live in the same bucket under `vault/`; KV holds the small counters (storage allowance, rate limit); a Durable Object counts new vaults per address, per day and in all. Nothing else runs anywhere. The climate grid is a build-time input only and is never uploaded.

Every command below runs from the project folder. In cmd, `npx` works as written. In Windows PowerShell 5 the `npx.ps1` shim is blocked by the default script policy: either write `npx.cmd` in place of `npx`, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once. PowerShell 5 also has no `&&`; separate commands with `;`. Where a line differs between the two shells, both are given; a line given once is the same in both.

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

The corpus on disk is `static\s\v3\` since round seventy-eight (8,945 dossiers, each named by its page's id, `k<Kew plant_name_id>.json` or `g<GBIF key>.json`, plus `index.json`, `manifest.json`, the products under `p\`, the genus records under `g\` and `report.txt`; `static\s\v2\`, round seventy-seven's, named by GBIF key, is what it was written from). It is gitignored and, with `static/.assetsignore`, excluded from the Worker's static assets, so the only way it reaches the site is R2. Uploading nine thousand objects one `wrangler r2 object put` at a time takes hours; rclone does it in minutes and is Cloudflare's own recommendation for bulk R2 work.

Install rclone once (`winget install Rclone.Rclone`, then a new terminal window so it is on the path), then make an R2 API token in the dashboard (R2 → Manage R2 API tokens → Create Account API token, permission "Object Read & Write", "Apply to specific buckets only" → `cultifolio`, no TTL). The token page shows the two keys once and the endpoint URL with the account id in it. Configure a remote:

```
rclone config create r2 s3 provider=Cloudflare access_key_id=<key> secret_access_key=<secret> endpoint=https://<accountid>.r2.cloudflarestorage.com acl=private
```

A token scoped to one bucket cannot list buckets, so `rclone lsd r2:` answers 403; the check is `rclone ls r2:cultifolio`, which is silent on an empty bucket. Then, after `npm run dossier -- --index`, upload as section 5 says: everything but the manifest, then the manifest. `copy` is incremental, so a daily `--fill inat` followed by `--index` and those two lines is the whole refresh. Check it landed with `npm run live-check`, or:

```
npx wrangler r2 object get cultifolio/s/v3/manifest.json --remote --pipe | more
```

The Worker re-reads the manifest each minute per isolate, so a new corpus is live within a minute of the upload finishing.

Never upload `static\s\v1` or `static\s\v2` again (older schemas; the Worker reads only `s/v3/`), and never upload `bulk\`, `climate\` or `static\s\v3\report.txt`. Once the site serves `s/v3/` (round seventy-eight's step below, then a week), round seventy-seven's `s/v2/` can go from the bucket: `rclone purge r2:cultifolio/s/v2` (never before the deploy: until then the live Worker reads it).

Turn off Cloudflare's own page-view beacon for the zone: the dashboard's Web Analytics "automatic setup" injects `static.cloudflareinsights.com/beacon.min.js` into every HTML response at the edge, which is analytics under a site that says it has none (round eight, 1). Dashboard → Analytics & Logs → Web Analytics → the site → Manage site → disable automatic setup (or remove the site). The Content Security Policy blocks the script from running either way, but it must not be served at all. Check from outside, with an HTML Accept header (a bare `curl` does not get the injection):

```
curl -sH 'accept: text/html' https://cultifolio.com/ | grep -c cloudflareinsights
```

must print `0`.

## 3. Every deploy

```
node scripts/corpus-ready.mjs && npm run deploy
```

The first part, `scripts/corpus-ready.mjs` (round seventy-eight), asks the bucket for `s/v3/manifest.json`, the corpus this Worker reads, and stops the deploy, deploying nothing, while the bucket does not hold one, since a Worker deployed before its corpus would answer every species page with "could not be read"; `npm run deploy` alone does not ask (package.json is unchanged). Then `npm run deploy` runs `svelte-check`, the unit tests, the build, `wrangler deploy` and then `scripts/live-check.mjs` against `https://cultifolio.com` (another deployment sets `LIVE_CHECK_ORIGIN=https://your.site` in the environment, or passes the origin as the script's argument; the species page it checks is the first in the site's own sitemap unless `LIVE_CHECK_SPECIES=<slug>` names one; a deploy whose `/api/corpus` answers the fixture id fails the check, because that is a Worker with no corpus in R2), in that order, and stops at the first failure. The live check is the set of requests made by hand after every deploy since round fifteen: the name service three times (200 each, and it says whether the edge answered), the two headers on a prerendered page, a species page, the offline page and an API route, the beacon check, the reference under a stale corpus id (must be `no-store`), a forecast, and the vault route's 400 on a JSON null. Since round sixty-two every build ends with `scripts/check-bundle.mjs` (run by `scripts/attach-do.mjs`): it records a hash of the sources and fails the build when the root layout imports a module under src/lib/backup/ or src/lib/ui/grow/ (bar the few grow modules it draws on purpose, named in the script with their reasons), read by module path from the sources the build was made from and from the build's own entries, so the unit test's skip on a stale build no longer matters. Before a deploy, run the browser suite once in strict mode on a quiet machine: `node scripts/predeploy.mjs` starts its own fresh server, runs every browser test with `CI_STRICT=1` on four workers (`PW_WORKERS` to change it; WebKit is held to two of its own, `PW_WEBKIT_WORKERS`, and since round seventy-five Firefox to two of its own, `PW_FIREFOX_WORKERS`; the script says what each engine runs at before it starts), and exits non-zero on any failure or on a test that passes only on its retry. A round names its tier: `node scripts/predeploy.mjs --tier=corpus` after a round that changed only the corpus builder (the unit tests, then Chromium and the Chromium phone), `--tier=app` after a round that changed pages or the app (the unit tests, then every engine), and `--tier=launch` once before the public launch (svelte-check, the unit tests, then every engine on two workers). Each stops at its first failing step and says which. Since round sixty-seven a plain `npx playwright test` is strict as well: a test that passes only on its retry fails the run. That server asks no outside service (`--var E2E_OFFLINE:1`, from `playwright.config.ts`), so a PC that can reach GBIF runs the suite as the sandbox does. The strict run also runs the tests tagged `@phone` on a Chromium phone at Safari's page size on an iPhone (390 x 664, touch, Safari's user agent; round sixty-three). Safari's engine and Firefox run when named: install them once with `npx playwright install webkit firefox`, then `node scripts/predeploy.mjs --browsers=all` (or `--browsers=webkit`; `PW_BROWSERS=webkit,firefox` in the environment does the same). Naming WebKit also runs the phone tests on the real iPhone profile in WebKit. `--project webkit` is Playwright's filter: it runs Safari's engine alone (its desktop tests and, added by the script, its phone tests), with no Chromium and no Chromium phone, so it checks one engine and is not the run before a deploy; the script says so when it starts. An engine named but not installed stops the script before the build, with that install line. Tests that need Chromium's own features (a CDP session, a Chrome profile's text size, a layout-shift reading, `page.pdf`) are listed in `tests/e2e/helpers/engines.ts` or tagged `@chromium`, and are left out of WebKit and Firefox. The run starts only when the local server has answered its front page (`webServer.url`), not when its port opens, so no test pays the server's start. Each browser test that makes a sync vault does so from its own documentation address (`tests/e2e/helpers/address.ts`), so the five-a-day limit per address is never met by accident. It can be run alone with `npm run live-check`, or against a preview with `node scripts/live-check.mjs https://<worker>.workers.dev`. A failure after `wrangler deploy` means the new version is live and wrong: roll back (section 6) before reading further. The first deploy creates the Worker at `cultifolio.<account>.workers.dev`; the custom domain is added once in the dashboard (Workers → cultifolio → Settings → Domains & Routes → add `cultifolio.com`), after which every deploy serves both.

`SYNC_OPEN` is `"1"` in `wrangler.jsonc`: any vault can sync. Set to `"0"` in the file and deployed, a new vault is still made (and still counts toward an address's five a day) but its sync is refused with a 402, while vaults made before keep syncing (never delete it: `keep_vars` keeps a deployed variable the file no longer names, and a dashboard value is replaced by the file's on the next deploy, so the file is the one place that decides `SYNC_OPEN`). The vault-creation counters live in a Durable Object (`COUNTERS`, class `Counters`; `scripts/attach-do.mjs` exports the class from the built worker after every build), so a burst of creations is counted exactly; without the binding the KV counters bound approximately. The binding and its migration are these two entries in `wrangler.jsonc`, after `kv_namespaces`:

```
"durable_objects": { "bindings": [{ "name": "COUNTERS", "class_name": "Counters" }] },
"migrations": [{ "tag": "v1", "new_sqlite_classes": ["Counters"] }]
```

New vaults are also bounded: 5 per address a day and 20 per IPv6 /48 (a 429), and for everyone by a day's ceiling and a ceiling in all, 200 a day and 2,000 in all by default (a 503 whose sentence the sync page shows: "Sync has taken all the new vaults it can today…" for the day, "Sync is not taking new vaults for now…" for the total, and "Sync could not count new vaults just now…" when the counter object cannot be reached); the last two can be raised without a deploy by setting `SYNC_VAULTS_PER_DAY` and `SYNC_VAULTS_MAX` on the Worker (dashboard → Settings → Variables; `wrangler.jsonc` has `keep_vars: true` so the next deploy does not wipe them; a value that is not a whole number is ignored and the default holds). The launch's are 1,000 a day and 20,000 in all (round seventy-three, the owner's decision): set both before the announcement, and read them back on the dashboard. Every sentence on /about/formats that states one names the default and says the deployment may set more, so the about page stays true whatever the variables say, and the running totals live in the counter object (`Counters.totals(day)`; the KV keys `vaults:all:<day>` and `vaults:all` are the counts from before round twenty-one, and `vaults:all` seeds the object's total once). The object drops address keys older than two days by a daily alarm, and sleeps once nothing it sweeps is left (since round sixty-one the places are swept too, so the `vaults` object wakes every midnight while any vault holds one). Addresses are counted as an IPv4 address or an IPv6 /64.

Since round sixty the day's places and the places in all (`SYNC_VAULTS_PER_DAY` and `SYNC_VAULTS_MAX`, 200 and 2,000 by default) are both taken at a vault's first stored batch or photograph, not at its creation, so empty vaults made by a script spend neither. Past either, a vault that holds nothing yet has its first upload refused (503, with Retry-After to UTC midnight for the day's, a day for the total's). A counter object that does not answer refuses that first upload too ("The site could not count this vault just now; try again in a minute.", Retry-After 60): nothing is stored uncounted. A vault whose first upload was counted and then did not land gives its place back, unless another upload of it is still landing. Since round sixty-one a vault's meta says `filled` only once an object has landed, so a Worker stopped between the count and the write leaves a vault whose next upload is checked again.

Since round sixty-one a place is also reclaimed: a vault with no upload for 90 days gives its place back at the counter object's midnight sweep (the object keeps the day of each vault's last upload in `f:<vault>`), and its next upload takes a place again, under the ceiling in all but not under the day's (it is not a new vault). Nothing the vault holds is touched; reading it needs no place. If the places are full when it comes back, that upload is refused with "Sync is full for now. This vault had no upload for 90 days, so its place was given back…" (503, Retry-After an hour) until one is free or `SYNC_VAULTS_MAX` is raised. Since round sixty-two a place is given back only on evidence: the sweep writes `reclaimedAt` into the vault's `meta.json` (a conditional write; a vault whose meta cannot be written keeps its place until the next sweep), then, in one storage transaction per page of a thousand keys, deletes `f:<vault>`, writes `r:<vault>` and lowers `all`, so a sweep cut short loses no place. The transaction reads each judged place again and keeps any an upload touched while the metas were being marked; that vault's meta keeps `reclaimedAt` until its next write, which then asks the counter object and clears it. The `r:<vault>` notes are kept until the vault takes a place again, and never swept. A vault with no place entry and neither mark (counted at its creation before round fifty-eight, or first filled under round fifty-eight) is adopted at its next upload and not counted again, and a meta from before round fifty-eight is written `filled: true`. A write to a vault whose meta says `reclaimedAt` needs a checked place: a counter that throws or cannot answer refuses it (503, Retry-After 60); reads never need one. Places recorded before round sixty-one start their 90 days at the first midnight after the deploy. The KV fallback (no counter object) counts each vault once by its own key (`vaultplace:<id>`, kept for good, given back with the day's count when its first upload fails) and does not reclaim places. When the 2,000 run short, raise `SYNC_VAULTS_MAX`.

Each vault's counter object also holds what is being uploaded as leases of ten minutes (`p:<id>`), so an upload whose Worker died is not counted for good; a log line "an upload's lease was not released" is that case and needs nothing done. A removal and an upload of the same photograph wait for each other through the same object (since round sixty-two always a 503 with Retry-After 10, which the device retries without stopping the vault's other uploads). A removal holds a lease of no bytes (`p:rm:<receipt>`) from just before its R2 delete until its give-back, and a listing is not written while any lease is live, and is not made either (`generation()` says `busy`), so a request that would have listed while another upload is in flight asks `take` again without a listing, or is answered 503; a recount can neither count an upload twice nor take a removal off twice. The site's own calls to other services are capped in the counter object named `upstream` (round sixty-one): MET Norway, the NWS and GBIF each have a share of 600 calls a minute for every address together, and one address (an IPv4 address or an IPv6 /64) may take at most a tenth of a share in a minute, an IPv6 /48 four tenths. A US forecast takes from both MET's share and the NWS's, both or neither, so a refusal always names MET. A forecast whose NWS alerts were refused is kept at the edge and on the device for five minutes, not the hour. The cap constants live in `src/lib/server/caps.ts`. The count is kept in that object's memory for the current minute, so a restart of the object (a deploy) forgets at most one minute. A call held back is answered 503 "not asked: this site's calls are used up for this minute" (429 when one address has used its part), with Retry-After to the next minute; the frost watch then says the site held the call back, never that the source did not answer. Without the binding, or while the object does not answer (a log line says so), each isolate counts in its own memory and shares the count through KV once a second (`rl:upstream:<service>:<minute>` and `rl:upstream:<service>:<address>:<minute>`): exact for one isolate, rough for the site, since isolates that open the same minute each pass a share before they see one another's counts.

A vault's counter object marks its total stale when an upload's lease lapses, so the next request lists the vault again rather than keep the lapsed bytes counted for up to an hour. A listing that an upload landing (or a removal) crosses is never written; after two crossed listings the request is answered 503, "The site could not count this vault just now…", Retry-After 30 seconds, and the device tries again. The midnight sweep reads its keys a thousand at a time and at most a hundred thousand a run; past that it runs again a second later from where it stopped (`s:<prefix>` holds the place, deleted once done). Since round sixty-two each page of the sweep, its cursor included, is one storage transaction, and an expired lease's deletion and the stale mark are one too. An open of a vault whose two listings were refused answers the total already put right that day, when there is one.

A photograph's removal is decided by claims alone (round sixty-one): an upload that stores a photograph, or finds it already there with the same removal proof, claims its name for two days (`c:<key>`), and a removal the device made before that claim is answered 409 and asked again on a later run; once the claim is swept, it goes through. The proof is checked before anything else. Since round sixty-two photographs are stored by generation: the first under `vault/<id>/photo/<photoId>.bin` as before, a photograph stored again after its removal under `.g<digits>`, named by a pointer `vault/<id>/photoref/<photoId>.json` that a removal moves to its receipt by R2's conditional write before it deletes the generation it saw. Nothing needs migrating: objects stored before are their name's first generation, read where they are, and a pointer is written at a name's first removal under this code. Names removed before this deploy have no receipt. A photograph whose name holds a receipt is stored again only with the removal's proof (403 otherwise). An upload with the proof that finds the photograph already there writes the pointer too, naming the generation it found (`{ g: 'bin' }` for the first), so a removal whose conditional pointer write stalled past its hold fails its condition and answers 409. The receipt names the generation it removes (`was`), so a removal cut off after the pointer moved (an R2 delete that failed, the counter object throwing, the Worker stopped) is finished by the device's retry with the same proof, answered 200. Bytes no pointer names (a generation an upload stored and never named; a `.bin` left after a receipt), once ten minutes old, are removed at the next removal or upload of that photograph; until then they count against the vault. The pointers themselves are never deleted and not counted: each removal leaves about 150 bytes in `photoref/`.

The sync engine sends `X-Cultifolio-Sync: 1` on every request (round sixty-two); a write with `Origin: null` and no `Sec-Fetch-Site` (a browser from before `Sec-Fetch-Site`) is accepted only with it. A device still running the old engine in such a browser is refused as before until it loads the new build.

### Logs, faults and the operator's records (round sixty-seven)

Workers Logs is off (`"observability": { "enabled": false }` in `wrangler.jsonc`; a unit test, `tests/unit/r67s-server.test.ts`, fails while it or its invocation logs are on). With it on, Cloudflare kept every request's URL for days, the search typed into the picker, a grower's rounded site and every vault id among them, while `/about/how` says the server does not log paths. Do not turn it on in the dashboard either. `npx wrangler tail` still shows the Worker's log lines live, and keeps nothing.

What the server wants you to hear of is counted instead, by kind alone, in the counter object named `vaults` (`e:<day>`, kept a week) and mirrored to KV:

```
npx wrangler kv key list --binding QUEUE --prefix ops: --remote
npx wrangler kv key get --binding QUEUE "ops:faults:2026-10-10" --remote
```

`ops:faults:<day>` is `{ kind: count }` for that UTC day. The kinds: `release` (an upload's lease not released; it lapses in ten minutes), `giveback` (an address's bytes not given back after a failed upload; they come back at midnight), `hold` and `unhold` (a photograph's name could not be held or freed), `mark` (a photograph could not be marked for the sweep; the request waited), `strays` (unnamed bytes not removed at a touch; the sweep tries again), `creation` and `place` (the vault-creation or place counter did not answer; the request was refused for a minute or let go), `upstream` (the counter of outside calls did not answer; each process counted alone), `listing` (a vault's listing could not be counted; it went ahead), `reclaim` (a vault's meta could not be marked reclaimed; its place is kept), `sweep` (a photograph the sweep could not read on seven nights; its mark was dropped). A few a day are the platform's own blips. A kind that climbs day after day is a fault to look into with `wrangler tail`.

### New vault places: the attack and the remedy (round sixty-seven)

The day's new-vault places and the places in all (200 and 2,000 by default; the launch sets 1,000 and 20,000) are what bound spend, and they are also a switch anyone can throw: a place costs one vault creation and one stored object of a few bytes. Before this round forty IPv4 addresses (one /26) or ten IPv6 /48s spent the whole day by noon, every new grower that day was refused ("Sync has taken all the new vaults it can today…"), ten days of it filled the 2,000 then in all, and one tiny upload per vault every 89 days keeps the places for good.

Since this round each network (an IPv4 /24 or an IPv6 /48 around the uploading address) may take 10 of the day's places (`MAX_NEW_VAULTS_PER_NETWORK_PER_DAY` in `src/lib/server/sync.ts`); past that its first uploads are refused until midnight UTC with "Sync has taken all the new vaults it takes from this network today…". It now takes twenty networks to spend a day of the default 200 (a hundred at the launch's 1,000). And when half the day's places are taken, the counter object records it once, with the networks that took the most (`o:<day>`, kept to the end of the next day as the address keys are), mirrored to KV:

```
npx wrangler kv key get --binding QUEUE "ops:vaults:2026-10-10" --remote
```

`{ at, count, perDay, networks: { "<network>": places } }`. A quiet launch day stays far below half. If the record appears:

1. Read it. Networks near 10 places each, many of them new that day, and `wrangler tail` showing uploads of a few hundred bytes, are the attack; a spread of networks at one or two places each is real growers, and the answer is to raise `SYNC_VAULTS_PER_DAY` (dashboard → Workers → cultifolio → Settings → Variables; no deploy needed).
2. Block the attacking networks for `/api/sync/*` with a WAF custom rule (Security → WAF → Custom rules: `ip.src in { 203.0.113.0/24 2001:db8:7::/48 }` and `starts_with(http.request.uri.path, "/api/sync/")`, action Block). A rate-limiting rule on `/api/sync/vault` (POST, per IP, a few an hour) slows a spread-out attack.
3. Before the places in all fill (`SYNC_VAULTS_MAX`, 2,000 by default), raise it; it costs only storage, which the per-vault 2 GB still bounds (20,000 vaults could hold 40 TB at most, so the R2 spend alert of section 1 is what tells you first). Places held by attack vaults go back 90 days after their last upload; a vault kept alive by tiny uploads keeps its place. Nothing in the site removes a place by hand, by design; if an attack goes on past the blocks and the raised ceiling, it needs a change in code (a minimum of stored bytes before a vault holds a place against the ceiling in all is the next step the review of round sixty-six named).

Keep Cloudflare's "Pseudo IPv4" setting (Network) off: it replaces `CF-Connecting-IP` for IPv6 visitors with an IPv4 address of class E, which destroys the /64 and /48 grouping every count here relies on.

### Listings, limits and their words (round sixty-seven)

A vault's listings of its log (`GET /api/sync/log`) are counted in its own counter object: at most 1,200 R2 list calls an hour per vault (`LIST_PAGES_PER_HOUR`); past that the listing is refused 503 with Retry-After to the end of the hour and "Receiving is refused for now: this vault was listed as often as the site allows in an hour…". The walk cannot start at the cursor, because a batch's name begins with the hour of its last change, not of its arrival, and an offline device's batches arrive late with old hours. This bounds R2's Class A list operations at about 29,000 a day per vault, so by the ceiling of vaults; a holder of a token who grew a vault to fifty thousand tiny batches made every pull cost fifty. A counter object that does not answer lets the listing go (fault `listing`).

A /48's twenty new vaults a day are refused as "too many new vaults from this network today" (429); this and the address's own five and the day's ceiling all wait until midnight UTC (`Retry-After` to then; it was an hour, and the retry was refused again). A log batch of 16 KB or less is not counted against its address's 3 GB or its /48's 12 GB a day, so one heavy neighbour on a shared address no longer stops everyone's record sync until midnight; it still counts against its vault's 2 GB. A photograph whose pointer cannot be read is answered 503 with Retry-After 10 on GET and HEAD, never 404, and an upload of it waits the same way. New photographs get random ids; old ids are accepted as before.

The adapter's own cache at the edge answers a repeated public GET by its full URL before the Worker runs. The client names its build in those URLs (`v=<version>`), and an answer is kept only under the build that made it (`src/lib/server/build.ts`), so a deploy is not answered from the old build's copies. What the edge keeps, by URL: a search, a name lookup, an entries or sheets bucket, a window of catalogue rows, the sitemap's files (each under an address that names the corpus, `/sitemap-<corpus id>-<n>.xml`, since round eighty) and `robots.txt` for a day; the sitemap index `/sitemap.xml` for five minutes (a day before round eighty); a forecast for an hour (five minutes when the NWS refused or did not answer for its alerts); `/api/index` for five minutes; the world maps for a day; the build's own files for a year. Besides those, the Worker's own copies: the name lookups and old-name checks by query for a day, the sheets by bucket for a day, a forecast by rounded site for the hour, a search by query for a day, the front page and species pages as rendered for a minute.

### A cold start's CPU and memory (rounds seventy-three, seventy-six and seventy-seven)

Since round seventy-six the first request a fresh copy of the Worker answers reads only what it needs, by name: the manifest, the genera file (21 KB), and for a species page the card files of its address, its own species and each near species (about 14 KB each, since round seventy-seven; round seventy-six read name files of about 113 KB), its dossier and its genus's row file. It no longer reads the species index (5.8 MB) or builds name maps from it. Since round seventy-seven's corpus step the search does not read it either: a first search reads the search's directory files and one or a few key files. Measured in node on round seventy-two's corpus (`scripts/dev/scale/cold-routes.mjs`; round seventy-seven's figures in `scripts/dev/scale/results/r77m-cold.txt`): a cold first search for "aloe" took 132 ms and held 3.6 MB, where round seventy-six's took 240 ms and 12 MB, and at 50,000 made-up species 144 ms and 4.4 MB, where it took 959 ms and 54 MB; a cold species page took 67 ms and held 3.2 MB (round seventy-six's 86 ms and 5.5 MB; round seventy-five's 550 ms and 45 MB). On Cloudflare, after round seventy-six's deploy, a `wrangler tail` showed every request `ok`, with at most 298 ms of CPU; an uncached species page took 50 to 300 ms. Measure it once after a deploy, and again after any round that changes what a cold request reads.

1. Deploy with `npm run deploy`. A deploy starts fresh copies, so the next requests are cold ones.
2. Open a second window (cmd or PowerShell: the lines below are the same in both, with `npx` in PowerShell as the top of this file says) in the project folder and type `npx wrangler tail cultifolio --format json > tail.json`. It prints nothing; it writes every request to `tail.json`. Leave it running. (Windows PowerShell 5.1 writes the file in UTF-16 and cmd in UTF-8; the summary reads either.)
3. In a private browser window open `https://cultifolio.com/species/copiapoa-cinerea`, then the same page again, then `https://cultifolio.com/`, then `https://cultifolio.com/api/search?q=aloe`.
4. Wait ten seconds, go back to the second window and press Ctrl-C (in cmd, answer `Y` if it asks "Terminate batch job").
5. Type `node scripts/tail-summary.mjs tail.json`, in either shell. It prints:
   - how many requests the file holds, and how many came from search engines' crawlers (Googlebot, bingbot) rather than from you: a deploy is soon followed by crawlers on species pages, so most lines are often theirs;
   - a table by kind of page (species page, front page, catalogue, search, dossier API, other): the count, then the middle (median), the 90th percentile and the most CPU time, the same for wall time, all in milliseconds, and how they ended;
   - the five slowest requests by CPU, each with its address;
   - between rows of `!!!`, above and below the rest, every request that did not end `ok`;
   - a last line saying what to do next, by the rules below.

   `--all` after the file's name lists every request, one a line (it does so anyway when there are 20 or fewer).

The first request of a fresh copy has the largest CPU time; the second visit to the same page takes a few milliseconds. Requests can reach more than one copy, so there may be more than one large figure, and an uncached species page a crawler asks for costs what a cold one does (50 to 300 ms). When to act (the summary's last line says the same):

- Any outcome other than `ok`, in particular `exceededCpu` (the browser shows "Error 1102") or `exceededMemory`: act now. Note the address and tell the developer.
- On the Workers Free plan, a request may use 10 ms of CPU, which a cold start cannot meet. Move to Workers Paid before the launch: Cloudflare dashboard → Workers & Pages → Plans.
- On Workers Paid, a request may use 30 s of CPU by default. A cold species page under 300 ms, and a first search under 1,000 ms, need nothing. Over that, write it in the round's notes with the figures `tail-summary.mjs` printed.

If the summary says the file holds no CPU times (an older wrangler), the dashboard shows the same: Workers & Pages → cultifolio → Metrics → CPU time, whose highest percentile is the cold starts. If it says the file holds no requests, wrangler tail was not running while the pages were opened, or was stopped before they answered: do steps 2 to 5 again.

### The memory test at 50,000 species (rounds seventy-six and seventy-seven)

The scaling study (`docs/SCALE-STUDY.md`, section 2) found that the Worker as it was could not hold the reference past 25,000 to 40,000 species in Cloudflare's 128 MB, and that a Worker that holds no whole-index structure can. This test puts a made-up reference of 50,000 species behind a second copy of the Worker and reads whether Cloudflare ran it in its memory. It uses a bucket and a Worker of their own, `cultifolio-scale`, and never touches the live bucket, the live Worker or its counters. It takes about an hour, most of it the upload: about 2.5 GB in 69,000 files since round seventy-seven, whose search files are most of it (260 MB in 2,300 files before). Do it once, after round seventy-seven is deployed and its corpus step is done.

1. **Make the bucket.** In cmd or PowerShell in the project folder (every line of this test is the same in both): `npx wrangler r2 bucket create cultifolio-scale`
2. **Make the made-up corpus** from the corpus on disk (`static\s\v3`, after round seventy-eight's corpus step). Two commands; the second takes three minutes or so and prints `50000 species → scale\c50k/s/v3: corpus …, … products and … search key files`:

   ```
   npx tsx --tsconfig tsconfig.scripts.json scripts/dev/scale/synth-index.ts static/s/v3/index.json 50000 scale/index-50000.json
   node --max-old-space-size=8192 --import tsx scripts/dev/scale/synth-corpus.ts scale/index-50000.json static/s/v3 scale/c50k k2735933 k298116
   ```

   The first 8,945 species are the real ones; the rest are real entries with made-up epithets. Only two species have their data files: Copiapoa cinerea (k2735933) and Aloe vera (k298116).
3. **Upload it to the scale bucket**, the files first and the manifest last:

   ```
   rclone copy scale\c50k\s\v3 r2:cultifolio-scale/s/v3 --transfers 32 --checkers 32 --exclude manifest.json --s3-no-check-bucket --stats-one-line --stats 30s
   rclone copy scale\c50k\s\v3\manifest.json r2:cultifolio-scale/s/v3 --s3-no-check-bucket
   ```

   Check the bucket name twice: `cultifolio-scale`, never `cultifolio`.
4. **Deploy the scale Worker**: `npm run build`, then `npx wrangler deploy --config wrangler.scale.jsonc`. Its last lines give its address, `https://cultifolio-scale.<your subdomain>.workers.dev`.
5. **Watch it**: in a second window, cmd or PowerShell, `npx wrangler tail cultifolio-scale --format json > tail-scale.json`.
6. **Open, in a private window, one after another**: `<address>/species/copiapoa-cinerea`, `<address>/`, `<address>/api/dossier/k2735933`, `<address>/api/search?q=aloe`, `<address>/api/search?q=aloe%20verra` (a typing error, the search that reads most), and `<address>/species/aloe-vera`. Then wait ten seconds and press Ctrl-C in the second window.
7. **Read it**: `node scripts/tail-summary.mjs tail-scale.json`. Each request ended `ok` or, where the copy ran out of memory, `exceededMemory` (the page shows an error), which the summary prints between rows of `!!!`. Paste all it printed back to the developer. What the developer measured here, in Cloudflare's own runtime run locally (`wrangler dev`, which does not enforce the limit): see `scripts/dev/scale/results/workerd-heap.txt` (round seventy-six), `r77-workerd-heap.txt` and `r77-workerd-worst.txt` (round seventy-seven's search: at most 52 MB taken by the 200 typing errors that read most).
8. **Remove it all**: `npx wrangler delete cultifolio-scale` (answer `y`), then `rclone purge r2:cultifolio-scale`, then `npx wrangler r2 bucket delete cultifolio-scale`, and delete the folder `scale`.

### A test that passed only on its retry: `scripts/flake-check.mjs` (round seventy-five)

The strict run fails when a test passes only on its retry, and does not say whether that test fails one time in five or one time in five hundred. Before reading anything into such a test, or after a round that says it fixed one, run it many times:

1. In a cmd or PowerShell window in the project folder, type `node scripts/flake-check.mjs`. With nothing more, it runs the six tests that were flaky once in round seventy-four (the four still open, and two whose faults were fixed, as checks) in Firefox and WebKit, 20 times each, at two workers, with no retries.
2. Its first lines say what it will run and how long it should take (between one and a half and two hours for the whole list, most of it WebKit's 400-plant backup). It builds and starts its own server, as predeploy does; leave the window open until it ends.
3. At the end it prints one line per test and engine, such as `webkit   r64f 7: on a first visit …  19 passed, 1 failed`, and under it each failure's run number and first line. Send those lines back, with the `test-results` folders that hold a `trace.zip` (a failed Firefox or WebKit test keeps its trace).

To run fewer, name them: `node scripts/flake-check.mjs --engine=firefox --repeat=5 "r62bg 1"` runs one test in Firefox five times (the start of a title is enough; several names may be given). `--engine=` takes `firefox`, `webkit` or `chromium`, `--repeat=` the runs per test, and `--dry-run` prints the plan and the time without running anything. It is not the run before a deploy: it never retries and never stops early, and it exits with 0 only when every run passed. The deploy still waits for `node scripts/predeploy.mjs --tier=app` to pass strictly.

## 4. After the first deploy, once, by hand

Open the site in a private window and walk it: a species you know (the climate, the marker caption, the photographs and their credits), search for a species, add a plant, follow another, `/` shows your list, export a backup, `/about/how`. Then on a phone: the same species page, the climograph legible, no horizontal scroll. Then sync: create a vault on one device, join from the other with the key, edit on both, watch them agree. Then check `npx wrangler tail` for a minute while doing it; the only errors should be the ones you caused.

Then the three things the code cannot do for you: confirm in the dashboard that the R2 bucket is private (no public bucket URL, no r2.dev subdomain), that the KV namespace holds `bytes:` and `rl:` keys after the sync test, which proves the binding is the real one, and that the `cloudflareinsights` check in section 2 prints `0`.

## 5. Refreshing the corpus later

**The corpus step is one command (round seventy-two).** `node scripts/corpus-step.mjs` runs the round's plan (`scripts/corpus-plan.txt`) in order: a backup, the fills, the rebuilds, `--index`, the upload and the live check. Everything it prints also goes to `corpus-step.log` in the project folder, and each finished step is recorded in `corpus-step.json`, so the same command carries on where it stopped. It stops with one sentence and the command to type next. The day's answers of GBIF, Wikidata, Kew and the rest are kept in `cache\upstream\` for that day only, so running it again the same day asks only what did not answer; the folder can be deleted at any time. Type it with `node`, not `npm run`: under `npm run`, Ctrl-C asks "Terminate batch job (Y/N)?" (either answer is safe). The steps below are round seventy-nine's full build, then round seventy-eight's, round seventy-seven's, round seventy-six's and round seventy-three's; the next section's two rclone lines and `--keep-list` are what the command runs, kept for reference.

### Round seventy-eight's corpus step: pages keyed by Kew's plant_name_id

**What changes, and why.** A species page's id was GBIF's backbone key, which GBIF has frozen since 2023 and calls obsolete. Now it is Kew's: `k` and the plant_name_id of the taxon Kew's World Checklist accepts for the page (`name.kew.entry`, which `--fill kew-names` reads), where that taxon is the page's alone; otherwise `g` and the page's GBIF key. Addresses do not change (they are names), and a grower's plants keep the GBIF keys they hold: each page's files hold its GBIF key beside its id, and a GBIF key finds its page. The dossier's shape changed, so the corpus is dossier version 3, under `static\s\v3` and the bucket's `s/v3/`, written once from `static\s\v2`, offline, in a few minutes. Nothing is asked of any source.

On the corpus of 8,945 pages, 8,916 take Kew's id and 29 keep their GBIF key, each listed with why in `ids-gbif.txt`: 15 whose Kew rows do not decide which taxon the page is (Harpephyllum caffrum, Aphelandra squarrosa, Handroanthus impetiginosum and others), and seven pairs that Kew holds as one taxon (Ceropegia melanops and C. nigra, Copiapoa calderana and C. boliviana, Weingartia pulchra and W. canigueralii, Drosera parvula and D. paleacea, Echeveria peacockii and Dudleya pulverulenta, Ceropegia cereiformis and C. nubica, Echeveria sessiliflora and E. pinetorum). Which of a pair is Kew's is not guessed: a merge decides it, and the kept page takes the Kew id at the next `--index`. You decided to merge all seven (2026-10-19), each into the page under Kew's accepted name; they were listed in `scripts/merged-pages-79.txt`, are in `scripts/merged-pages.txt` since round seventy-nine, and are applied by its full build, not by this step, which changes no page's content. Until then each of the fourteen keeps its GBIF key.

**The order: this step first, then the deploy. It is checked.** Round seventy-seven's Worker, live now, reads only `s/v2/`; this step writes and uploads `s/v3/` and touches neither `static\s\v2` nor the bucket's `s/v2/`. This round's Worker reads only `s/v3/`. Deployed first, it would find no corpus of its version. So this round's deploy command is `node scripts/corpus-ready.mjs && npm run deploy`: `scripts/corpus-ready.mjs` stops it unless the bucket holds `s/v3/manifest.json`. A plain `npm run deploy` does not check (package.json is unchanged), and a Worker deployed without the check answers 503 "The reference could not be read just now", never the four test species. What the live site serves at each point:

| After | The bucket holds | The live Worker | The site serves |
|---|---|---|---|
| nothing yet | `s/v2/` | round seventy-seven's | round seventy-seven's corpus from `s/v2/`, as now |
| steps 1 and 2 (backup, `--rekey`, review) | `s/v2/` | round seventy-seven's | the same: nothing has left the PC |
| step 3 (the upload) | `s/v2/` and `s/v3/` | round seventy-seven's | the same: that Worker never reads `s/v3/` (measured: 0 reads of `s/v3/` and every answer byte for byte the same with both in the bucket) |
| step 4 (`node scripts/corpus-ready.mjs && npm run deploy`) | `s/v2/` and `s/v3/` | this round's | the same species, pages and addresses from `s/v3/`, each page under its new id; a page's GBIF key in `/api/dossier/<key>` moves to its id |
| the purge, a week later | `s/v3/` | this round's | the same |

**Going back.** Until `s/v2/` is purged, `npx wrangler rollback` brings back round seventy-seven's Worker, which reads `s/v2/` as it did; nothing of `s/v2/` is deleted by this step. The purge, once you are happy and no sooner than a week after the deploy, ends that way back: `rclone purge r2:cultifolio/s/v2`.

**Step 1.** In the project folder, type `node scripts/corpus-step.mjs`. The backup step says `static\s\v3` is not there yet and that `static\s\v2`, which this step only reads, is the backup. Then `--rekey` writes every dossier of `static\s\v2` under its id in `static\s\v3`, copies the genus records, and writes the index, the products and the manifest of version 3. Its lines include:

```
  page ids: 8916 by Kew's plant_name_id, 29 by GBIF's key (ids-gbif.txt says why); 8945 dossiers written under a new id
  … genus records copied to static/s/v3/g
  index: 8945 species
  corpus …: 8945 species in 32 buckets, 64 posting files, … search key files (… MB) → static/s/v3/p/ (… files written, …); manifest.json names it
```

**Step 2. Review.** It stops with "Review before going on". Good looks like this: the four lines above, `ids-gbif.txt` listing 29 pages, the review line saying "0 dossiers differ from the backup of corpus … apart from their ids", and no `drops.txt`. On the dry run of round seventy-seven's copy here (8,947 species, round seventy-three's two merged pages not yet pruned, so 31 kept their GBIF key), it said 8,947 dossiers written under a new id, 1,321 genus records copied, 13,899 product files written (365 MB), and "0 dossiers differ from the backup … apart from their ids"; a second `--index` wrote nothing and every file was the same. Then `node scripts/corpus-step.mjs --go-on`.

**Step 3. The upload.** It runs by itself: every file of `static\s\v3`, about 24,000 files and 660 MB this once (289 MB of dossiers, 365 MB of products, 5 MB of genus records), since every dossier has a new name and the products are under the new folder. Later refreshes upload only what changed, as before.

**Step 4. The deploy.** The step stops again: "The corpus is in the bucket under s/v3/, which the site does not read yet". Now deploy as section 3 says (`node scripts/predeploy.mjs --tier=app`, then `node scripts/corpus-ready.mjs && npm run deploy`); its first line says "corpus-ready: the bucket holds corpus … under s/v3/". Then `node scripts/corpus-step.mjs --go-on`: the live check, which must find the site serving the corpus on disk.

**Afterwards.** The prune (`--prune`) is of `s/v3/p` now. `s/v2/` can be deleted from the bucket a week later with `rclone purge r2:cultifolio/s/v2` (section 2), and `static\s\v2` from the PC once you no longer want it as the backup.

### Round seventy-eight: the build's sources and the species list

**Nothing more to run for these parts.** The step above writes every page again under its id and builds nothing: no source is asked and no page's content changes, so a page keeps its papers, photographs and summary as they are until it is built again. What the build now does differently, for the next build:

- **Literature is off** (your decision 2). The build asks OpenAlex nothing, and `OPENALEX_KEY` is read by nothing. A page built from now on shows, under Papers, "Not checked. Papers are not yet asked for this reference; a later fill takes them from OpenAlex's free snapshot." A page built before keeps its papers until it is built again; an offline re-derivation (`--offline`, `--rederive`) carries them, as it carries everything it does not ask. `--fill openalex` says this and stops.
- **Wikidata and Wikipedia are asked in batches**, 500 species ahead of the build: one SPARQL query for the items of 200 GBIF keys, one read of 50 items, one read of 20 Wikipedia leads. Their answers stand in for the requests the build made species by species. On 50 real species (`scripts/dev/scale/r78b-batch-proof.ts`, 2026-10-19), Wikidata and Wikipedia went from 158 requests to 14, and the dossiers were the same, field for field, for 42; the other 8 differ only in the summary's text, which is now Wikipedia's lead as written, brackets kept ("Heptapleurum actinophyllum (formerly Schefflera actinophylla) is a tree…"), where the per-species summary left them out. `--no-batch` asks species by species, as before.
- **Wikimedia's sites are paced as one**: Wikipedia, Wikidata and Commons together at most one request every 0.35 s (171 a minute), under Wikimedia's 2026 allowance of 200 a minute for a named client across all its sites. Each was paced on its own at 0.25 s before, which together could pass it.
- **Kew's names come from Kew's file** when the build has it (`--bulk bulk`): the IPNI and POWO numbers a page links, the name it cites, and every Kew reading of a proof, which GBIF's copy of Kew's checklist answered once a species or more. On 155 names it gives the same rows as GBIF's copy, 12 of them in another order (`scripts/dev/scale/r78b-kew-proof.ts`). `--kew-api` asks GBIF's copy, as before.
- **iNaturalist's day is kept across runs**: every run of a UTC day together asks iNaturalist at most 4,000 times (9,000 before round eighty; "Round eighty: iNaturalist", below) (counted in `cache\day-budget\`, which can be deleted at any time; `--inat-budget <n>` names another number), then the run stops with exit 3 and the same command the next day goes on. `--fill inat --cultivated` asks the cultivated photographs alone.
- **Cultivated photographs by your rule of 2026-10-19.** The build asked iNaturalist for research-grade observations marked captive, and iNaturalist makes every captive observation casual (3 such plant observations in all of iNaturalist; none of today's 8,947 pages had a cultivated photograph). It now asks for observations marked captive or cultivated with open-licence photographs (`captive=true`, `photo_license=cc0,cc-by,cc-by-sa`, `photos=true`, `identifications=most_agree`) and takes one only when its identifications agree: at least two current identifications, the community taxon its own taxon, and none disagreeing (`identifications[].current`, `community_taxon_id`, `num_identification_disagreements`, `taxon.ancestor_ids`). The page marks them "cultivated", and "in cultivation" in their credits, as before. On 100 real species, `--fill inat --cultivated` made 101 requests and 33 species gained 567 photographs. Every page's cultivated record of the rule before is asked again by the next `--fill inat`.

- **The species list** (agent S; your decisions 1 and 5, and your clause "and every species already in the reference"). `scripts/species-list.txt`, written by `scripts/select-species.ts`, holds 48,368 species: every species Kew accepts with at least three cultivated records (iNaturalist's observations marked captive or cultivated and GBIF's living-specimen records of living collections, genebank and germplasm datasets not counted, each dataset listed with why in `scripts/counted-datasets.txt`, `excluded-datasets.txt` and `undecided-datasets.txt`), every accepted species of the 173 collector genera, and every species already in the reference. Each line gives Kew's plant_name_id, the name, why it is there and its GBIF key; 46,041 have a GBIF key. It changes nothing live: the site's pages are today's until round seventy-nine builds from it. To make it again (only when you want fresher counts; the committed one is complete): `npm run bulk -- wcvp` if `bulk\wcvp_names.csv` is not there, GBIF's backbone export `simple.txt.gz` into `bulk\backbone\` (https://hosted-datasets.gbif.org/datasets/backbone/current/simple.txt.gz), then `node --max-old-space-size=4096 --import tsx scripts/select-species.ts` (about 20 minutes the first time, about a minute after).
- **The build and the bulk fetch read the list by GBIF key.** `npm run dossier -- scripts/species-list.txt …` builds each species by the GBIF key on its line, and `--index` names its page by Kew's id; a species the list gives no GBIF key (2,327) was built only where a page on disk had its id (none is matched by its name, rule 3); since round seventy-nine each is built from Kew's file (below). `npm run bulk -- gbif scripts/species-list.txt` asks GBIF's download for the list's 46,041 keys and matches no name.

### Round seventy-nine: the full build of the species list

**What waits on what.** The full build of `scripts/species-list.txt` (48,357 species since round eighty, 46,022 with a GBIF key) waits only on GBIF's occurrence records for the list. You asked GBIF's helpdesk on 2026-10-20 to enable SQL downloads for your account. If they do, the **SQL download** (about 4.8 GB, with an images' download of about 1.5 GB beside it) replaces the **Darwin Core Archive** (DWCA, about 65 GB), which is the fallback if they refuse or are slow. The build reads either, and both give the same pages from the same records (the proof is in the GBIF part below). Everything else is ready: the 2,327 species without a GBIF key (your decision 1), the seven merges (decision 2), iNaturalist's open data and the budgeted fill (decision 3), the institution rule from the cross-checks (decision 5), and the index, upload and Worker at the full size.

This section is one walk, in the order you type it. The parts after it give each step's detail, what good output looks like and what to do when something else comes back. Every time and size is an estimate from a rate measured here or on your PC, each part says whose, until your PC measures it: there is no `occurrence.zip` or climate grid here, so the build, the fills and the upload could not be run at this size.

**The walk.**

| Step | What you type | How long | Disk on the PC |
|---|---|---|---|
| 0. This round's Worker, on the corpus live now (any day before step 5's upload; now is best) | `node scripts/predeploy.mjs --tier=app`, then `node scripts/corpus-ready.mjs && npm run deploy` | as long as your last `--tier=app` run, then a few minutes | none |
| 1. GBIF's counts (any day, no account) | `npm run bulk -- gbif-count scripts/species-list.txt` | about 45 minutes (53 here) | small |
| 2a. GBIF's records, SQL route (once SQL downloads are enabled) | `npm run bulk -- gbif-sql scripts/species-list.txt --wait`, and in a second window `npm run bulk -- gbif-media scripts/species-list.txt --wait` | GBIF's preparing time (not known; round seventy-two's 12.7 GB DWCA took 67 minutes), then about 10 minutes to fetch at 100 Mbit/s | about 4.8 GB and 1.5 GB |
| 2b. GBIF's records, DWCA route (if GBIF refuses or is slow) | `npm run bulk -- gbif scripts/species-list.txt --wait` | GBIF's preparing time, then about an hour and a half to fetch at 100 Mbit/s, seven hours at 20 | about 65 GB |
| 3. iNaturalist's open data (any day; the export of 2026-09-27, the next due about 27 October) | the four `curl` lines of the iNaturalist part, then `npx tsx scripts/inat-open-load.ts bulk\inat-open` | about 45 minutes to download at 100 Mbit/s, then under an hour to read | 34.1 GB of downloads (keep 36 GB free), and the 1.1 GB file it writes |
| 4. GBIF's backbone export, if `bulk\backbone\simple.txt.gz` is not there from round seventy-three | the address in round seventy-eight's list part | minutes | 466 MB |
| 5. The plan, to the first upload | `node scripts/corpus-step.mjs --plan scripts/corpus-plan-full.txt`, and the same with `--go-on` at each of its two review stops (each stop prints the command) | a day to a day and a half (below) | about 10 GB besides the downloads |
| 6. The list's paragraph, deployed | commit `src/routes/about/how/+page.svelte`, then `node scripts/predeploy.mjs --tier=corpus`, then `node scripts/corpus-ready.mjs && npm run deploy` | as long as a `--tier=corpus` run, then a few minutes | none |
| 7. The cultivated fill, over about five more days from round eighty's code ("Round eighty: iNaturalist") | `node scripts/corpus-step.mjs --plan scripts/corpus-plan-full.txt` once a day after midnight UTC, until it goes past the fill; then the same with `--go-on` at its last review stop | about three hours a day (one request every 2 s, at most 4,000 a day, round eighty), unattended, then minutes for the second upload | small |
| 8. The cold-start check | section 3, "A cold start's CPU and memory" | minutes | none |
| 9. The prune, a day or more after the last upload | `rclone version` (1.65 or later), then `node scripts/corpus-step.mjs --prune`, then `node scripts/corpus-step.mjs --prune --go-on` | minutes | none |
| 10. The purge of `s/v2/`, on or after 26 October (your reminder; a week after round seventy-eight's deploy) | `rclone purge r2:cultifolio/s/v2` | a minute | none |

**Step 0. This round's Worker first, on round seventy-eight's corpus.** Round seventy-eight's Worker cannot read a page without a GBIF key: its schema requires one, so it answers 503 "This species page could not be read just now" for each of the 2,327 (measured here: round seventy-eight's build, given a corpus holding K's Hesperocyparis lusitanica, answered 503 for its page and its `/api/dossier/k457911`, and everything else as this round's did). And the upload's last file, the manifest, is what switches the live site to the new corpus. So this round's Worker goes live first, on the corpus live now, which it serves as round seventy-eight's Worker does. That was measured too: both Workers, built from r79base and from this round, answered all 18,285 paths of round seventy-seven's corpus written as round seventy-eight wrote it (every species page's HTML and data, every `/api/dossier/<id>`, 300 lookups by GBIF key, the front page, the sitemaps, `/api/corpus`, 14 searches, every entry and sheet bucket and the three catalogues) the same, once this round's changes to every page on purpose are set aside: the species page's held "Your notes: none yet" line and the styles that hold it (agent F's), and the empty places of agent K's not-checked lines (`scripts/dev/scale/r79m-worker-proof.mjs`, `scripts/dev/scale/results/r79m-worker-proof.txt`). `/api/corpus` also says `"keyless": true`. **It is checked:** the plan's upload step asks the live `/api/corpus`, and while the corpus on disk holds a page without a GBIF key and the live Worker does not say `"keyless": true`, it stops, uploads nothing, and says: "Deploy this round's Worker first, on the corpus live now (node scripts/predeploy.mjs --tier=app, then node scripts/corpus-ready.mjs && npm run deploy), then run: node scripts/corpus-step.mjs --plan scripts/corpus-plan-full.txt". `corpus-ready` passes, since the bucket holds round seventy-eight's `s/v3/manifest.json`. Good output: the deploy's live check passes, and the site shows the same pages as before.

**Steps 1 and 2. GBIF's records.** The counts first, by either route; then whichever download GBIF lets you have. Each request asks for the list's 46,041 keys and, since your decision on K's offer, for the 1,956 keys of `scripts/extra-keys-kew.txt` too (the names Kew's file holds as 1,415 of the species without a GBIF key); the first line says so: `… of the 2327 species with no GBIF key in the list, 1415 are asked by the 1956 keys Kew's synonymy gives them (scripts/extra-keys-kew.txt), never by their name; the other 912 are left out of the download …`. They add little (GBIF's count API, 2026-10-20, `scripts/dev/scale/results/r79m-kew-keys.txt`): 1,944 of the keys hold at most 100,000 records each, 3.9 million records in all, so about 1.8 GB more DWCA or about 0.13 GB more SQL download, and the request is 47,114 keys, still within one request; the other 12 keys hold more than 100,000 each and go to the API path, as the list's heaviest species do; the images' download gains at most 1.25 million records with images (fewer without iNaturalist's dataset), at most about 0.6 GB. 1,356 of the 1,415 pages get records; 59 read keys that hold none, and say so ("none", having been asked). Each `--wait` request writes its request file first, asks GBIF, then checks every 30 seconds and fetches it to `bulk\occurrence.zip` (and `bulk\media.zip` on the SQL route). If GBIF answers 403 to `gbif-sql`, SQL downloads are not enabled yet: take the DWCA route, or wait; nothing is lost. The GBIF part below says every answer GBIF may give and what to do. Delete round seventy-two's 12.7 GB `bulk\occurrence.zip` once the new one is fetched: the build refuses it.

**Step 3. iNaturalist's open data.** The four files, then one read of them, which writes `bulk\inat-wild.jsonl`. The plan's wild pass reads that file; nothing asks iNaturalist for a wild photograph again.

**Step 5. The plan, to the first upload.** `node scripts/corpus-step.mjs --plan scripts/corpus-plan-full.txt` runs `scripts/corpus-plan-full.txt` in order, with its stops. Each finished step is kept in `corpus-step.json`, so after any stop the same command carries on. Every stop prints the command to type next, with its `--plan`; and given no `--plan`, a run carries on with the plan the last run left unfinished, so a `--go-on` typed without it does not start round seventy-eight's plan instead:

| Plan step | What it does | How long | Disk |
|---|---|---|---|
| backup | copies `static\s\v3` (round seventy-eight's 8,945 pages, corpus `c14b776c7296ad11`) to `backups\v3-c14b776c7296ad11` | a minute or two | 0.7 GB |
| `--list-extra-keys scripts/species-list.txt` | the other GBIF keys each page reads, the merged pages' among them, from Kew's file and the backbone export, for every page the build will write (round eighty: 1,348 keys on 1,206 pages) | about three minutes (measured here at the list's size) | small |
| the build (`--renew`) | every species of the list, round seventy-eight's pages among them (round eighty): the records and GBIF's photographs from `bulk\`, the institution rule, Kew's range and names, the climate, GBIF's three requests a species, Commons, POWER's new cells, Wikidata and Wikipedia in batches; the 2,327 species without a GBIF key from Kew's file, 1,415 of them with GBIF's records under the keys Kew's synonymy gives them, the other 912 "not checked"; nothing of iNaturalist yet | reading the download first (the SQL download about 10 minutes, the DWCA about an hour), then about 19 hours (1.4 s a species, agent B's), plus up to 12 hours of POWER's new cells (the scaling study's bound) | dossiers 1.5 to 1.9 GB; `cache\upstream\` a GB or two for the day; POWER's cells up to about 3 GB |
| review | the build's lines (below) | you | |
| `--prune-followed` | the merged pages leave, but Echeveria peacockii (round eighty, below) | seconds | |
| `--fill inat --wild --bulk bulk` | iNaturalist's wild photographs from the open data, every page, no request to iNaturalist | about 20 minutes (3.6 for 8,947 pages here) | |
| `--index` | the index, the products, the manifest | 10 to 30 minutes (17 here at 48,368, 1.8 GB of heap) | products about 2.5 GB |
| review | the index's lines and the list's paragraph (below) | you | |
| upload | about 117,000 objects and 4.4 GB to `s/v3/`, the manifest last; only once the live Worker is this round's | half an hour to an hour (an estimate) | |
| live-check | the site serves the corpus on disk | minutes | |

On disk at the most, then: on the SQL route about 6.3 GB of GBIF's downloads, on the DWCA route about 65 GB; plus iNaturalist's 35 GB until step 7 is done; plus about 10 GB for the backup, the dossiers, the products, the day's cache, POWER's cells, Kew's files and the backbone export.

**The first review: good looks like this.** The build's lines say:

- `GBIF occurrences from bulk/occurrence.zip (… MB zipped, 00…-26….csv streamed)` on the SQL route, or `(… occurrence.txt streamed)` on the DWCA route, then `… rows → … taxa, … rows kept (≤2000 each)`;
- the photographs: `GBIF photographs' records from bulk/media.zip …; iNaturalist's dataset left out of it` and `… image rows → … species with openly licensed photographs` (SQL), or `GBIF photographs from multimedia.txt of bulk/occurrence.zip…` (DWCA). If it says GBIF's photographs are not asked, run `npm run dossier -- --fill gbif --bulk bulk` before going on;
- `scripts/species-list.txt: a species list of 48357 species: 46022 built by their GBIF key, 2335 with no GBIF key in the list … built from Kew's file by their plant_name_id, never matched to GBIF by their name`, and `2335 species without a GBIF key read from Kew's file, to be built from it` (the counts since round eighty, below);
- `Kew's names: … answered from Kew's file`;
- about 48,357 species built (or kept, after a stop);
- near the end, `Institution rule (Wikidata's 6656 botanic gardens, herbaria and zoos, 1 km): …`. Expect records left out on about a third of the species that have records (on round seventy-seven's corpus, 2,651 of 7,776 species, 1.8% of the open points), and read its list of species that lost their habitat climate whole if it names more than a few dozen;
- `drops.txt`, if it is there, naming nothing unexpected.

Then `node scripts/corpus-step.mjs --plan scripts/corpus-plan-full.txt --go-on`.

**The second review: good looks like this.** `index: <n> species`, n about 48,350 (the list's 48,357 less the merged pages that left at `--prune-followed` and any the build said it could not build); `page ids: … by Kew's plant_name_id`; the corpus line, about 64,000 search key files and about 2,100 MB; nearly every dossier differs from the backup, since every page is built anew. Then, in the same window, the list's paragraph for `/about/how` (agent F's script; seconds, offline):

```
node scripts/about-how-r79.mjs
node scripts/about-how-r79.mjs --write
```

The first says what it would write: `about-how: the list holds 48,357 species; the reference (static/s/v3/index.json, N pages) holds 48,357 of them, every one; Aloe 199 of 611, Euphorbia 401 of 2118.` If it says the reference holds fewer and asks for the reason, use `--write --why "<the build's own words>"`. The page is deployed in step 6, once the corpus it describes is live. Then `node scripts/corpus-step.mjs --plan scripts/corpus-plan-full.txt --go-on`: the upload (which stops at once if step 0 was not done) and the live check, which must find the site serving the corpus on disk.

**Step 6. The list's paragraph, deployed.** Commit `src/routes/about/how/+page.svelte` (the only file `--write` changed), then `node scripts/predeploy.mjs --tier=corpus` (only an about paragraph changed) and `node scripts/corpus-ready.mjs && npm run deploy`. Its live check passes, and `/about/how` says the reference holds the list's species.

**Step 7. The cultivated fill, over about six days.** After the live check, the plan goes on with `--fill inat --bulk bulk`: iNaturalist's API for the cultivated photographs of every page, and the taxon of a page without one (most of the 2,327 without a GBIF key, whose wild photographs then come from the open data file too), about 49,000 to 54,000 requests at 9,000 a UTC day. Each day it stops at the allowance with "the day's allowance is spent … Run the same command again tomorrow, after midnight UTC"; type the same command the next day. Meanwhile the site serves the corpus of step 5, each page's cultivated set "not checked" until its turn. From round eighty's code on, the same step also asks the API for the 24 most-voted wild observations of each page whose taxon the open data holds more than 24 of ("Round eighty: the most-voted wild photographs", below), and asks several taxa a request, at most 4,000 a day, so the rest of the fill is about five days ("Round eighty: iNaturalist", below). When the fill has finished (`… filled. Every dossier has been asked for its photographs.`), the plan runs `--index` again, stops for a last review (the same species count as at the first upload), then uploads only what changed and runs the live check. Then delete `bulk\inat-open` (34 GB).

**Step 9. The prune.** At least a day after the last upload (the prune leaves anything uploaded less than a day ago), so round seventy-eight's products leave the bucket. It needs rclone 1.65 or later since this round (`rclone version`; `winget upgrade Rclone.Rclone`); an older one stops at the listing with nothing deleted. The index part below says what its dry run prints.

**Step 10. The purge of `s/v2/`.** Round seventy-seven's corpus, which no Worker since round seventy-eight reads: `rclone purge r2:cultifolio/s/v2`. It does not wait on the build: on or after 26 October, before or after the upload. It keeps two corpora around a refresh (about 7 GB) inside R2's free 10 GB.

**What the live site serves at each point.**

| After | The bucket holds | The live Worker | The site serves |
|---|---|---|---|
| nothing yet | `s/v2/`, and `s/v3/` with round seventy-eight's 8,945 pages | round seventy-eight's | round seventy-eight's corpus |
| step 0 | the same | this round's | the same pages, data and addresses (measured, above); the species page holds its notes line while the collection opens |
| steps 1 to 4, and step 5 to its second review | the same | this round's | the same: nothing has left the PC |
| step 5's upload and live check | `s/v3/` with the full corpus, and round seventy-eight's products until the prune | this round's | about 48,360 pages, among them the 2,327 without a GBIF key, 1,415 of them with GBIF's records under the keys Kew's synonymy gives them; wild iNaturalist photographs from the open data; cultivated sets "not checked" |
| step 6 | the same | this round's, with the list's paragraph | the same, and `/about/how` says how many of the list's species the reference holds |
| step 7 | the same, the fill's changes added | this round's | the cultivated photographs, and iNaturalist's photographs on most pages without a GBIF key |
| steps 9 and 10 | `s/v3/` only, and only the files the live corpus names | this round's | the same |

**Going back.** Before step 5's upload, `npx wrangler rollback` brings back round seventy-eight's Worker, which serves the same corpus. After it, round seventy-eight's Worker would answer 503 for the 2,327 pages without a GBIF key, so go back by the corpus instead, with this round's Worker kept: copy `backups\v3-c14b776c7296ad11` back into `static\s\v3` and upload it (the two `rclone copy` lines of section 5 and the manifest last), which serves round seventy-eight's corpus again.

#### GBIF's records, by either route (agent D)

**Both routes.** The **SQL download** (format `SQL_TSV_ZIP`), which GBIF's helpdesk enables per account, or the **Darwin Core Archive** the build has always read, which needs nothing enabled. Both are asked for exactly the same records (the list's keys, with coordinates, no geospatial issue, present), and the build reads the same columns from each, so the pages are the same by either route ("The proof" below). The difference is size and photographs: the SQL download holds only the 15 columns the build reads and none of GBIF's photographs, so beside it you fetch a small DWCA of the records with images (the images' download).

**Your GBIF account, once per window.** In cmd, in the project folder (`cd /d "C:\path\to\AI Work\cultifolio"`):

```
set GBIF_USER=yourname
set GBIF_PASSWORD=your password
set GBIF_EMAIL=you@example.org
```

`GBIF_USER` is your GBIF user name, not your e-mail address. No space after `=`.

**The counts (walk step 1; no account needed, about 45 minutes, any day).** `npm run bulk -- gbif-count scripts/species-list.txt`. It counts the list's records with GBIF's count API, one request a second, and keeps the counts in `bulk\counts.json` and `bulk\media-counts.json`, so a second run is quick and the requests below reuse them. Good output ends like this (here, 2026-10-20):

```
  45170 species with 142.3 M records go in the download; 871 species with more than 100000 records each (307.4 M in all) are left to the API path, listed in bulk/api-path.txt
  records: 142.3 M … by the species facet
  the Darwin Core Archive (gbif): about 64.9 GB
  the SQL download (gbif-sql): about 4.8 GB
  records with images, human observations: 40,240,751; iNaturalist's dataset 37,000,387, the others 3,240,364
  the images' download (gbif-media): about 1.5 GB without iNaturalist's dataset, 18.3 GB with it (--with-inat)
```

The 871 species with more than 100,000 records each (common trees and weeds: 307 million records between them) are left out of either download, as since round sixty-seven; the build asks GBIF's API for a few hundred records of each.

**The SQL route (walk step 2a, once GBIF has enabled SQL downloads).** Two requests, which GBIF prepares side by side (it lets an account have three in preparation, or one when it is busy; a request past that waits a minute and asks again, by itself):

```
npm run bulk -- gbif-sql scripts/species-list.txt --wait
npm run bulk -- gbif-media scripts/species-list.txt --wait
```

Run the second in another cmd window (with the three `set` lines) while the first waits, or after it. Each first writes its request to `bulk\request-sql.json` and `bulk\request-media.json` (that file is exactly what is sent; add `--dry-run` to write it and send nothing), then asks GBIF to check the SQL ("GBIF's validation accepted the SQL (HTTP 201)"), then sends it, says `download requested: 00…-26…`, and checks every 30 seconds until GBIF has made it. Then it fetches it to `bulk\occurrence.zip` (about 4.8 GB, an estimate) and `bulk\media.zip` (about 1.5 GB, an estimate: 3.2 million records with images at the DWCA's 456 bytes a record; more if they carry more images than the average) and ends with "… ready (… MB, … records). Cite as https://doi.org/10.15468/dl.…". How long GBIF takes is not known; round seventy-two's 12.7 GB DWCA took 67 minutes, and an SQL download is a newer service. If a window is closed while it waits, `npm run bulk -- gbif-status --wait` (the records) and `npm run bulk -- gbif-media-status --wait` (the images) carry on from `bulk\download.json` and `bulk\media-download.json`. The SQL is one `SELECT` on GBIF's `occurrence` table, written by `scripts/gbif-request-lib.ts` (`sqlQuery`):

```
SELECT gbifid, occurrence.gbif_classification.specieskey AS specieskey, occurrence.gbif_classification.taxonkey AS taxonkey, occurrence.gbif_classification.acceptedtaxonkey AS acceptedtaxonkey, decimallatitude, decimallongitude, coordinateuncertaintyinmeters, coordinateprecision, "year", countrycode, basisofrecord, license, datasetkey, establishmentmeans.concept AS establishmentmeans, degreeofestablishment.concept AS degreeofestablishment FROM occurrence WHERE occurrence.hascoordinate = TRUE AND occurrence.hasgeospatialissues = FALSE AND occurrence.occurrencestatus = 'PRESENT' AND EXISTS(occurrence.gbif_classification.taxonkeys, taxonkey -> taxonkey IN ('2650087', '2650105', …))
```

with the list's keys in the `IN` (508 KB of SQL). The three keys are read from `gbif_classification`, GBIF's backbone, because the table's own `specieskey` and `taxonkey` are now Catalogue of Life's and the build is by backbone key; the reader stops with a sentence if a download ever holds the other kind. The `WHERE` is GBIF's own translation of the DWCA's filter (GBIF's `/occurrence/download/request/sql` gives these four clauses for it), with the keys' clause written since round eighty as GBIF's data analyst advised on 2026-10-21, `EXISTS(… taxonkey -> taxonkey IN (…))` in place of GBIF's translation `ARRAYS_OVERLAP(occurrence.gbif_classification.taxonkeys, ARRAY(…))`: the same records, and the download asked in the older form ran 23 hours and was cancelled. GBIF's validation accepted the whole query in the new form on 2026-10-22, as it accepted the older one on 2026-10-20 (a check of the SQL, not a run; `scripts/dev/scale/results/r80o-gbif-validate.txt`). Nothing else the build applies is applied by GBIF, on purpose: the build keeps a uniform sample of 2,000 records a species by a hash of each record's id, then judges each kept record, and a record GBIF left out would change the sample. SQL cannot take the sample itself (no sub-queries, `HAVING` or `QUALIFY`).

**What GBIF may answer, and what to do.**

- `GBIF refused the SQL download (HTTP 403): SQL downloads are not enabled for this account yet`: the helpdesk has not enabled it. Wait for their answer, or take the DWCA route below now. Nothing is lost: the counts stand, and the build reads whichever arrives.
- `GBIF's validation refused the SQL (HTTP 400): …`: GBIF has changed its SQL. Paste the line back.
- `download … FAILED`: GBIF could not make it. Ask it again in four parts, `npm run bulk -- gbif-sql scripts/species-list.txt --parts 4 --wait`: four requests of about 11,300 species each, fetched to `bulk\occurrence-1.zip` … `occurrence-4.zip`, which the build reads in turn (each page cites its own part's DOI). If that fails too, take the DWCA route.
- "GBIF holds three of your downloads in preparation already: waiting a minute": as it says; it asks again by itself.
- HTTP 401: the user name or password is wrong (the user name, not the e-mail address).

**The DWCA route (walk step 2b, if GBIF refuses or is slow).** `npm run bulk -- gbif scripts/species-list.txt --wait`. The same as round seventy-two's, for the list: one request of 45,170 keys, which is 45,173 of the 101,000 items GBIF allows in one request (the Occurrence API reference, "Occurrence Download Limits", https://techdocs.gbif.org/en/openapi/v1/occurrence#limits), so it is not split. It writes `bulk\request-dwca.json` first, waits, and fetches `bulk\occurrence.zip`: about 65 GB (142.3 million records at round seventy-two's 456 bytes a record, an estimate), so check the disk first. At 100 Mbit/s that is about an hour and a half to fetch; at 20 Mbit/s about seven hours. It carries GBIF's photographs, so no images' download is needed. If you took the SQL route and then also fetched a DWCA, the newer `bulk\download.json` decides which `occurrence.zip` is read; keep one.

**Either way: the old download is refused.** Round seventy-two's `bulk\occurrence.zip` (12.7 GB, for 8,900 species) is still on your PC. The build of the list now stops on it ("… does not say how many species its download was asked for …"), and on a download asked for and not yet fetched ("… asked for and not fetched yet …"), and beside an SQL download on an images' download asked for fewer species, rather than ask GBIF's API for the 36,000 species it lacks. Delete it once the new one is fetched (the new one overwrites it anyway).

**The photographs, plainly.** Today's 8,947 pages hold 61,190 photographs taken from GBIF's download, on 5,158 pages. 54,833 of them (90%) are iNaturalist's (iNaturalist Research-grade Observations, GBIF's dataset `50c9509d…`), on 5,021 pages; 23,489 of those are on their page as iNaturalist's own photographs too, and on 606 pages (8,891 photographs) GBIF is the only way iNaturalist's photographs reach the page today. The other 6,357, on 1,316 pages, come from Pl@ntNet observations (5,669 on 1,186 pages), ALA species sightings and OzAtlas (363), the Norwegian Species Observation Service (150), Meise Botanic Garden Herbarium (68), Observation.org (37), MINKA (21), the Prairie Fen Biodiversity Project (20) and six more with fewer than ten each (`scripts/dev/scale/results/r79d-photographs.txt` lists them). The SQL download carries none of them. iNaturalist's are in iNaturalist's open data, which agent P's pass reads; so by default the images' download leaves iNaturalist's dataset out and asks only for the others: 3,240,364 records with images, about 1.5 GB. With it, a page's GBIF photographs are drawn from the other datasets alone, so they differ from the DWCA route's (which draws its forty photographed records from all datasets, most of them iNaturalist's), and iNaturalist's come through P's pass instead. For the DWCA route's photographs exactly, add `--with-inat`: 40,240,751 records, about 18.3 GB. If you start the build before `bulk\media.zip` is there, the build says "the SQL download carries no photographs and bulk/media.zip is not there: GBIF's photographs are not asked" and marks them not asked (never "none"); once it is there, run `npm run dossier -- --fill gbif --bulk bulk` before `--index`.

**The proof that both routes give the same pages** (`scripts/dev/scale/r79d-sql-proof.ts`, 2026-10-20; results in `scripts/dev/scale/results/r79d-sql-proof.txt`). Real records of seven species (1,108 records, 523 of them photographed observations) were read from GBIF's occurrence search and written in both shapes: a DWCA under all 230 of GBIF's interpreted columns in GBIF's order, with multimedia.txt; and an SQL download in the form GBIF writes one (lower-case names, empty for null, Java's doubles, GBIF's licence codes, the rows in another order) with the images' download beside it (the records in a third order). The build's own reader read each and the build's own builder built each species from each. With the images' download holding iNaturalist's dataset, all seven pages were the same, field for field, by both routes, with the build's cap of 2,000 records and again with a cap of 100 (so the sample was drawn, not kept whole). Without iNaturalist's dataset in it, the records and every other field were still the same, and the GBIF photographs differed as said above (Sedum potosinum's and Drimia ciliata's 24 were all iNaturalist's, so they had none from GBIF; their iNaturalist photographs come through agent P's pass). Since a page's thirty GBIF photographs were the first thirty in the file's order, and two of GBIF's files hold the same records in different orders, they are now the first thirty by the record sample's own order, whatever order the file gives (`MediaIndex`): the same set by either route, and by two DWCAs made on different days of the same records.

**What the build asks, a species at a time and in batches** (agent B's measures of round seventy-eight, on a sample of 12 species, every request counted, multiplied out to the list's 48,368):

| | The build before round seventy-eight | After round seventy-eight |
|---|---|---|
| Requests a species (12-species sample, no download) | 14.4 | 8.7 by key (10.7 by name; the list gives the key) |
| Wikidata and Wikipedia | 3.0 a species: 145,000, at least 12 hours at Wikimedia's allowance | 0.28 a species: 13,500, about 1.3 hours |
| Commons (pages with fewer than 12 photographs) | 0.33: 16,000 | the same, now paced with the above: 1.6 hours |
| Kew's names via GBIF | 1 a species: 48,000, 3.4 hours at 0.25 s | none: Kew's file, 15 seconds to read, about 300 MB |
| OpenAlex | 48,000: $48, or 48 days on a free key | none |
| GBIF's species record, synonyms and common names | 3 a species: 145,000, 10 hours at 0.25 s | the same (the common names have no bulk source: below) |
| iNaturalist, in the build | 2.83 a species: 137,000, 15 days | none (`--skip inat`) |
| iNaturalist, the fill after it | | about 2 a species: 97,000, 11 days at 9,000 a day, about 4 hours a day; the cultivated set alone 1.01 a species: 49,000, 6 days, about a third of species gaining photographs |

**Common names stay a request a species.** GBIF's backbone archive (`backbone.zip`, 2023) holds 41,604 common names for today's species where GBIF's API gives 103,389, has no "preferred" mark, and has no English name for 1,711 species that have one today. Taking them from it would lose names, so the build still asks GBIF's API, which sets no daily limit.

#### The species without a GBIF key (agent K)

**Your decision 1.** The list's 2,327 species that GBIF's backbone gives no one key (the lines of `scripts/species-list.txt` whose last column is `-`) are now built, from Kew's file, and are never matched to GBIF by their name. Of them, GBIF's backbone (the copy the list was made from) holds 1,758 only as a synonym of another species, 564 not at all (79 of those it spells otherwise, such as Viburnum davidi for Kew's Viburnum davidii and the 2024 correction of "caffra" to "afra"), and 5 only as several doubtful names. Most are in by their own records (1,763), 504 by their collector genus alone, 60 by both; Cactaceae 226, Asteraceae 150, Apocynaceae 143. Among them are some of the most grown plants on the list: white spruce as Kew names it (Picea laxa, 5,919 records), Mexican, Monterey and Arizona cypress (Hesperocyparis lusitanica, macrocarpa, arizonica), Nootka cypress, Viburnum davidii, leek (Allium porrum), salad burnet, Opuntia cespitosa and Adenium multiflorum.

**What such a page holds, and what it says.** Its id is `k` and Kew's plant_name_id; its name, author, family, older names and range are Kew's; its Wikidata item is the one carrying Kew's IPNI or POWO identifier (and Wikipedia through that item); iNaturalist's taxon only where its name is the species' own or one of Kew's; Commons as any page. **Its GBIF records, by your decision of 2026-10-20 on K's offer:** read only under GBIF's keys for the names Kew's file holds as this plant, by round seventy-three's rule (the entry's own name and author, a spelling Kew files under it, or a name it files under it and marks homotypic, or an autonym of one; a key no other page holds or is filed under), never a name matched. Those keys are `scripts/extra-keys-kew.txt` (1,956 keys on 1,415 of the 2,327 pages, written by `npx tsx scripts/kew-extra-keys.ts --bulk bulk --backbone bulk\backbone\simple.txt.gz` from the list, Kew's file and GBIF's backbone export, and committed), and every GBIF request asks for them with the list's own, so their records are in the download. Such a page has the map, the marker, the habitat climate and the record counts from them, names each key with Kew's reading of it, and keeps no GBIF key of its own and no GBIF photographs. Of the 1,758 the backbone holds only as another species' synonym, 1,141 gain keys (237 by GBIF's usage of their own name and author, 904 only by names Kew files under them); of the 564 it holds no name of, 270 (by names Kew files under them: a homotypic synonym, or a spelling); of the 5 doubtful, 4. The other 912 read no key: 633 because GBIF files every key of theirs under another page of the reference (so its records are that page's already, and a record is never on two pages), 42 because only heterotypic synonyms were left (not read, as round seventy-three's rule has it), 17 for other refusals and 220 for want of any usage of their names; they have no points on the map, no marker, no habitat climate and no species of nearest climate, and each says "not checked", with the reason, never "none". Measured on all 2,327 (2026-10-20): Wikidata finds one item for 1,868 (80%), two for 12 (not taken), none for 447; of the 1,868, 734 have an English Wikipedia article and 1,018 an iNaturalist id, 847 of which pass the name rule as they stand. iNaturalist's name search found a taxon by the rule for 78 of a sample of 120 of the rest. So about four in five of these pages will have iNaturalist's photographs once the fill has run.

**Nothing separate to run.** The plan's build step (walk step 5) builds them in the same run, from the same command, because it is given `--bulk bulk`:

```
node scripts/corpus-step.mjs --plan scripts/corpus-plan-full.txt
```

Its build step's first lines then say:

```
scripts/species-list.txt: a species list of 48357 species: 46022 built by their GBIF key, 2335 with no GBIF key in the list (its lines whose last column is "-") built from Kew's file by their plant_name_id, never matched to GBIF by their name
  2335 species without a GBIF key read from Kew's file, to be built from it
  1415 of them read GBIF's records under 1956 keys Kew's synonymy gives them (scripts/extra-keys-kew.txt); the other 920 say GBIF's records not checked
```

and each such species' line reads like `✓ Hesperocyparis lusitanica [k457911] 0 photos, 312 open/40 restricted in range, climate ok (… ms)` for one that reads keys, or `… 0 open/0 restricted in range, climate pending` for one that reads none: no photographs yet, since the build skips iNaturalist and `--fill inat` adds them over the following days; "climate pending" is the record's word, and the page says "not checked" with the reason. A line `… plant_name_ids of the list Kew's file of … does not hold as an accepted species, not built` names any the Kew file in `bulk\` has moved since the list was written; rerun `scripts/select-species.ts` if it is more than a handful. Reading Kew's file for them takes about 20 seconds; building them about 1 to 2 seconds a species (Wikidata 47 queries and about 38 item reads in batches, Wikipedia about 40 reads, Commons one request a species), so under an hour of the build's 19.

**To build only these first, as a check** (optional, before the full build; under an hour, with no GBIF download needed):

```
node -e "const fs=require('fs');const t=fs.readFileSync('scripts/species-list.txt','utf8').split(/\r?\n/);fs.writeFileSync('kew-only.txt',t.filter(l=>l.startsWith('#')||l.endsWith('\t-')).join('\n')+'\n')"
npm run dossier -- kew-only.txt --bulk bulk --skip inat
```

The first line writes `kew-only.txt`, the list's header and its 2,335 lines without a GBIF key (2,327 before round eighty). The build says "a species list of 2335 species: 0 built by their GBIF key, 2335 with no GBIF key in the list…", writes them to `static\s\v3\k<id>.json`, and is kept by the full build after it ("kept (clean)"). Delete `kew-only.txt` afterwards.

**The fills.** `--fill inat` asks each such page's iNaturalist taxon by its own and Kew's names (its Wikidata item's id checked the same way), and then its photographs, inside the day's 9,000 requests; `--fill inat-ids`, `--fill wikidata`, `--fill gbif-open` and `--names` pass these pages by and say how many ("… pages without a GBIF key passed by"), since each reads GBIF's answers by the page's key.

**The deploy order** is walk step 0: this round's Worker live before the upload of a corpus that holds such pages, since round seventy-eight's answers 503 for each of them. The corpus stays version 3 (`s/v3/`), so `corpus-ready` passes on round seventy-eight's corpus, and this round's Worker serves that corpus as it is (measured; the walk says how). The plan's upload checks it.

#### iNaturalist's photographs (agent P)

**What changes, and why** (your decision 3). A page's wild iNaturalist photographs now come from iNaturalist's open data: the export iNaturalist publishes each month in the public Amazon bucket `inaturalist-open-data`, read once on the PC, in one pass, with no daily limit and no request to iNaturalist. Only the cultivated photographs, and the taxon of a page that has none yet, are still asked of iNaturalist's API, within the day's 9,000 requests.

**What the open data holds.** Four of its files are read (the export of 2026-09-27; the next is due about 27 October):

| File | Size | Columns |
|---|---|---|
| `taxa.csv.gz` | 40.0 MB | taxon_id, ancestry, rank_level, rank, name, active |
| `observers.csv.gz` | 17.4 MB | observer_id, login, name |
| `observations.csv.gz` | 13.42 GB | observation_uuid, observer_id, latitude, longitude, positional_accuracy, taxon_id, quality_grade, observed_on, anomaly_score |
| `photos.csv.gz` | 20.67 GB | photo_uuid, photo_id, observation_uuid, observer_id, extension, license, width, height, position |

It has a quality grade, each photograph's own licence, the observer's name and login for the credit, and iNaturalist's own taxon ids (the API's). It has no captive or cultivated flag, which is why the cultivated set stays with the API; the wild set needs none, since iNaturalist never makes a captive observation research grade. It has no observation number (so a photograph's page is its observation's address by uuid, `https://www.inaturalist.org/observations/<uuid>`), no place name and no votes.

**What a page shows differently.** Checked on 50 real species against the API itself, one request every two seconds (`scripts/dev/scale/r79p-inat-open-proof.ts`; the answers and the comparison are in `scripts/dev/scale/results/r79p/`). Where a species has 24 such observations or fewer, the page shows the same photographs by either route: 29 of 30, and the 30th lacks one observation made on 14 October, after the export. Where it has at most 200, the whole set is the same for 37 of 42; each of the other five differs by an observation made or identified again since the export (four), or by one the API counts that the export did not hold as qualifying (one). Of the 719 photographs both routes chose, every field the page shows is the same (address, size, licence, date, author) but three: the photograph's page is its observation's by uuid rather than number (the same page); the place name is gone, since the export has none (701 of the 719 had one); and one credit names the observer's account name where the API names the photograph's own record ("A4"). Within an observation, the photographs are in the export's `position` order, which differs from the API's for 54 of 427 observations with two or more (the same photographs, another first). Where a species has more than 24, the page shows the 24 newest, not the 24 most voted: on 20 such species, 209 of the API's 480 choices are among them. On today's corpus (8,947 pages, filled from the export here in 3.6 minutes): 5,549 pages have wild iNaturalist photographs (5,110 before; 439 gain them, which showed only GBIF's copies, since the API was not asked where GBIF's download gave six or more); no page loses all of them; 777 show ten or more fewer, because the most-voted observations carry more photographs each (2.6 against 1.8), and in all 193,015 against 186,756.

**Download the four files** (walk step 3; once a refresh; 34.1 GB, about 45 minutes at 100 Mbit/s, an hour and a half at 50). In the project folder, in cmd (curl is part of Windows 10 and 11; `-R` keeps the files' dates, which name the export, and `-C -` carries on a download that stopped):

```
mkdir bulk\inat-open
curl -R -C - -o bulk\inat-open\taxa.csv.gz https://inaturalist-open-data.s3.amazonaws.com/taxa.csv.gz
curl -R -C - -o bulk\inat-open\observers.csv.gz https://inaturalist-open-data.s3.amazonaws.com/observers.csv.gz
curl -R -C - -o bulk\inat-open\observations.csv.gz https://inaturalist-open-data.s3.amazonaws.com/observations.csv.gz
curl -R -C - -o bulk\inat-open\photos.csv.gz https://inaturalist-open-data.s3.amazonaws.com/photos.csv.gz
```

Or with the AWS command line, which needs no account: `aws s3 cp s3://inaturalist-open-data/photos.csv.gz bulk\inat-open\ --no-sign-request`, and the same for the other three. About 34.1 GB in all; with the file written in step 2, keep about 36 GB free (the file is 1.1 GB). These are the export's tables, not photographs: iNaturalist's limit on media downloads (5 GB an hour, 24 GB a day) is about image files, and nothing here downloads one. The reader reads the four tables, and the pages store each photograph's address, which a visitor's browser loads as it does today.

**Read them** (walk step 3; under an hour on the PC; measured here at 49 minutes, reading both big files straight from the bucket on a shared two-core machine, at most 1.05 GB of memory):

```
npx tsx scripts/inat-open-load.ts bulk\inat-open
```

Good output ends like this (the export of 2026-09-27, read here):

```
iNaturalist's open data of 2026-09-27 in bulk\inat-open: reading the plant taxa, then observations and photographs together (one pass), then observers…
  501 M photographs, 283 M observations read; 10.78 M research-grade plant observations with an open photograph; 48.5 min
  282933221 observations and 501256126 photographs read (0 observations with no photograph row); 64366921 research-grade observations of a plant at species rank or below, 10789509 of them with a CC0, CC BY or CC BY-SA photograph
  398211 plant taxa; 115849 at species rank or below have wild photographs; 1201219 observations kept (at most 24 a taxon)
  a photograph's observation was found at most 23049 observations back (the window holds 500000)
  398211 taxa written to bulk/inat-wild.jsonl (1111.1 MB) in 48.8 min. Next: npm run dossier -- --fill inat --wild --bulk bulk
```

If it stops with "photograph rows name an observation not found near them", the export's two big files are further out of step than this one's were: run it again with the `--window` it names. If it stops with "no column …", iNaturalist has changed a file's columns: stop and tell the developer.

**The wild photographs, every page, in one pass** (the plan's wild pass in walk step 5, after the build; no request to iNaturalist; 3.6 minutes for today's 8,947 pages here, so about 20 at 48,368):

```
npm run dossier -- --fill inat --wild --bulk bulk
```

It says how many dossiers have an iNaturalist taxon the file holds, and "… wild sets read from iNaturalist's open data". A page without an iNaturalist taxon is left for the cultivated fill, which asks its taxon by name; so is a page without a GBIF key whose taxon its Wikidata item gave, until the cultivated fill has checked it against Kew's names. Each page's record says "from iNaturalist's open data of 2026-09-27: research-grade observations with an open-licence photograph, the 24 whose photographs iNaturalist received last (the open data holds no votes); filled <day>".

**The cultivated photographs, over days** (walk step 7: the API, within the day's 9,000):

```
npm run dossier -- --fill inat --bulk bulk
```

It asks iNaturalist only for what the open data cannot give: the cultivated set of each page, the taxon of a page without one (and that page's wild set is then read from the file), and the wild set of a taxon newer than the export. At the day's allowance it stops (exit 3); the same command the next day goes on. About 49,000 to 54,000 requests in all: the cultivated set, one a page, and the taxon of a page without one (one page in eight on today's corpus; a species without a GBIF key costs 1.8 requests, measured on 25 of them). So about six days at 9,000 a day, about four hours a day (one request every 1.5 s, round eighty). Round eighty's code asks several taxa a request, one every 2 s and at most 4,000 a day: "Round eighty: iNaturalist", below, for its numbers.

**Afterwards.** `bulk\inat-wild.jsonl` is read by the fills only; once the cultivated fill has finished, delete the downloads: `rmdir /s /q bulk\inat-open` (34 GB), and `del bulk\inat-wild.jsonl` if you will not fill again before the next export. Nothing on a page depends on either: each page's record names the export's day.

#### The cleaning of the records: botanic gardens, herbaria and zoos (agent Q)

**Nothing to run for it.** Every build now leaves out a GBIF record within 1 km of a botanic garden, arboretum, herbarium or zoo on Wikidata's list of them (CC0), and counts it: such a record is most often a planted plant, or a specimen placed at the address of the herbarium that keeps it, and its climate is not the wild plant's. The list is `scripts/institutions.txt` (6,656 places), committed, so the build asks nothing for it. The rule reads only a record's coordinates, which both of GBIF's routes give. Each page's record of GBIF's occurrences says how many records it left out, by kind of place. The full build's log ends with one more paragraph, for example:

```
  Institution rule (Wikidata's 6656 botanic gardens, herbaria and zoos, 1 km): 41210 records of 5212 species left out; 4630 of those species have a habitat climate; beside the pages the build before wrote without the rule (whose records may differ for other reasons too), 4402 kept a habitat climate, on 812345 grid cells where they had 830211, and 9 lost it:
    Gasteria glauca [k…]: 2 records left out; climate none, 1 cell before
```

The figures above are invented, to show the form. On round seventy-seven's corpus the rule removed 1.8% of the openly licensed points that were kept, from 2,651 of 7,776 species. Five species lost every point: four Gasterias whose only kept points were samples and sheets of 2010 placed at Kirstenbosch, and Prunus laurocerasus, whose one point lay 98 m from a botanic garden in Ljubljana. Six more fell under three points, one of them wrongly: a 2025 observation of Haemanthus pumilio lay 1 km from Stellenbosch University's garden (Wikidata's Q7607242), and the species' other two points lie 2 and 13 km from it. Expect about the same share at 48,368 species. The climate's effect can only be measured on your PC, where the grid is, and this paragraph is that measure. If "lost it" lists more than a few dozen species, send the paragraph back before the upload. If the line instead says `Institution rule not applied`, the file is missing: restore it with `git checkout scripts/institutions.txt` and build again.

**To refresh the list** (only when you want to; the committed one is from 2026-10-20). This asks Wikidata's query service three times and takes a minute or two:

```
npx tsx scripts\institutions-fetch.ts
```

Good output lists the three kinds with their counts (about 3,650 botanic gardens, 290 herbaria and 2,700 zoos) and ends with the file written. Commit the new `scripts\institutions.txt`. The next build reads it.

**The cross-checks are not yours to run.** `scripts/dev/r79q-*` compared this round's rules with CoordinateCleaner's tests and Kew's ranges with rWCVP's reading of the same names. Those scripts need R and two GPL packages, which were installed in the review workspace only. Nothing in the build or the site needs them.

#### The index, the upload and the Worker at the full list's size (agent Z)

Nothing to type beyond the plan: its `--index`, upload and live-check steps are the ones below. What to expect, measured by the developer on a corpus made to the list's size (48,368 dossiers, 1.9 GB, made from round seventy-seven's real ones with the list's names, ids and Kew's ranges, 2,326 of them without a GBIF key; `scripts/dev/scale/r79-full-corpus.ts` and `r79-keyless.ts`), on the review machine's two shared cores:

- **`--index`** (the plan's index step; alone, `npm run dossier -- --index`): 17 minutes here, 9 of them CPU; plan on 10 to 20 minutes. Node held at most 1.8 GB of heap (2.5 GB in all), inside the 8 GB the command allows; before this round it held every dossier parsed at once (1.9 GB of them as text) while it marked the photographs two pages share. Good output has, in order, `page ids: …`, `nearest habitat climates for about 38000 species (…)` (under a minute here; 30 minutes before this round), `index: 48368 species`, `photograph judgement: … on 48368 pages …`, then a line like `corpus <id>: 48368 species in 256 buckets, 512 posting files, about 64000 search key files (about 2100 MB) → static/s/v3/p/ …`.
- **What the upload carries the first time:** about 117,000 files and 4.4 GB, of which 48,368 dossiers (1.9 GB, median 37 KB, largest 166 KB), 1,321 genus records (0.7 MB), `index.json` (37 MB) and `p\` with 67,500 files (2.5 GB): 63,800 search key files (2.1 GB; median 7 KB, largest 0.96 MB), 256 entry and 256 sheet buckets (30 and 74 MB), 1,024 card files (21 MB), 512 older-name files (52 MB), 768 row files (66 MB), 512 posting files (31 MB), 516 search directory files (4 MB), the 9 catalogues (4 MB) and 2 sitemap files. The bucket then holds about 5 GB, inside R2's free 10 GB; a refresh adds only what changed until the prune.
- **The sitemap** is two files, `/sitemap-1.xml` with 40,000 addresses and `/sitemap-2.xml` with 14,901, each under the protocol's 50,000; `/sitemap.xml` names both (since round eighty as `/sitemap-<corpus id>-1.xml` and `-2.xml`; below, "Round eighty: operations").
- **The upload's time, estimated, not measured on your line:** 117,000 files at 32 transfers and about 150 ms a file is about 10 minutes; 4.4 GB is 12 minutes at 50 Mbit/s and 30 minutes at 20 Mbit/s. Plan on half an hour to an hour for the first upload, then a few minutes for `rclone check`.
- **The prune** (`node scripts/corpus-step.mjs --prune`) needs rclone 1.65 or later since this round (`rclone version`; `winget upgrade Rclone.Rclone`): it lists the bucket with each file's upload time and gives rclone the files to delete as `prune.txt`. Its dry run says, as before, `the bucket's p/ holds … files; keep.txt keeps …; named by none: …, of which … more than a day old would be deleted now`. An older rclone stops it with "the bucket could not be listed. Nothing was deleted." The manual lines of section 5 still work but are slow at this size (about half an hour to an hour each `rclone delete --exclude-from`).
- **The Worker** at this size, in Cloudflare's runtime run locally (`scripts/dev/scale/workerd-heap.mjs` and `page-cpu-workerd.mjs`): a cold species page took 88 to 229 ms of CPU (median 165), a cold front page 158 ms, a cold first search at most 381 ms ("rose"; "cactus" 199, "aloe" 209, "aloe verra" 277, "red rose" 302), a lookup by GBIF key or by page id under 80 ms, and a fresh copy held at most 19.5 MB after any one of them. One copy answering 56 requests in a row (24 species pages, the front page and two catalogue views, the lookups, the sitemap files and fourteen searches) held at most 66 MB in use. After the deploy, the cold-start check above (section 3, "A cold start's CPU and memory") is the one to run, with the same limits: a cold species page under 300 ms, a first search under 1,000 ms.

#### The review, the plant and species pages, and the list's paragraph (agent F)

**Nothing to run for the review.** The corpus step's review now compares a photograph's `shared` list (the other pages that hold it) as a set of GBIF keys: the same pages in another order are the same page, and a page more or fewer is a difference it names. On round seventy-eight's run it said Melia azedarach and Eucalyptus robusta differed "apart from their ids": the index had sorted their lists by id, and the order was part of each page's fingerprint, so `--index` stamped both changed that day. The fingerprint now reads the list as a set, so the order moves no page's day; the rekey writes the lists in the index's order, and the index does not rewrite a list of the same pages. Every list already in the index's order keeps its fingerprint, so this round's build moves no day for it.

**The list's paragraph on /about/how, at the plan's second review, after the build's `--index` and before the upload** (a few seconds, offline; walk steps 5 and 6). It is written from the list and the corpus on disk, never by hand:

```
node scripts/about-how-r79.mjs
```

Good output starts `about-how: the list holds 48,357 species; the reference (static/s/v3/index.json, N pages) holds 48,357 of them, every one; Aloe 199 of 611, Euphorbia 401 of 2118.`, then the paragraph, then "Nothing written". If it says the reference holds fewer of the list's species, it asks for the reason: give it as the build's own line says it, then write the page:

```
node scripts/about-how-r79.mjs --write
node scripts/about-how-r79.mjs --write --why "the build stopped before them"
```

The second form only when the first refuses. It says `written into src/routes/about/how/+page.svelte.`; commit that file and deploy it once the upload's live check has passed (walk step 6; its test run checks the page). It refuses, writing nothing, with no `static\s\v3\index.json`, with the fixture's or round seventy-eight's corpus on disk, or if the page's paragraph has changed since round seventy-eight.

**Nothing to run for the pages.** With the reference's photographs switched on, a plant page now keeps the species photograph's room while it asks for the sheet, so the photograph's arrival moves neither the card nor the buttons under a finger; a species page keeps "Your notes: none yet"'s line while the collection opens, so the cultivation cards do not move. In the owner's WebKit runs a press made in that moment was lost (r69p P5, and r73p keys 1 on the front page, whose test now waits for the collection).

### Round eighty: the owner's walk

Your PC is at step 11 of `scripts/corpus-plan-full.txt`, the cultivated fill, about 5,176 of 48,361 pages done. This is the whole of round eighty for you, in the order to do it. The sections after this one are each agent's notes, for reference; where one of them says otherwise about when to run something, this walk is the one to follow.

**The rule for every step below: never while `node scripts\corpus-step.mjs` is running.** Each step goes on an evening after a day's run has ended ("Run the same command again tomorrow", exit 3) and before the next day's run, or on a day you run nothing.

**(a) The delivery and the deploy (one evening, about two hours, most of it the tests).**

1. Let the day's run end. Extract the round's zip over the project folder, replacing files when asked. It holds every file changed since your last delivery; it does not hold `scripts\corpus-plan-full.txt`, so your plan file is the one your run started with, and nothing of yours that the plan wrote (`scripts\extra-keys.txt`, `corpus-step.json`, the corpus, `backups\`) is in it.
2. Delete the nine app files that moved to `static\app\` (the zip brings the new copies; extracting deletes nothing, and the unit tests check `static\` holds only `app` and `s`). In the project folder, in cmd:

   ```
   del static\favicon.svg static\icon-192.png static\icon-512.png static\icon-maskable-512.png static\manifest.webmanifest static\og.png static\.assetsignore
   rmdir /s /q static\maps
   ```

   (in PowerShell: `Remove-Item static\favicon.svg, static\icon-192.png, static\icon-512.png, static\icon-maskable-512.png, static\manifest.webmanifest, static\og.png, static\.assetsignore; Remove-Item -Recurse static\maps`). `dir /a static` should then list only `app` and `s`.
3. `node scripts\corpus-step.mjs --plan scripts\corpus-plan-full.txt --status`. Good: lines 1 to 10 `done`, line 11 `unfinished` (or `to do`), `dossier --fill inat --bulk bulk`, lines 12 to 15 `to do`. If every line says `to do`, stop and paste it back: the record from before is the newest `corpus-step.<date>.<number>.json`, and copying it over `corpus-step.json` puts it back.
4. `node scripts\predeploy.mjs --tier=app`: the unit tests, then the browser suite in every engine, strict; about as long as your last run of it, less the minutes its server took to start. Its server no longer copies the corpus (agent O): it answered in about 20 s here with 25,860 corpus files on disk (agent O measured 29 s with 145,000), where at your corpus's size the build had been copying 4.5 GB twice. The first build after the delivery clears the last build's two copies (about 9 GB) once, which is slow; every build after it writes about 630 files. If a test fails, paste the end back and do not deploy.
5. `node scripts\corpus-ready.mjs && npm run deploy` (the release gate runs the unit tests again, about ten minutes, then a few minutes for the deploy). The build prints `offline-files: the service worker caches 138 build files at install` (agent U). Then S's two checks after the deploy (section "Round eighty: search and the catalogue"): `x-search-total` on an Echeveria search, Quercus under "Most grown".

What the deploy changes at once, with no rebuild: the search's count, paging, regions and speed (S); the app's pages and the phone (U); the sitemap's lifetimes, the sync server's fallback, the about pages' caching and Cloudflare's error-report sentences (O); the cold floor set aside where the weather cell's ground is more than 1,000 m from the typical spot's (A, about 570 live pages); the common name that is the species' own or an older name, not shown on the species page (A); the plant page's notice for a keyless species (A); the not-checked pages' own reasons and the Wikidata names line, as soon as the one-off fills below write them (R, N).

**(b) The one-off steps, between two fill days (the same evening as (a), or the next; about two hours in all, most of it the last one).** Each is typed alone in the project folder. None changes the plan's record, and each page they write reaches the site with the plan's own `--index` and upload at the end of the fill.

1. **The 475 lost iNaturalist ids** (agent I; offline, under a minute). First `findstr backupDir corpus-step.json`, which prints the backup step 1 made, then:

   ```
   npm run dossier -- --fill inat-restore backups\v3-<the id that line names>
   ```

   Good: `N pages without an iNaturalist id had one in backups\v3-…: M given back (not yet checked: the next --fill inat checks each …)`, M about 475 less any the fill found since, and `inat-restored.txt` naming each. Run it once, before the next fill day, so the fill checks and fills them.
2. **English names from Wikidata for the pages without a GBIF key** (agent N; about 15 seconds of Wikidata's query service, a few minutes reading the dossiers, then the index, 10 to 30 minutes). After the deploy of (a), since the Worker before says on `/about/how` that every common name is GBIF's:

   ```
   npm run dossier -- --fill wikidata-names
   ```

   Good: `… 2335 without a GBIF key; 1868 Wikidata items asked in 10 queries …` and `249 pages given English names from Wikidata …` (the counts move a little as Wikidata is edited). If it ends "Wikidata did not answer" (exit 3), type it again an hour later: pages not answered are left as they were. Do not run `scripts\corpus-plan-r80-names.txt` now: its upload would go up in the middle of the fill. The flag `--keyed` stays off (your decision, in N's section).
3. **The not-checked pages' own reasons** (agent R; seconds, offline, then the index):

   ```
   npm run dossier -- --fill kew-why
   ```

   Good: `920 pages without a GBIF key read no key; 908 changed: 643 lumped, 210 none, 46 other-type, 8 other-author, 1 other say why for themselves (scripts/extra-keys-kew-none.txt), 12 the general reason (not in the file)` (Xanthoceras sorbifolium, the file's 909th, gets its reason when (d) builds it from Kew's file). The twelve are pages whose list lines lost their GBIF key just before the build (agent X's homonym fix), for which the rule now finds keys the download did not ask: they say the general reason until the next refresh asks them. A second run says `0 changed`. Do not run `scripts\corpus-plan-r80r.txt` now, for the same reason as above.
4. **Wikidata's batches that timed out at the build** (agent A; reads the download, so about ten minutes for the SQL download or an hour for the Darwin Core Archive, then about 2 s a page and the index, about 17 minutes):

   ```
   npm run dossier -- --list-wikidata-retry
   npm run dossier -- --keys rebuild-wd-retry.txt --grid climate --bulk bulk --skip inat
   ```

   The first says how many pages Wikidata did not answer (the full build's 22, and the pages with a Kew id whose item a label refused); skip the second if it says `0 pages`. The rebuilt pages keep their iNaturalist ids and photographs (agent I's carry), so the fill goes on with them as before.

**(c) The daily fill, until it ends (about five more days, about three hours a day).** Once a day after midnight UTC, as now:

```
node scripts\corpus-step.mjs --plan scripts\corpus-plan-full.txt
```

The fill now asks iNaturalist several taxa a request, one request every 2 s, at most 4,000 a UTC day (agent I), where one search a page met iNaturalist's throttle: about 16,000 requests are left, about five days, where the code before had about twelve. The first day begins `first, the … iNaturalist ids no build or fill has checked, checked with iNaturalist (thirty a request)` (about 1,400 requests), then the pages. A day ends at the allowance with `The day's allowance is spent (…); not a throttle. … filled; … still to do; run this again tomorrow (UTC)` (exit 3). Lines `iNaturalist is throttling this address (…): waiting 30 minutes, then going on` are the fill waiting out a throttle: leave it running. Keep `bulk\inat-wild.jsonl` until the fill ends. If iNaturalist throttles before 4,000 on several days, type `set CULTIFOLIO_INAT_BUDGET=3000` (PowerShell `$env:CULTIFOLIO_INAT_BUDGET=3000`) before the command; never edit the plan file.

The last fill day does not stop at the fill. The fill's last line is `… Every dossier has been asked for its photographs.`, then the same run goes on with step 12, `--index` (17 to 30 minutes at 48,000 pages), and stops at step 13's review (exit 2): `Review before going on: corpus-step.log: the fill's last line …, the --index step's "index: <n> species" …`. That stop, before the upload, is where the repair goes.

**(d) At the review stop: agent A's repair, then the upload (one fill-free evening, about four to six hours).** A's repair must run after the fill (it rebuilds about 12,000 pages, which the fill would otherwise read and write the same evenings) and before the corpus goes up, so that one upload carries the filled and the repaired pages. Type it by hand at the stop, not as `scripts\corpus-plan-r80-repair.txt`: that plan is for a corpus whose full plan has finished, and run now it would make its own upload first (this round's `corpus-step.mjs` would keep the full plan's run aside and take it up again after, agent O's fix, but the full plan would then upload a second time).

```
npm run dossier -- --list-default-points
npm run dossier -- --list-range-shapes
npm run dossier -- --list-wikidata-retry
npm run dossier -- --keys scripts/r80-repair-keys.txt --grid climate --bulk bulk --skip inat
npm run dossier -- --keys rebuild-wd-retry.txt --grid climate --bulk bulk --skip inat
npm run dossier -- --keys rebuild-shapes.txt --offline --grid climate --bulk bulk
npm run dossier -- --prune-followed
npm run dossier -- --index
node scripts\corpus-step.mjs --plan scripts\corpus-plan-full.txt --go-on
```

- The three listings ask nothing, a minute or two each. `--list-wikidata-retry` should now list none or few (step (b) 4 did the rest): skip the second `--keys` line if it says `0 pages`. `--list-range-shapes` writes `rebuild-shapes.txt`, about 12,000 pages.
- The first `--keys` line rebuilds the 13 pages of `scripts\r80-repair-keys.txt` online (Xanthoceras sorbifolium from Kew's file, Crocus nudiflorus, seven ranges, Datura innoxia, the two merges' kept pages): the download (ten minutes to an hour), about 2 s a page, then its index (about 17 minutes). The `--offline` line re-derives the records, marker and climate of `rebuild-shapes.txt`'s pages from the download and the climate grid: the download again, about 80 minutes for the pages, NASA POWER for a cell not yet cached, then its index. In all about three to five hours; good output for each is in A's section.
- `--prune-followed` says `3 dossiers of pages merged into another deleted (9574874, 9592399, 7530398)`; the index typed after it then holds three species fewer than the review stop's (about 48,358), which is expected.
- `--go-on` passes the review and runs the upload (about half an hour to an hour: the fill rewrote nearly every dossier and the repair about 12,000 more) and the live check (a few minutes). Good: `the site serves corpus <id>, the one on disk` and `every step is done`.

Then on the site: A's checks (A's section: Crocus nudiflorus at `k327378`, `/species/ceropegia-cereiformis` leading to the kept page, Dracaena trifasciata's marker not at Nairobi, the tomato's page with no cold floor and why), S's two checks after the upload (an Echinocactus chrysacanthus search finding Ferocactus chrysacanthus; "cape provinces" with its total and region), R's (`/species/echinocereus-canus` naming and linking Echinocereus viridiflorus), N's (a keyless page such as Allium porrum with "Garden leek" and its Wikidata line).

**(e) The bucket's housekeeping (two short evenings).**

- **The `s/v2` purge, on or after 26 October** (any evening, before or after the upload; a minute): `rclone purge r2:cultifolio/s/v2`. It ends the way back to round seventy-seven's Worker and nothing else (O's section).
- **The prune, a day after (d)'s upload** (minutes): `node scripts\corpus-step.mjs --prune`, which is a dry run naming what it would delete (round seventy-eight's products, about 0.35 GB), then `node scripts\corpus-step.mjs --prune --go-on`. Optional: the 11 dossiers the index does not list, by O's `rclone delete --files-from-raw` lines.

**The calendar, if the zip is extracted on the evening of Friday 23 October:** (a) and (b) that evening; fill days 24 to 28 October, the last ending at the review stop (a day either way, by iNaturalist's throttle); (d) the evening of 28 or 29 October; the `s/v2` purge any evening from 26 October; the prune on 30 October or after.

**Proved before delivery** (round eighty's merge, `scripts/corpus-step.mjs` run for real on a copy made like your PC): a 24-page corpus of round seventy-seven's real pages at step 11 (steps 1 to 10 done, the fill unfinished at the allowance, your plan file of the last delivery, two pages without the iNaturalist id their backup held), the code of your last delivery, then this round's files extracted over it with the plan file left out and the nine moved files deleted. `--status` said lines 1 to 10 `done`, 11 `unfinished`; `--fill inat-restore` gave the two ids back; the daily command at an allowance of 3 went on at step 11 (no backup, no build), checked the 18 ids not yet checked and stopped at the allowance (exit 3); the next run finished the fill (2 batched searches for 15 sets), ran `--index` and stopped at step 13's review (exit 2); A's listings, `--prune-followed` and `--index` ran at the stop; `--go-on`, with the upload's commands stubbed, ran the upload and the live check, and every step was done. The same copy given this round's plan file too carried on at step 11 (V's fix); the code of your last delivery given this round's plan file started again at step 1, which is why the zip leaves the plan file out.

### Round eighty: round seventy-nine's build path, reviewed before the build (agent X)

Six faults in round seventy-nine's build path were found before the build started (four below, two more in the species list after them), each put right in a commit of its own (round eighty, X). Take them before you start the plan: with round seventy-nine's code the build would stop in its first hour, or build a reference that is not the one the walk describes. Nothing else in the walk changes; the plan file carries the two changed lines, so type the same command.

1. **Memory.** The download's sample of records (up to 2,000 a key) held each record as 241 bytes. At the list's size that is about 34 million records kept (726 a key, from GBIF's counts for a random 500 of the list's keys), about 8 GB, and the build's limit is 8 GB: it would have stopped with "JavaScript heap out of memory" while reading the download. A record is now 80 bytes (about 2.5 GB in all), and the build gives the same pages. See "The build that ran out of memory" below for what the builder holds now.
2. **The other GBIF keys.** The plan's `--list-extra-keys` read only the 8,945 pages on disk. It now reads the species list too (`dossier --list-extra-keys scripts/species-list.txt …`): 1,348 keys on 1,206 pages, where it gave 338 on 311, and none of them a key GBIF files under another of the list's species (21 of the 338 were, so those records would have been on two pages). Their records are not in the download (it was asked before they were known), so the build asks GBIF for them, up to 900 records a key: about 4,000 more requests, 20 minutes more of the build.
3. **Round seventy-eight's pages are built again.** The build keeps a page on disk whose climate is settled, which is every one of round seventy-eight's 8,945: they would have stayed as they are, with September's records and none of this round's rules (the botanic gardens' rule, the other keys, the merges). The plan's build now has `--renew`: a page built before the day GBIF made the download is built again, and one built since is kept, so after a stop the same command still goes on where it stopped.
4. **The download's day.** Every page states the day its records are of. The build read it from the download's key, and "0036848-260928105237408" was made on 2026-10-20, not on 2026-09-28. `bulk-fetch.ts` now keeps GBIF's own day when it fetches, and for a download fetched before (with round seventy-nine's code) the build asks GBIF once.

**The build that ran out of memory** (your run of 21 October, the Darwin Core Archive route: "JavaScript heap out of memory" in step 3, while reading `multimedia.txt`, before any species was built). A text field the build keeps, cut from a line of a file, kept the whole 64 KB piece of the file it was read in alive: the photographs' index (30 a species) kept the whole of `multimedia.txt`'s text, and each of Kew's indexes its own copy of Kew's names file. Each now keeps its own copy of what it keeps, and a build that skips iNaturalist no longer reads Kew's names below species. Measured here on the loading phase, Kew's real files and GBIF's records made up at your download's counts (45,648 species, 34.85 million records kept, about 44 million photograph rows): before, about 4.1 GB of heap before the records were read and the whole of `multimedia.txt` after; now about 2.8 GB of heap, plus about 2.6 GB for the records themselves, which is memory outside the heap's limit. The corpus step now sizes the builder's heap from your PC: the larger of 8,192 MB and 70% of its memory (at most 32,768), said on the step's first line (`the builder's heap: … MB`). To set another, type `set CULTIFOLIO_HEAP_MB=12000` in the same cmd window first. **What to do:** take round eighty's newest commits and type the same command again, `node scripts/corpus-step.mjs --plan scripts/corpus-plan-full.txt`; it goes straight to the build (the backup and the extra keys are done and kept), reads the download again (about an hour on your PC) and builds. Nothing was written by the run that stopped.

**Two more, in the species list itself** (agent R's findings, put right the same way: a rule in the code, a test, the committed list rewritten by the rule):

5. **Eleven plants were on the list twice.** A page of the reference that matches no species Kew accepts by its own name (listed by its GBIF key, "-" for plant_name_id), whose range the build reads through a Kew entry (Kew's spelling of its name, Kew's synonym of it, or an older name GBIF gives it that Kew accepts), and a line without a GBIF key for that same entry, which the build would have made a second page of. They are Ceropegia ananthapuramensis, hadramautica, linophylla and marnierana, Conophytum tomasii, Cyphostemma degraerii, Dorstenia poinsettifolia, Handroanthus impetiginosum, Harpephyllum caffrum, Monsonia lheritieri and Tylecodon cacaliodes: each keeps its page, and the second line is left out (`heldThroughRange`, which `select-species.ts` and the build both apply). Bisnaga hamatacantha and Ceropegia macrocarpa are not such pairs by Kew's file (it holds no row of the first name, and the second only by another author), so they stay as they are.
6. **Twenty GBIF keys were homonyms.** The list took the one accepted usage of a name's words whatever its author; for 20 lines Kew's file reads that usage, by GBIF's author, as another species' name (Gymnosporia acuminata: GBIF's is "(L.fil.) Szyszyl.", which Kew files under Maytenus acuminata). Now such a key is not taken: 19 of those species have no GBIF key, are built from Kew's file and say GBIF's records "not checked"; Prunus glandulosa Thunb. takes GBIF's usage of Kew's own author (3022160), whose records the build asks GBIF for.

So the list is **48,357 species, 46,022 with a GBIF key and 2,335 without** (1,415 of those read GBIF's records under the 1,956 keys of Kew's synonymy, as before; the other 920 say not checked). Your download need not change: it holds every key the list gives but Prunus glandulosa's new one, and a few keys no page reads now cost nothing.

**What the build's first lines now say**, besides those of the walk above: `the day GBIF made the download, asked of GBIF: 0036848-260928105237408 2026-10-20 (kept in bulk/download.json)` (only when it was fetched with round seventy-nine's code), then `--renew: every page built before 2026-10-20, the day GBIF made the download, is built again; a page built since is kept`, and at the end `48… built, 0 kept` (after a stop, the pages built before it are "kept (clean)"). The extra keys' step says `scripts/species-list.txt: 48368 species; <about 37,100> pages by their GBIF key not on disk yet, read with the <about 8,945> on disk; …` and about 1,350 keys; ignore its "run --keys rebuild-extra.txt" sentence, which the plan's build does.

**One merge waits for round eighty.** `--prune-followed` deletes each merged page whose kept page now reads its key, but Echeveria peacockii into Dudleya pulverulenta (7530398 into 2985894): Kew writes its author "Croucher ex T.Moore & Mast.", GBIF "Croucher", and the rule reads no GBIF key for it. Its line ends `not yet, the kept page not rebuilt with it (--keys rebuild-extra.txt): Echeveria peacockii [7530398] into 2985894`; leave it, and go on. Its page stays as it is live now, and the index holds one page more than the merges would leave.

**Disk, if you need it.** Once `bulk\inat-wild.jsonl` is written, nothing reads `bulk\inat-open` again (the wild pass and the cultivated fill read the `.jsonl`), so its 34 GB may be deleted before the build rather than after the fill.
### Round eighty: the most-voted wild photographs

**What changes, and why.** iNaturalist's open data holds no votes, so where a taxon has more than 24 qualifying observations (research grade, with a CC0, CC BY or CC BY-SA photograph, of the taxon or one below it), round seventy-nine's wild pass gives a page the 24 whose photographs iNaturalist received last, where the API gave the 24 it puts first by votes. Now the cultivated fill, the plan's `--fill inat --bulk bulk` of walk step 7, also asks the API that one request, once, for each such page, under the same 9,000 a UTC day, and writes its answer as the page's wild set. Everything else of the wild rule stays: research grade, the taxon or below, the three licences, at most 24 observations, the author's credit as iNaturalist writes it, and a photograph's page is its observation's by uuid, now by either route. A page whose taxon has 24 or fewer is never asked: the open data's set is then the whole set, the same set the API gives. A page whose wild set the API already answered is never asked again: its record says so (`from iNaturalist's API: … the observations iNaturalist puts first by votes, 24 of them (the open data of 2026-09-27 holds N, and no votes)`). No better rule exists from the open data alone: its columns (listed in the iNaturalist part above) hold nothing that says which photographs people chose, only dates, places, sizes and licences, so any other order would be a guess.

**How many, and the days it adds.** Of the list's 48,368 species, about 19,600 have more than 24 such observations (iNaturalist's own species counts with the wild request's filters, 2026-10-21: 19,218 found by the list's names, and on today's corpus matching by name finds 98% of the pages its iNaturalist ids find; `scripts/dev/scale/r80v-count-over-24.py`, `scripts/dev/scale/results/r80v/count-over-24.json`). So about 19,600 more requests: the fill goes from about 49,000 to 54,000 requests to about 68,600 to 73,600, from about six days to about eight, at about three hours a day. Until its turn a page shows the open data's 24 newest.

**Its place in the plan.** No new step and no new command: it is the plan's `dossier --fill inat --bulk bulk`, which you run daily anyway. If this round's code reaches your PC while that step is part way through, update the code and type the same command the next day: `scripts/corpus-plan-full.txt` changed only in a comment, and the corpus step now keeps a run's place when only a plan's comments change (before, any change to the plan's text started it again from its backup). The step needs `bulk\inat-wild.jsonl`, which says how many observations each taxon has, so keep it until the fill has finished; without it the fill asks for no most-voted set and says nothing of them.

**What good output looks like.** The fill's count line now reads, on the first day after this round's code arrives:

```
48360 dossiers on disk; N without iNaturalist's photographs (M of them for their 24 most-voted wild observations: the open data of 2026-09-27 holds more than 24 of their taxon); at most 9000 requests to iNaturalist today, …
```

M is about 19,600 less the pages already asked. Each day ends at the allowance with the stop you know ("the day's allowance is spent … Run the same command again tomorrow, after midnight UTC"). The last day's run ends `… filled; … wild sets read from iNaturalist's open data, K asked of its API for the 24 most voted (the open data holds more than 24). Every dossier has been asked for its photographs.`, where K counts only that run's. A run after that says `0 without iNaturalist's photographs` and asks nothing.

**Proved on real species** (`scripts/dev/scale/r80v-most-voted-proof.ts`, results in `scripts/dev/scale/results/r80v/`, 2026-10-21, one request every 2.1 s). The real fill ran on round seventy-seven's dossiers of agent P's 50 sample species, rekeyed to version 3, their wild sets first filled from P's open-data file by `--fill inat --wild`. It asked 70 requests: 20 most-voted wild sets, exactly the 20 species of more than 24, and 50 cultivated sets; the other 30 wild sets came from the file. Run again, it asked nothing. Then the API was asked the same 20 requests directly, and the builder's own reading of its answers gave the same photographs, field by field (address, size, licence, author, page, date, place), for all 20. On those 20 pages the open data's newest had 993 photographs, and the most voted have 1,038; 211 of the API's 480 observations were among the open data's 24 newest. Two things to know: only 78 of the 480 had any vote, so most of the API's 24 are observations of no votes in the API's own order; and that order moves from day to day (against agent P's answers of 2026-10-20, 3 of 20 sets came back in the same order and 460 of the 480 observations were the same), so a page shows the API's choice of the day it was asked.

### Round eighty: operations (agent O)

Six changes, none of which the fill runs, and the bucket's housekeeping. Each says whether it can reach your PC in the middle of the fill.

**1. The build no longer copies the corpus.** The app's own files (the icons, the two world maps, the link-preview image, `manifest.webmanifest` and `.assetsignore`) moved from `static\` to `static\app\`, and `svelte.config.js` names that folder as the app's files. The corpus stays where every script writes it, `static\s\v3\`, beside it and outside it. Until now every `npm run build` (each deploy, and the browser suite's server before each run) copied all of `static\`, the corpus's 4.5 GB and 145,812 files with it, twice: into `.svelte-kit\output\client\` and again into `.svelte-kit\cloudflare\`, for files `.assetsignore` then kept out of the deploy. `npm run dev` serves `static\s\` at `/s/` itself (`vite.config.ts`), as before. Nothing to type. The first build after this round's code arrives still has to clear the last build's two copies (about 9 GB), once; every build after it writes about 630 files and 10 MB. Safe to deliver mid-fill, but pull it between two days' runs, never while `corpus-step` runs (below), as every delivery.

**2. The sitemap index turns over within five minutes of an upload.** It was kept a day at the edge under an address that names no corpus, and after the first full upload one Cloudflare site served round seventy-eight's one-file index for most of a day (review C 2). Now `/sitemap.xml` is kept five minutes, and names its files `/sitemap-<corpus id>-1.xml`, `-2.xml`, which are new addresses with every corpus and are kept a day. The old names `/sitemap-1.xml` still answer, with the current corpus, kept five minutes. `robots.txt` and Search Console keep `/sitemap.xml`; nothing to change there. The live check reads the index's first file, whichever its name. Deploy only; safe mid-fill.

**3. Cloudflare's error reports (review C 5).** Cloudflare adds two headers to every answer, the collection's pages included: `Report-To` and `NEL`, its Network Error Logging. A Chromium browser then reports to `a.nel.cloudflare.com`, from the visitor's address and for a week, any request to the site that fails. The code cannot remove them (they are added after the Worker answers). `/about/how` now says so. To turn them off, if you want the site to send nothing of the kind: in Cloudflare's dashboard, the Network Error Logging toggle (Cloudflare's page says it is under Network; https://developers.cloudflare.com/support/network/understanding-network-error-logging/), or by the API, `PATCH /zones/<zone id>/settings/nel` with `{"value":{"enabled":false}}`. `npm run live-check` then says "no NEL header: network error logging is off for the site"; tell the developer, and the sentence on `/about/how` is taken out in the next round.

**4. Delivering this round's code to the PC while the fill runs (review C 1).** Agent V's fix in `scripts\corpus-step.mjs` keeps the plan's place when only the plan's comments change. A run reads the plan once, as it starts, and compares it with the record using the code on disk at that moment, so a changed plan must never arrive before the code that reads it. This round's delivery is a zip of the changed files without `scripts\corpus-plan-full.txt` (round eighty's merge), so the plan your run started with stays, and the question does not arise: "Round eighty: the owner's walk" (a) gives the steps, `--status` among them. Review C's simulation (`C-s/sim`), run again here against both versions of the code, and the merge's simulation of the zip on a copy made like your PC both show it.

**5. A repair plan between fill days no longer starts the full plan again.** One `corpus-step.json` holds one plan's run, and until this round running another plan (`--plan scripts\corpus-plan-r80-repair.txt`, say) put the full plan's record aside under a dated name, so the full plan run next started again at its backup and its build with `--renew`. Now an unfinished run of another plan is kept as `corpus-step.plan-corpus-plan-full.json` ("the unfinished run of scripts/corpus-plan-full.txt is kept in …") and taken up again where it stopped the next time that plan runs ("carrying on with the run of … that was kept in …"). A plan typed with backslashes is the same plan. This needs this round's code on the PC (item 4) before any repair plan runs; with the code before, run a repair only after the full plan's last step.

**6. GBIF's SQL request for later refreshes.** `npm run bulk -- gbif-sql …` now asks for the keys as GBIF's data analyst advised on 2026-10-21, `EXISTS(occurrence.gbif_classification.taxonkeys, taxonkey -> taxonkey IN (…))`, in place of `ARRAYS_OVERLAP(…)`, whose download ran 23 hours and was cancelled. The same records. GBIF's validation accepted it for the whole list on 2026-10-22 (`scripts\dev\scale\results\r80o-gbif-validate.txt`); a validation is not a run. Nothing to do now: this round's build already has its download.

**7. The sync server (review C 6).** Without the counter object (a deployment with no `COUNTERS` binding) two removals of one photograph at once could both take its bytes off the vault's running total. Not the live site's path, which has the object; deploy only.

**The bucket's housekeeping.**

- **What the prune clears.** `node scripts\corpus-step.mjs --prune` deletes from `s/v3/p/` only, and only files that none of three manifests names (the live one, and this folder's `manifest.json` and `manifest.prev.json`, with the search key files their search directories name) and that were uploaded more than a day ago. It never touches a dossier (`s/v3/<id>.json`), a genus record, `s/v2/` or a vault. It runs before the plan is read, so it does not disturb the plan's record.
- **When to run it.** After the plan's last step, the live check after the fill's upload, and a day after that upload. Run before, it clears little: while the fill runs, this folder's previous manifest is round seventy-eight's, so round seventy-eight's products (about 0.35 GB, measured on round seventy-seven's corpus of the same size: 13,915 product files, 0.354 GB) are still named and kept. Run after, it deletes them; the first full upload's products that the fill's index replaced are still named by this folder's previous manifest then, and go at the prune after the next refresh. The dry run says what it would delete; then `--prune --go-on`.
- **The 11 dossiers in the bucket that the index does not list** (the upload's `bucket-unlisted.txt`) are round seventy-eight's pages that are not pages of this build: merged into another page, followed to another name, or given another id (by GBIF key, 7 of round seventy-seven's 8,947 are in no live page, among them the two merges). The site answers each with a 404 whatever the bucket holds, and no prune deletes them. They take about 0.4 MB. To remove them, after the plan's last step: in PowerShell, `Get-Content bucket-unlisted.txt | ForEach-Object { "$_.json" } | Set-Content unlisted-files.txt`, then `rclone delete r2:cultifolio/s/v3 --files-from-raw unlisted-files.txt --dry-run` (it names each), then the same without `--dry-run`. Keeping them costs nothing that matters.
- **The purge of `s/v2/`, on or after 26 October:** `rclone purge r2:cultifolio/s/v2`, before or after the fill's upload. This round's Worker reads `s/v2/manifest.json` only to refuse when there is no `s/v3/` corpus; the purge ends the way back to round seventy-seven's Worker and nothing else.
- **R2's storage against the free 10 GB-month**, from the files' sizes: `s/v2/` 0.65 GB (round seventy-seven's corpus, 24,187 files, measured here); round seventy-eight's products in `s/v3/p/` about 0.35 GB; the full corpus 4.4 GB (agent Z's build to the list's size: 48,368 dossiers 1.9 GB, products 2.5 GB, index 37 MB; the live `index.json` is 37.4 MB); the fill's upload rewrites the dossiers in place (each larger by its cultivated photographs' credits) and adds the products that photographs change (entries, sheets, cards, rows, catalogues, the index: about 0.25 GB at Z's sizes; the search's key files do not change with photographs). About 5.7 GB in all before the prune and the purge, and about 4.7 GB after both, plus the vaults and the dossiers' growth. The fill's upload is about 50,000 writes (each changed dossier and product once), inside the free million a month.

**Measured here** (two shared cores, the corpus on disk made to the PC's size from round seventy-seven's real files, 145,122 files, hard links so no disk was spent): the browser suite's server (`npm run build`, the state reset and `wrangler dev`, timed to the front page's answer) started in 28.6 s with this round's code; with the code before, on half that corpus (72,561 files, 2 GB) it took 82.6 s and 77.0 s, and on none 23.6 s for the build alone, so about 18 s for each 24,000 files here, about 140 s at the PC's size before this round, on a fast Linux disk; the PC's Windows disk, with its virus scan, took minutes. The build's output is now 629 files (2.9 MB in `.svelte-kit\cloudflare`) whatever the corpus on disk.
### Round eighty: iNaturalist

This section's figures (4,000 a day, one request every 2 s, about five more fill days) replace those of the section above (9,000 a day, about eight days); its rule for which 24 wild observations a page shows stands.

**What changes, and why.** The fill of walk step 7 (`dossier --fill inat --bulk bulk`) was throttled on its first day: 5,273 requests at 1.1 s apart, then 429 on every call; later that day, at 1.5 s, again after about 350 pages. iNaturalist's practices (https://www.inaturalist.org/pages/api+recommended+practices) ask for "about 1 per second, and around 10k API requests a day", the highest `per_page`, and "a concatenated list of multiple IDs" in one request; the tolerance it showed your address was nearer 5,500 a day. Each page cost one observation search of the API's version 1, which returns every identification, taxon and user in full (313 KB for two observations). Now:

- **Several taxa a search.** The cultivated sets are asked up to 50 taxa a request, the most-voted wild sets 6 taxa of like size a request (by the open data's counts), 200 observations each, of the API's version 2 with only the fields the builder reads (3.5 KB for the same two observations). A page's set is its first 12 (or 24) observations of the answer, which is its own search's set; where the answer cannot say, the taxa not settled are asked again. A page found only in the fill (a taxon by name) is asked alone, of version 2 too.
- **One request every 2 s, at most 4,000 a UTC day.** About three hours a day.
- **A 429 is a throttle, said as one.** It is retried once, after a minute, then the fill waits 30 minutes, then 60, then 120, and goes on each time; only if iNaturalist still throttles after three and a half hours does the day's run stop (exit 3), saying "this is iNaturalist's throttle, not the day's allowance" with the day's count. The allowance's stop says "The day's allowance is spent … not a throttle".
- **Every id is checked before a set is asked of it.** The full build left iNaturalist to the fill and kept each Wikidata item's id unchecked, and the open data's pass read Iris germanica's inactive 57097 as "nothing to report". The fill now checks first, thirty ids a request, every id no build or fill has checked, and follows an inactive one to its current taxon by the build's rule (`--fill inat-ids`'s); the page's sets are then asked again. `--fill inat --wild` no longer writes "none" for an id not yet checked.
- **The sets read again.** A wild set the API gave before the open data (round seventy-eight's builds; 48 of 68 sampled old pages) is read as the rule now reads it: from the open data, at no request, where its set is the whole set, else the 24 most voted. A set with a CC0 photograph whose credit names no one is read again: a CC0 photograph's credit now names its observer ("Alan Weakley, no rights reserved (CC0)"). A page whose names Kew's file says can take in another species' observations is read with Kew's filter in the same pass, and marked, so the step after does not ask its taxon's children (a request a page, about one page in five).
- **The builder.** A build that skips iNaturalist keeps the id the page had, with its rows, and each iNaturalist row says why it was not asked.

**Delivering it.** Safe between any two fill days: the plan file is unchanged, the dossiers keep their form, and the fill goes on from where it stopped. Nothing to type for the change itself. The first day after delivery begins with the ids' check (about 1,400 requests for about 40,000 ids, under the day's 4,000) and then goes on with the pages.

**The one repair to type: the 475 pages that lost their id.** The fill asks a page without an id by its accepted name alone, so it does not find an id the build before had found by an older name. On an evening after a day's fill has ended and before the next (not while one runs), in the project folder:

```
findstr backupDir corpus-step.json
npm run dossier -- --fill inat-restore backups\v3-<the id that line names>
```

Offline, under a minute; nothing is asked of anyone. Good output: `N pages without an iNaturalist id had one in backups\v3-…: M given back (not yet checked: the next --fill inat checks each with iNaturalist, then asks its photographs), …` with M about 475 less those the fill has found since, and `inat-restored.txt` listing each page (and any not given back, with why: another page holds the id, or the fill's rule refused it). The next day's plan step checks and fills them; they reach the site with the plan's own last `--index` and upload. Run it once; a second run gives back nothing.

**What good output looks like.** The first lines of the day's fill:

```
48360 dossiers on disk; N without iNaturalist's photographs (… of them for their 24 most-voted wild observations: …) (… whose wild set the API gave before the open data, read again; … with a CC0 photograph whose credit names no one, read again; … without an iNaturalist taxon, asked by name; … read again against Kew's file of 2026-06-04, …); at most 4000 requests to iNaturalist today, 0 already made, one every 2 s, the observation searches several taxa a request; …
  first, the … iNaturalist ids no build or fill has checked, checked with iNaturalist (thirty a request), …
  … ids checked: … inactive ids followed to their current taxon (or taxa given back), …
```

then the progress line, and at the allowance `The day's allowance is spent (… today's allowance of 4000 requests is spent …): 4000 of the day's 4000 requests made (UTC …); not a throttle. … filled; … still to do; run this again tomorrow (UTC), and it goes on from here.` The last day's run ends `… filled; … wild sets read from iNaturalist's open data, … asked of its API for the 24 most voted …; … batched searches answered … sets, … asked alone. Every dossier has been asked for its photographs.`, then the descendants line, which should say nearly every page was read before.

**If iNaturalist throttles anyway.** Lines `iNaturalist is throttling this address (…): waiting 30 minutes, then going on` are the fill waiting; leave it. If a day stops on the throttle, run the plan the next day as usual. If it throttles on several days before 4,000, set a lower day before the plan's command, without touching the plan file (a changed step line starts the plan again): in cmd `set CULTIFOLIO_INAT_BUDGET=3000`, in PowerShell `$env:CULTIFOLIO_INAT_BUDGET=3000`.

**How many days.** About 16,000 requests are left after this round's code arrives (about 5,176 of 48,361 pages done), so about five fill days at 4,000 (the last one short). The code before, one search a page, had about 63,000 to 68,000 left: seven or eight days at 9,000 had iNaturalist allowed them, about twelve at the 5,500 it did:

| What | Pages | Requests |
|---|---|---|
| ids not yet checked, thirty a request, and the follows | about 40,000 | about 1,700 |
| a taxon by name, for a page without one (13% to 19% of pages) | 5,600 to 8,200 | 6,200 to 9,000 |
| cultivated sets, several taxa a search (0.085 a page measured), with the CC0 and Kew re-reads | about 39,000 | about 3,300 |
| the 24 most voted (agent V's pass, and the sets the API gave before the open data), 6 taxa a search | about 19,600 | about 3,500 |
| taxa newer than the export; children for the few pages not read with Kew's filter | | about 400 |

**Proved here** (`scripts/dev/scale/results/r80i/`, 2026-10-22, the real fill with one request every 2.05 s to iNaturalist and 1.05 s elsewhere):

- 300 random pages of round seventy-seven's corpus, rekeyed: 74 requests to iNaturalist where the code before asked about 300, one search a page and the same names (9 checks of 247 ids, 42 name searches and children, 23 observation searches for 269 cultivated sets), in 3 minutes 12 s; every page asked, 105 with cultivated photographs, every CC0 credit naming its observer. 40 of those pages asked again by their own search: 34 the same photographs; the other 6 differ only among observations with no votes, whose order iNaturalist changes from request to request.
- agent V's 50 pages with agent P's open data: 10 requests (2 checks; 8 searches for 20 most-voted and 50 cultivated sets) where V's run made 70. Every one of the 78 voted observations of V's answers of the day before is in the sets; 457 of their 480 observations, where two of the API's own answers a day apart shared 460.
### Round eighty: the reference's data (agent A)

**What changes.** Ten faults the reviewers found in the reference's data, each put right by a rule in the code with its test: a GBIF key filed in another order than Kew's genus is not a list line's key (Xanthoceras sorbifolium, whose 9479204 is a Poaceae oddity, is now built from Kew's file); a name Kew holds twice by one author links and cites the accepted entry (Crocus nudiflorus); records are tested against the regions' shapes (Natural Earth, public domain; 243 of the 369 regions, the rest by their boxes, as before), so Nairobi is no longer in Tanzania's range; daily extremes corrected by more than 1,000 m, or with a record low warmer than any month's mean night, are not used (the tomato's 18.9 °C); a plant whose species page has no GBIF key is told what that page read; a list page reads the range of its own Kew entry (seven pages had none); a page with a Kew id is matched on Wikidata by its identifiers, never its label, and links Kew's IPNI and POWO whatever Wikidata answers (Datura innoxia); a common name that is the species' own name or an older name, even a letter off, is not shown; a dataset's default point (a coordinate where the records of 20 species or more lie, nearly all undated) is left off the map, the marker and the climate; the owner's merges of the duplicate pages apply (Ceropegia cereiformis and C. nubica into Echidnopsis cereiformis, Echeveria peacockii into Dudleya pulverulenta); a Wikidata batch that does not answer is asked again in halves.

**Safe to take mid-fill.** Nothing here changes `scripts/corpus-plan-full.txt`, and the fill (`--fill inat`) and the plan's `--index` run none of the changed rules but these, which they read only as they read every page: `--index` shows the new common-name rule and the merges' page ids, and the Worker deployed with this round's code mends two things as it reads a page, with no rebuild (the extremes beyond the lapse rule are set aside, and the species page reads the common-name rule). `scripts/species-list.txt` (Xanthoceras's key), `scripts/merged-pages.txt` and the new `scripts/default-points.txt`, `scripts/tdwg3-shapes.json` and `scripts/r80-repair-keys.txt` are read by builds only, and the fill builds nothing. Take it any day; the repair below waits for the fill.

**The repair of the live pages** (at the full plan's review stop after the cultivated fill and its `--index`, step 13, as "Round eighty: the owner's walk" (d) says; or, if the full plan has already finished, `node scripts/corpus-step.mjs --plan scripts/corpus-plan-r80-repair.txt`, which runs the same lines and then the index, a review stop, the upload and the live check). While the full plan is unfinished, type the lines by hand rather than run that plan file: this round's corpus step would keep the full plan's run aside and take it up again after (agent O), but the repair plan's own upload would go up first and the full plan's again after it. Type, in the project folder:

```
npm run dossier -- --list-default-points
npm run dossier -- --list-range-shapes
npm run dossier -- --list-wikidata-retry
npm run dossier -- --keys scripts/r80-repair-keys.txt --grid climate --bulk bulk --skip inat
npm run dossier -- --keys rebuild-wd-retry.txt --grid climate --bulk bulk --skip inat
npm run dossier -- --keys rebuild-shapes.txt --offline --grid climate --bulk bulk
npm run dossier -- --prune-followed
```

then `npm run dossier -- --index` and `node scripts/corpus-step.mjs --plan scripts/corpus-plan-full.txt --go-on`: the full plan's upload and live check take the filled and the repaired pages to the site together. Skip a `--keys` line whose file the listing before it did not write (it says "0 pages").

- The three listings read the dossiers on disk and ask nothing: a minute or two each at 48,000 pages. `--list-default-points` writes `scripts/default-points.txt` (a point once listed stays listed) and says how many pages hold one; `--list-range-shapes` writes `rebuild-shapes.txt`, every page with an open in-range record outside every native region's shape or at a default point (round seventy-seven's corpus: 2,300 of 8,947 pages, so expect about 12,000); `--list-wikidata-retry` writes `rebuild-wd-retry.txt`, the pages Wikidata did not answer (the full build's 22) and the pages with a Kew id whose item a label refused.
- The first `--keys` line rebuilds 13 pages online (`scripts/r80-repair-keys.txt` names each and why): GBIF's species records, Wikidata, Wikipedia and Commons are asked, iNaturalist's photographs are carried. About 2 s a page, plus reading the download first (about ten minutes for the SQL download, an hour for the Darwin Core Archive), plus about 17 minutes for the index each build writes at its end. The second does the same for `rebuild-wd-retry.txt`.
- The `--offline` line re-derives the records, the marker and the climate of `rebuild-shapes.txt`'s pages from the download and the climate grid, asking nothing but NASA POWER for a cell not yet cached: about 0.4 s a page (round seventy-seven's offline re-derivation), so about 80 minutes, plus the download and the index. A page that loses records outside its range is what this is for; drops.txt lists a page that lost photographs, an identifier or its range, which this should not do: paste it back if it does.
- `--prune-followed` should say `3 dossiers of pages merged into another deleted (9574874, 9592399, 7530398)`; the index then holds three species fewer, which the corpus step expects.

**What good output looks like.** The first `--keys` run: `13 built`, among them `Xanthoceras sorbifolium` built from Kew's file ("1 species without a GBIF key read from Kew's file"), and for Echidnopsis cereiformis records of GBIF's keys 9574874 and 9592399, "the key of a page merged here by the owner's decision". After the `--index`: Crocus nudiflorus's page is `k327378` and Crocus mazziaricus's `k327347`; `/species/ceropegia-cereiformis`, `/species/ceropegia-nubica` and `/species/echeveria-peacockii` lead to the kept pages; Dracaena trifasciata's marker is no longer at Nairobi; the tomato's page has no cold floor and says why.
### Round eighty: search and the catalogue (agent S)

**What changes, and why.** Four things a grower meets in the catalogue's search, and the "Most grown" chip.

- **Kew's older names.** The index now carries, for each page, Kew's older names for the plant that GBIF's do not give (`kew` in the entry; 71,424 names on 10,673 pages at the full list's size, counted from Kew's file of 2026-06-04 over the live index). The search reads them as a name typed, the genus in full first: "Echinocactus chrysacanthus" finds Ferocactus chrysacanthus, "Aloe amoena" Aloe framesii, "Lavandula officinalis" Lavandula angustifolia, each after any species whose own name it is. They are kept in small files of their own, one per genus (`@<genus>` in the search's directories), and not in the word files, which they would have grown from 1,830 MB to 2,574 MB: with them the key files are 1,839 MB, 6,610 files more of 8 MB in all, the largest 51 KB. Nothing a page shows changes, nor any address, nor the photograph rules.
- **The count.** An answer says how many species match (`X-Search-Total`), and the front page says "30 of 259 matches" where it said "60 matches"; "Show more" brings sixty more at a time, and a genus typed alone links to its row of the catalogue. A word matched by more than 2,000 species keeps the reference's best hundred, as before, and the page says so.
- **Regions.** A region of origin typed whole whose every word is that common ("Cape Provinces") is answered from the build's own best hundred, with its count (34 such names at the full size); a query that names a region, even misspelt ("provinses"), says which broad region of the Origin grouping it is part of, linked.
- **Speed.** A search now reads its directories, the tables and the photograph blocks at once, beside the address's allowance, where it read them one after another, and the front page asks for 30 hits, not 60. Each hit shown is one more read of the bucket, and a Worker waits on at most six at once.
- **Most grown.** `scripts/most-grown-genera.txt` is counted again over the full list's 6,539 genera (6,449 counted, 90 refused, 2026-10-22, 227 requests to iNaturalist from the review workspace): the chip now holds 118 genera and 8,278 species, Quercus, Pinus and Phalaenopsis among them, where it held 95 genera and 6,853 species of the old 1,321.

**When it can be delivered.** Any time, the fill included: it is an app deploy (`npm run deploy`, as every round). `scripts/build-dossiers.ts` changes only in what `--index` writes into each index entry; the fill, the plan and `corpus-step.json` are not touched, and `scripts/corpus-plan-full.txt` is not changed. The Worker of this round reads today's live corpus as it was built: there are no Kew files in it yet, so a Kew name finds nothing until the next index, "Cape Provinces" still says "too many" (now with its region's link), and a word too common to list shows its first hundred, saying that more match. The new files arrive with the plan's own `--index` (step 12) and its upload; nothing extra is run, and no live page needs a repair.

**After the deploy, a check** (four requests):

```
curl -sI "https://cultifolio.com/api/search?q=echeveria&n=30" | findstr /i "x-search-total"
curl -s "https://cultifolio.com/?by=genus&chip=grown&from=Q" | findstr /c:"Quercus"
```

The first prints `x-search-total: 259` (or near it); the second finds the Quercus row under "Most grown". After the plan's `--index` and upload:

```
curl -s "https://cultifolio.com/api/search?q=Echinocactus%20chrysacanthus&shape=2"
curl -s "https://cultifolio.com/api/search?q=cape%20provinces&shape=2&n=3"
```

The first answers Ferocactus chrysacanthus; the second three species with `"total":` about 4,800 and a `regions` entry for Cape Provinces. The `--index` line `… search key files (N MB) …` should say about 1,840 MB at the full size.

**Running the count again** (only when the list's genera change; about ten minutes, about 230 requests at one every two seconds): `npx tsx scripts/most-grown-genera.ts --index static\s\v3\index.json`, then deploy. It writes the day and the genera it counted into the file, and `/about/how` names them; its test (`tests/unit/r75g-opening-rule.test.ts`) then says which sentence to change.
### Round eighty: the app's pages and the phone (agent U)

**What changes.** The app's pages only: Back from a species page to an opened catalogue row returns to the row or tile you left (it ran to the end of the list and kept loading rows); the plant page's card no longer covers its photograph strip, and its photograph fills its box on a phone; Compare, `/privacy` and `/frost` offline open the app's "No connection" page; the top bar's "‹" counts a browser Forward; notices sit at the window's foot on a desktop; the month table's row names stay put; and smaller layout and wording faults. The service worker's install now fetches only what the pages that work offline use: 146 requests where it was 170, about 550 kB compressed where it was about 900 kB (2.1 MB to 1.3 MB as files), with no share image, large icons, maps or WOFF fallbacks (each is kept the first time a page asks for it). The 12 pages it fetches from the Worker are unchanged.

**What you run.** Nothing of its own: it reaches the site with the next `npm run deploy` (section 3). It changes no dossier, no corpus file and nothing the plan's steps run (`scripts/build-dossiers.ts`, `src/lib/dossier/`, `scripts/corpus-step.mjs` and the plan files are untouched), so it can be delivered between two fill days, or mid-step, and the fill carries on where it stopped.

**What good looks like.** The build prints `offline-files: the service worker caches N build files at install` (138 on this round's code). If it prints `offline-files: no client manifest or no server build to hand the list to; the service worker caches the whole build` instead, the site still works offline, and each new device fetches the whole build again, as before this round: say so in the next round's notes. After the deploy, a device's next page loads the new worker; nothing is asked of you.
### Round eighty: common names from Wikidata

**Your decision.** The 2,327 pages without a GBIF key had no common name: GBIF's vernacular names are read by the page's GBIF key, and they have none. They now take English names from their own Wikidata item, the one round seventy-nine's route took by Kew's IPNI or POWO identifier: its "taxon common name" statements (P1843) in English. `en` and every regional English (`en-gb`, `en-us`, `en-ca` and the others) are read as English; no other language is read. Refused, and listed with why in each page's record: a statement Wikidata ranks deprecated, a name with a letter outside the Latin script, the scientific name or one of Kew's names for it, a genus named on its own, and a scientific name the reference holds as another species. The rest go through the same common-name rule as GBIF's names (comma lists, pooled spellings, no generic noun as the headline, another genus set back). The headline is the name more references give (each reference naming a source outside Wikimedia counted once, Wikidata itself as one; "imported from English Wikipedia" or Wikispecies counts nothing), then a statement ranked preferred, then the alphabet. The page says under the name "English names from Wikidata, item Q…, read <day> (CC0)", and "not checked", with why, where Wikidata did not answer or no one item was taken.

**What it gives (measured 2026-10-21 on all 2,327, live).** 1,868 have one item; 250 of those items hold English names; 249 pages take at least one (Artocarpus mariannensis's only name, "artocarpus", is refused as a genus) and 243 show one; the other 6 take only ARKive's "Cactus", which is searched but never shown. 1,619 items hold no English name the rule takes, and 459 pages have no item (447 none, 12 two items), each saying why. Examples: Allium porrum "Garden leek", Blechnum spicant "Deer fern; Hard fern", Hesperocyparis macrocarpa "Monterey cypress", Sanguisorba minor "Small burnet; Salad burnet", Monotropa hypopitys "Yellow Bird's-nest; Pinesap", Cylindropuntia bigelovii "Teddy bear cholla", Picea albertiana "Interior spruce; Western white spruce". Most names come from the USDA PLANTS database through Wikidata (163 of 332 statements), then the IUCN Red List (27), ARKive (15) and iNaturalist (11); 27 have no reference, and 19 only "imported from" Wikispecies or English Wikipedia.

**When it runs.** During this round's fill, typed alone between two fill days after the deploy, as "Round eighty: the owner's walk" (b) 2 says (`npm run dossier -- --fill wikidata-names`), and not as the plan below, whose upload would go up in the middle of the fill; the plan is for a corpus whose full plan has finished. In either case after round seventy-nine's build and its upload, once round eighty's code is on the PC and **its Worker is live** (round seventy-nine's Worker would show the names but say on `/about/how` that every common name is GBIF's). The fill is small: it reads every dossier once, asks Wikidata's query service two hundred items a query (about 10 queries, about 15 seconds; 12.8 s here), paced with Wikimedia's other sites, and writes each page without a GBIF key; then the index, 10 to 30 minutes at 48,368 pages.

```
node scripts/predeploy.mjs --tier=app
node scripts/corpus-ready.mjs && npm run deploy
node scripts/corpus-step.mjs --plan scripts/corpus-plan-r80-names.txt
```

The plan is a backup, `npm run dossier -- --fill wikidata-names`, a review stop, the upload of what changed (about 2,327 dossiers and the index's products that hold names, a few minutes) and the live check. Good output from the fill:

```
  48360 pages read: 2327 without a GBIF key; 1868 Wikidata items asked in 10 queries (15 s).
  249 pages given English names from Wikidata (243 of them now show one; the others only a generic noun, which is searched and not shown); 1619 whose item holds none the rule takes; 459 with no item taken, each saying why; 2327 dossiers written:
    Allium porrum [k296308]: Garden leek (Q21870138: garden leek)
    …
```

(the counts move a little as Wikidata is edited). A line "… pages not checked: Wikidata did not answer" makes the step stop with "a source did not answer": those pages are left as they were, and the same command an hour later takes them up. A second run writes nothing that has not changed. Later builds keep the names without the fill: the builder reads them from the item it already reads for such a page (no extra request).

**Offered, not done: the same for pages with a GBIF key.** Of round seventy-seven's 8,947 keyed pages, 4,861 have no English name from GBIF, and 4,771 of those have a Wikidata item; by the same rule, 105 would gain names and 69 would show one (the other 36 take only ARKive's "Cactus", not shown). 29 of those 69 would be ARKive's "Pitcher plant" for Nepenthes species, a name of the genus, and a few others are of that kind too ("Stone plant", "Cone plant", "Bottle tree", Spanish "Biznaguita" for three Mammillaria); the rest are good (Eucalyptus camaldulensis "River redgum", Larrea tridentata "Creosote bush", Clivia miniata "Bush lily", Claytonia perfoliata "Miner's lettuce"). It is behind a flag, off unless you add it: `npm run dossier -- --fill wikidata-names --keyed`, after every build or `--names` run that rewrites those pages' names (the `--names` step and an offline re-derivation keep Wikidata's rows, a fresh build does not). If you turn it on, `/about/how`'s sentence "Pages with a GBIF key take no names from Wikidata." must be replaced (the report gives the words).
### Round eighty: the not-checked pages and the institution references

**Not before round seventy-nine's corpus is uploaded.** Nothing here changes what round seventy-nine's build writes: its code does not read the new file, and this round is delivered after its upload.

**What changes.** Of the species without a GBIF key, those that read no key under the keys of Kew's synonymy (912 of 2,327 on agent R's list; 921 of 2,336 on the list as round eighty leaves it, counts below as the file was made again at the merge) said one general sentence. Each now says why, for itself, from what GBIF's backbone holds of the names Kew's file gives it (`scripts/extra-keys-kew-none.txt`, committed; `npx tsx scripts/kew-extra-keys.ts` writes it beside `scripts/extra-keys-kew.txt`, by the same rule):

- 643 "lumped": GBIF files their names under another page here, as its synonyms or a taxon below it, so those records are that page's already. The page names and links that page, and where Kew accepts it apart from this one it says GBIF lumps what Kew splits. Example: Echinocereus canus, under Echinocereus viridiflorus.
- 210 "none": the backbone holds none of Kew's names for them.
- 46 "other-type": only names Kew files under them as of another type, or as names partly another taxon's.
- 9 "other-author": the words only by another author (Xanthoceras sorbifolium among them).
- 12 left to the general reason, named in the file's header: their list lines lost their GBIF key after `scripts/extra-keys-kew.txt` was made, and the rule now gives them keys the build's download did not ask.
- 1 "other".

No page gains records by it, and GBIF's download does not grow.

**The steps, after round seventy-nine's upload and its live check.** During this round's fill, type only `npm run dossier -- --fill kew-why`, between two fill days after the deploy ("Round eighty: the owner's walk" (b) 3): on the PC's corpus it says `920 pages … read no key; 908 changed …, 12 the general reason (not in the file)`, Xanthoceras sorbifolium's reason coming with A's repair. The plan below is for a corpus whose full plan has finished; its counts are those after A's repair (921, 909, 9 other-author). The file was made again at the merge on the list as it now is (909 lines, kinds 643, 210, 46, 9, 1); the twelve pages it leaves to the general reason are named in its header.

1. Deploy this round's Worker, as section 3 says (`node scripts/predeploy.mjs --tier=app`, then `node scripts/corpus-ready.mjs && npm run deploy`). Round seventy-nine's Worker reads the new field as nothing and shows the general sentence, so either order is safe, but the link to the other page needs this Worker.
2. `node scripts/corpus-step.mjs --plan scripts/corpus-plan-r80r.txt`. It makes a backup, runs `npm run dossier -- --fill kew-why` (seconds, offline, nothing asked of any source), then `--index`, stops for a review, uploads and checks the live site. The plan's review line says what good output is: "921 pages without a GBIF key read no key; 909 changed: 643 lumped, 210 none, 46 other-type, 9 other-author, 1 other say why for themselves …, 12 the general reason (not in the file)", about 909 dossiers differing from the backup, every one a `k` page, and the index's species count unchanged. Then `node scripts/corpus-step.mjs --plan scripts/corpus-plan-r80r.txt --go-on`.
3. Good output on the site: `/species/echinocereus-canus` says under its map "Records not checked: GBIF's backbone files this species' own names (Echinocereus canus (A.M.Powell & Weedin) D.Felix & H.Bauer; Echinocereus viridiflorus var. canus A.M.Powell & Weedin) under Echinocereus viridiflorus Engelm., a species with its own page here, …", with a line linking Echinocereus viridiflorus.

**Later builds** write the same words themselves: the build reads `scripts/extra-keys-kew-none.txt` (`--kew-no-keys <file>` names another). A second run of the fill says "0 changed". If you refresh the keys from a newer backbone (`npx tsx scripts/kew-extra-keys.ts --bulk bulk --backbone bulk\backbone\simple.txt.gz`), commit both files, then run the fill again.

**The institution references: nothing to run.** No list that is CC0, CC BY or public domain holds herbaria with coordinates of their own, so `scripts/institutions.txt` is unchanged. GBIF's GRSciColl states no licence, and Index Herbariorum (NYBG) is under NYBG's site terms, which forbid reuse without consent. BGCI's GardenSearch forbids commercial use and redistribution. Round eighty's report has two letters for you to send, asking GRSciColl and Index Herbariorum for a licence. GeoNames (CC BY 4.0) was measured: it would add 258 points at zoos, 2,059 at what it calls gardens and 3,457 at universities beyond Wikidata's. None of these is a herbarium, and many are wild records, so none is used.

### Round seventy-seven's corpus step: the search from key files, and a species page's card files

**What changes, and why.** Until this round the search was the one thing that still read the whole species index (5.8 MB), on the first search a fresh copy of the Worker answered, and any unknown species address reached it too, through the 404's suggestions. At 50,000 species that first search took 97 MB of a copy's 128 MB. The build now writes the search's own files: `search/top.json`, sixty-four `search/<n>.json`, `search/genera.json`, `search/tables.json`, `search/blocks.json`, and the files they name under `p/`. For each beginning of a word there is a file of the species whose words begin so, holding only what the search's order reads (names, family and regions of origin), plus photograph counts and the species' entries in small blocks by position. A query reads a few small files and ranks them exactly as the whole index would. Under a manifest that names these files, nothing in the Worker reads or holds the index. A refresh that changes photographs or thumbnails rewrites none of the key files, only a few blocks.

The same step splits round seventy-six's name files (`names/`, 128 files of about 113 KB) in two: `cards/` (256 files of about 13 KB), what a species page reads, and `older/` (128 files of about 85 KB), the accepted and older names, read only for an address that is no page's and for a page reached by an older name. A species page the cache does not hold now reads card files of about 14 KB where it read name files of 113 KB, and the page carries its maps' points rather than the two maps drawn, which it draws itself. A copy of the Worker holds at most 12 MB of parsed files, where it held 24 MB, and over a crawl of 250 species pages its heap in use in Cloudflare's runtime run locally went from up to 126 MB to up to 80 MB (`docs/review-77/C.md`). Nothing is asked of any source: the step is one offline re-index, a review, the upload and the live check.

**One thing the search now says that it did not.** When every word of a query of two words or more begins the words of more than 2,000 species ("cape provinces", "a e"), or a word with a typing error does ("provinses"), or a typing error would have the search look through more than 12,000 species or put more than 2,000 in order (none of the round's 8,751 typing errors does today; a few dozen would at 50,000), the search lists nothing and the page says "Too many species match “cape provinces” to list them all. Type another letter or another word to narrow it." This is the scaling study's decision 6, which you approved in principle; the round's proof (`scripts/dev/scale/results/r77-proof.txt`) lists every query of its 69,021 that says it, on the real corpus.

**The order: deploy first, then this step.** Either order is safe, and the code makes it so:

- **Deploy first** (recommended). This round's Worker meets round seventy-six's corpus, finds no card files (`cards/`, `older/`) in its manifest, and reads that corpus through its index, pages and search alike, as every Worker did before round seventy-six (tested: `tests/unit/r77c-page-cpu.test.ts`, "a manifest of round seventy-six's layout", and `tests/unit/r77k-search-files.test.ts`, "a corpus built before"). Until the upload, a fresh copy's first request reads the whole index again, about half a second and 43 MB in node at today's size, which fits Cloudflare's 128 MB at 8,945 species; so run the step soon after the deploy, not days later.
- **Upload first.** Round seventy-six's Worker meets this round's manifest, finds no `names/` files in it, and reads the corpus through its index, as before round seventy-six; the manifest still names the postings and `short.json` it needs, and it passes by the new files. Until the deploy, it is the same half second and 43 MB.
- **Why deploy first:** the deploy's own live check (`npm run deploy` ends with `node scripts/live-check.mjs`) then runs against the corpus live now, and this step's live check, last, sees the new Worker on the new corpus, which is what stays. With the upload first, that last live check would see round seventy-six's Worker on the new corpus, a state that lasts only until the deploy.

So: `npm run deploy` as in section 3, then the steps below, then the cold-start measure in section 3. To go back after both, `npx wrangler rollback` is enough: round seventy-six's Worker reads the new corpus through its index, as above.

**Step 1.** In the project folder (in cmd `cd /d "C:\path\to\AI Work\cultifolio"`; in PowerShell `cd "C:\path\to\AI Work\cultifolio"`), type `node scripts/corpus-step.mjs`. It copies `static\s\v2` to `backups\v2-<the corpus id>`, then runs `--index` (a minute or two; the search files are most of it). Its lines include:

```
  index: 8945 species
  photograph judgement: … Commons files on 8945 pages read with the reference's names; 0 dossiers written anew
  corpus …: 8945 species in 32 buckets, 64 posting files, … search key files (… MB) → static/s/v2/p/ (… files written, …); manifest.json names it
```

**Step 2. Review.** It stops with "Review before going on". Good looks like this: "index: 8945 species"; "0 dossiers written anew"; about 13,200 search key files of about 280 MB, most of them a few kilobytes; the review line says 0 dossiers differ from the backup. On the dry run of round seventy-six's copy here (8,947 species), the corpus line said "13210 search key files (278.0 MB)" and "13662 files written, 238 already on disk under their hash, 16 of older corpora deleted"; the manifest named 690 files where it named 366: 452 added (256 `cards/`, 128 `older/`, and the search's 68: `search/top.json`, sixty-four `search/<n>.json`, `search/genera.json`, `search/tables.json` and `search/blocks.json`) and the 128 `names/` files gone, every other name the same by hash. `drops.txt` should not be there. Then `node scripts/corpus-step.mjs --go-on`.

**Step 3.** The upload and the live check run by themselves. The upload is larger than usual this once: on the dry run, 13,662 new files of 307 MB, 13,210 of them (278 MB) the search's. The bytes are about two minutes at 20 Mbit/s; the number of files makes it longer, by how much has not been timed here, so leave it running until it ends. Later refreshes upload little of them: a photograph fill of 1 per cent of species rewrote 99 of them, 0.8 MB (`scripts/dev/scale/results/r77-churn.jsonl`). Then measure the cold start (section 3, "A cold start's CPU and memory"); the first search should now read a few small files, not the index.

**The prune** (`node scripts/corpus-step.mjs --prune`) now also fetches the live manifest's search directories into `live-search\` before it makes `keep.txt`, so the key files they name are kept; if it cannot read them it stops and deletes nothing.

### Round seventy-six's corpus step: the Worker without the whole index

**What changes, and why.** Until this round every fresh copy of the Worker read the whole species index (5.8 MB) and built maps of every name from it before it answered its first page: 0.5 s and 43 MB in node, and at 50,000 species more memory than Cloudflare gives a copy (`docs/SCALE-STUDY.md`). The build now writes those maps as small files (the name files `names/`, the catalogue's row files `rows/`, `genera.json`, `featured.json` and the sitemap's files `sitemap/`), and stores in each dossier what the photograph rules made of its Commons files with every name the reference holds (`judged`). A page then reads one or two small files and its dossier; only the search still reads the index. Nothing is asked of any source: the step is one offline re-index, a review, the upload and the live check.

**The order: deploy first, then this step.** Either order is safe, and the code makes it so:

- A Worker of this round, deployed before the upload, finds a manifest without the new files and reads the live corpus as before, through its index (tested: `tests/unit/r76w-lookups.test.ts`, "the fallback").
- The Worker live now, if the upload comes first, reads the new manifest as before and passes by the new files and the new field.

So: `npm run deploy` as in section 3 (its live check runs against the live corpus), then the steps below, then the cold-start measure in section 3. To go back after both, `npx wrangler rollback` is enough: the Worker before reads the new corpus.

**Step 1.** In the project folder (in cmd `cd /d "C:\path\to\AI Work\cultifolio"`; in PowerShell `cd "C:\path\to\AI Work\cultifolio"`), type `node scripts/corpus-step.mjs`. It copies `static\s\v2` to `backups\v2-<the corpus id>`, then runs `--index` (about a minute). Its lines include:

```
  index: 8945 species
  photograph judgement: … Commons files on 8945 pages read with the reference's names; … dossiers written anew
  corpus …: 8945 species in 32 buckets, 64 posting files → static/s/v2/p/ (… files written, …); manifest.json names it
```

**Step 2. Review.** It stops with "Review before going on". Good looks like this: "index: 8945 species"; on the dry run of round seventy-two's copy here, 889 dossiers were written anew, each only gaining the judgement, and the review line said about 890 dossiers differ from the backup; the manifest names 227 more files than before (128 name files, 96 row files, the genera, the strip and one sitemap file). `drops.txt` should not be there. Then `node scripts/corpus-step.mjs --go-on`.

**Step 3.** The upload and the live check run by themselves, as in round seventy-three's step. On the dry run the upload's new or changed files were 892 dossiers and 242 products, 53 MB in all, besides the top-level index and the manifest. Then measure the cold start (section 3, "A cold start's CPU and memory"), and if you have half an hour, the memory test after it.

### Round seventy-three's corpus step, after `npm run deploy`

This round re-derives about 305 pages with the records and photographs of the other GBIF keys GBIF files their plant under, and merges two pairs of pages that are one plant. It takes about an hour: reading `occurrence.zip` once, then about 1,000 requests to GBIF's search API, made one after another. Keep the PC from sleeping while it runs; if it sleeps, run the same command again.

**What changes, and why.** GBIF files some plants' records under more than one backbone key. Myrica cerifera's page reads GBIF's key for "Myrica cerifera Bigelow" (292 records), while GBIF files the wax myrtle under Morella cerifera (L.) Small (18,590 records with coordinates). A page now also reads another key's records and photographs when, and only when, Kew's file holds that key's name and author as the page's own name or as a name of the same type (an orthographic variant, a synonym Kew marks homotypic, or an autonym of one), GBIF does not already file the key under the page's key, and the key is not another page's (or filed under one). Heterotypic synonyms, such as Lonicera pileata on Lonicera ligustrina, are not read: that is a taxonomic decision not made yet, and `extra-keys-refused.txt` lists them with "the owner's decision". `scripts/extra-keys.txt` lists every such key: 332 keys on 305 pages, made from Kew's file of 2026-06-04 and GBIF's backbone export. Each page says in its record which keys its records come from and why (`occurrences.keys`). Coryphantha macromeris joins Pelecyphora macromeris, and Rebutia fidana joins Weingartia fidaiana (`scripts/merged-pages.txt`): each kept page reads the other's key, the old name answers there as an older name, the old address and a grower's plant under the old name find the kept page, and the old dossier is deleted. The index then holds 8,945 species, two fewer, on purpose.

**Step 1. Open cmd or PowerShell in the project folder.** The quotes are needed because the folder's path has a space in it. In cmd:

```
cd /d "C:\path\to\AI Work\cultifolio"
```

In PowerShell, which has no `/d`:

```
cd "C:\path\to\AI Work\cultifolio"
```

**Step 2. Start the corpus step.**

```
node scripts/corpus-step.mjs
```

It first runs `svelte-kit sync`, then copies `static\s\v2` to `backups\v2-<the corpus id>` (`backups\v2-d60525499b8c8c20` for round seventy-two's corpus; a minute or two), then runs the steps one after another. Each step starts with a line like `=== 2026-10-17 09:12:03  step 2 of 12: dossier --list-extra-keys`.

**Whenever it stops, read its last sentence.** There are four kinds of stop:

- "a source did not answer … Run the same command again in an hour or so". Nothing is lost. Wait, then type `node scripts/corpus-step.mjs` again.
- "Review before going on: …" or "some species lost what the build before had". Read what it names, as the steps below say, then type `node scripts/corpus-step.mjs --go-on`.
- "it failed", "a dossier on disk could not be read", or "the index now holds fewer species than before". Do not go on. Open `corpus-step.log` (`notepad corpus-step.log`) and paste its last forty lines back.
- "Stopped by Ctrl-C". Type `node scripts/corpus-step.mjs` to carry on.

`node scripts/corpus-step.mjs --status` lists the steps and which are done, and changes nothing.

**Step 3. Review: the pages to re-derive.** The command stops after `--list-extra-keys`. Open the list:

```
notepad rebuild-extra.txt
```

Good looks like this: about 305 lines, each a key and a name, among them `11798439 Pelecyphora macromeris`, `7281301 Weingartia fidaiana`, `8038589 Myrica cerifera`, `8793122 Ixora coccinea` and `11869920 Eucalyptus camaldulensis`. Coryphantha macromeris and Rebutia fidana are not in it. If it holds a few dozen lines, or several thousand, stop and paste the first lines back. Otherwise go on:

```
node scripts/corpus-step.mjs --go-on
```

The re-derivation reads the download for each page's own key and asks GBIF for the other keys' records and photographs (none of the 332 is in `occurrence.zip`, which was made for the reference's own keys). Its lines read like `✓ Myrica cerifera [8038589] 49 photos, 412 open/…`.

**Step 4. Review: drops, if the re-derivation stops for them.** A rebuild that loses something the page had before writes `drops.txt` and stops.

```
notepad drops.txt
```

Good: every line names one of the pages just re-derived, and the change is the round's: a climate or a marker that moved because more records are read. Not good: a page losing all its photographs, its range or its records for no reason you can see. Paste those lines back and do not go on. If every line is expected:

```
node scripts/corpus-step.mjs --go-on
```

**Step 5. The merged pages and the check (no review).** `--prune-followed` deletes the dossiers of Coryphantha macromeris (3084426) and Rebutia fidana (7906297), and says "2 dossiers of pages merged into another deleted (3084426, 7906297)". It deletes one only when the page it joined records its key, so a re-derivation that stopped short leaves it, and says which. The second `--list-extra-keys` must say "0 pages to rebuild with their other keys"; if it names pages, the re-derivation did not finish them, and at the next review paste that line back rather than uploading.

**Step 5b. iNaturalist (no review).** `--fill inat --bulk bulk` asks iNaturalist again about some sixty pages once (Kew's names below species now read more exactly) and a few of them get new photograph sets; it takes a few minutes and says how many. Then `--fill commons-kind` reads the description of the few Commons files a new title rule would hide, so a file whose description names the species stays.

**Step 6. Review: before the upload.** After `--index` it stops with a sentence like "corpus on disk 1a2b…, was d60525499b8c8c20; 8945 species; about 370 dossiers differ from the backup …; drops.txt not there".

Good looks like this:

- 8945 species: the 8947 before, less the two merged pages. The step said so after `--prune-followed` ("2 pages merged into another left the index on purpose: 8945 species expected from here on"); any other shrink still stops it.
- The `--index` lines in `corpus-step.log` include "2 old addresses of pages merged into another answered by the kept page: coryphantha-macromeris, rebutia-fidana".
- No line in `corpus-step.log` says "could not be read".
- `drops.txt` is not there, or holds only lines you read in step 4.

Then upload:

```
node scripts/corpus-step.mjs --go-on
```

**To make the list of other keys again** (only when Kew's file or GBIF's backbone changes; it is offline and takes about five minutes): download GBIF's backbone export once, `simple.txt.gz` (466 MB) from https://hosted-datasets.gbif.org/datasets/backbone/current/, into a folder `backbone`, then

```
npm run dossier -- --list-extra-keys --bulk bulk --backbone backbone\simple.txt.gz
```

It rewrites `scripts\extra-keys.txt`, lists the keys the rule did not take, and why, in `extra-keys-refused.txt`, and writes `rebuild-extra.txt`.

**Step 7. Upload and live check (no review).** The command does the rest:

1. It copies everything but the manifest.
2. It checks with `rclone check` that the bucket holds every file as it is on disk, and only then copies the manifest.
3. It lists the bucket's dossiers the index does not list into `bucket-unlisted.txt`. This is a report only: nothing is deleted.
4. It runs the live check, and then waits until the site serves the corpus on disk.

It ends with "the site serves corpus …, the one on disk" and "every step is done". A handful of keys in `bucket-unlisted.txt` (pages followed to another name in earlier rounds, and this round 3084426 and 7906297, the two merged pages) is expected: the site answers a key the index does not list with a 404 whatever the bucket holds. If the check fails, the manifest was not uploaded and the site still serves the corpus before; paste the end of the log back.

**Step 8. A day or more later: the prune.**

```
node scripts/corpus-step.mjs --prune
```

It reads the live manifest from the bucket, checks the site serves it, checks the bucket holds every file it names, and makes a dry run. Then it stops with a sentence like "the bucket's p/ holds 600 files; keep.txt keeps 256 (…); named by none: 344, of which 344 more than a day old would be deleted now. Every file the live manifest names is in the bucket."

Good: the kept number is between about 139 and 280, and the deleted number is what is left of the files. Each corpus uploaded since the last prune leaves about 117. If it stopped instead, saying the site serves another corpus or the bucket lacks a file, delete nothing and paste the sentence back. If it is good:

```
node scripts/corpus-step.mjs --prune --go-on
```

**To go back to the corpus before the step:**

```
rmdir /s /q static\s\v2
xcopy /e /i /q backups\v2-d60525499b8c8c20 static\s\v2
```

Then upload it with the two rclone lines under "The upload" below, and check it with `npm run live-check`.

The order of operations for a corpus refresh is always: build or fill on the PC, `npm run dossier -- --index`, the upload below (the folder is `static/s/v3` since round seventy-eight; the paths in the older rounds' sections say `v2`, as they were then). `--index` writes `static/s/v2/index.json` (the names file a rederive reads, and the Worker's fallback when the bucket holds no manifest), `static/s/v2/manifest.json`, and, under `static/s/v2/p/`, each of the build's products as a file named by the md5 of its content: the index again, the entries and the sheets of every bucket, the search's postings (64 files that say which species each short key of a word can match; `src/lib/core/postings.ts`), the short answers (`short.json`: the whole index's first hundred hits for every key of one or two letters, so a first keystroke costs a lookup; round fifty-eight) and the nine catalogues' rows. The manifest maps each product's name to its hash and so to its file; the Worker reads the manifest, takes the corpus id, the bucket count and the index from it, and reads every product of a request from the one manifest it began with. A manifest that does not name every product its counts call for is not adopted (round fifty-eight), so a half-written one leaves the corpus held before in place. The upload needs no deploy: `/api/corpus` reports the manifest's id and every reference request from a device carries it, so the Worker's own cache (the Cache API: held pages for a minute, search answers for a day, both keyed by the corpus id), each device's worker cache and the browser cache turn over on their own (the Worker re-reads the manifest within a minute). Cloudflare's edge does not keep a Worker's answers on its own; only what the Worker puts in the Cache API is kept, and the adapter puts there a public answer of status 200, 203, 204, 300 or 301 and nothing else, so no 404 and no 302 (round eighty, review C 2 and 4); among them the sitemap's index, whose address names no corpus, for five minutes, and its files under the corpus id, for a day. Dossiers (`/api/dossier/<key>`) are read from their fixed, overwritten place, not by hash, so they are answered `no-store`.

The upload: everything but the manifest, then the manifest alone, which names a corpus whose files are all there whatever order the first copy landed in:

```
npm run dossier -- --index
rclone copy static\s\v3 r2:cultifolio/s/v3 --transfers 32 --checkers 32 --exclude report.txt --exclude manifest.json --exclude manifest.prev.json --s3-no-check-bucket -P
rclone copy static\s\v3\manifest.json r2:cultifolio/s/v3 --s3-no-check-bucket -P
```

A file already on disk under its hash is not written again, so the copy carries only the files whose content changed: a refresh that touched a few dossiers uploads the index (4 MB at nine thousand species), the entries and sheets buckets those species are in, and the postings (3 MB) and short answers whenever a field the search reads changed: a name, a common name, a family, an origin or an older name. The corpus id is a hash of every product's hash, so any change makes a new id. The bucket count is chosen for the corpus's size (32 up to about ten thousand species, doubling past that; `src/lib/core/bucket.ts`) and announced by `/api/corpus` as `buckets`, which every device reads before it hashes. Afterwards `npm run live-check` fails if `/api/corpus` does not say `"manifest":true`.

**Round sixty's corpus step, once, after `npm run deploy`: every English common name.** The index entry now carries every English common name a species has (`commons`, beside `common`, which stays the first), and the search and its postings read them all, so "string of pearls" finds Curio rowleyanus whichever name GBIF listed first. A Worker reads an index without `commons` as before (only the first name is searched), so the deploy goes first and the corpus follows: `npm run dossier -- --index` and the two-line upload above. No fill or rederive is needed; the names are already in each dossier. Afterwards a search for a species' second English name should find it.

**Round sixty-two's corpus step, once, after `npm run deploy`: GBIF's common names again.** The dossiers built before round sixty-two kept GBIF's vernacular names merged by spelling, with no preferred flag and no source count, so the common-name rule's second and third steps had nothing to read. `npm run dossier -- --names` asks GBIF's `vernacularNames` once per stored dossier (about nine thousand requests, paced at the build's GBIF pace), rewrites only each dossier's vernacular block and its `gbif.vernacular` record (`names fetched YYYY-MM-DD`, and `truncated` when GBIF had more than four thousand rows), then writes the index, its sheets, its products and its manifest as `--index` does. It is resumable: a dossier already carrying the mark is skipped, and if GBIF refuses it stops, says how many are left, and the same command continues. Then the two-line upload above. Keep the index from before it, and run `npx tsx scripts/audit-common-names.ts <the new index.json> --before <the old index.json> [--sample 40] [--json]` to see which species show another common name. A full build writes the mark too (`names fetched YYYY-MM-DD`), and an offline re-derivation carries it, so a later `--names` skips those dossiers. `/api/search`'s edge key is `search4` since this round, so answers kept under older readings are not served. Afterwards the live check, and the searches in `docs/review-61/corpus.md`.

A sheets bucket the Worker derives itself (no `sheets/<b>.json` in the manifest) with a dossier it cannot read is answered 503, and that isolate keeps the refusal for 30 s (Retry-After the time left). The log line `sheets: bucket <b> of corpus <c> refused; these dossiers could not be read: <key> (<slug>)` names the dossier, and the bucket stays refused until that dossier is uploaded again or rebuilt.

**Round sixty-seven's corpus step, once, after `npm run deploy`: 156 species rebuilt online, then the names.** Zip `static\s\v2` first (section 6) and keep the index from before (`Copy-Item static\s\v2\index.json $env:TEMP\index-before-r67.json`). The repair: `npm run dossier -- --keys r67-rebuild-keys.txt --grid climate --bulk bulk`.
- The list holds 156 backbone keys, one a line with the name after it. They are the species that an offline re-derivation left without a photograph (120) or with a refusal it never received (44); 8 are in both.
- `--keys` rebuilds just those, online and whatever is on disk, and keeps the rest.
- The run fails, and lists the species in `drops.txt`, when one loses every photograph or a source turns refused. Read that file before going on.

Then:
1. `npx tsx scripts/audit-common-names.ts --dossiers static\s\v2 --sample 40`. It says what this round's name rules change before the index is written: about 410 headlines and the names under about 805 titles, each by its cause, with the names it flags.
2. `npm run dossier -- --index`.
3. `npx tsx scripts/audit-common-names.ts static\s\v2\index.json --before $env:TEMP\index-before-r67.json --sample 40`. It fails on a species whose photographs dropped to none or whose climate turned refused.
4. The two-line upload above, and the live check.

The index grows by about 8% (every older name of species rank is searched, beyond the six shown), and the postings by about 7%. `/api/search`'s edge key is `search6` since this round.

On the iPhone, in airplane mode, before a deploy is called done: open a plant page never opened before (it opens from the section shell), then `/benches/x` (it lands on `/places/x` and says "Not here"). In Safari's engine the browser tests take the network away behind the service worker instead (`tests/e2e/r67h-offline.spec.ts`); this is the check on the device itself.

**Round sixty-nine's corpus step, once, after `npm run deploy`: photographs, identifiers, summaries and the older-name ranges.** The deploy alone corrects what a page shows of Commons (files that are not photographs of the species, credits, public domain, sizes, the lead): those rules act where a dossier is read. The steps below correct the files themselves. Zip `static\s\v2` first (section 6) and keep the index from before (`copy static\s\v2\index.json %TEMP%\index-before-r69.json`). Then, in order:
1. `npm run dossier -- --fill gbif-licence`: re-reads each stored GBIF photograph that is not iNaturalist's from its occurrence record and drops those whose own media item states no open licence. Resumable; if it says dossiers were left with none, `npm run dossier -- --fill gbif-open`.
2. `npm run dossier -- --prune-uncredited`: removes photographs whose credit names no author under CC BY or CC BY-SA, by the read's own rule ("Own work", "See above", "Unknown author" and the like).
3. `npm run dossier -- --fill inat-ids`, then `npm run dossier -- --fill inat`: inactive iNaturalist ids followed to their current taxon, then their photographs.
4. `npm run dossier -- --fill summaries`: drops a Wikipedia summary reached through a redirect to another title whose lead is not this species' (a genus of many species, another species), listing each one, and asks again for those an earlier run set aside, taking back the ones whose lead is this species' (a genus of one species, a crop's common name, the species in another genus). Read both lists.
5. `npm run dossier -- --list-rebuild`, then `npm run dossier -- --keys rebuild-keys.txt --grid climate --bulk bulk`: the ranges taken under older names and every dossier with exactly 50 stored synonyms, rebuilt under the new rules. Its `drops.txt` is expected to name Lantana strigocamara's native range (Kew holds it with none); read every line.
6. `npm run dossier -- --index`, `npx tsx scripts/audit-common-names.ts static\s\v2\index.json --before %TEMP%\index-before-r69.json --sample 40`, the two-line upload above, and the live check. `npx tsx scripts/audit-commons-photos.ts` lists, without changing anything, every Commons file the read now leaves out.

**Round sixty-three's corpus step, once, after `npm run deploy`: the year's rain, credits, sitemap days and common names.** Zip `static\s\v2` first (section 6). Keep the index from before (`Copy-Item static\s\v2\index.json $env:TEMP\index-before-r63.json`). Then the offline rederive (`npm run dossier -- static\s\v2\index.json --offline --grid climate --bulk bulk`, one to two hours), which writes each dossier's `climate.annualRain.p50` (the median of the cells' own yearly totals), the builder's refusal details as full clauses, and `changed` (the day the dossier's substance last changed, kept when a rebuild changes nothing). Then `npm run dossier -- --index` (a few minutes), which writes the index's `credit` (the thumbnail's licence and author for tiles) and `changed` (the sitemap's day), the sheets with the credit, and the common names read by round sixty-three's rules (a comma list split; a bare genus word the headline only when nothing fuller). `--index` writes the `changed` stamp into dossier files, so never run it from a copy of `static\s\v2` that is not the one uploaded. Then `npx tsx scripts/audit-common-names.ts static\s\v2\index.json --before $env:TEMP\index-before-r63.json --sample 40`, the two-line upload above (every dossier changes this once, so the whole corpus goes), and the live check. `/api/search`'s edge key is `search5` since this round. Before the rederive a species page still says "Rain a year (sum of monthly medians)", which is true of what it shows.

**Round sixty-three's backup version.** A backup that holds a change carrying its recorded time (`w`, written by every change this build makes) is format 3; a tab still running round sixty-two refuses it with "written by a newer Cultifolio". Sync batches are unchanged.

**Round sixty-two's database and wire versions.** The device database is version 4: a tab still running an older build is asked to let go, and reloads into the new one. A sync batch that carries a marked stamp, or parked stamps, is version 2, and a backup holding a marked stamp is version 2: a device still on round sixty-one sets such a batch aside until it updates, and refuses such a backup with a sentence. Update every device soon after the deploy.

What a corpus that cannot be read does now (round sixty): a manifest this build refuses, on an isolate that holds nothing, falls to the top-level `s/v3/index.json`; if that is missing or not a list too, every page and reference route answers 503 "The reference could not be read just now", and never the four fixture species. A refused manifest is read again after ten minutes, so a product put right under the identical manifest is taken then. An R2 error at the minute's check keeps the corpus held and asks again ten seconds later. A bucket that holds no corpus at all (a dev server's empty local bucket) is still the fixture, which `live-check` fails on; one that holds the version before's (`s/v2/manifest.json`) and none of this version's answers 503 (round seventy-eight).

A schema bump (`DOSSIER_V` in `src/lib/dossier/schema.ts`) changes the prefix (round seventy-eight's was `s/v2/` to `s/v3/`), needs the corpus written again (a rederive, `--offline` the fast one, or, as in round seventy-eight, `--rekey`), an upload to the new prefix, and a deploy, in that order (`node scripts/corpus-ready.mjs && npm run deploy`, so the bucket is checked first); the old prefix can be deleted from the bucket afterwards (`rclone purge r2:cultifolio/s/v2`), never before.

**One operator, one checkout.** The prune below, like the refresh, assumes a single person publishing from a single checkout. Two checkouts publishing to one bucket can each prune a product the other's manifest names (the live manifest is re-read before the delete, which narrows this to a refresh landing in the minutes between the re-read and the delete, but does not close it). If a second operator or machine ever publishes, agree who prunes, or stop pruning (round sixty; the second outside review, B13).

**Pruning the bucket's `p/`.** `--index` keeps the manifest before the current one as `manifest.prev.json` and deletes from `static\s\v3\p` any file neither of the two names, so the folder holds two corpora at most. The bucket keeps what was uploaded until it is told otherwise, and what it may lose is decided by the manifest it serves, not by this checkout (a prune from a second checkout, or after two refreshes in a day, could otherwise delete a file the live manifest names; round fifty-eight). A day or more after a refresh:

```
rclone copyto r2:cultifolio/s/v3/manifest.json live-manifest.json
npm run dossier -- --keep-list live-manifest.json
rclone delete r2:cultifolio/s/v3/p --exclude-from keep.txt --min-age 24h --use-server-modtime --dry-run
rclone copyto r2:cultifolio/s/v3/manifest.json live-manifest.json
npm run dossier -- --keep-list live-manifest.json
rclone delete r2:cultifolio/s/v3/p --exclude-from keep.txt --min-age 24h --use-server-modtime -P
```

`--keep-list` refuses a file the Worker would not accept as a manifest, and lists every file the live one names and every file this checkout's own `manifest.json` and `manifest.prev.json` name, so a corpus built here and uploaded since is kept too. The live manifest is read again just before the real delete, so a refresh that landed while you read the dry run is in the list. `--use-server-modtime` makes `--min-age 24h` mean "uploaded more than a day ago": without it rclone reads the age the file had on the PC, and a product built days before its upload counted as old the moment it landed (round fifty-nine; three reviews). Read the dry run's list before the real `delete`, and run the lines in one sitting. (`copyto`, not `rclone cat >`: PowerShell 5's redirect writes UTF-16.) Since round seventy-nine these lines are slow at the full list's size (rclone tries every line of keep.txt on every file: about half an hour to an hour each `delete`); `node scripts/corpus-step.mjs --prune` does the same in a minute or two, with the files to delete as a list.

**Rollback below round fifty-three is not possible on a device that has opened it.** Round fifty-three opens the vault at version 3 (the `order` store); the previous builds open version 2 and get a `VersionError` on a v3 vault. A rollback to an older build, or an older build's shell kept by the service worker, cannot open the collection on such a device until the current build is deployed again. Roll forward. The `order` store grows one row per change stored and is not pruned (about thirty megabytes at four hundred and fifty thousand changes); pruning needs a frontier every open tab agrees on, and is left for the round that needs it.

**Round fifty-seven: compatibility with earlier builds is gone.** Nobody used the app before launch, so the paths that read what earlier builds wrote were removed (docs/REVIEW-ROUND-57.md): the v2 importer, the changes-only JSON backup, `importedOn`, the free-text location, value mending, old batch names and unbound seals, a bucket request without its count. A device that had opened the app before keeps its log, folds it once under FOLD_RULES 3, and reads on; a test sync vault made by an earlier build will not open (its batches carry the old names or seals): Stop syncing on each device and create a new vault. From launch on, a format change is a migration, not a removal. The snapshot is now keyed to the fold rules rather than the build, so a deploy no longer makes every device fold its whole log; `tests/unit/fold-rules.test.ts` fails when the fold's source changes and FOLD_RULES does not, and its message says which to do.

**The one-off corpus steps of earlier rounds** follow, kept as a record; each has been run. Their upload lines are written as today's (everything but the manifest, then the manifest), not as they were run.

**Round sixteen's corpus step, once.** 2,935 photographs in 702 dossiers were published credited "unknown" under CC BY or CC BY-SA, which those licences do not allow (round sixteen, 3). The build no longer produces them; the ones on disk are removed with

```
npm run dossier -- --prune-uncredited
npm run dossier -- --index
rclone copy static\s\v2 r2:cultifolio/s/v2 --transfers 32 --checkers 32 --exclude report.txt --exclude manifest.json --exclude manifest.prev.json --s3-no-check-bucket -P
rclone copy static\s\v2\manifest.json r2:cultifolio/s/v2 --s3-no-check-bucket -P
```

No API calls; a minute on the PC. 53 species are left without a photograph by it; all 53 have iNaturalist and Commons recorded as having nothing for them, so no fill can give them one until a source does (round seventeen, 13: the pass reopens a dossier's photo sources for the next fill only where a source had answered). Round seventeen's version of the pass also rewords the CC0 credits that read "unknown" to "author not stated" (1,018 photographs), so it is run once more, with `--index` and the two uploads after it. Round sixteen also adds a dev dependency (`fake-indexeddb`, for tests that run the real vault on an in-memory IndexedDB), so `npm install` once before `npm run deploy`.

**Round thirty-one's corpus step, once.** Four rules changed in the builder and take effect only when the dossiers are rederived: a record with no stated accuracy counts for the climate only as a human observation with coordinates to three decimals (round thirty, R2-11); a species with records on both sides of the equator in strength takes its envelope from the larger side alone and says so (round thirty-one, 1); the typical cell for the daily extremes is the nearest-to-median cell whose NASA POWER cell is mostly land, and the fraction is written when none is (round thirty-one, 2); and the index carries each species' older names, so the search and the picker find a species under a name it no longer has (round thirty-one, 3). The rederive is offline (the range, the records, the centre and the climate from the bulk files and the grid; no API calls), then the index, then the two uploads. Zip the current `static\s\v2` first, as section 6 says.

```
npm run dossier -- static\s\v2\index.json --offline --grid climate --bulk bulk
npm run dossier -- --index
rclone copy static\s\v2 r2:cultifolio/s/v2 --transfers 32 --checkers 32 --exclude report.txt --exclude manifest.json --exclude manifest.prev.json --s3-no-check-bucket -P
rclone copy static\s\v2\manifest.json r2:cultifolio/s/v2 --s3-no-check-bucket -P
```

The rederive rereads the climate grid for every species (about nine thousand envelopes, each now sampling the grid around its typical cell), so expect it to take a while longer than the photograph pass; `report.txt` says what changed. The first two rederives with these rules (2026-09-29) found every POWER cell 100% land and no in-range cell at sea. The land sample first tested whether the grid had a cell at each point, and the file grid has one for every point in its extent; then whether the cell held figures, and CHELSA has temperatures and rain over the ocean (a probe at 30°N 40°W reads 20 °C days). Land is now the elevation layer, which the packer masks to land pixels, so a cell with no land has none: that rule is in `readCell`, so it also takes a record placed at sea out of the envelope (the source line says how many cells were left out), which had never happened before. Rederive once more with all four lines: the index carries each species' climate status and its "grows like" neighbours, and the sheets are built with it, so a rederive without `--index` and the index copy leaves the site disagreeing with itself (the first upload here did exactly that, and a reviewer caught it: round thirty-three, 6). Sanity counts afterwards: `(Select-String -Path static\s\v2\*.json -Pattern '"landFraction":0\.[0-4]' -List | Measure-Object).Count` was 89 on the rederive that went up (island and coastal species; Melocactus intortus 0.16); `-Pattern 'with records at sea'` 1,483 (a coastal species with a record a little offshore; Copiapoa cinerea lost one cell of 53, Yucca glauca none); `'"hemispheres"'` 210. A later rederive should land near these, not at zero and not at thousands for the first. After the upload, `/species/rhipsalis-baccifera` should carry the hemisphere line, `/species/melocactus-intortus` the sea-cell line under its cold floor, and a search for "haworthia attenuata" on the front page should list Haworthiopsis attenuata. No deploy is needed for the corpus; the deploy for the round's code changes goes first, since the pages that show the new fields must be live before the fields arrive.

**Round thirty-two's corpus step, once, after `npm run deploy` (round thirty-three's build rules ride with it: the typical cell within 2 °C of the median, the hemisphere split by cells poleward of 10°, the record count per cell, decimals on the raw coordinate).** GBIF's image cache stopped answering the bare address form, so every GBIF thumbnail in the corpus is written again in the occurrence form (the Worker mends a dossier's as it reads it, but the index's tile thumbnails and the sheets carry no occurrence key and need the rebuild), and a species the download has no observation photographs for drops the herbarium sheets an older build gave it. The same three commands as round thirty-one's, with `--index` this time, which is never skipped after a rederive (the front page said 5,523 with climate against a corpus of 5,521 when it was):

```
npm run dossier -- static\s\v2\index.json --offline --grid climate --bulk bulk
npm run dossier -- --index
rclone copy static\s\v2 r2:cultifolio/s/v2 --transfers 32 --checkers 32 --exclude report.txt --exclude manifest.json --exclude manifest.prev.json --s3-no-check-bucket -P
rclone copy static\s\v2\manifest.json r2:cultifolio/s/v2 --s3-no-check-bucket -P
```

Before the upload: `(Select-String -Path static\s\v2\index.json -Pattern 'image/cache/fit-in/400x/https' -SimpleMatch -Quiet)` should print `False` (no bare-form thumbnail left; the first run printed `True` because 1,407 species with no coordinated record kept an old set, fixed in round thirty-three) and `(Select-String -Path static\s\v2\*.json -Pattern 'iiif.rbge.org.uk|medialib.naturalis.nl|sweetgum.nybg.org|oxalis.br.fgov.be' -List | Measure-Object).Count` should be far below its value before (herbarium hosts). After: the front page's tiles for Haworthiopsis attenuata and Acharagma aguirreana show photographs, `/species/albuca-yerburyi` has no herbarium sheet, and the live check's thumbnail check passes (`npm run live-check`).

**Round thirty-seven's corpus step, once, after `npm run deploy`: the index alone.** The sheet buckets were built before round thirty-five's sea rule and carry a sea cell's extremes raw, so plant pages and labels still printed them (round thirty-seven, R1-3). `sheetOf` reads a parsed dossier, which the rule is applied to, so rewriting the sheets is enough; no rederive, so the first of the four lines is left out:

```
npm run dossier -- --index
rclone copy static\s\v2 r2:cultifolio/s/v2 --transfers 32 --checkers 32 --exclude report.txt --exclude manifest.json --exclude manifest.prev.json --s3-no-check-bucket -P
rclone copy static\s\v2\manifest.json r2:cultifolio/s/v2 --s3-no-check-bucket -P
```

The copy uploads the 32 sheet files and the index; the dossiers are unchanged and skipped. Before the upload: `(Select-String -Path static\s\v2\sheets\*.json -Pattern '"extremesStatus":"sea"' -SimpleMatch -List | Measure-Object).Count` should be above zero (89 species have a cell under half land, spread over the buckets). After: a plant of Melocactus intortus on `/plants/<number>` says the daily extremes were read at a weather cell that is mostly sea and set aside, and its label prints no habitat night. A later full rederive writes `hemispheres.equatorial` and cuts the carried-row chains in the files themselves; until then the pages do both as they read.

## 6. If something is wrong after a deploy

`wrangler deploy` is atomic and the previous version is kept: Workers → cultifolio → Deployments → roll back. HTML is cached for at most a minute and open pages reload on their next navigation after a deploy, so a rollback is live within a minute too. The corpus is not versioned by the deploy; a bad corpus upload is fixed by uploading the previous `static\s\v2` again (keep the last good one zipped somewhere before a rederive).
