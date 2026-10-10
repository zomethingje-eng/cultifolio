Review, round forty-five: 8f2d56c (rounds sixty-two to sixty-six)

The five rounds closed nearly everything the last review raised. Of its 44 findings, 37 are fixed or stated as decided, and four are partly done. Both suites are green.

The example collection is the weak point. It makes a real first visitor's first plant look like theirs, then deletes it without asking. Three things show it:

"+" in the example. The plainest thing a visitor does on a fresh phone is tap "+" and add a plant. That plant goes into the example, while the bar above it still says "Your own starts when you add a plant".
Closing the tab. Close the tab and open the site again, and the example, with that plant, is deleted with no question. Leave's prompt guards one exit only.
Real-looking files. It also hands out a calendar file of real-looking reminders.

Two faults reach every browser:

Text lost after a deploy. Typing in the first four seconds after a deploy is lost to a reload.
The "keep data" question. It is asked on every load in Firefox, which is what round sixty-four set out to stop.

The data fault that matters most:

Plants hidden after sync. Round sixty-two decided a correction no longer lapses with time. That has turned last round's fault around: a device whose own clock is fixed while the tab is closed keeps a +3-day correction, and the plants it adds offline are parked on every device after the next sync, the writer included.

The WebKit diagnosis:

The verdict holds. The failures are slowness, not hangs.
The remedy points the wrong way. The cost is the number of requests, not transactions. Every commit is already one transaction.
What was run
System: Linux 6.18, x86_64, in a cloud sandbox.
Type check: npm run check gives 951 files, 0 errors, 0 warnings.
Unit: npx vitest run gives 246 files, 2,039 passed, 1 skipped, on Node 22.22.2 and on Node 24.21.0. The owner's 2,038 and 2 skipped differ by the bundle test, which runs here because a fresh build exists.
End to end: npx playwright test, with projects chromium and phone, Chromium 141, Playwright 1.63, Node 22. 350 passed, 5 skipped in 10.7 minutes. No test needed its retry.
WebKit and Firefox: not run. npx playwright install webkit firefox fails because the sandbox's proxy refuses cdn.playwright.dev, and Playwright's engines are patched builds, so a system Firefox would not do. No real Safari, iPhone or Windows was available either.
The WebKit pace questions are answered by counting requests in Chromium and emulating a 16 ms request delay there.
Probes: vitest probes over fake-indexeddb, the real engine, the server harnesses, and git worktrees of rounds 61 and 62.
Reverts: 70 reverts of rounds 62 to 66 (51 unit, 19 end to end, built in four batches with --retries=0).
Interface: local builds under wrangler dev driven by Playwright:
at 390×664, 375×548, 360×640, 390×844, 320 with 200% text, 400% zoom and 1280×800;
in light, dark and forced colours;
with axe-core and CDP's accessibility tree;
with fonts delayed and blocked;
with a two-build deploy swap.
Not checked: the live site and GBIF. The proxy refuses both, and the repo holds no real English names, so the name findings are about the rule, tested on built GBIF-style lists.
Marking: every finding is confirmed (reproduced) or suspected (read, not run). The repo was not modified.

Ranked by what a skeptical first visitor, technical and in a hurry, finds first; then data loss; then the rest.

A. What a first visitor finds

1. A visitor's first plant goes into the example, under a bar saying their own hasn't started (confirmed).

Where: the top bar's "+" (+layout.svelte:317); DemoBar.svelte:82-84.
Steps: on a fresh phone (390×844), tap Today; the example opens. Tap "+", type Copiapoa cinerea, press Add.
What appeared: "2026-0008 added" and the plant's page.
Above the plant, the bar still says "Your own starts when you add a plant", with an "Add your first plant" button.
On the add form that button sits just above the form's own Add, and the two do opposite things.
Should: inside the example, "+" leaves first, or the form says the plant joins the example and goes with it.
Fix: have "+" call the bar's leave('/plants/new'). Add one line on plants/new and propagation/new in the example: "This goes into the example and is deleted when you leave it."

2. What a visitor added in the example is deleted without asking on every exit except Leave (confirmed, data loss).

Where: dropLeftoverSample (demo.ts:276-288), called from DemoBar.svelte:42.
First way: add a plant in the example, close the tab, and open / in a new tab. The example's database is gone, and Today opens a fresh 12-plant example.
Second way: the example tab goes to another site, or Safari discards it in the background, and another tab opens /. Back in the first tab shows "No plant with this number on this device."
Should: formats:51 says Leave asks first when the visitor added or changed records; this path never asks.
Fix: in dropLeftoverSample, run the count sampleEdits uses. If it is above zero, keep the database and offer it back ("You left an example with 1 plant you added").

