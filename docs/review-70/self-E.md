# Self-review of round seventy, reviewer E: the server, sync and the harness

Copy `(scratch)` at `76dcd55`, port 4405. Trial fix: `E-fix.diff` (findings 1 and 2; with it applied, `r70p-alerts`, `r70w-server`, `r70p-about-seams` and `r70p-about-rules` pass, 81 tests). The working copy is clean.

## Findings

**1. St Lawrence Island and St Paul Island are not asked of the National Weather Service, and are told it "does not cover" them. Confirmed.**
`src/lib/weather/forecast.ts`, `isUS`. The Alaska box stops at 170° W (`lon > -170`), and the new Aleutian box west of 170° W stops at 55.5° N. Points west of 170° W and north of 55.5° N fall between the two boxes. Those points are Gambell (63.78, -171.74), Savoonga (63.69, -170.48) and St Paul in the Pribilofs (57.13, -170.28).
- **Reproduction.** `isUS` returns false for all three and true for St George (-169.55). The NWS answers `alerts/active?point=63.7800,-171.7400` and `57.1300,-170.2800` with 200 (checked today). Midway answers 400 "out of bounds", as expected.
- **What the user sees.** A place on those islands gets `alertsStatus: 'n/a'`, so the place page says "Forecast clear." and then `NO_ALERTS_SERVICE`: "…the US National Weather Service, which does not cover it." That sentence is false. `/about/how` also says the territories it lists have "the Aleutians included".
- **Fix (in the diff).** The Alaska box runs `lon > -180 && lon < -129.9`, and the antimeridian box keeps only `lon >= 172`. Chukotka east of 180° then gets the NWS's 400 "out of bounds", which the route already reads as `n/a`. The bound -129.9 also takes in the panhandle's edge at Hyder.

**2. The listing budget's "no sixty minutes hold more than 1,249" holds only for walks that settle. Confirmed in the counter; suspected as reachable.**
`counters.ts` `listAsk` and `listState`: a reservation that is never settled lapses after `RESERVE_MS` (60 s) and is then counted nowhere.
- **Reproduction (unit probe against `Counters`).** One ask a second for an hour, none settled, admits 1,440 walks, which is 72,000 pages. That is 60 times the budget (24 walks of 50 every minute).
- **Whether it can be reached.** A walk goes unsettled only if the Worker stops before `listBatches`' `finally`. That happens when the client disconnects, if the runtime cancels the request then. Cloudflare's own changelog speaks of work "before your Worker's invocation ends" on a client cancel, so a client that drops each listing after the walk starts plausibly escapes the count.
- **Where the claim is made.** `/about/formats` says "a listing's reservation … lapses" and "no sixty minutes hold more than 1,249" in the same sentence. They contradict each other.
- **Fix (in the diff).** The GET route passes the listing promise to `platform.context.waitUntil`, so the walk and its settle outlive the client. Then either charge a lapsed reservation's 50 pages in its minute (the old bound comes back, and lapses become rare), or reword the sentence to "of walks that finish".
- The other probes found nothing wrong:
  - A slow walk that settles past its reservation is counted in its minute: 1,200 pages, with no double count.
  - A settle without an id takes the oldest reservation of its minute. Every caller passes the id.

**3. The writes an hour, measured. Confirmed; the cost is small.** `take` still counts `w` and `wp` by the clock hour.
- **Probe.** 7,200 log batches are taken within 38 s across a turn of the hour, against 3,600 under a sliding count, and photographs have the same again.
- **Cost.** A clock hour can never exceed 3,600 of each kind, so the long-run and daily ceilings are the same as a sliding count's (86,400 of each a day per vault). Only the peak over sixty minutes doubles. That is 14,400 Class A writes per vault across one turn, about $0.06.
- **Reachability.** One address cannot reach even one hour's log figure: pushes share the `sync` window, 600 per ten minutes, which also holds listings and opens. So the doubling needs several addresses on one vault.
- **Recommendation.** Leave it, and say "in a clock hour" on `/about/formats`. If it is changed, reuse `listState`'s minute array.

