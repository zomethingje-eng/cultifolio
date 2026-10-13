# Self-review of round sixty-nine, reviewer E: the server, the sync engine and the harness

Working copy `/tmp/claude-0/rev69/E` (commit `526ecaf`), port 4205, Chromium only. The reproductions are left in the copy as untracked files: `tests/unit/zz-e-review.test.ts`, `tests/unit/zz-e-words.test.ts` and `tests/e2e/zz-e-review.spec.ts`. No source change is left in it; the one fix I tried (finding 1) was reverted after its run.

Nothing in my area puts a wrong fact on a species page, so the ranking starts at what a first visitor would meet.

## Findings

### 1. A tab that reaches /sync by its own link after sync was set up in another tab is configured but never runs, and says "checking now" (confirmed)

**Where.**
- `src/lib/sync/engine.svelte.ts:240-262`: `readInit` configures the engine and hooks its listeners, but schedules no run.
- `src/routes/+layout.svelte:274-275`: the layout schedules the first run, but only on its own mount (`if (sync.configured) sync.schedule(1500)`).
- `src/routes/sync/+page.svelte:39`: the sync page calls `await sync.init()` and schedules nothing.
- `src/lib/db/vault.ts:612-619`: tabs are told of `sync-forgotten`, but no message says that sync was set up.

**What happens.** Tab A is open with no sync record, so its layout's init found nothing. In tab B the grower sets up a vault. Tab A never hears of it. When tab A follows the top bar's Sync link (a move inside the app, so the layout does not mount again), the page's `init` reads the new record and configures the engine. Nobody schedules a run. The status card reads "Not checked yet / last synced just now; checking now", and no request is made until the tab regains focus or the five-minute tick fires. Until that move, tab A's own edits are pushed by no one from tab A: its engine is not configured and `onLocalChange` is not hooked. The same holds after a Stop in another tab followed by a new setup there.

This is section 12's symptom, "checking now" when nothing checks, reached by a path the round-sixty-nine fix does not cover.

**Reproduction.** `tests/e2e/zz-e-review.spec.ts`, test E1:
1. In one context, tab A adds a plant.
2. Tab B creates a vault and reaches "Synced", then closes.
3. Tab A clicks `a.iconbtn.sync`.

On the deployed code, after 15 s:
```
E1 status 15 s later: "STATUS\nNot checked yet\nlast synced just now; checking now"
E1 sync requests in those 15 s: []
```

**Fix.** Add `this.schedule(1500)` at the end of `readInit`'s configured branch, so whoever configures the engine also starts its first run.
- With that one line, E1 passes: "Synced", one `GET /api/sync/log`.
- The 9 engine unit files (105 tests, `r69-sync-init` among them) still pass.
- It also makes the layout's own schedule, and the race section 12 fixed, unnecessary.

Separately, `setup` could announce `sync-set-up`, so other tabs call `init` at once.

### 2. Sync's failure words: a 429 is "The server is busy", a bare 5xx is "refused", and the day's upload allowance is cut to ten minutes and paid for with a photograph each time (words confirmed; the re-sending read)

**Where.**
- `src/lib/sync/engine.svelte.ts:723-728` (`limited`): every 429 becomes "the server asked this device to wait N s before syncing again". The server's own sentence is thrown away, and `N` is capped at 600.
- `src/lib/ui/sync-words.ts:23`: that message is turned into "The server is busy and asked this device to wait 600 seconds."
- `src/lib/ui/sync-words.ts:15`: `push failed: 5xx` reads "The server refused a change from this device (502)".