3. The example hands out files that look real (confirmed).

Calendar: in the example's Today, "Watering in your phone's calendar" downloads a .ics file of 14 repeating events with 9 am reminders running to 2028 (CalendarExport.svelte:38-41). Example: "Water 2025-0003 Welwitschia mirabilis (every 10 days)". The only trace of "example" is inside the UIDs.
Spreadsheet: the download is offered in the example too.
Backup lines: the example's Today and front page say "Kept on this device: no backup yet, not synced", and My plants offers "back up" with a link to a locked page.
Fix: hide both downloads when inDemo(), and in the example say "deleted when you leave" instead.

4. On a phone, the first screen doesn't say what the site is (confirmed).

Where: +page.svelte:874 hides the pitch while the welcome line shows, and PageHead.svelte:35 hides "Species reference" on a phone. The comment at :874 assumes the head line is visible.
What appeared (390×664, 375×548, 360×640):
"Cultifolio";
"4 species · 2 with habitat climate";
"Grow some of these? Keep their record…".
Missing: nothing visible says cactus, succulent, bulb or reference.
Fix: "Grow cacti, succulents or bulbs? …" in the welcome's lead. It costs no height; 375×548 has 10 px to spare.
Sound: a whole catalogue row is above the tab bar at all three sizes, in light, dark and forced colours (first row 397-481 px against tab bars at 607, 491 and 583).

5. Text typed in the first seconds after a deploy is lost, and a second tab keeps the old build (confirmed in Chromium).

Where: +layout.svelte:224-229.
First fault: on the first full load after a deploy, the old worker serves the page. The new worker installs and is told to take over, and performance.now() < 4000 reloads the page whatever has been typed.
Steps: I served build A, opened the app, then swapped to build B, loaded /plants/new and typed a name at 0.2 s. At 2.0 s the page reloaded into build B and the field came back empty.
Second fault: a second tab that did not send skip returns at !takingOver. It runs build A under worker B indefinitely and never sets reloadOnNext.
Suspected: buildOf returns null after 1 s with no answer (:126-131), and null ≠ version reloads. So a slow worker reloads a fresh page, against how:95's "never reloaded under you".
Fix:
Reload early only when no field has had input (one document input listener).
Set reloadOnNext when servedByOld && v !== version.
Do nothing on a null answer.

6. The "keep data" question is asked on every load in Firefox (confirmed).

Where: GrowLayer.svelte:26-36 calls persist() on every full load while cultifolio.persistAfterFirst is unset. That key is written only after the answer is shown (:45).
What happens: a question the person dismisses never answers in Firefox, so the key is never written.
Measured: with a persist() that never resolves, one ask per load across five loads. The first /plants load asked twice: the collection's monthly ask plus GrowLayer's.
The monthly gate (cultifolio.persistAskedAt, collection.svelte.ts:57-66) is right, and is written when asked.
Should: how:95 says "a page asks at most once a month".
Fix: GrowLayer goes through askDue().

7. Hovering the compare tray on a private page sends the compared species (confirmed by reading both sides).

Where:
app.html:18 sets data-sveltekit-preload-data="hover" on the body.
+layout.svelte:341 turns it off inside <main> on private pages.
<CompareBar> sits outside <main> (:348), and its links are /compare?s=<slugs>.
What happens: on /plants or /today, a hover loads /compare's data with the slugs.
Should: how:95 says "links on these pages are not preloaded on hover, so a name goes only when you click".
Fix: data-sveltekit-preload-data="off" on CompareBar's links on private routes.

8. Two layout shifts a visitor sees (confirmed).

Species page with photographs failing: CLS 0.17 at 390, 0.14 at 1280. Each strip thumbnail deletes itself on error (species/[slug]/+page.svelte:406), so "At a glance" jumps 28-51 px. With photos loading the CLS is 0.004. This is the fault round sixty-five fixed on the front-page strip. Fix: keep a 72×72 placeholder.
Front page, returning visitor who dismissed the welcome: 0.039 at 390 and 0.013 at 1280, on every load. "Keep a record of your plants" appears about 750 ms in and pushes the rows down 49 px (+page.svelte:754). Fix: render it from the server for html[data-welcomed].
Fonts are not the problem: with the web fonts 3 s late the front page shifts 0.0001 at 390 and 0.001 at 1280. On Linux the fallbacks are within 0.3-1.5% of each font's width, with identical line heights. Windows and macOS faces are declared but were not measurable here.

