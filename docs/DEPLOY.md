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

The corpus on disk is `static\s\v2\` (8,947 dossiers plus `index.json`, `manifest.json`, the products under `p\` and `report.txt`). It is gitignored and, with `static/.assetsignore`, excluded from the Worker's static assets, so the only way it reaches the site is R2. Uploading nine thousand objects one `wrangler r2 object put` at a time takes hours; rclone does it in minutes and is Cloudflare's own recommendation for bulk R2 work.

Install rclone once (`winget install Rclone.Rclone`, then a new terminal window so it is on the path), then make an R2 API token in the dashboard (R2 → Manage R2 API tokens → Create Account API token, permission "Object Read & Write", "Apply to specific buckets only" → `cultifolio`, no TTL). The token page shows the two keys once and the endpoint URL with the account id in it. Configure a remote:

```
rclone config create r2 s3 provider=Cloudflare access_key_id=<key> secret_access_key=<secret> endpoint=https://<accountid>.r2.cloudflarestorage.com acl=private
```

A token scoped to one bucket cannot list buckets, so `rclone lsd r2:` answers 403; the check is `rclone ls r2:cultifolio`, which is silent on an empty bucket. Then, after `npm run dossier -- --index`, upload as section 5 says: everything but the manifest, then the manifest. `copy` is incremental, so a daily `--fill inat` followed by `--index` and those two lines is the whole refresh. Check it landed with `npm run live-check`, or:

```
npx wrangler r2 object get cultifolio/s/v2/manifest.json --pipe | more
```

The Worker re-reads the manifest each minute per isolate, so a new corpus is live within a minute of the upload finishing.

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

That runs `svelte-check`, the unit tests, the build, `wrangler deploy` and then `scripts/live-check.mjs` against `https://cultifolio.com` (another deployment sets `LIVE_CHECK_ORIGIN=https://your.site` in the environment, or passes the origin as the script's argument; the species page it checks is the first in the site's own sitemap unless `LIVE_CHECK_SPECIES=<slug>` names one; a deploy whose `/api/corpus` answers the fixture id fails the check, because that is a Worker with no corpus in R2), in that order, and stops at the first failure. The live check is the set of requests made by hand after every deploy since round fifteen: the name service three times (200 each, and it says whether the edge answered), the two headers on a prerendered page, a species page, the offline page and an API route, the beacon check, the reference under a stale corpus id (must be `no-store`), a forecast, and the vault route's 400 on a JSON null. Since round sixty-two every build ends with `scripts/check-bundle.mjs` (run by `scripts/attach-do.mjs`): it records a hash of the sources and fails the build when the root layout imports a module under src/lib/backup/ or src/lib/ui/grow/ (bar the few grow modules it draws on purpose, named in the script with their reasons), read by module path from the sources the build was made from and from the build's own entries, so the unit test's skip on a stale build no longer matters. Before a deploy, run the browser suite once in strict mode on a quiet machine: `node scripts/predeploy.mjs` starts its own fresh server, runs every browser test with `CI_STRICT=1` on four workers (`PW_WORKERS` to change it; WebKit is held to two of its own, `PW_WEBKIT_WORKERS`, and since round seventy-five Firefox to two of its own, `PW_FIREFOX_WORKERS`; the script says what each engine runs at before it starts), and exits non-zero on any failure or on a test that passes only on its retry. A round names its tier: `node scripts/predeploy.mjs --tier=corpus` after a round that changed only the corpus builder (the unit tests, then Chromium and the Chromium phone), `--tier=app` after a round that changed pages or the app (the unit tests, then every engine), and `--tier=launch` once before the public launch (svelte-check, the unit tests, then every engine on two workers). Each stops at its first failing step and says which. Since round sixty-seven a plain `npx playwright test` is strict as well: a test that passes only on its retry fails the run. That server asks no outside service (`--var E2E_OFFLINE:1`, from `playwright.config.ts`), so a PC that can reach GBIF runs the suite as the sandbox does. The strict run also runs the tests tagged `@phone` on a Chromium phone at Safari's page size on an iPhone (390 x 664, touch, Safari's user agent; round sixty-three). Safari's engine and Firefox run when named: install them once with `npx playwright install webkit firefox`, then `node scripts/predeploy.mjs --browsers=all` (or `--browsers=webkit`; `PW_BROWSERS=webkit,firefox` in the environment does the same). Naming WebKit also runs the phone tests on the real iPhone profile in WebKit. `--project webkit` is Playwright's filter: it runs Safari's engine alone (its desktop tests and, added by the script, its phone tests), with no Chromium and no Chromium phone, so it checks one engine and is not the run before a deploy; the script says so when it starts. An engine named but not installed stops the script before the build, with that install line. Tests that need Chromium's own features (a CDP session, a Chrome profile's text size, a layout-shift reading, `page.pdf`) are listed in `tests/e2e/helpers/engines.ts` or tagged `@chromium`, and are left out of WebKit and Firefox. The run starts only when the local server has answered its front page (`webServer.url`), not when its port opens, so no test pays the server's start. Each browser test that makes a sync vault does so from its own documentation address (`tests/e2e/helpers/address.ts`), so the five-a-day limit per address is never met by accident. It can be run alone with `npm run live-check`, or against a preview with `node scripts/live-check.mjs https://<worker>.workers.dev`. A failure after `wrangler deploy` means the new version is live and wrong: roll back (section 6) before reading further. The first deploy creates the Worker at `cultifolio.<account>.workers.dev`; the custom domain is added once in the dashboard (Workers → cultifolio → Settings → Domains & Routes → add `cultifolio.com`), after which every deploy serves both.

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

