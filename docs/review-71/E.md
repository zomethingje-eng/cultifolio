# Round seventy-one, agent E: the server, sync, weather and the harness

Working copy `(scratch)`, branch `r71`, commit `d098c79` on `r71base` (`cb05efd`). Port 4405. The finding numbers are my report's (`review-70/self-E.md`), which the triage names S-E1 to S-E9.

## Done

**S-E1. The Bering Sea's Alaskan islands are asked of the National Weather Service (`weather/forecast.ts`, `isUS`).**
- **Before.** The Alaska box stopped at 170° W, and the Aleutians' box west of it stopped at 55.5° N. Gambell, Savoonga (St Lawrence Island) and St Paul (Pribilofs) fell between the two boxes. They were never asked, and were told the NWS "does not cover" them.
- **Now.** The Alaska box runs to the antimeridian (`lon > -180 && lon < -129.9`). The antimeridian box keeps only the Aleutians west of 180° (`lon >= 172`).
- **Checked against the NWS.** Points in Chukotka east of 180° now fall inside the box, and the NWS answers them 400 "out of bounds" (checked: 65.5, -175). The route already reads that answer as no alerts service (`n/a`). Gambell and St Paul answer 200.
- **Test.** `r71e-alerts.test.ts`. On the base: `expected false to be true` for all three places. A guard covers the places already asked and five abroad (Kamchatka, Hokkaido, Midway, Chukotka west of 180°).

**S-E2. A listing is settled even if the client leaves (`routes/api/sync/log/+server.ts`; comment in `server/sync.ts`).**
- **Before.** The settle ran in `listBatches`' `finally`, inside the request. A request the client left could end before it ran. The reservation then lapsed after a minute and its pages were counted nowhere: about 72,000 pages an hour by asking once a second and leaving.
- **Now.** The GET hands the listing promise to `platform.context.waitUntil` before awaiting it, so the walk and its settle outlive the client.
- **Kept from round seventy.** The one-minute lapse (W6) stays for a Worker that really stops.
- **Test.** `r71e-server.test.ts`, E2. The route is called, and its response is never awaited. Only the promise handed to `waitUntil` is run, and it alone settles the reservation (`l.r` empty, one page counted). On the base: `expected +0 to be 1` (nothing was handed to `waitUntil`).

**S-E3. A vault's writes are counted over any sixty minutes (`server/counters.ts`, `take`; comment in `server/sync.ts`).**
- **Decision.** The triage's: count as listings are counted, not just reword.
- **Storage.** `w` and `wp` are now `{ m: [[minute, n], …] }`, kept 61 minutes, counted by the minute each upload is taken.
- **Limit and wait.** Past 3,600 of a kind, the answer is `spent`. Retry-After runs to when enough of the oldest minutes have left the count (`untilUnder`, 61 minutes at most).
- **Rows from the old build.** A row stored as `{ h, n }` is read as taken in its hour's last minute not past now, so nothing counted before the deploy is forgotten at the turn of the hour.
- **Removed.** `toNextHour` and `HOUR_MS`, now unused.
- **Tests.** `r71e-server.test.ts`, E3:
  - 3,600 taken in an hour's last half-minute leave none in the next hour's first minutes, with Retry-After to 14:00. On the base: `expected { ok: true, … } to match object { spent: true }`.
  - A three-hour sliding check, one upload every half-second. On the base: `expected 6000 to be less than or equal to 3600`.
  - A row stored by the clock hour stays counted until 14:00. On the base: forgotten at 13:00.
  - Guard: photographs and log batches are still counted apart.
- **Pinned old test updated.** `r69w-server.test.ts` (W5) pinned the `{ h, n }` shape and Retry-After to the hour. It now reads `{ m: [[minute, n]] }` and 61 minutes.

**S-E6. The sync page says what a refusal keeps (`ui/sync-words.ts`, `routes/sync/+page.svelte`).**
- **Before.** The notice always ended "Your changes are kept here meanwhile". For the photographs' hour, that sentence followed the server's own "changes to your records still go".
- **Now.** `refusalKept` words it by the refusal's kind:
  - photographs' hour: photographs kept, record changes still go;
  - day's allowance: photographs and bundles over 16 KB kept, smaller bundles still go;
  - any other refusal: every change kept, as before.
- **Test.** `r71e-sync-words.test.ts`. On the base: `refusalKept is not a function`, and the page's fixed sentence.