9. Common names: three rule faults (confirmed on built lists; whether the live data has these shapes is suspected).

A comma that isn't a list makes nonsense headlines (index-entry.ts:78-80, :204-207):
"Aloe, Coral" → "Coral", even when "Coral aloe" is also listed;
"Echeveria, blue" → "Blue";
"spurge, African milk" → "Spurge";
"Prickly pear (Indian fig, Barbary fig)" → "Prickly pear (Indian fig" and "Barbary fig)".
Fix: never split inside brackets, and treat a one-word part that no source gives alone as a bare word (tier 1).
Correct proper nouns are lowered (:55 SMALL_WORDS, :195-197):
"Star of Bethlehem" with "star of bethlehem" → "Star of bethlehem";
"Lily of the Nile" → "Lily of the nile";
"Queen Victoria Agave" twice plus one all-lower → "Queen victoria agave";
"St. john's wort", "Saint helena ragwort".
Why: small words don't count as lower case in the "meant" test, and off() scores every unmeant capital as a fault.
Pooling stops at hyphens: "String-Of-Pearls" twice against "string of pearls" shows "String-Of-Pearls"; "Mother In Law's Tongue" beats "Mother-in-law's tongue".
/about/how doesn't match the code:
It says "Title Case and all-lower-case spellings say nothing", without the small-word exception.
It says apostrophe spellings are one name, but nameKey only straightens curly ones, so "St John's wort" and "St Johns wort" stay two.
It says "each source counted once", but the spelling choice adds per row (sp.n += own.size).
Fix: count small words as lower case in meant; pool spellings word by word over [\s-]; correct the page.

10. One card puts the range's rain median beside the median year's months (confirmed).

Where: Glance.svelte:63,101; card.ts:40,57.
What happens: the headline is annualRain.p50, the median of cells' yearly totals. The "N months of 25 mm or more" line under it counts the median year's monthly medians.
Built range: three rain zones, every cell 400 mm, each wet in a different third of the year. The share card read "RAIN A YEAR (MEDIAN ACROSS THE RANGE) 400 mm · no month of 25 mm or more". That can't be true of any one place.
Real ranges: mixed winter- and summer-rain ranges (the Cape, Namaqualand) get milder versions.
Fix: "in the median year" on the sub-line, as the sheet already says.

11. Refusals are still said as "did not answer" (confirmed, rule 2).

Species sheets: index.svelte.ts:199 turns every non-ok answer from /api/sheets into null, so a 503 refusal or a 429 reads as an absence:
Today: "the species sheets did not answer" (Today.svelte:164, today/+page.svelte:388);
the plant page: "could not be reached from here just now" (plants/[acc]:608,806);
labels: "the reference was not reached" (:347).
"Check again" ignores Retry-After and is refused again at once.
Outside services that refuse the site:
MET Norway 429/403 becomes 502 "forecast source did not answer" (forecast/+server.ts:91).
GBIF 429 becomes "The name service did not answer." (names/+server.ts:62) and "GBIF's name service did not answer" on the 404 (synonyms.ts:78).
NWS failures and refusals are both recorded as 'refused' (:107).
At build time: a timeout is recorded as 'refused' (fetch.ts:173). NASA POWER failures are recorded as 'refused' but worded "did not answer" (provider.ts:101). The builder's "climate grid unavailable: …" is not a full clause.
Fix: carry the status and Retry-After through sheetsFor and the API routes; word a source's 429/403 as "refused this site"; disable "Check again" until Retry-After.

12. Tile credits lose their licence at 200% text (confirmed).

At normal size: the licence survives at 390 and 1280 ("Photo: CC BY, Wolfgang …").
At 200% text: a Related tile shows "Photo: CC …" and the desktop strip "Photo: CC BY-…". The author and the licence's version are gone.
The hero credit: its author line is still one line cut with "…" (423 against 316 px at 390).
Fix: drop "Photo: " on tiles, or allow two lines.

13. /about/how and /about/formats drifted again (confirmed by reading both sides).