**What happens.**
- **Rule 2, both ways.** A 429 is a refusal. It comes from the address's or the network's request window, or from `DayQuota` ("the upload allowance for this address is used up for today"). The page says the server is "busy", not that it refused. A bare 500, 502 or 504 (a Worker that threw, Cloudflare's own 502) is not a refusal, yet it is said as one. W6's own reading for the reference (`failureKind`) calls that case `unreachable`, "did not answer".
- **The day's allowance.** `DayQuota` sends Retry-After to midnight UTC. The engine waits 600 s and tries again, all day. Each try is a photo PUT whose body is read in full before the address's day is checked (the photo route reads the body, then `storeOnce`, then `storeCountedNow`, then `DayQuota`). So a grower whose first sync passes 3 GB in a day uploads one more whole photograph every ten minutes until midnight, on mobile data as well. The page meanwhile says the server is busy.

**Reproduction.** `tests/unit/zz-e-words.test.ts` prints:
```
"The server refused a change from this device (502). It is kept here and tried again at the next sync."
"The server is busy and asked this device to wait 600 seconds. Your changes are kept here; it syncs again then."
```
The engine's messages are quoted from lines 724-725 and 874. `DayQuota.response()` is at `sync.ts:648-650`, with Retry-After `untilMidnight`.

**Fix.**
- In `limited`, keep the server's `error` text.
- Word a 429 as a refusal: "The server refused uploads from this address for now: …".
- Treat a Retry-After over 600 s as `refusedBy` does: store the refusal, capped at an hour, so no photograph is sent to be refused again before then.
- In `syncWords`, read `push failed: 5xx` as "did not answer", the way `failureKind` already reads it for the reference.

### 3. A DELETE without the proof, on a removed photograph, takes the name's hold: the W4 class on the other route (confirmed)

**Where.** `src/lib/server/sync.ts:109-114`.
- `deleteCounted` answers `noproof` before the hold only when `first`, the object the pointer names, exists.
- For a removed photograph the pointer holds a receipt and `first` is null, so any DELETE goes into `withHold`, proof or none.
- Inside the hold it reads the pointer and lists the generations (`dropStrays`, line 121) before it answers 404.

**What happens.** Section 6 (W4) says an upload whose proof does not match "holds the photograph's name for no time at all, so it cannot keep a removal waiting". A holder of the token alone can still hold a removed photograph's name, by DELETE, as often as the rate window allows (3,000 per ten minutes per address). Meanwhile the grower's own revival of that photograph (an Undo past ten minutes, or an edit on another device) is answered 503 "busy". This is the same denial W4 closed for PUT.

**Reproduction.** `tests/unit/zz-e-review.test.ts`, "a DELETE without the proof on a removed photograph takes the hold":
1. The owner stores a photograph, then removes it.
2. A DELETE with the stranger's proof is stalled inside its listing.
3. The vault's object recorded one hold given, `{ ok: true }`.
4. The owner's re-store with the right proof, made meanwhile, is a `PhotoBusy`.

**Fix.** Before `withHold`, when nothing is there, answer at once unless the request's proof matches the pointer's receipt:
```ts
if (!first && !(photo && pre.ref.removed?.drop && proof === pre.ref.removed.drop)) return false;
```
A removal cut off partway is still finished by its own device, which carries the matching proof. Strays left by an upload are still swept by the vault's alarm.

### 4. Two server specs take their vault's place from 127.0.0.1's /24: a network is still shared, and the eleventh place in a day fails (confirmed)

**Where.**
- `tests/e2e/r62s-server.spec.ts:24,31` and `tests/e2e/r62bs-server.spec.ts:18,24`: each creates its vault from `docAddress()`, but sends the first PUT with no `cf-connecting-ip`.
- Since round sixty-seven the place is taken at the first stored object (`admitVault`, then `fill`), counted to `upstreamNetwork(127.0.0.1)`, which is 127.0.0.0/24, ten a day.
- The guard `tests/unit/r62bh-vault-addresses.test.ts:16` (`MAKES`) checks only the creation, so it passes these specs.

**Reproduction.** Run the two tests twelve times on one server:
```
PW_PORT=4205 … npx playwright test tests/e2e/r62s-server.spec.ts tests/e2e/r62bs-server.spec.ts --project chromium --repeat-each 6 --retries 0 -g "removed photograph|claim on a first"
```
Result: 10 passed, then 2 failed, `Expected: 200, Received: 503` at the first PUT. That is the network's ten places. A full `--browsers=all` run spends 6 of the ten (2 specs, 3 desktop projects) and each retry one more. A second run on a server kept with `PW_REUSE=1`, or a rerun of these specs the same day, fails. This is section 11's failure, by another door.

**Fix.**
- Send `docAddress()`'s address on every request of these two tests: a `headers` object built once, or `fromAddress` on the request context.
- Widen the guard to any test that stores a batch or a photograph (`request.put(` or `request.post(` to `/api/sync/(log|photo)`).

### 5. The per-address limit test cannot pass on its own retry (confirmed)

**Where.** `tests/e2e/helpers/address.ts:42-45`. `limitAddress()` depends only on the run's salt and the project. A retry (the config's `retries: 1`) or a repeat therefore gets the address whose five vaults the first attempt already spent.

**Reproduction.** Run smoke's "five new vaults a day" test with `--repeat-each 2 --retries 0`. The second attempt fails at once: `a new vault from 2001:db8:2131::1 … Expected: 200, Received: 429`. A first attempt that fails for a passing reason (workerd's broken pipe, which is what the retry is for) is therefore always reported as a second, different failure.

**Fix.** Fold in `test.info().retry` and `test.info().repeatEachIndex`, for example `hex((salt + p * 16 + retry * 4 + repeat) & 0xffff)`.

### 6. Section 11's harness fix has no guard; section 12's has one (confirmed)

- **Section 11 reverted.** I set `docAddress()` back to the old /24 (`198.51.100.${randomInt(256)}`). `r62bh-vault-addresses` and `r69p-harness` both stay green (60 of 60). No unit test reads the helper's output. A strict Chromium run would not notice either, since Chromium and the phone stay under ten places a day. Only the all-engines run catches it, and only by running out of places. A unit check would close this: draw a few thousand `docAddress()` values and require distinct `networkKey`s outside every /24 the server counts.
- **Section 12 reverted.** `init` returning without waiting (`if (this.initing) return;`) fails `r69-sync-init` ("expected false to be true"), as section 12 says.
- **W5 reverted.** The hour's check in `take` turned off fails W5's test.