**S-E7. The day's refusal stands through a shorter refusal of a small batch (`sync/engine.svelte.ts`).**
- **Before.** Under the day's allowance a small batch still goes. If it was answered 503 for the hour, or met a request window's 429 of a minute or more, that refusal replaced the day's. An hour later a whole photograph was sent, to be refused for the day again.
- **Now.** `refusedBy` and `uploadLimited` keep a standing day's refusal that ends later (`dayStands`). The shorter wait still stops the run.
- **Tests.** `r71e-sync.test.ts`, E7, with both cases.
  - On the base: `expected undefined to be true`.
  - Two hours on, the photograph is still not sent.
  - Guard: with no day's refusal standing, a 503 is kept as before.

**S-E8. The retry of a run that did not reach the server (`sync/engine.svelte.ts`, `ui/sync-words.ts`, `routes/sync/+page.svelte`).**
- **Hidden tabs.** The minute's retry is scheduled only while the page is in view. A hidden tab is asked again by the existing `visibilitychange` listener as it comes into view.
- **Timed-out photographs.**
  - A photograph whose upload did not finish in its 180 s is marked (`syncFetch` tags its timeout).
  - Each such photograph in a row doubles the wait: 2, 4, 8, then 16 minutes at most.
  - Any answer to a photograph's upload resets the count.
- **The card.** The engine exposes `retryAt`, and the Status card says "again in about 8 minutes" (`checkAgainWords`) where it said "in a minute" whatever the wait.
- **Tests.** `r71e-sync.test.ts`, E8.
  - Hidden: no 60,000 scheduled. On the base: `expected [ 60000 ] to not include 60000`.
  - In view: 60,000 (guard).
  - Three timed-out photographs: `[120000, 240000, 480000]`. On the base: `[60000, 60000, 60000]`.
  - After that, a run that sends the photograph clears `retryAt`.