Labels picks: how:95 says cultifolio.labelsPicked is written when the page is left. Since round 66 it is also written when hidden, and cleared on a move within the app (labels/+page.svelte:129-138).
Requests: after a failed navigation the layout also calls reg.update(), a second /service-worker.js request (+layout.svelte:134-141). how:89 and :95 list only /_app/version.json.
Sources: "In brief" (how:25) leaves out Wikidata (wikimedia.ts:35) and Natural Earth. The footer lists both.
The seed: formats:51 says the example is set out "in one change … marked only once that change is stored". It is one commit of many changes, and without Web Locks seedOnce(true) writes the mark first (demo-seed.ts:118). DemoBar.svelte:41's "tried again the next time a page opens" is false there (demo.ts:276 returns false without locks).
The bundle gate: check-bundle.mjs:23 bans chunks named grow. grow/index.ts was deleted, so no chunk has that name and that half can never fail, though round 63 §14 says the layout's chunks hold "neither backup nor grow". Fix: ban by module path (src/lib/ui/grow/), not by chunk name.
What the seam tests do not check:
r62w-about-seams:159 accepts cultifolio and cultifolio- by substring, so it passes with the cache-storage and database sentences removed from the page.
inCode() skips names spelt with name or n.
r63fd-words:61-63 asserts code comments.
r62bw-words:56-57, r62bw-words-species:25,51 and r63fd-words:52,71 only assert an old phrase is absent.
Not checked at all:
cookies;
what each key is for;
the server's own keys (u:, h:, g:, r:, s:, vaultplace:);
hosts other than api.*;
the hover-preload, reload and /api/corpus-once claims;
every figure the pages state (0.25 reserve, 77 networks, 3 and 12 GB, 100 a run, 7 nights, 30 days, 2,000 lines, 60 code points).
B. Data loss

14. A slow clock fixed while the tab is closed keeps its correction, and the plants it adds are parked everywhere after sync (confirmed, real engine).

Where: hlc.ts readStored (about L84-95) and follow (about L165-170).
What happens: a device 3 days slow gets a +3-day correction from two readings. The browser closes, and NTP fixes the clock, or fixes it during a sleep, which arrives as one forward move of 3 days 8 hours. On the next load the +3 days is kept and clockChecked() reads true. Every stamp is 3 days ahead for as long as the device stays offline (still 3 days after 8 days).
Probe (zz-engine):
A plant added offline showed until the sync.
It was then parked by arrival on the writer (3 stamps stored) and on the peer, and was gone from both, after a reload too.
It comes back only through Apply.
Why: this is round 62's decision that a correction no longer lapses with time. It has turned last review's #17 around.
Behind rather than ahead: a device 3 days fast fixed while closed keeps −3 days. It parks nothing, but localDate() dates waterings and lines 3 days early until a reading. Each change of correction cost exactly one refold.
Fix: while unsure, apply a positive offset only up to TRUST_SERVER_TWICE_PAST_MS. Above that, stamp by the raw clock until the next reading. Stamps that land behind park nothing.

15. The import adds duplicates and brings removed plants back (confirmed).

An edited or re-saved sheet is imported again. The import key is a hash of the whole line (plan.ts:66), so any edit to a cell gives a new key.
Unnumbered sheet: edit one note, or let Excel re-save 2019-05-03 as 5/3/2019, and those lines (or the whole sheet) are offered again with no flag.
Numbered sheet: the line is flagged already but defaults to drop: false, so CF-001 comes back as CF-004 (:286).
Removed plants come back. The keys already here are taken from collection.accessions, live plants only (import/+page.svelte:171, commit.ts:108). A plant removed after an import is re-added under a new number on the next run.
The tab hangs on huge unpadded numbers. nextInSheet (plan.ts about L243-250) counts in floats. With three lines numbered 9007199254740993, ++patTop stops changing and the do/while never ends (vitest killed after 40 s).
Fix:
Default drop: true when a plant here has the same number and name, whatever its key.
For unnumbered lines, match name + acquired + source and say "looks like a line already imported, changed".
Gather keys from removed plants too.
Stop at !Number.isSafeInteger.

16. The example's seed marks are lost on about one reload in ten, and Leave then deletes without asking (confirmed).

Where: seedOnce writes the plants, then seeded, then demoSeedTop, in separate writes (demo-seed.ts:125-136).
Measured:
Of 50 reloads at random moments during the seed, 5 left plants with no marks.
Of 30 two-tab runs with one tab killed, 3 did the same.
None was seeded twice.
Effect: without the stamp, sampleEdits skips every change to a seed-tagged record (demo.ts:126-131). Notes typed on a seed plant and another seed plant removed count 0; with the stamp they count 2. "Water 2 here" twice, then Leave, deleted with no question; the same steps in a well-seeded example asked about 3 records.
Read, not run: removing all 12 plants reseeds the example on the next load.
Fix: when plants exist but a mark is missing, write it, with the stamp as the newest seed-tagged change.

17. A cancelled Leave, or a second example tab, sends settings to the grower's storage (confirmed).