**4. `/about/how` misdescribes what the server keeps for listings. Confirmed (rule 5).**
- **What the page says.** "how many objects it stored and how many pages of its log were listed in the current hour (each a number and its hour)".
- **What the code keeps.** Since W4 and W6, `l` holds the pages for each minute of the last 61, plus open reservations with a random id, their time, pages and minute. Objects are two counts, `w` and `wp`.
- **Fix.** "…how many log batches and how many photographs it stored this clock hour (each a number and its hour), and how many pages of its log were listed in each of the last sixty-one minutes, with each listing still under way (a random id, when it was asked and its pages) until it ends or a minute passes."

**5. `/about/formats` says a kept 429 still lets small batches through. That holds only for the day's allowance. Confirmed.**
- **What the page says.** "…until its Retry-After or within the hour… Meanwhile no photograph and no log batch over 16 KB is sent; a smaller log batch… still is".
- **What the code does.** A request-window 429 of a minute or more (`sync` or `syncobj`, up to 600 s) is kept as a refusal without `day`. `waitRefusal` then throws at the start of `push`, so nothing is sent, small batches included.
- **Fix.** Begin that sentence "For the bytes of a day, meanwhile…".

**6. The sync page's refusal notice contradicts the server's own sentence. Confirmed by reading.**
- **The contradiction.** `routes/sync/+page.svelte:199` always ends "Your changes are kept here meanwhile". For the photographs' hour (`refusal.photos`), the server's sentence just before it says "changes to your records still go". For the day's allowance, small record batches go too.
- **Fix.** For either kind, say "Photographs (and larger bundles of changes) are kept here meanwhile; changes to your records still go".

**7. A 503 on a small batch drops the day's allowance from the device. Suspected (by reading); the cost is bounded.**
- **What happens.** While `refusal.day` holds, a small batch answered 503 (`WritesSpent` for logs, `VaultsClosed`) runs `refusedBy`. That replaces the refusal with an hour's refusal that has no `day` flag.
- **Consequence.** An hour later one photograph, up to 12 MB, is sent and refused 429 again, which sets the day's allowance back. At most one photograph an hour is wasted.
- **Fix.** In `refusedBy`, keep a standing `day` refusal whose `until` is later.

**8. The minute retry runs in hidden tabs and after timed-out photographs. Suspected; minor.**
- **What happens.** `runNow` schedules `NOT_REACHED_MS` whenever `unreached === 'server'`. That is also true of `syncFetch`'s timeout, which becomes a TypeError, including a 12 MB photograph that cannot finish in 180 s on a slow link. The retry ignores visibility, unlike the five-minute tick.
- **Consequence.** A hidden tab, or a photograph on 3G, retries every minute indefinitely, which is about twice the old rate on mobile data.
- **Fix.** Schedule it only while the page is visible, and back off after a timed-out photograph.

**9. The answer to the load's keep-data question is never said. Suspected; this predates round seventy.**
- **What happens.** `collection.svelte.ts:338` asks with reason `'load'` whenever the collection holds any record, a place for instance. `askedHere` is then set, but `firstAsk` is not. When the first plant is added later on that page, `askToKeep('first')` (the commit hook's and GrowLayer's) resolves null, so GrowLayer says nothing that month.
- **Fix.** Keep the load's answer in `firstAsk` as well, whatever the reason.

## The harness

**The run.** `predeploy.mjs` strict, Chromium and phone:
- **Result.** 466 passed, 5 skipped and 2 flaky, so the run failed (exit 1). The flaky ones were `smoke.spec.ts:1236` ("Target crashed") and phone `r70p-alerts.spec.ts:24` (a timeout waiting for `data-ready`).
- **Cause.** `dmesg` shows the memory cgroup's OOM killer, started by a python3 and an esbuild elsewhere in the sandbox, killing two `chrome` processes at that moment (uptime 1132 s and 1151 s).
- **Rerun.** Both tests with `--repeat-each 3` under the lock: 15 of 15 passed.
- **Verdict.** No genuine flake. The sandbox shares memory across reviewers, and a strict run there is only as good as the quietest twenty minutes.

