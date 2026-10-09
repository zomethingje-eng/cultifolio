# Self-review of round sixty-one: server

**Covered.** I read `sync.ts`, `counters.ts`, `synonyms.ts`, the search-charge change in `dossiers.ts`, `hooks.server.ts`, the sync, names and forecast routes, `weather/client.ts`, `ui/frost.svelte.ts`, the engine's handling of 409/503 and the persisted refusal, `DEPLOY.md`, and the about-page sentences that describe them. I did every probe in the review brief's server section.

**How.**
- I wrote 18 tests in four files: 5 reproductions that fail on f4ab4f8 and 13 guards that pass. They use the round's own fakes (`fake-sync.ts` `countersNs`/`fakeR2`, `r61s-fake.ts` `pagedStorage`, and the engine harness of `r61h-engine-refusal.test.ts`).
- On the shared server I ran curl against the redirect and the names route, and one Playwright run on the species picker.
- I ran 63 single-line mutations of the round's fixes against the server-area unit files (56 server and client, 7 engine). The round's own tests killed 47 and let 16 through. My guards kill 10 of the 16; the other 6 are equivalent or redundant (table below).
- The server-area files (19 files, 172 tests plus the 1 expected fail) pass in my copy before any mutation.

**Conclusion.** The photo-removal rule, the proof-first check, the fence and the recount check hold up under every interleaving I could build. What is wrong is at the edges:
- a refusal of the site's own that the species picker words as GBIF's silence. This one a grower meets on day one, with any field number.
- a reclaim cycle that lets pre-round-58 vaults hold a place uncounted;
- the species 404's GBIF calls, which escape the per-address part;
- a lease-lapse path where a count still drifts;
- an engine refusal that outlives its hour when the device clock goes back.

One test gap matters most. Nothing in the round's tests holds the proof check inside the removal's hold (mutation P2). Without that line, the bearer token alone deletes a photograph whose first upload lands during a proof-less DELETE. My guard now holds it.

## Findings

### 1. P1, confirmed. The species picker says "The name service did not answer" when this site refused the name itself

**Where:** `src/routes/api/names/+server.ts:35` and `:45`; `src/lib/ui/SpeciesPicker.svelte:54`, `:239`, `:240`.

**What happens:** The names route answers 400 to any query with a digit in it. The picker sends the parsed scientific part, which keeps field and collection numbers:

| Typed | Sent | Route answers |
|---|---|---|
| "Copiapoa cinerea KK 1234" | "Copiapoa cinerea KK 1234" | 400 |
| "Lithops lesliei C036" | the same | 400 |
| "Gymnocalycium sp. LB 2091" | the same | 400 |
| "Aloe sp. 123" | the same | 400 |

The picker's classifier turns every answer without `held: true` into "The name service did not answer, so only the reference's own species are offered". The route's own rate-limit 429 goes the same way ("too many requests from this address", no `held`); an office or a club behind one address can reach it (300 per ten minutes).

In both cases GBIF was never asked: the site refused. Rule 2 says a refusal is said as a refusal and a call the site held back is "not asked". Field numbers are routine on cactus and succulent labels, so a grower meets this on the first plants they add.

This is not new in round sixty-one: the 400 and the classifier both predate it. But the round set out to make every held path say "not asked", and these two paths were missed.

**Reproduction:**
- `curl "http://127.0.0.1:4173/api/names?q=Copiapoa%20cinerea%20KK%201234"` answers `400 {"error":"a name is letters, spaces, periods, apostrophes, hyphens and ×"}`.
- A Playwright run typed the same name on `/plants/new`. The one request seen was `400 Copiapoa cinerea KK 1234`, and the hint reads "The name service did not answer, so only the reference's own species are offered; …". Screenshot: `shots/server/picker-field-number.png`.
- The 429 case: `server--review.test.ts`, "a 429 from the route itself carries something the picker can word as a refusal". It sends 301 requests from one address, spread so GBIF's per-minute part is never reached. The 301st answers 429 "too many requests", with no `held`. The test FAILS.

**Smallest fix:**
- In the picker, send only the name part: the words before the first token with a digit. The field number is not a name, and GBIF's suggest would not use it anyway.
- Word a 400 as "The name service was not asked: what is typed is not a name it can look up".
- Word any 429 as "not asked: this site asked this device to wait", by status, whatever `held` says.

### 2. P2, confirmed. A pre-round-58 vault whose place is reclaimed takes it back uncounted, every time

**Where:**
- `src/lib/server/sync.ts:1010` (`touch(..., meta.filled === undefined, now)`);
- `src/lib/server/counters.ts:304-307` (the `legacy` branch);
- `docs/DEPLOY.md` ("is recorded at its first upload after the deploy and not counted again").