Cancelled Leave: readyToLeave() clears the flag before the browser has left (demo.ts:159-161).
Steps (Chromium with the Navigation API removed, which older Safari and Firefox lack): Leave is answered Cancel at "Leave site?", then Add is pressed within 3 s.
Result: the example's place id was written to the grower's cultifolio.lastLocation and stayed there after a real Leave. The units and hemisphere cookies and the compare tray take the same path.
Second tab: tab A leaves and tab B answers Cancel. B's flag is cleared but its example bar stays. Its Adds still go into the example's database, which is deleted when B closes, while its settings now go to the grower's storage (demo.ts:105-110).
Labels: leaving from /labels writes the example's 12 picks under the grower's cultifolio.labelsPicked. Harmless; the next visit clears it.
Fix: clear the flag at pagehide, not before navigating; app.html already clears it from ?left=sample.

18. Place pickers: one settle for every picker, no guard on Move, and a silent failure (confirmed).

One settle for every picker: settlePlaces() (places-pending.ts:16-18) settles every open picker, not only the form's own.
Steps: open Edit, choose New… and type a name, then use the Move panel.
Result: Move creates the Edit form's place ("Bench I was only thinking about"), and a later Save moves the plant there.
Move has no busy guard: a double press wrote two "to Shed" lines (plants/[acc]/+page.svelte:213-219).
A failed place leaves the form stuck: if the new place's parent was removed (another tab, or sync), addLocation throws before committing. plants/new:197's catch {} assumes lastWriteError explains it, but nothing sets it, so Add does nothing, with no message, on every press. doMove rejects unhandled.
Untested: settlePlaces is untested in Start batch, Pot up, batch Save and plant Edit Save (green on revert).
Fix: settle the form's own picker by id; guard Move; catch in create() and show the error in the picker.

19. "Renumber now" on two devices can write two notes, one false, or make a new duplicate (confirmed).

Where: collection.svelte.ts:1945-1966.
Steps: X and Y share 2026-0007. A, offline, mints Z = 0008 and renumbers Y to 0009. B renumbers Y to 0008. They sync.
Result: Y = 0009, with both "to 0009" and "to 0008" shown. The winner is decided by the tag hash; in the other order Y and Z both become 0008.
Fix: choose the fresh number from numbers ever issued in the log; hide a sibling note whose "to" isn't current.

20. "Empty" is called on devices that hold the grower's things (confirmed).

Where: example.svelte.ts:29-31.
Opens the example over:
notes on a species whose plant was deleted (not followed);
a numbering-scheme setting only;
a deleted plant only.
Correctly stays out for: a followed species, a place or a parked change.
Effect: nothing is lost, but the bar tells that grower "Your own starts when you add a plant".
Fix: count any live taxon or setting record, and removed records.

21. Photographs: two server paths can lose a live generation (confirmed in the harness, low likelihood).

An unreadable pointer lets the bearer token alone replace a live photo (sync.ts:871-893).
What happens: runPhoto never checks ref.unreadable, which comes back as removed with drop: '', and '' means no proof needed.
Probe: with one pointer read failing, a token-only PUT with any proof was stored, and the pointer moved to it. That night's sweep deleted the grower's generation, and the grower's DELETE then got noproof for good.
It needs a transient R2 body-read failure, which an attacker can only retry for.
GET and HEAD answer 404 "no such photo" on an unreadable pointer, which is an absence said for a fault.
Fix: if (ref.unreadable) throw new PhotoBusy(...), and answer 503 there.
A revival upload that stalls more than 10 minutes between its generation write and its pointer write loses its bytes (sync.ts:891-893, counters.ts:600-637).
What happens: the sweep deletes the young-looking unnamed generation, then the stalled point() still succeeds against the unchanged etag.
Probe: { r: 'stored', sweptGen: true, namedExists: false }.
Fix: re-put the pointer conditionally before deleting a generation, so the stalled write fails.
Minor: photogen.ts:73 lists 100 and ignores truncated, so a photo with more than 100 generations is marked done with strays left.

22. A bogus w reaches the screen and the removal path (suspected, low).

Where: vault.ts:405 keeps the earliest w. when.ts:17 accepts any positive integer.
Effect:
w = 1 shows 1970.
w = 1e300 shows "NaN-NaN-NaN" and sorts to the top of a timeline.
The engine's removedAt (min(w, seen)) sends a photo DELETE at once, skipping the 10-minute Undo, when w is early.
Not affected: no fold, hold, park or CSV reads w.
Fix: accept w only between 2020 and 8.64e15, and near the stamp's wall.