**Addresses.**
- **`limitAddress`.** Within one run, `p + 8·(retry % 8)` stays below 64 and each repeat moves by 64, so projects, attempts and repeats never share a /48 (up to 1,024 repeats). Across runs, only two salts within 64 of each other could collide, and only on a reused server, at odds of about 1 in 2^26.
- **`docAddress`.** A uniform /48 of 3fff::/20, 2^28 of them. At about 30 calls a run, the chance of a shared /48 is under 10^-5, and a shared /48 stays under every limit.
- **The vault-making specs.** `r62s`, `r62bs`, `r70w-sync`, `r69p-disclosure` and smoke's three each take an address per test, not per module.
- **Midnight.** The limit test can straddle midnight UTC, putting five vaults on two days so the sixth is not refused. This is rare and known in kind.

## Root cause of the open issue in my area

Only "the vault's writes an hour on the fixed clock hour" (finding 3). W4 replaced the clock hour for listings but not for `take`, whose `Hourly` row is a single number. The daily ceiling is unaffected and the turn's burst costs cents, so I recommend only the wording, unless a uniform rule is wanted.

## Checked and sound

- **W1 (the init schedule).** `readInit`'s configured branch schedules a run, and the layout's call only moves the same timer.
- **W2 (429 words and the day's allowance).**
  - The day's 429 is recognised by `limit`, which only `DayQuota` carries. The creation 429s carry none.
  - The wait is `Date.now() + Retry-After`, so the device clock does not matter. It is capped at a day and written back.
  - Batches over 16 KB are held. Small ones go, and their success neither clears nor extends the refusal. The two ends read one `SMALL_BATCH_BYTES`, and both measure the sealed body.
  - "A photograph never uploaded because a small batch keeps the allowance alive" cannot happen: `until` is fixed, and `waitRefusal` clears it once it is past.
- **W3 (DELETE's hold).** Without the receipt's proof, a DELETE gets 404 or `PhotoBusy` before `withHold`. A live photograph without the proof is still 403 before the hold.
- **W4 and W6 (the listing count).**
  - A lapsed reservation that settles late is counted once, in its own minute, with no double count.
  - Retry-After is at most 61 minutes.
  - The migration from `{h, n}` is sound.
- **Photographs and batches counted apart.** `of` is read from the key. `WritesSpent` carries `what`, and the engine holds photographs alone.
- **The upstream object's memory.** A timer clears the minute's counts at the minute's end.
- **Territories.** The boxes for Puerto Rico and the US Virgin Islands, Guam and the Northern Marianas, American Samoa, Hawaii, the contiguous states and the Aleutians from Adak to Attu all hold their land (checked by `isUS` on sample points).
  - "Forecast clear." is shown wherever the status is not `ok` or `none`, on the notice and the pill. Today never says "All clear.".
  - The NWS credit is dropped for `n/a`.
- **The keep-data question.**
  - **Not asked twice.** `askedHere`, plus the month stamp written before `persist()`.
  - **Never in the example.** `PAGE_IN_DEMO` is read at load, and entering the example reloads the page.
  - **No double prompt for the first plant.** The commit hook and GrowLayer share `firstAsk`.
- **`hooks.server.ts`.** The foreign-write check runs on every path. The service worker never touches `/api/sync`.

## Not done

- No WebKit or Firefox.
- I did not test the client-disconnect behaviour of Workers in production.
- I did not drive the keep-data finding (9) in a browser.
- I did not read every sentence of `/about/formats` beyond those on sync, limits and the counters.