**What happens:**
- A vault whose meta has no `filled` is "adopted" by `touch`: `f:` is written and `all` is not raised, since the seed already counted it. That is right the first time.
- Nothing ever writes `filled` into a legacy meta: `landed()` and `unadmit()` act only on `filled === false`.
- So after 90 idle days the sweep reclaims the place (`all - 1`), and the vault's next upload is "adopted" again, for free. It holds a place that `all` does not count. Each such cycle lowers `all` by one, and the 2,000 ceiling can be passed by that many.

**Read, the same root:** a legacy vault that never uploads after the deploy never gets an `f:` entry. Its place in the seeded `all` can never be reclaimed.

**Reproduction:** `server--review.test.ts`, "a legacy vault reclaimed after 90 days is counted again when it comes back":
- seed `vaults:all = 1`, a legacy meta, one upload: `all` is 1;
- sweep at day 92: `all` is 0;
- upload at day 93: `[all, f:] = [0, true]`, expected `[1, true]`. FAILS.

**Smallest fix:** in `touchVault`, after `'adopted'`, set `meta.filled = true` and write the meta. The legacy reading is then used once, and the vault's next reclaim is counted on its return like any other.

Nobody uses sync yet, so production should hold few or no such vaults. That is why this is P2 rather than P1.

### 3. P2, confirmed. The species 404's old-name check is outside the per-address part, so one address takes a fifth of GBIF's share

**Where:**
- `src/lib/server/synonyms.ts:69` (`upstreamAllowed(platform)`, no address);
- `src/routes/species/[slug]/+page.server.ts:49` (the `match` bucket, 60 per ten minutes per address).

**What happens:** `/about/how` and DEPLOY.md say one address may take a tenth of a share in a minute. Two routes spend GBIF calls:
- the names route charges them to the address (60 a minute);
- the 404's old-name check charges them to the site alone, and only the `match` bucket limits it (60 per ten minutes, all of which can fall in one minute).

So one IPv4 address takes 120 of GBIF's 600 in a minute, and one IPv6 /48 takes 240 + 240 = 480.

**What it costs to hold a share spent**, from the code's own limits:
- **GBIF:** 5 IPv4 addresses or 2 /48s spend it for a minute. About 17 addresses or 5 /48s hold it spent continuously: the names bucket allows 30 a minute sustained per address and 120 per /48, and the 404 path adds 6 and 24.
- **MET Norway:** the forecast bucket (60 per ten minutes per address) binds before the upstream part. Holding it spent takes about 100 IPv4 addresses or 25 /48s.
- **The NWS:** the same as MET, but a US point that finds only the NWS share spent is refused whole, MET included (see suggestion 1).

The site then says "not asked", which is honest. GBIF is the cheap one.

**Reproduction:** `server--review.test.ts`, "one address spends at most a tenth of GBIF's share in a minute, whichever route asks". It makes 60 `upstreamCall(['gbif'], '1.2.3.4')` calls, then 60 `synonymOf` lookups through the same counter object: 120 GBIF calls. FAILS (expected at most 60).

**Smallest fix:** pass the reader's address into `synonymOf` (`clientIp(getClientAddress)` from the page) and call `upstreamCall(platform, ['gbif'], ip)`. The `match` bucket can stay as it is.

### 4. P3, confirmed. A landing whose lease had lapsed does not bump the generation, so a listing it crossed is committed, and its bytes go uncounted until the next day's listing

**Where:** `src/lib/server/counters.ts:182-193` (`release`: `if (!l) return;` before the generation bump).

**What happens:** Round sixty-one made a lapsed lease mark the total stale (B14), so the next request lists the bucket.

If the upload behind that lease then lands, `release(lease, true)` finds no lease and returns before bumping `gen`. A listing taken before that landing and committed after it passes the generation check, so the landed bytes are missing from the total. The same holds when the listing is committed before the landing.

The total is put right at the next day's listing. Every other path keeps the rule that a landing is never erased.

A lease lapses after ten minutes, and the take comes after the body is read, so this needs an R2 put that stalls for minutes. Rare.

**Reproduction:** `server--review.test.ts`, "a listing crossed by a landing whose lease lapsed is refused":
1. `take` 100 bytes at T.
2. At T+11 min, a `take` gets `recount`; the generation is read.
3. The slow upload's `release(lease, true)` runs.
4. `take` with the listing (0) and the generation is accepted with `before: 0`.

FAILS (expected `{ recount: true }`).