**S-E9. The keep-data answer is said (`ui/keep-ask.ts`).**
- **Same page.** A page's ask now becomes `firstAsk` whatever its reason, so the first plant's ask after the load's is handed the load's answer, which GrowLayer says.
- **Later page.** A first plant on a later page within the month of an earlier ask gets the browser's standing answer from `persisted()`. That puts no question, and is used only when an ask was recorded and, through GrowLayer's gate, its answer not yet said.
- **Effect.** A grower whose answer was never said (a place recorded first; Firefox's question dismissed) hears it once, on the first page with a plant.
- **Tests.** `r71e-keep-ask.test.ts`. On the base: `expected null to be true` twice. A guard checks that the load reads nothing within the month.
- **Pinned old tests updated.** In `r67p-keep-ask.test.ts`, four expectations pinned the null:
  - "one page asks once": the first plant now gets the load's answer;
  - the monthly rule and the five loads: the standing answer (false in the stub), still with one `persist()` call;
  - storage refusing: the same promise as the load's.
  - Every count of asks is unchanged.

**Runs.**
- **Unit, whole suite.** 3,370 passed, 8 skipped, 1 failed. The failure is `r70p-about-rules.test.ts` ("each kind is counted apart"), which is F's file and pins the old `{ h, n }` shape (Need 1).
- **Typecheck.** `tsc --noEmit` clean. `svelte-check`: 1,114 files, 0 errors.
- **Fold hash.** `fold-rules` passes: no hashed engine block changed.
- **Browser.** The strict run is under Measured.

## Needs

1. **F, `tests/unit/r70p-about-rules.test.ts`, "the hour of uploads".**
   - **Shape.** Replace `expect(store.m.get('wp')).toEqual({ h: hour, n: 1 });` with `expect(store.m.get('wp')).toEqual({ m: [[Math.floor(now / 60_000), 1]] });`. The `store.m.set('wp', { h: hour, n: photos })` line still works, since an old row is read as its hour's last minute.
   - **The sentence it finds.** It finds its sentence by "A vault may take 3,600 log batches and 3,600 photographs in an hour", so it follows F's wording in Need 3.
2. **F, `/about/formats`, the listing sentence.**
   - **Replace:** "a listing's reservation that is not settled within a minute, such as a pull cancelled partway, lapses; no sixty minutes hold more than 1,249)"
   - **With:** "the server finishes a listing, and settles it, even when the device has gone; a reservation not settled within a minute, as when the server itself stops partway, lapses; no sixty minutes hold more than 1,249 pages of listings that settle)"
3. **F, `/about/formats`, the writes sentence.**
   - **Replace:** "A vault may take 3,600 log batches and 3,600 photographs in an hour, each counted apart in its counter object as the upload is taken (an upload that then fails still counts). Past either, the next upload of that kind is answered 503 with <code>Retry-After</code> to the end of the hour and"
   - **With:** "A vault may take 3,600 log batches and 3,600 photographs in any sixty minutes, each counted apart in its counter object by the minute the upload is taken (an upload that then fails still counts). Past either, the next upload of that kind is answered 503 with <code>Retry-After</code> to when enough of the oldest have left the count, 61 minutes at most, and"
4. **F, `/about/formats`, the kept 429.**
   - **Replace:** "Meanwhile no photograph and no log batch over 16 KB is sent; a smaller log batch, which the day does not count, still is, and receiving goes on."
   - **With:** "Meanwhile nothing more is uploaded, except under the bytes of a day, when only photographs and log batches over 16 KB wait and a smaller log batch, which the day does not count, still goes; a shorter refusal met by such a batch (a 503, or a request window's 429) stops that sync but leaves the day's wait standing. Receiving goes on."
5. **F, `/about/how`, what the server keeps.**
   - **Replace:** "how many objects it stored and how many pages of its log were listed in the current hour (each a number and its hour) for the hourly limits"
   - **With:** "how many log batches and how many photographs it stored, and how many pages of its log were listed, in each of the last sixty-one minutes (a minute and a number), with each listing still under way (a random id, when it was asked and its pages) until it ends or a minute passes, for the hourly limits"
6. **F, `/about/how`, the NWS's places.**
   - **Replace:** "in the US and its territories (Puerto Rico, the US Virgin Islands, Guam, the Northern Mariana Islands and American Samoa, the Aleutians included)"
   - **With:** "in the US and its territories (Puerto Rico, the US Virgin Islands, Guam, the Northern Mariana Islands and American Samoa, and all of Alaska, the Aleutians, St Lawrence Island and the Pribilofs included)"
7. **F, `/about/how`, the keep-data keys.**
   - **First replacement.** Replace "<code>cultifolio.persistAfterFirst</code> (that the browser's answer to the question asked after your first plant, whether it will keep this site's storage, was said)" with "<code>cultifolio.persistAfterFirst</code> (that the browser's answer to whether it will keep this site's storage was said, once there was a plant to keep, whichever page asked)".
   - **Second replacement.** In the `persistAskedAt` parenthesis, after "a page asks once at most," insert: "and an answer not yet said when your first plant comes within that month is read from the browser's own record, which asks nothing,".

## The corpus step

None. Nothing of mine reads or writes the corpus.

## Measured

- **Writes over sixty minutes.** In a three-hour run of an upload every half-second, the busiest sixty minutes held exactly 3,600 per kind. The clock hour allowed 7,200 across a turn.
- **Cost of the new storage.** Each take writes the minute array, at most 61 pairs: one storage write per upload, as before.
- **Strict browser runs on `d098c79`** (`node scripts/predeploy.mjs`, Chromium and phone):
  - **First run.** 467 passed, 5 skipped and 1 flaky, so the run failed. The flaky test was `smoke.spec.ts:1639`: the front page's catalogue tile did not preload on hover within 5 s, and it passed on its retry. There was no memory kill this time.
  - **That test alone.** `--repeat-each 10 --retries 0`: 10 of 10 passed.
  - **Second whole run.** 468 passed and 5 skipped, every test first time ("the deploy may go ahead").
  - **The one possible link to my change.** The keep-data answer (S-E9) can now be said on a later page. At the failure the toast region was empty, and the toast sits at the top of the page, away from the tile. I count the flake as the harness's, under load, not this change's, but I record it.

## Not done or departed from

- **S-E2's lapse rule.** I kept round seventy's one-minute lapse, rather than charging a lapsed reservation its full 50 pages. With `waitUntil`, a lapse needs the Worker itself to stop mid-walk, which no client can cause. Charging it in full would bring back R47-18's case of a broken walk holding the budget for an hour. The about sentence (Need 2) says the bound holds for listings that settle.
- **S-E4 and S-E5** are about-page sentences: Needs 4 and 5 (with Need 2 for the listing's half).
- **`WritesSpent`'s sentence** still says the device "sends them again within the hour". The engine caps a 503's wait at an hour, so the device does try within the hour, and may be refused once more if the count needs its 61st minute. I judged that true enough to leave.
- **D's need.** `fix-D.md` says no sync file needs a change ("there is no need for E"). Its fold-hash note: I changed no hashed engine block.
