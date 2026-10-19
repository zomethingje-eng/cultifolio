# Round 77, agent F: small fixes

Branch `r77` in `/tmp/claude-0/rev77/F`, commits on `r77base` (`3aad821`). Nothing touched in the search code, `src/lib/dossier/lookups.ts` or `src/lib/server/lookup.ts`.

## Done

### 1. `scripts/tail-summary.mjs` reads PowerShell's file, and sums it up

- **Why it said "holds no requests".** Windows PowerShell 5.1's `>` writes UTF-16 little endian with a mark (FF FE). The script read the bytes as UTF-8, so every character had a zero byte beside it and no object parsed. It also treated a quote outside any object as the start of a string, so one stray quote in a warning line hid everything after it.
- **Now it reads:**
  - UTF-16 little and big endian, with a mark or without one (told by where the zero bytes fall);
  - UTF-8 with or without a mark;
  - wrangler's own output: one object a request, written by `JSON.stringify(event, null, 2)` (checked in wrangler 4.143's source), one after another;
  - NDJSON, one object a line;
  - CRLF line ends.
- A `{` at the start of a line always starts a new object. Text outside objects is passed by. A piece that does not parse is counted and said: Ctrl-C often cuts off the last request.
- **What it prints, in plain words:**
  - how many requests the file holds, and how many came from robots, by the name each gives (Googlebot, bingbot and the rest);
  - a table by kind: species page, front page, catalogue (`/api/rows`), search, dossier API, other. Each row gives the count, the median ("middle"), the 90th percentile ("9 in 10") and the most CPU, the same three for wall time, and the outcomes;
  - the slowest five by CPU, each with its address and robot;
  - every request, one a line, with `--all`, or when there are 20 or fewer;
  - any outcome other than `ok` between rows of `!!!`, at the top and again at the bottom;
  - an answer with status 500 or above that still ended `ok`;
  - "What to do next": nothing, a note for the round's notes (a species page over 300 ms, a search over 1,000 ms), send the output now, or use the dashboard when the file has no CPU times.
- **When the file holds no requests,** the script says the size and encoding it read and what to do.
- **`docs/DEPLOY.md`:**
  - the tail steps say "cmd or PowerShell", and each line works in both shells;
  - step 4 says the "Terminate batch job" question is cmd's alone;
  - step 5 now describes the new output (the old `findstr` line is gone; it does not work on a UTF-16 file);
  - "When to act" adds that a crawler on an uncached species page costs what a cold one does;
  - "no requests" now says what to do;
  - the 50,000-species memory test's steps 1, 5 and 7 are updated the same way.
- **Test:** `tests/unit/r77f-tail-summary.test.ts`, 10 cases. With the base script, all 9 run-the-script cases fail: the PowerShell file of 156 requests reads as "holds no requests", and so do UTF-16 big endian and UTF-16 without a mark. NDJSON with a stray quote in a warning line reads none. No per-kind table, slowest five, robots or loud alarm. `r76w-tail-summary` still passes, unchanged.

### 2. Entering the example: a token in the address, as Leave has

- **Before.** `enterDemo` set the tab's flag before it navigated. A Cancel was undone by `navigateerror`, or, in a browser that does not report one, by a 3 s timer. A reload before that timer fired opened the example in a tab that had answered Cancel.
- **Now.**
  - `enterDemo` writes only a one-use token, `cultifolio.sampleEntering`, and goes to `to?enter=<token>`.
  - app.html's first script sets `cultifolio.demo` only when the address's token matches the tab's own, and only when the address does not also carry `left=`. In the same step it notes the tab's generation and drops a pending "closed" note. It takes the token off whether or not it matched.
  - The example's bar (`DemoBar.svelte`) takes `enter=` off the address, as it already took off `left=`.
  - The CSP hash in `svelte.config.js` is updated (`r61h-csp-hash` passes).
  - A Cancel, a reload or a closed tab leaves nothing to undo.
- **The button's words.** Leave and entering now share one helper, `whileGoing` in `src/lib/db/demo.ts`. The button comes back:
  - at once on `navigateerror`;
  - at the first press or key after "Leave site?";
  - after 3 s with the question asked;
  - after 10 s in any case.

  Only the button's words rest on this timing.
- **Tests:**
  - `tests/e2e/r77f-enter.spec.ts`, Chromium with the Navigation API removed, as `r75h-leave` does it. On a base build, tests 1 and 2 fail:
    - test 1: after Cancel and a reload, the flag is "1" and the example has opened;
    - test 2: the button is not back within 1 s.

    Test 3 (an entry that goes enters, at `/today` with the token taken off the address) passes on both. Tests 1 and 3 also run on the phone.
  - `tests/unit/r77f-enter.test.ts`, 6 cases: 4 fail on base, and 2 guards pass on both.