**Smallest fix:** in `release`, when the lease is gone and `landed` is true, still bump `gen` and mark the row stale.

### 5. P3, confirmed. A persisted 503 refusal outlives its hour when the device clock is set back

**Where:** `src/lib/sync/engine.svelte.ts:616-619` (`readRefusal`).

**What happens:** `refusedBy` stores `until` capped at an hour ahead. `readRefusal` caps it again at "an hour from now" on every read, but never stores the capped value.

When the clock goes back a day (a wrong phone clock corrected by the network, or a manual change), the stored `until` stays a day ahead. Each run reads "an hour from now" again, so uploads wait a day and an hour, not the hour the comment and `/about/formats` promise. Receiving goes on, so nothing is lost, but the outbox waits.

**Reproduction:** `server--engine-refusal.test.ts`, "a refusal stored before the clock went back a day lapses an hour later on the new clock":
1. Refuse the vault with places full.
2. Free a place, then set the clock back a day.
3. One hour and two minutes later on the new clock, a run sends no batch.

FAILS.

**Smallest fix:** in `readRefusal`, when `r.until > now + 3600_000`, write `m.refusal.until = now + 3600_000` back, so the cap holds.

### 6. P3, read. On a place page, a held forecast promises "it is asked again in a few minutes" and is never asked again

**Where:** `src/routes/places/[id]/+page.svelte:291-298`; the sentence is from `src/lib/weather/client.ts:150`.

**What happens:** The frost watch re-asks a held call after a minute, and the Today tab follows it through `frost.readAt`. The place page's effect runs once per `condKey`, and an error leaves `got` null with nothing to re-run it. So a place with its own coordinates keeps "Forecast not checked: … it is asked again in a few minutes" until the page is reopened.

**Smallest fix:** when `r.held`, re-run after `retryAfter` (a timer that bumps a reactive counter read by the effect). Or let that page say "asked again when this page is next opened", as the 502 sentence does.

### 7. P3, read. The picker words an address's own cap (429, `held: true`) as the whole site's calls being used up

**Where:** `src/lib/ui/SpeciesPicker.svelte:54`, `:239`, `:240`.

**What happens:** `heldBack` answers 429 `HELD_BACK_ADDRESS` ("this address has used its part …") when one address has used its tenth. The picker shows "this site's calls to it are used up for this minute", which is not what happened, though it is still "not asked". The species 404 cannot reach this case: it has no address part (finding 3).

**Smallest fix:** show the server's own `error` after "The name service was not asked:".

### 8. P3, read. The residual race is two calls, not "that one call"

**Where:** `src/lib/server/sync.ts:92-96`; the `/about/formats` sentence "which narrows this to that one call"; DEPLOY.md ("an R2 delete call that itself stalls for over a minute").

**What happens:** The fence renews the hold and then makes two R2 calls, the re-read `head` and the `delete`. A replacement can land in the gap if the two together take over a minute; the `delete` alone need not. `it.fails` covers only the stalled delete.

**Smallest fix:** say "its last look and its delete, together, take over a minute". Or move the `fence()` call after the re-read `head`, renewing the hold just before the delete, so the words become true.

### 9. P3, read. Joining or opening a vault shows "It tries again shortly" for a crossed recount, and does not try again

**Where:** `src/lib/sync/engine.svelte.ts:286-294` (`setup`); `RecountCrossed.response()` in `sync.ts:489`.

**What happens:** `POST /api/sync/vault` can answer `RecountCrossed`: an open lists the vault when its last listing is over an hour old, so another device in a long first push can cross it twice. `setup` throws the server's sentence as the error. Nothing retries; the grower must press Join again.

**Smallest fix:** in `setup`, on a 503 whose Retry-After is at most 60, wait it out and post once more. Or give the vault routes their own sentence ("try again in half a minute").

### 10. P3, read. "At most hourly" holds per tab only

**Where:** `src/lib/sync/engine.svelte.ts:403` (`asked409`, in memory) and `:1154`; `/about/how` ("the device asks again later, at most hourly").

**What happens:** A reload, or a second tab, asks every 409'd photograph again at its first run. It is a few requests per photograph per open, not harmful, but the sentence is about the device.

**Smallest fix:** keep `asked409` in the sync record beside `refusal`. Or say "at most hourly while a page is open".

### 11. P3, read. The 90-day clock starts only if the `vaults` object wakes