23. With IndexedDB refused, Today stays on "Opening the collection…" (suspected; simulated in Chromium). collection.load() has no failed state. The example from the menu then sticks the same way. Fix: a failed state that Today and the offer can show.

C. The shares

24. A share is still spent by 77 networks, the same 77 every minute (confirmed).

Where: caps.ts. The share is 600 a minute: one address 60, one /24 or /48 240, an open part of 450, and a reserve of 150 at 2 calls per new network.
Measured: 77 networks (2 /24s of 4 addresses, plus 75 /24s) spent all 600, and spent it again the next minute. The reserve resets each minute, so no rotation is needed.
Service	IPv4 to keep it spent	IPv6 to keep it spent
GBIF (names plus match)	about 88 addresses in 77 /24s	about 79 /48s
MET Norway	about 150 addresses in 77 /24s	about 94 /48s
NWS	Spent with MET by US coordinates, at no extra cost	Same
What it takes: a residential proxy pool covers 77 /24s easily, and a free tunnel broker gives /48s.
Once spent: everyone gets who: 'site', correctly worded as held.
Behind a carrier's NAT: growers are told "not asked" with the reason, on the picker, the frost line and the species 404. "Networks that have not called yet" reads oddly to someone whose own device never called.
Daily upload totals: the totals (3 GB an IPv4 address, 12 GB a /48) also count log batches. One heavy neighbour on a carrier-NAT address or a shared mobile /48 stops everyone's record sync until UTC midnight. IPv4 has no /24 total.
Fix: exempt small batches from the day totals. Weigh whether a public pre-launch site needs more than a per-minute share: a cache-miss budget per species, or a longer reserve memory.
D. The WebKit diagnosis
Verdict: "slowness, not hangs" holds, but the remedy is aimed the wrong way.
What was counted (requests and transactions, in Chromium):
What	Read-write transactions	Requests	Chromium
Example seed	1	1,297	0.6 s (2.0 s at 4x CPU)
300-row import	7	16,235 (54 per plant)	2.6-4.6 s
Opening 1,000 plants	–	18	0.6-1.6 s
First reopen after that import	–	5,418 (one get per change, vault.ts:813-815)	1.5 s (3.9 s at 4x CPU)
One edit	1	3	–
Water 20 plants	1	240	–
The cost is per request, not per transaction. Every commit is already one transaction, so batching transactions gains nothing. "Three requests per change" (changes.put, outbox.put, order.add, vault.ts:418-419) is real and is the lever.
On a real iPhone: Safari runs IndexedDB in a separate process, with a round trip per request.
At an assumed 0.1-0.5 ms a request (my assumption, not measured; this is the uncertain number), the seed would take about 0.15-0.7 s, a 300-row import 1.6-8 s, and the first reopen after a bulk write 0.5-2.7 s more on "Opening".
That is a design cost a mid-range iPhone pays, though far less than Playwright's 16 ms on Windows.
What I'd batch first, with no format change: arrivalsAfter reading the tail with one getAll over the changes when the tail is long. That turns 5,418 requests into about 3.
Then, with a format change: one outbox row and one order row per commit instead of per change. That is a database version bump with a migration, and brings a change to about one request.
What a grower would see at 16 ms a request (emulated without breaking transactions):
No page showed "no plants" or a blank, and nothing froze over 5 s.
The seed showed "Setting it out…" for 34 s.
A 60-row import took 53 s with progress shown.
Water all 20 took 9 s.
What the WebKit waits now allow, and a person would call broken:
smoke 2584-2586: 90 s for "400" after two restores, about 80 s of "Opening your collection…";
seedWait: 46 s of "Setting it out…";
r61g 4: a 60-row import bounded at 174 s;
smoke 2562 and 2580: 125 s for a restore;
every WebKit assertion: 10 s.
No WebKit coverage of offline: the skips (smoke 1342 and 1988) leave the offline story, the iPhone's main case, untested there.
Fix: request-budget tests in Chromium with a counting wrapper (seed ≤ 1,400 requests, ≤ 60 per imported plant, reopen ≤ 50), so a regression fails whatever the engine's pace. Then the check on a real iPhone, which is still not done.
E. Interface and accessibility

25. Smaller interface items (confirmed unless marked).