### 7. The listing budget doubles at the turn of the hour (confirmed; low)

**Where.** `src/lib/server/counters.ts:400-418`. A walk reserves its 50 pages in the hour it is asked, and `listed` settles nothing in a later hour.

**Reproduction.** `tests/unit/zz-e-review.test.ts`, "the listing budget at the hour's turn": 30 asks at 12:59:59.9 and 30 at 13:00:00.1 let **48 walks, 2,400 pages, start within 0.2 s**.

Section 6 says an hour "ends at no more than 1,249 pages". That is true of the counter's hour, not of any sixty minutes. The bound per vault is about twice the stated one, which is the usual cost of a fixed window. Either say "per clock hour" on `/about/formats`, or count a reservation in both hours when it is asked in the hour's last minute.

## Checked and sound

- **W1, read and run.**
  - **What is kept.** Every key the counter objects write:
    - `ip:`, `net:`, `day:`, `pn:`, `fn:`, `o:`, `e:`, `d:`, `g:`, `c:`, `p:`, `h:`, `f:`, `u:`, `s:`;
    - each vault object's `v`, `gen`, `l` and `w`;
    - the places, which hold only `{ d, w }` once mended;
    - in KV: `rl:` (TTL twice the window), `ipbytes:` and `vaults:` (expire at the end of the next day), `ops:vaults:`, `ops:faults:` and `vaultplace:` (a day only);
    - in R2, the metadata `sha`, `plain`, `device` (a device id) and `drop`, and `meta.json`.

    Nothing address-shaped outlives its day. `mend` strips `n` from round sixty-seven and sixty-eight places once their day is past, and `touch` keeps `n` only until then.
  - **Tests.** `r69w-server` and `counters.test.ts`: 35 of 35 with my file.
  - **Logs.** Workers Logs are off, and no `console.*` line in `sync.ts` or the routes prints an address.
- **W3.**
  - **Worker cache keys.** All five keys go through `workerKey` with `$app/environment`'s `version`, a build timestamp, since `svelte.config.js` names none.
  - **A forged or missing `v=`.** It reaches only the adapter's public copy, through `forBuild`. A foreign `v` is `no-store`. A missing one is cached under a URL no page asks for.
  - **Corpus.** The old-name check applies the corpus after the cached GBIF answer.
  - **Disclosed.** The cached 404 and 302 under the page's address, and the service worker's `cultifolio-corpus` (by corpus, not build), are both on `/about/how`.
- **W4 on the PUT route.** The same bytes with a stranger's proof are `same` with no hold. A removed name without its proof is 403 before the hold. A no-proof DELETE of a live photograph is `noproof` before the hold. I found no way, with the token alone, to remove a photograph or to make the sweep delete a named generation. The sweep and `dropStrays` write the pointer back before deleting, so an upload stalled past its hold fails its condition and takes its own generation off. That is the R46-31 test, which passes.
- **W5.**
  - **Exceeding it.** `take` checks and counts in one step, inside the object's input gate. The only R2 writes outside it are pointer writes, made by a key-holder's claim, and meta writes, which are bounded.
  - **A first sync.** A grower with more than 3,600 photographs is refused at the 3,601st object with W's sentence. The page says when it asks again. The refusal is kept in the record, capped at an hour, and the run is rescheduled for then, so it recovers without the grower doing anything. Pulls carry on.
- **The engine after section 12.**
  - **No deadlock.** Both callers await `collection.load()` before `init`, and `readInit` awaits nothing that waits on `init`.
  - **Another tab's Stop during a first init.** The notice is missed, but the first run's `save` fails `setMetaIfKey` and drops the engine. `appendChanges` checks the key, so nothing reaches the old vault.
  - **Back from another site** (test E2). The page is not restored from the back-forward cache (`pageshow.persisted` false, navigation type `back_forward`). It loads again and runs once.
- **Wording outside sync.** Spot-checked:
  - `reach-words.ts`, `failureKind`;
  - the picker's `/api/names` handling (400, 429 and held 503 are "not asked"; GBIF's 429 or 403 is "GBIF refused");
  - the forecast route's `refusedBy` and `notAnswered`.

  All agree with rule 2.
- **The random /48 helper.** It draws 12 + 16 bits under 3fff:0000::/20, and the server's `addressKey` and `networkKey` read `3fff:5:1a2b::1` as `3fff:5:1a2b::/48`. Collisions in a run are negligible, and every count stays under its limit even on a collision. The limit test's 2001:db8 addresses are apart from it, but see finding 5.

## Not done

- WebKit and Firefox are not installed here.
- A phone tab brought back after hours was checked only by reading: the five-minute interval, `visibilitychange` and `focus` each schedule once the engine is configured.
- Recount walks (`recount`, up to 100 list calls, from a vault open or a day's first take) are not counted against the listing budget. They are bounded per hour by `RECOUNT_MS` and the day's row. I did not try to keep a row unset by crossing every listing with landings.
- No probe of the live site. The forecast, sheets and search client pages were spot-checked, not read line by line.