**Where:**
- `src/lib/server/counters.ts:293-313` (`touch`'s `'already'` path writes `w` but never calls `wake`);
- DEPLOY.md ("places recorded before round sixty-one start their 90 days at the first midnight after the deploy").

**What happens:** Under round sixty, the `vaults` object re-armed its alarm only while `ip:`, `net:` or `day:` keys remained. If no vault was created in the two days before the deploy, it has no alarm, and `touch` of existing vaults does not set one. Then nothing gets `w` and nothing is reclaimed until the next creation or first upload calls `wake`. This is harmless once anyone creates a vault, but the DEPLOY sentence is conditional on it.

**Smallest fix:** call `this.wake(now)` in `touch` whenever it writes.

## Mutations of the round's fixes

Each mutation was run against the server-area files that cover it. A kill caused only by an unrelated test that times out under load (`server-r60` "every bucket … stops a /48", seen twice) was run again on clean files; P2 and R7 are those re-runs.

**Killed by the round's tests (47):**

| Area | Mutations killed |
|---|---|
| Removal | P1 the early proof check; P3 the fence call; P5 a re-read that found nothing answered `true`; P6 a fence that ignores the renewal; P7 `renew` without its token check; P8 a claim on "same" with any proof; P10 the busy wait leaking the hold's time; P11 `>=` in the claim test; P12 claims never swept by day |
| Recount | R1 and R2 (the retry unchecked); R3 crossed treated as full; R4 one try; R5 no `markStale` on a lapsed lease; R6 none in the sweep; R9 `refusal()` missing `RecountCrossed` |
| Admission and places | A2 `landed` without `fill`; A3 `landed` without the meta write; A4 the KV place key unchecked; A5 the KV day not given back; A7 a legacy vault counted; A8 `>` for `>=` in `touch`; A9 `touch` not updating `w`; A10 no reclaimed refusal; A12 the once-a-day cache off |
| Sweep | S1 `<=` in the reclaim test; S4 no 90-day start; S5 no `all` give-back; S6 `f:` not re-arming the alarm; S7 the cursor never deleted |
| Cap | U1 no /48 check; U2 a fifth for a tenth; U4 a US forecast as MET only; U5 a held site share said as 429; U7 the names route uncapped; U8 the names route without its address; U9 `'held'` said as `'unchecked'`; U10 `forecastRefusal` ignoring `held`; U13 `upstreamAllowed` always true; U14 the share tripled |
| Other | H1 the redirect without its security headers; D1 per-pass charging |
| Engine | E1 a 409 asked every run; E2 a 409 taken as final; E3 a refusal never persisted; E4 not kept in the meta; E6 the write cap a day |

**Survived the round's tests, killed by mine (10):**

| Mutation | What it shows | Killed by |
|---|---|---|
| **P2** the proof check inside the hold removed | **The one that matters.** A DELETE with no proof whose unheld look finds nothing goes on to take the hold. An upload that lands in between is then deleted by the bearer token alone. | `server--review.test.ts`, "a DELETE without the proof, racing a first upload, removes nothing" |
| R7 the removal rethrows a crossed recount | | `server--guards.test.ts` |
| R8 `RECOUNT_RETRY_S` 30 to 60 | The engine would then keep it as an hour's refusal. | `server--guards.test.ts` |
| A11 `touch` fails closed | A placed vault refused during a counter outage. | `server--guards.test.ts` |
| S2 no give-back when a run stops short | | `server--guards.test.ts` |
| S3 no cursor | Kept keys past the budget meant stale ones were never reached. | `server--guards.test.ts` |
| U3 a call counts only its first service | The NWS was never spent. | `server--guards.test.ts` |
| U6 the KV fallback's address part removed | | `server--guards.test.ts` |
| U11 the forecast client drops `held` | Every held 503 would read "could not be reached". | `server--guards.test.ts` |
| U12 the frost watch's one-minute re-ask removed | | `server--frost-held.test.ts` |

**Left as they are (6):**
- **P4** (the version re-read after a successful renewal): equivalent while holds work. Every replacement goes through a hold, which fails the renewal first.
- **P9** (a claim on the "same" fallback after a failed conditional put): unreachable under the hold.
- **A1** (`unadmit`'s in-flight check) and **A6** (`unadmit` writing `filled`): redundant with `landed()`, which takes the place again and writes `filled` at every first landing.
- **E5** (the read cap): it does not hold anyway (finding 5).
- **E7** (the refusal cleared on an accepted batch): a stored refusal blocks uploads until it lapses, and `waitRefusal` then clears it.

## Checked and sound

**Proof first.**
- A DELETE without the proof gets the same 403 whatever `X-Photo-Removed-At` it sends. On an existing object it never takes the hold: `r61s-photo-removal` binary-searches the claim time and finds nothing.
- One exception: for a name that holds nothing, a proof-less DELETE does take the hold for one `head`. That needs the photograph id, which a holder of the token alone cannot read.
- 403 against 404 reveals only existence, which `HEAD` already gives the token.

**Undeletable by claims.** A holder of the token alone cannot plant a claim:
- re-PUTting the stored bytes with another proof is "same" with no claim;
- different bytes are "different".

They can store under a name that is already removed, with their own proof. That is adding, which the token allows anyway.

A key-holder can refresh a claim by re-PUTting with the right proof. No honest path re-PUTs a stored photograph: `verifyPhotos` HEADs, and `noteRevived` acts only on revivals.

**A late first upload.** It is removed at most 48 h after its claim (the `c:` sweep keeps today and yesterday), at the next DELETE any device sends. Two cases:
- The removal came after the upload: the removing device got 409 and asks hourly.
- The removal came first (404, marked done): the uploading device asks itself once it folds the removal, since a run pushes before it pulls. That DELETE finds its own claim (409) and goes through once the claim lapses.

**The upload side is not fenced, and needs no fence.** An upload that stalls past its hold lets a removal see nothing (404). Its own `unhold` then records no claim, so the next DELETE removes it. Guard: "an upload whose put stalls past its hold …" PASSES.

**The fence.** A hold that lapsed and was taken or freed fails `renew` (token mismatch): the B10 "look stalled" case answers 503 and keeps the revival. The version re-read after a successful renew is unreachable while holds work; see mutation P4.

**Recounts.**
- Both tries pass the generation, in `vaultBytes` and in `take`'s retry.
- Two crossings throw `RecountCrossed` on the open, GET, push and photo routes. Guard: a crossed open writes nothing and throws.
- A removal on a day with no row swallows it, and the delete stands.
- `take` reads the leases before the row, so a lapsed lease makes the same request list.

**The sweep.**
- Each page's deletions, the `w` starts and the `all` give-back are applied before a run stops.
- The cursor is saved only in the prefix where the run stopped, and each run makes progress. A run cut short leaves no counter wrong; it only delays the rest by a second.
- `c:` and `f:` re-arm the alarm.

**The existing-data assumption.** `filled` and `f:` arrived together in round fifty-nine (REVIEW-ROUND-59 items 1-2), and production has bound the object since. So `filled: true` without `f:` comes only from round sixty's server-5 race, and counting those vaults is right. The legacy case is finding 2.

**The KV fallback.** It counts a vault once by `vaultplace:<id>`, and gives back the day by the stored day. Concurrent first uploads can lose an increment (read then write); DEPLOY calls this rough.

**The cap.**
- Shares are separate, and a call takes all of its services or none (in the object).
- The /48 is checked at four tenths. Retry-After runs to the next minute.
- Forecast: 503 or 429 `held: true`, no-store.
- The frost line, the Today tab and the place page word a held 503 as "not asked".
- The frost watch re-asks after a minute, at its next look.
- The species 404 says "not checked: this site's calls to GBIF are used up for this minute".
- The names route's held 503 shows "was not asked" in the picker.

**Engine.**
- A DELETE 409 is never pushed onto `photosDropped`, and is asked again after the hour. Guard: `server--engine-refusal.test.ts`, "is not pushed onto photosDropped, and is asked again after the hour".
- A 503 under a minute (RecountCrossed 30 s, PhotoBusy 10 s) is not persisted; the run is rescheduled for then.
- A refusal of a minute or more is persisted, capped at the hour on write, and cleared by any accepted upload.
- Pulls go on throughout.

**The redirects.** `curl -I /benches/x?y=1` gives 301 `Location: /places/x?y=1` with HSTS, Permissions-Policy, Referrer-Policy, nosniff and XFO.

**Search charging (`dossiers.ts`).**
- The candidates of both passes are summed against one threshold.
- `charge` is memoised, so a request is charged once however many checks pass the line.

**`removedAt`.** The server's five-minute tolerance equals `MAX_AHEAD_MS` on the device, so an honest HLC wall is never discarded.

## Suggestions (not bugs), ranked

1. **A US forecast with only the NWS share spent.** Fetch MET's forecast and mark the alerts "not asked" (an `alertsStatus: 'held'`), rather than refusing the whole forecast. Today, spending the NWS share alone, which serves only US points, takes MET's forecast away from every US grower for the minute.
2. **The refusal for a reclaimed vault.** Say what still works and when it is asked again: "… Receiving from your other devices goes on; this device asks again within the hour." A grower back from a long trip reads the current sentence once and does not know whether to act.
3. **One cap path for the species 404.** Give the old-name check the same `upstreamCall(..., ip)` as the names route (finding 3), so `upstreamAllowed` can go.