Today's place headings run together in Chromium's accessibility tree: "Bench 24 growing" and "Kitchen windowsill2 growing" (today/+page.svelte:374). That is what NVDA or TalkBack on Chrome would read. Fix: a hidden ", " in the count.
axe, serious: label-content-name-mismatch on chips that show "All4" labelled "All, 4" (+page.svelte:784-786, ToggleGroup.svelte:33), on the front page, Propagation and My plants. It is the only rule that fired across 12 pages, both themes and both widths.
The menu: marks the current page by colour only, with no aria-current (+layout.svelte:325). Its items are 41 px tall against the 44 px token (:431).
At 320 with 200% text:
The front page's welcome runs 217-804 px against a tab bar at 583, so the search starts at about 820.
On example pages the example bar takes 390 of 640 px.
The example bar's status says "Setting it out…", then goes empty, so nothing says when the example is ready.
Spending: 1 200 € (a space as thousands separator) isn't read.
Import: "Check names" is greyed out while the collection opens, with no reason given.
The picker after "Add another" (suspected): an answer still in flight for the previous name can settle its key onto the empty field (SpeciesPicker.svelte:165, plants/new/+page.svelte:189). Fix: bump reqGen when the value changes from outside.
F. The harness

26. Seven of 70 reverts stay green (confirmed).

Fix	Revert	Why green	Smallest test
One write per new place	drop if (making) return making	nothing presses "Add place" twice in flight	slow the write, press twice, expect one place
settlePlaces in Start batch, Pot up, batch Save, plant Edit Save	each commented out	no spec uses New… in those pickers	r66y 7's steps on each form
adoptStored doesn't re-measure	follow() first	no test moves the clock between one tab's write and another's storage event	exactly that; expect one listener call
observe at PAST_BIT-1, and bump never on the mark	each alone	each masks the other; both together go red	observe 0x7fffff; expect count 0 next tick
plan.mixed only when renumbered	drop the condition	the page shows the sentence only when renumbered	planNumbers on a mixed sheet with no repeats
Sweep hold dated clock()	hold(name, now)	the renew before the delete re-dates it	an upload's hold refused before the renew
Smoke "path species" passes with no settlePlaces at all, and the race from round 66 (Move pressed while "Add place" is still writing) has no deterministic test.
Red: the other 63, round 66's Leave count and late reference answer among them. None went red only sometimes.

27. The disclosure helper: cause not found, and it hides nothing a person would meet beyond a missed tap.

Without the helper: a single click plus toHaveAttribute('open') passed 110 of 110 runs in Chromium across the 11 tests that use it.
Two probes disagree:
One reproduced the symptom mechanically: a press, the page moving 21 px, then the release, which leaves focus on the summary and no toggle. On a cold load the Public Sans swap moves the page head by exactly 21 px.
The other sampled the summary every 50 ms after the CSV switch on a warm page and saw no movement.
Likeliest cause: a tap during the first font swap on a cold load.
Fix: the late-content and font shifts in 8 make it rarer. The helper is acceptable if it logs each second press.

28. Chromium-only tests that matter in Safari. 22 tests are left out of WebKit.

The service-worker takeover (r64f 4): this matters most, since finding 5 is in that code. Have the test server serve a second worker build behind an E2E flag instead of page.route.
Layout shift (r61a 5, r61g 6, r62a 61-5, r62ba N10, r63v V2): record element positions per frame instead of reading the Layout Instability API.
The 6x CPU numbering race: use r66y's slowOpen wrapper.
The accessibility tree (r62a 61-8): toMatchAriaSnapshot works in every engine.
r63fv front 2: needs only emulateMedia.
200% text: inject html{font-size:200%}.

29. Other harness points (confirmed).

