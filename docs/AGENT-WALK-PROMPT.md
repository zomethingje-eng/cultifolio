# Prompt: a multi-agent walk of Cultifolio v3

Paste everything below the line into a new chat with the project folder `C:\Users\jefar\Desktop\AI Work\Cultifolio v3` connected. It is written for a session that can spawn subagents and run a browser in its own sandbox.

---

You are testing Cultifolio v3, a species reference (8,947 species) with a private, on-device plant-collection tracker, built in SvelteKit 5 on Cloudflare Workers. It is about to be posted to Show HN. The live site is https://cultifolio.com; the source is public at https://github.com/zomethingje-eng/cultifolio. The connected folder on my PC is the working checkout. I want six independent walkthroughs of the current build by six subagents, each playing one kind of person, and then a triaged list of what they found. Accuracy first: a finding is only a finding if the agent saw it and can say how to reproduce it.

## Set up the build in your sandbox (do this yourself, once)

1. `git clone https://github.com/zomethingje-eng/cultifolio` into your sandbox and `npm install`. Playwright's Chromium is preinstalled in the sandbox; do not run `playwright install`. If `@playwright/test` needs a browser path, use `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (check `ls /opt/pw-browsers`).
2. The real species corpus is on my PC at `C:\Users\jefar\Desktop\AI Work\Cultifolio v3\corpus.zip` (a zip of `static\s\v2`: `index.json`, 8,947 dossiers and 1,321 genus files under `g/`). Stage it into the sandbox and unzip it so the files land at `static/s/v2/` inside the clone. The server reads that folder before falling back to the four-species test fixtures, so the agents will see the real reference. Photographs are external URLs and will not load in the sandbox; that is expected and not a finding.
3. Build and serve: `npm run build`, then `npx wrangler dev --port 4173` in the background; wait for "Ready on". Confirm `curl -s http://127.0.0.1:4173/api/index | head -c 200` returns real species. If a build step fails, read `docs/DEPLOY.md` and `README.md` before guessing.
4. Sanity-run the existing suites so you know the baseline: `npx vitest run` (30 files) and `npx playwright test tests/e2e/smoke.spec.ts --workers=1` (46 tests, ~2 min). Note any failures; they are the baseline, not findings.

## Then spawn six subagents in parallel, on the cheapest model that can drive a browser well (Sonnet), one persona each

Give each agent: the base URL `http://127.0.0.1:4173`, its persona and tasks below, the reporting rules, and nothing else. Each agent gets its own Playwright browser context (fresh storage). They must not edit any file; they report.

**A. The stranger.** Arrives from a Hacker News comment link straight at `/species/ariocarpus-fissuratus` on a phone-sized viewport (390 × 800). Reads the page top to bottom. Uses the section row. Taps the temperature to switch units. Goes to the front page, searches "lithops", opens a genus, opens a species, uses Compare with three species, opens the share card. Never adds a plant. Question to answer: what did you not understand, where did you get lost, what did you expect that did not happen.

**B. The collector.** Desktop, 1280 wide. Adds fifteen plants of real species (use the search), some with field numbers and provenance, three as cultivars or hybrids. Makes a greenhouse with two benches inside it, sets a floor temperature on one, moves plants onto benches. Waters a bench, audits it. Edits a plant, removes a plant, restores it from the log if possible. Uses the labels page and prints (to PDF is fine). Question: what took more steps than it should, what did you enter that the app lost or changed, what number or date came out wrong.

**C. The sower.** Phone-sized. Sows a batch of seed from a species page, records germination counts over "days" (edit the dates), records a loss, pots up three seedlings, checks their pages and provenance, marks the batch done. Starts a cutting from an existing plant. Question: does a plant raised from a batch tell the truth about where it came from, and does the batch tell the truth about what became of it.

**D. The one who goes offline.** Desktop. Adds two plants, makes a bench, then sets the browser context offline (`context.setOffline(true)`) and: opens a plant page, waters it, adds a note, opens a bench, opens the species page of a species already visited and one never visited, opens the front page. Comes back online and reloads each. Question: what worked offline, what broke, and did anything recorded offline get lost or doubled when back online.

**E. The keyboard and screen-reader user.** Desktop. No mouse: Tab, Enter, Escape, arrow keys only. Reaches the menu, every place in the top bar, the search, a genus row, a species page's section row and its disclosures, the Add-a-plant form end to end, a plant's quick verbs and the More button, the compare tray. Reads the accessibility tree (`page.accessibility.snapshot()` or an equivalent) for the species page and the plant page and reports any control without a name, any image without alt text, any heading level that jumps. Question: where did focus go somewhere you did not expect, or get stuck.

**F. The settings and units person.** Phone-sized, browser locale `en-US`. Notes what units the site shows before touching Settings. Sets a site (40.44, -79.99), Fahrenheit, a prefix numbering scheme with 5 digits, dark appearance. Adds a plant and checks its number. Visits a species page, the frost page, a bench with a floor set in °F, the compare page, the labels page, and checks every temperature and rain figure is in the chosen units and the same figure appears the same way everywhere. Switches back to metric on the species page's cold-floor card and checks the frost page follows. Question: where did a unit, a number format or a hemisphere disagree between two pages.

## Reporting rules for every agent

- Report only what you saw. Each finding: a one-line title, severity (blocks a task / wrong figure or lost data / confusing / cosmetic), the exact steps to reproduce from a fresh browser, what you expected, what happened, and the URL. No design opinions, no "consider adding"; a missing feature is not a finding unless the app promised it.
- Do not report photographs failing to load (external hosts are blocked in the sandbox).
- Do not report anything the baseline suites already fail on.
- Twenty findings maximum per agent; the first-visit confusion and lost-data ones matter most.
- Finish with three sentences: what worked well, what you would tell a friend about it, what you would warn them about.

## When they are back

1. Verify every finding yourself against the running build and the source before you accept it; mark each Confirmed, Could not reproduce, or Not a defect (with why). Agents confirm their own hypotheses; do not take a report on trust.
2. Write `docs/AGENT-WALK-1.md`: the setup you used, the baseline suite results, then the confirmed findings ranked by severity with the file and line that causes each, then the rejected ones in a short list with the reason.
3. Fix the confirmed defects that are clearly defects (wrong figure, lost data, broken flow, missing name on a control). Do not redesign anything; leave "confusing" findings as recommendations in the doc unless the fix is one line of copy. Add or adjust an e2e test for each fixed defect. Run `npx svelte-check --threshold warning`, `npx vitest run` and the e2e suite; all must pass.
4. Write a DEVLOG entry at the end of `docs/DEVLOG.md` in the same voice as the entries there (prose, no bullet lists, one paragraph, what was found and what was done).
5. Copy every changed file back to the connected folder on my PC, preserving paths. Do not commit or push; I do that. Tell me the `git add -A; git commit -m "…"; git push` line and that `npm run deploy` follows. In PowerShell use `;` between commands, never `&&`.

Standing rules for this codebase: every derived figure says its source; a refusal from an upstream source is shown as "not checked", never as an absence; nothing on a species page is written by a person or a model except the quoted Wikipedia passages; there are no accounts, no analytics, and the collection never leaves the device except through the encrypted sync the user sets up. Do not paste keys or tokens anywhere. The v1 and v2 folders beside this project are frozen; do not touch them.