- **Unit tests changed.** Five unit test files encoded the old order. Each changed test now records its r77base value in a comment:
  - `r63v-example`: "enterDemo opens on the page it is given";
  - `r69x-left`: "entering notes the device's generation" (it now runs the first script at the entry's address);
  - `r63fv-example`: four cases, now asserting the token address, no flag before the page goes, and the button words decided by the timer;
  - `r69x-empty` and `r70x-keep` (MX25): the token address.
- **Stale comment fixed:** `ExampleOffer.svelte`'s comment saying the tab's flag is set at the press.

### 3. `--fill commons-kind` asked one file on every run

- **The file.** I ran the fill offline over `real-s` with a fetcher that records each request. It asked two files in one request:
  - `File:Heterodoxa pt12.JPG`: unread in that copy; read once, then `described` is set;
  - `File:Boswellia papyrifera.jpg`: asked on every run.
- **Why Boswellia's file was asked every run.** Round 72's `kindToReadAgain` asks again any file left out only by its description, so that a narrower rule reaches files read before it. A file the rule still reads as a herbarium sheet stays one, and was therefore asked again on every run.
- **The fix.**
  - The fill now writes `kindRule` on each file it reads.
  - `kindRule` is `SOURCE_KIND_RULE`, a new constant set to 72, placed beside `sourceKind` in `photo-kind.ts`, with a note to raise it whenever the description rules change.
  - A file is asked again only when its `kindRule` is lower than the constant.
  - `Photo` in `schema.ts` gains `kindRule`.
- **Test:** `tests/unit/r77f-commons-kind-rerun.test.ts` uses both photographs exactly as the corpus stores them, and Commons' categories as the fill recorded them. The first run asks both files in one request; the second run asks nothing and writes nothing. On base, the second run asks `File:Boswellia papyrifera.jpg`. A guard checks that a lower `kindRule` is still asked once.
- **The stand-in description.** Commons refused this workspace twice ("too many requests"), and I did not ask again. Boswellia's description is not kept in the corpus, so the test uses a stand-in that the rule reads as the stored kind. A case checks that the stand-in gives the stored kind.

### 4. Other small things

- **DEPLOY.md, section 3:** "On Cloudflare it has not been measured" was stale. It now gives the brief's figures (every request `ok`, at most 298 ms of CPU).
- **DEPLOY.md, cmd-only lines:**
  - `cd /d` is cmd only. Round 76's Step 1 and round 73's Step 1 now give the PowerShell line too.
  - The flake check says "cmd or PowerShell".
  - The header now says that a line given once is the same in both shells.
- **Dead links:** none found. I checked every relative link in `docs/**/*.md`, every `scripts/`, `docs/`, `tests/` and `src/` path DEPLOY.md names, and every `/about/…#anchor` in the routes.

### About-page sentences (each checked against the code)

- **`/about/formats#sample`.**
  - After "Nothing opens it by itself: arriving on a page, by a tab, a link or its address, never does." it adds: "The button goes to its page at an address that says so (`?enter=` and a one-use token the button writes in the tab's session storage, `cultifolio.sampleEntering`), and that page's first script sets the flag only when the token matches the one written in that same tab, taking the token off as it reads it, and the page then takes it off the address; so a copied link, a bookmark, the history or another tab's address opens nothing."
  - The Cancel sentence gains "however soon the page is reloaded after, since nothing but the token was written before it".
  - "refuses the flag" becomes "refuses the token".
- **`/about/formats`, photo fields.** "`kind` … and `sourceRead` (set once the fill has read them)" becomes "`kind` …, `sourceRead` (set once the fill has read them) and `kindRule` (the version of the description rules that read it; a file left out by its description is asked again only when those rules are newer)".
- **`/about/how`.** The session-storage list gains `cultifolio.sampleEntering` (a one-use token the button writes and its address carries; only when the two match does the page it opens set `cultifolio.demo`).

## Needs

None.

## For the owner's PC

1. **After the next deploy,** in cmd or PowerShell: `npx wrangler tail cultifolio --format json > tail.json`, open the four pages, Ctrl-C, then `node scripts/tail-summary.mjs tail.json`. The round-76 file that read as "holds no requests" can be read again now with `node scripts/tail-summary.mjs tail.json`. Send what it prints.
2. **The next corpus step's `--fill commons-kind`** asks `File:Boswellia papyrifera.jpg` one last time and writes `kindRule` into its dossier, 5421356, which goes up with the next upload. After that the fill asks nothing until the rule changes.

## Measured

- A PowerShell-style file of 156 requests (UTF-16 with its mark, CRLF): r77base prints "holds no requests"; the new script reads all 156 and names the 152 crawler requests.
- `--fill commons-kind` offline over `real-s`: 4,391 Commons files, 4,389 passed by, 2 asked in 1 request (named above).
- Whole unit suite, run with no browser run going: 4,009 passed, 8 skipped. The first full run found 6 more unit tests that encoded the old entry order: 4 in `r63fv-example`, and 1 each in `r69x-empty` and `r70x-keep` (MX25). Each now records its r77base value in a comment.
- Strict Chromium and the phone, fresh server, 32 affected spec files (every spec that enters or leaves the example, reads the about pages or the tab's flags, the smoke specs, and r77f-enter): 333 passed, 5 skipped, none flaky, in 14.7 min. On a base build, r77f-enter tests 1 and 2 fail as stated, and test 3 passes.
- `tsc` and `svelte-check --threshold error`: no errors.

Commits: `0a5cbfe` (tail summary), `5accd48` and `d25c0fb` (the commons-kind fill), `a678d97` (entering), and `12aefd5` (three unit test files updated).

## Not done, with why

- **The real Commons description of `File:Boswellia papyrifera.jpg`** was not recorded: Commons refused this workspace twice, and I did not ask again.
- **Firefox and WebKit** are not in this workspace. The entry's fix holds wherever the first script runs, which is what the owner's all-engines run checks.