The adapter's own cache at the edge answers a repeated public GET by its full URL before the Worker runs. The client names its build in those URLs (`v=<version>`), and an answer is kept only under the build that made it (`src/lib/server/build.ts`), so a deploy is not answered from the old build's copies. What the edge keeps, by URL: a search, a name lookup, an entries or sheets bucket, a window of catalogue rows, the sitemaps and `robots.txt` for a day; a forecast for an hour (five minutes when the NWS refused or did not answer for its alerts); `/api/index` for five minutes; the world maps for a day; the build's own files for a year. Besides those, the Worker's own copies: the name lookups and old-name checks by query for a day, the sheets by bucket for a day, a forecast by rounded site for the hour, a search by query for a day, the front page and species pages as rendered for a minute.

### A cold start's CPU and memory (rounds seventy-three and seventy-six)

Since round seventy-six the first request a fresh copy of the Worker answers reads only what it needs, by name: the manifest, the genera file (21 KB), a name file or two (about 110 KB each), and for a species page its dossier and its genus's row file. It no longer reads the species index (5.8 MB) or builds name maps from it; the first search in that copy reads the index, once, and keeps it. Measured in node on round seventy-two's corpus (`scripts/dev/scale/cold-routes.mjs`): a cold species page took 75 ms and held 5.5 MB, where round seventy-five's took 550 ms and held 45 MB; a cold first search 258 ms and 12 MB, where it was 371 ms and 25 MB. On Cloudflare it has not been measured. Measure it once after a deploy, and again after any round that changes what a cold request reads.

1. Deploy with `npm run deploy`. A deploy starts fresh copies, so the next requests are cold ones.
2. Open a second cmd window in the project folder and type `npx wrangler tail cultifolio --format json > tail.json`. It prints nothing; it writes every request to `tail.json`. Leave it running.
3. In a private browser window open `https://cultifolio.com/species/copiapoa-cinerea`, then the same page again, then `https://cultifolio.com/`, then `https://cultifolio.com/api/search?q=aloe`.
4. Wait ten seconds, go back to the second window and press Ctrl-C (answer `Y` if it asks to end the batch job).
5. Type `node scripts/tail-summary.mjs tail.json`. It prints one line a request: how it ended (`outcome`), its CPU time and its wall time in milliseconds, and the address, then the most CPU any request took. (`findstr /C:"cpuTime" /C:"outcome" tail.json` shows the same, less tidily.)

The first request of a fresh copy has the largest CPU time; the second visit to the same page takes a few milliseconds. Requests can reach more than one copy, so there may be more than one large figure. When to act:

- Any outcome other than `ok`, in particular `exceededCpu` (the browser shows "Error 1102") or `exceededMemory`: act now. Note the address and tell the developer.
- On the Workers Free plan, a request may use 10 ms of CPU, which a cold start cannot meet. Move to Workers Paid before the launch: Cloudflare dashboard → Workers & Pages → Plans.
- On Workers Paid, a request may use 30 s of CPU by default. A cold species page under 300 ms, and a first search under 1,000 ms, need nothing. Over that, write it in the round's notes with the figures `tail-summary.mjs` printed.