Retries: a plain npx playwright test still retries once, and a retry-only pass exits 0. Only predeploy.mjs sets CI_STRICT and --fail-on-flaky-tests. My full run needed no retry.
Raw database writes: two remain in smoke, the backup round trip near :503 and "round twenty-eight" near :2571. They clear changes and photos but leave meta.fold and order, the same race class as last review's #44. Everything else uses inject.ts.
The fold guard now has a behaviour hash too, but passes with these changed:
io.fileParks keeping an older build's clock-only parks;
stillWaiting always true;
applyParked not applying a parked restore;
parkedFor offering the earliest parked value.
The bundle gate runs from attach-do.mjs at every build, not as postbuild. It is real for backup and vacuous for grow (finding 13).
The claims, checked
REVIEW-TRIAGE-61:
Done: 1, 2, 4, 5, 7, 11 and 12.
Done differently:
3: the set-back rule is a fixed list of nouns, not a capitals test.
6: the "MET alone" branch was removed on purpose (forecast/+server.ts:80-82).
9: no ifs, but substring checks (finding 13).
10: the gate runs from attach-do.mjs.
Done with holes:
8: the first screen, corrected in round 63, but finding 4.
10: the grow ban.
The deferred list: closed in round 63. Printers and VoiceOver are left to the owner's manual checks.
Round sixty-three, sections 2 to 8:
§2 is done except the Leave count (16) and "empty" (20).
§3 to §8 are done, apart from findings 9, 10 and 12.
§5: backup format 3, w, the import's numbering.
§6: the sweep, the /24 rule, the /48 12 GB total, the 429 wording.
§7 and §8 done.
Round sixty-six: the Leave count before the stamp, the late reference answer, and the place settled before save each go red when reverted.
REVIEW-ROUND-44's 44 findings:
Fixed: 1-4, 6-8, 10-27, 29-31, 33, 35-42 and 44.
Stated as designed: 28, and 32 with its counter clamp built.
Partly: 5 (drifted again: finding 13), 9 (now findings 2 and 16), 34 (a different rule, finding 9) and 43 (the grow ban).
Also checked and sound
The example:
A grower with plants: they opened it from the menu, watered, added and left, after a prompt that counted 6 records correctly. Their database, localStorage and cookies were the same before and after.
Kept apart from the grower's: hasMine, the monthly persist ask, the frost site, the units and hemisphere cookies, and (outside finding 17) the compare tray and last place.
Separately named and guarded: sync, the vault channel, backup and staging.
Browsing without editing, then Leave, asks nothing.
Back and the back-forward cache behave. A storage refusal for the flag is explained. The same tab offers rather than reopens after Leave. A new tab on an empty device opens it again, which is by design and not a loop.
It's worth keeping: the bar shows within about 0.5 s on a fresh phone, and "Water 2 here" makes the page's job obvious. It needs findings 1 to 3 to be honest about whose plants these are. Giving the example a fixed frost site of its own would show the feature it promises; today it shows "No site set".
Phone and tab bar:
The bar: landmarks and aria-current are right on the tabs. At 320 with 200% text the bar switches to icons and keeps the labels as names (last review's #11 is closed).
400% zoom: the menu holds every place. Forced colours mark the current tab.
Targets and the menu: tabs 78×56, buttons 44 px. The menu traps Tab and Escape returns focus.
Fixed from last review: "Show N more", "Use it", the repeated toast sentence, spending formats and Escape in select mode are all fixed.
Search:
Hybrids, invisible characters and cultivars: both hybrid crosses are flagged retries. A trailing full stop keeps its word. The picker sends text as typed. Unquoted cultivars fall back to the genus. Zero-width, soft hyphen and full-width characters work. "Echeveria Lola" and "cv. Lola" no longer give lilacina.
Refusals and stated words: a 400 or 429 on the picker is "not asked". In 44 queries, the words the search said it used were the words it used. "Aloe Verra" gives only Aloe vera.
Slash lists stay whole.
Records and clock:
No fold reads w. FOLD_RULES 7 holds.
Rule 5 holds: scanClock, judgeOwn, takeBatch, backup export (storedParks), recordedTimes and the renumber note write nothing to the log.
Tabs and daylight saving: the correction is shared across tabs without double counting, and daylight saving changes nothing.
Photos stored as bytes round-trip through backup, restore, staging and sync.
Numbering patterns: CF-001, A1/A9, 1.9/1.10 and mixed widths are read right, and numbers sort as numbers.
Versions:
Current backups: a format 3 backup is refused by rounds 61 (run) and 62 (read).
Round 62 backups: they lose only w on restore.
Batches: a v2 batch waits on round 61.
Repairs: rounds 62 and current converge on renumber repairs.
Server:
Reclaim: needs evidence (reclaimedAt or the sweep's r: note, written in the same transaction).
The sweep: its mark is written first, an unreadable pointer removes nothing, and a stuck mark is dropped after 7 nights. Runs of 100 continue from a cursor.
The sheets refusal is kept for exactly its Retry-After and never cached.
Last review's 23, 24 and 29 to 31 are closed.
2027: the suite passes with the clock in 2027. No e2e "2026" depends on the year.
In three sentences

What's best is that five rounds closed nearly all of the last review honestly:

the clock rule converges;
the fold guard now hashes behaviour as well as source;
axe fires one minor rule across twelve pages;
350 Chromium end-to-end tests and 2,039 unit tests pass on Node 22 and 24 with no retries.

A skeptical first visitor will tap Today on a fresh phone, add their real first plant with "+" under a bar that says their own hasn't started, close the tab, and find it gone. A Firefox user is asked to keep data on every page. If I could fix only one thing it would be finding 2: make dropLeftoverSample count the visitor's own edits before it deletes, because it is the one path where the site deletes something a person typed without asking them.