If `tail.json` has no `"cpuTime"` lines (an older wrangler), the dashboard shows the same: Workers & Pages → cultifolio → Metrics → CPU time, whose highest percentile is the cold starts.

### The memory test at 50,000 species (round seventy-six)

The scaling study (`docs/SCALE-STUDY.md`, section 2) found that the Worker as it was could not hold the reference past 25,000 to 40,000 species in Cloudflare's 128 MB, and that a Worker that holds no whole-index structure can. This test puts a made-up reference of 50,000 species behind a second copy of the Worker and reads whether Cloudflare ran it in its memory. It uses a bucket and a Worker of their own, `cultifolio-scale`, and never touches the live bucket, the live Worker or its counters. It takes about half an hour, most of it the upload (about 260 MB, 2,300 files). Do it once, after round seventy-six is deployed.

1. **Make the bucket.** In cmd in the project folder: `npx wrangler r2 bucket create cultifolio-scale`
2. **Make the made-up corpus** from the corpus on disk (`static\s\v2`, after round seventy-six's corpus step). Two commands; the second takes a minute or two and prints `50000 species → scale\c50k/s/v2: corpus …`:

   ```
   npx tsx --tsconfig tsconfig.scripts.json scripts/dev/scale/synth-index.ts static/s/v2/index.json 50000 scale/index-50000.json
   node --max-old-space-size=8192 --import tsx scripts/dev/scale/synth-corpus.ts scale/index-50000.json static/s/v2 scale/c50k 7284333 2777724
   ```

   The first 8,945 species are the real ones; the rest are real entries with made-up epithets. Only two species have their data files: Copiapoa cinerea (7284333) and Aloe vera (2777724).
3. **Upload it to the scale bucket**, the files first and the manifest last:

   ```
   rclone copy scale\c50k\s\v2 r2:cultifolio-scale/s/v2 --transfers 32 --checkers 32 --exclude manifest.json --s3-no-check-bucket --stats-one-line --stats 30s
   rclone copy scale\c50k\s\v2\manifest.json r2:cultifolio-scale/s/v2 --s3-no-check-bucket
   ```

   Check the bucket name twice: `cultifolio-scale`, never `cultifolio`.
4. **Deploy the scale Worker**: `npm run build`, then `npx wrangler deploy --config wrangler.scale.jsonc`. Its last lines give its address, `https://cultifolio-scale.<your subdomain>.workers.dev`.
5. **Watch it**: in a second cmd window, `npx wrangler tail cultifolio-scale --format json > tail-scale.json`.
6. **Open, in a private window, one after another**: `<address>/species/copiapoa-cinerea`, `<address>/`, `<address>/api/dossier/7284333`, `<address>/api/search?q=aloe`, and `<address>/species/aloe-vera`. Then wait ten seconds and press Ctrl-C in the second window.
7. **Read it**: `node scripts/tail-summary.mjs tail-scale.json`. Each line says `ok` or, where the copy ran out of memory, `exceededMemory` (the page shows an error). Paste the lines back to the developer. What the developer measured here, in Cloudflare's own runtime run locally (`wrangler dev`, which does not enforce the limit): see `scripts/dev/scale/results/workerd-heap.txt`.
8. **Remove it all**: `npx wrangler delete cultifolio-scale` (answer `y`), then `rclone purge r2:cultifolio-scale`, then `npx wrangler r2 bucket delete cultifolio-scale`, and delete the folder `scale`.

### A test that passed only on its retry: `scripts/flake-check.mjs` (round seventy-five)

The strict run fails when a test passes only on its retry, and does not say whether that test fails one time in five or one time in five hundred. Before reading anything into such a test, or after a round that says it fixed one, run it many times:

1. In a cmd window in the project folder, type `node scripts/flake-check.mjs`. With nothing more, it runs the six tests that were flaky once in round seventy-four (the four still open, and two whose faults were fixed, as checks) in Firefox and WebKit, 20 times each, at two workers, with no retries.
2. Its first lines say what it will run and how long it should take (between one and a half and two hours for the whole list, most of it WebKit's 400-plant backup). It builds and starts its own server, as predeploy does; leave the window open until it ends.
3. At the end it prints one line per test and engine, such as `webkit   r64f 7: on a first visit …  19 passed, 1 failed`, and under it each failure's run number and first line. Send those lines back, with the `test-results` folders that hold a `trace.zip` (a failed Firefox or WebKit test keeps its trace).

To run fewer, name them: `node scripts/flake-check.mjs --engine=firefox --repeat=5 "r62bg 1"` runs one test in Firefox five times (the start of a title is enough; several names may be given). `--engine=` takes `firefox`, `webkit` or `chromium`, `--repeat=` the runs per test, and `--dry-run` prints the plan and the time without running anything. It is not the run before a deploy: it never retries and never stops early, and it exits with 0 only when every run passed. The deploy still waits for `node scripts/predeploy.mjs --tier=app` to pass strictly.

## 4. After the first deploy, once, by hand

Open the site in a private window and walk it: a species you know (the climate, the marker caption, the photographs and their credits), search for a species, add a plant, follow another, `/` shows your list, export a backup, `/about/how`. Then on a phone: the same species page, the climograph legible, no horizontal scroll. Then sync: create a vault on one device, join from the other with the key, edit on both, watch them agree. Then check `npx wrangler tail` for a minute while doing it; the only errors should be the ones you caused.

Then the three things the code cannot do for you: confirm in the dashboard that the R2 bucket is private (no public bucket URL, no r2.dev subdomain), that the KV namespace holds `bytes:` and `rl:` keys after the sync test, which proves the binding is the real one, and that the `cloudflareinsights` check in section 2 prints `0`.

## 5. Refreshing the corpus later

**The corpus step is one command (round seventy-two).** `node scripts/corpus-step.mjs` runs the round's plan (`scripts/corpus-plan.txt`) in order: a backup, the fills, the rebuilds, `--index`, the upload and the live check. Everything it prints also goes to `corpus-step.log` in the project folder, and each finished step is recorded in `corpus-step.json`, so the same command carries on where it stopped. It stops with one sentence and the command to type next. The day's answers of GBIF, Wikidata, Kew and the rest are kept in `cache\upstream\` for that day only, so running it again the same day asks only what did not answer; the folder can be deleted at any time. Type it with `node`, not `npm run`: under `npm run`, Ctrl-C asks "Terminate batch job (Y/N)?" (either answer is safe). The steps below are round seventy-six's, then round seventy-three's; the next section's two rclone lines and `--keep-list` are what the command runs, kept for reference.

### Round seventy-six's corpus step: the Worker without the whole index

**What changes, and why.** Until this round every fresh copy of the Worker read the whole species index (5.8 MB) and built maps of every name from it before it answered its first page: 0.5 s and 43 MB in node, and at 50,000 species more memory than Cloudflare gives a copy (`docs/SCALE-STUDY.md`). The build now writes those maps as small files (the name files `names/`, the catalogue's row files `rows/`, `genera.json`, `featured.json` and the sitemap's files `sitemap/`), and stores in each dossier what the photograph rules made of its Commons files with every name the reference holds (`judged`). A page then reads one or two small files and its dossier; only the search still reads the index. Nothing is asked of any source: the step is one offline re-index, a review, the upload and the live check.

**The order: deploy first, then this step.** Either order is safe, and the code makes it so:

- A Worker of this round, deployed before the upload, finds a manifest without the new files and reads the live corpus as before, through its index (tested: `tests/unit/r76w-lookups.test.ts`, "the fallback").
- The Worker live now, if the upload comes first, reads the new manifest as before and passes by the new files and the new field.

So: `npm run deploy` as in section 3 (its live check runs against the live corpus), then the steps below, then the cold-start measure in section 3. To go back after both, `npx wrangler rollback` is enough: the Worker before reads the new corpus.

**Step 1.** In cmd in the project folder (`cd /d "C:\path\to\AI Work\cultifolio"`), type `node scripts/corpus-step.mjs`. It copies `static\s\v2` to `backups\v2-<the corpus id>`, then runs `--index` (about a minute). Its lines include:

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

**Step 1. Open cmd in the project folder.** The quotes are needed because the folder's path has a space in it.

```
cd /d "C:\path\to\AI Work\cultifolio"
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

The order of operations for a corpus refresh is always: build or fill on the PC, `npm run dossier -- --index`, the upload below. `--index` writes `static/s/v2/index.json` (the names file a rederive reads, and the Worker's fallback when the bucket holds no manifest), `static/s/v2/manifest.json`, and, under `static/s/v2/p/`, each of the build's products as a file named by the md5 of its content: the index again, the entries and the sheets of every bucket, the search's postings (64 files that say which species each short key of a word can match; `src/lib/core/postings.ts`), the short answers (`short.json`: the whole index's first hundred hits for every key of one or two letters, so a first keystroke costs a lookup; round fifty-eight) and the nine catalogues' rows. The manifest maps each product's name to its hash and so to its file; the Worker reads the manifest, takes the corpus id, the bucket count and the index from it, and reads every product of a request from the one manifest it began with. A manifest that does not name every product its counts call for is not adopted (round fifty-eight), so a half-written one leaves the corpus held before in place. The upload needs no deploy: `/api/corpus` reports the manifest's id and every reference request from a device carries it, so the Worker's own cache (the Cache API: held pages for a minute, search answers for a day, both keyed by the corpus id), each device's worker cache and the browser cache turn over on their own (the Worker re-reads the manifest within a minute). Cloudflare's edge does not keep a Worker's answers on its own; only what the Worker puts in the Cache API is kept. Dossiers (`/api/dossier/<key>`) are read from their fixed, overwritten place, not by hash, so they are answered `no-store`.

The upload: everything but the manifest, then the manifest alone, which names a corpus whose files are all there whatever order the first copy landed in:

```
npm run dossier -- --index
rclone copy static\s\v2 r2:cultifolio/s/v2 --transfers 32 --checkers 32 --exclude report.txt --exclude manifest.json --exclude manifest.prev.json --s3-no-check-bucket -P
rclone copy static\s\v2\manifest.json r2:cultifolio/s/v2 --s3-no-check-bucket -P
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

What a corpus that cannot be read does now (round sixty): a manifest this build refuses, on an isolate that holds nothing, falls to the top-level `s/v2/index.json`; if that is missing or not a list too, every page and reference route answers 503 "The reference could not be read just now", and never the four fixture species. A refused manifest is read again after ten minutes, so a product put right under the identical manifest is taken then. An R2 error at the minute's check keeps the corpus held and asks again ten seconds later. A bucket that holds no corpus at all (a dev server's empty local bucket) is still the fixture, which `live-check` fails on.

A schema bump (`DOSSIER_V` in `src/lib/dossier/schema.ts`) changes the prefix to `s/v3/`, needs a rederive (`--offline` is the fast one), an upload to the new prefix, and a deploy; the old prefix can be deleted from the bucket afterwards (`rclone purge r2:cultifolio/s/v2`), never before.

**One operator, one checkout.** The prune below, like the refresh, assumes a single person publishing from a single checkout. Two checkouts publishing to one bucket can each prune a product the other's manifest names (the live manifest is re-read before the delete, which narrows this to a refresh landing in the minutes between the re-read and the delete, but does not close it). If a second operator or machine ever publishes, agree who prunes, or stop pruning (round sixty; the second outside review, B13).

**Pruning the bucket's `p/`.** `--index` keeps the manifest before the current one as `manifest.prev.json` and deletes from `static\s\v2\p` any file neither of the two names, so the folder holds two corpora at most. The bucket keeps what was uploaded until it is told otherwise, and what it may lose is decided by the manifest it serves, not by this checkout (a prune from a second checkout, or after two refreshes in a day, could otherwise delete a file the live manifest names; round fifty-eight). A day or more after a refresh:

```
rclone copyto r2:cultifolio/s/v2/manifest.json live-manifest.json
npm run dossier -- --keep-list live-manifest.json
rclone delete r2:cultifolio/s/v2/p --exclude-from keep.txt --min-age 24h --use-server-modtime --dry-run
rclone copyto r2:cultifolio/s/v2/manifest.json live-manifest.json
npm run dossier -- --keep-list live-manifest.json
rclone delete r2:cultifolio/s/v2/p --exclude-from keep.txt --min-age 24h --use-server-modtime -P
```

`--keep-list` refuses a file the Worker would not accept as a manifest, and lists every file the live one names and every file this checkout's own `manifest.json` and `manifest.prev.json` name, so a corpus built here and uploaded since is kept too. The live manifest is read again just before the real delete, so a refresh that landed while you read the dry run is in the list. `--use-server-modtime` makes `--min-age 24h` mean "uploaded more than a day ago": without it rclone reads the age the file had on the PC, and a product built days before its upload counted as old the moment it landed (round fifty-nine; three reviews). Read the dry run's list before the real `delete`, and run the lines in one sitting. (`copyto`, not `rclone cat >`: PowerShell 5's redirect writes UTF-16.)

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
