# Review prompt, round sixty

Paste everything below the line to the reviewing model. Give it the repository (`https://github.com/zomethingje-eng/cultifolio`, commit `21257b7` or later), a checkout with `npm install` done if it can run code, and the live site `https://cultifolio.com` (the real corpus, 8,947 species, manifest `0db12ae5de39052e`, with every English common name in the index; a checkout serves a four-species fixture corpus with no manifest). The round's own account is `docs/REVIEW-ROUND-60.md`; what it answered is `docs/REVIEW-TRIAGE-59.md` (the triage of three reviews) and `docs/REVIEW-SELF-59.md`; the engineering log is `docs/DEVLOG.md`, last paragraph; `docs/DEPLOY.md` section 5 is the corpus refresh and the prune.

---

You are reviewing Cultifolio, a SvelteKit 2 / Svelte 5 (runes) application on Cloudflare Workers. It has two halves. One is a species reference for cactus, succulent and bulb growers: 8,947 species, each page derived from public data (GBIF, Kew's WCVP, CHELSA, NASA POWER, iNaturalist, Wikimedia Commons, Wikipedia). The other is a private collection tracker that lives in the browser as an append-only change log, synced end-to-end encrypted when the grower chooses. It is heading for Show HN. Nobody uses it yet, the author included.

Round sixty is the largest round in the project's history: 178 files, about 11,500 lines added and 1,300 removed. It claims to do everything a triage of three reviews kept, plus a list of experience work. Six agents did it. Four worked in separate copies (server and corpus; the public pages; the private pages and accessibility; new grower features) while the data layer was changed in the main checkout. Their work was merged three-way against one base. Two more agents adopted the reviewers' tests and wrote end-to-end tests for the new features. So test three things before anything else:

- **The claim that nothing in the triage is left outstanding.** Take `REVIEW-TRIAGE-59.md` item by item and find what is missing, half done, or done differently from what it decided.
- **The seams between the agents' work.** A word changed in one file but not in its twin. A rule stated on `/about/formats` that one agent wrote and another's code does not keep. A component two agents both touched.
- **The new features nobody has reviewed yet:** import, select mode, the watering calendar, the sample collection and the label code.

Your job is to find what is wrong. Give reproductions, not impressions: a finding names a file and line, or a request and its answer, or a sequence of steps and what appeared.

## The rules the project holds itself to

A claim the code does not keep is a finding.

1. Every figure on a species page states its source. Nothing on a species page is written by a person or a language model. Every sentence is one of three things: a quoted passage, marked and credited; a figure with its source; or a labelled reading of a fixed rule. No AI images.
2. A refusal is not an absence. A source that did not answer is "not checked", never "none". A refused request is said as a refusal, never as "nothing matches".
3. Nothing derived is smoothed, guessed or inferred beyond what the rule states.
4. The collection is the grower's alone: on the device, synced only if they set it up, and encrypted so the server never reads it. No accounts, no analytics, no third-party scripts. `/about/how` lists every request the site's pages make and every host they load from. `/about/formats` states every format and rule. Both must be true of the code at this commit.
5. The log is the collection. Anything else the device keeps (a snapshot, an index, a cache) is a reading of the log and must be droppable without loss. No reading of the log may write to the log.

## What changed (look here hardest)

### 1. Wrong clocks (`src/lib/core/hlc.ts` `trustedAge`, `clockChecked`, `trustServerTime`; `src/lib/core/log.ts` `isParked`, FOLD_RULES 5; `src/lib/db/collection.svelte.ts` `stampPast`, `staleOwn`, `commit`, `checkClock`, the snapshot key; `tests/unit/r60-clock-review.test.ts`, `r60-fuzz.test.ts`, `fold-rules.test.ts`)

The round made four decisions:

- **An edit always wins.** An edit is stamped past the field's current stamp, however far ahead that stamp is.
- **This device's own changes are never parked by its own clock.** `isParked` exempts them when there is no arrival to judge by. When the clock is confirmed and an edit would be stamped past one of this device's own stamps that is more than two days ahead, that old stamp is parked as part of the edit and the fold is rebuilt.
- **A reading dated after the clock is not a confirmation.** A server reading confirms the clock only if its age is between minus five minutes and a week. The slack was one minute until the end-to-end suite needed more.
- **The fold snapshot is keyed by whether the clock is confirmed.**

Probe them:

- **Stamping past a stamp years ahead.** It makes every later edit to that field carry a stamp years ahead too. Does that stamp travel to other devices and win there over edits made at true time? Does it make the field uneditable from a correct device, or move a correct device's HLC forward? Follow one field through two devices for five edits.
- **Parking the device's own stale stamp as part of an edit.** That writes a park record in response to a write, not a reading, so rule 5 is not broken on its face. Is it right, though? What does the grower see on the record afterwards, and can Apply bring back the old value? What happens if the edit itself fails to commit?
- **The five-minute slack.** Is there a real-world clock change (daylight saving on a device that keeps local time wrongly, a manual change, a dual-boot machine) that falls inside it and lets a set-back clock count as confirmed? Is there one just outside it that drops a correct correction?
- **The known divergence.** A device three days fast keeps its own edit folded, while its peers park that edit by its arrival. The convergence fuzz shows records shown differently by different devices in 26 of 120 skewed seeds, and 2 without the three-day-ahead skew. The round traced one seed and calls the rest the same case. Check that claim. Find a divergence that is not this case, or one that persists after the grower presses Apply on every peer.
- **The guard.** The fold-rules hash now covers the engine's `hold` and `takeBatch`. Name code that shapes a fold or a snapshot and still is not hashed.

### 2. Numbers two plants share (`src/lib/db/links.ts`; `collection.svelte.ts` `withNumber`, `restore`; `src/routes/plants/[acc]/+page.svelte` chooser; `src/routes/labels/+page.svelte`; `src/lib/backup/backup.ts` `sharedNumbers`, `csvCell`; `src/lib/import/csv.ts`)

Links go by record id while a number is shared. A bare shared number opens a chooser. Labels refuse an ambiguous `?acc=`. A restore gives up its number only to a record born after the removal. The CSVs gain id columns and write number-like text as `="…"`.

- **The links.** Find every place that still links, navigates or acts by number: the toast after an add, Today, a printed QR code, the share card, the sync page, search results, the undo of a removal, browser history and bookmarks. Any one that opens the wrong plant, or writes to it, while a number is shared is a finding.
- **"Born after the removal".** It compares HLC stamps from two devices. Under clock skew, can it judge the wrong way, and what does the grower then see?
- **The `="…"` form.** It stops Excel and Google Sheets converting `0012` or `3-12`. What do LibreOffice, Numbers and Sheets' own import actually show? Is anything that is not number-like now wrapped? Does the app's own import read every exported sheet back exactly?

### 3. The server (`src/lib/server/sync.ts`, `counters.ts`, `dossiers.ts`, `src/hooks.server.ts`, `_headers`, `svelte.config.js` CSP; `tests/unit/server-r60.test.ts`, `hooks-r60.test.ts`, `r60-review-server*.test.ts`)

The changes:

- **Uploads.** In-flight bytes are now leases (`p:<id>`) that lapse after ten minutes. A recount is committed only if no upload landed and no removal was made while it was being taken.
- **Admission.** It fails closed: a counter that cannot be read answers 503. A vault takes its place among the day's 200 and the 2,000 in all at its first stored object, and a failed first write gives the place back.
- **Photographs.** A PUT and a DELETE of one photograph are serialised by a hold in the counter object. Receipts use R2's object version. A removal older than a newer upload of the same photograph is answered 409. The device now sends the removal's time in `X-Photo-Removed-At`.
- **Outside services.** Calls are capped at 600 a minute for the whole site.
- **Requests and headers.** Renders the cache cannot hold are counted per address and per /48. `Sec-Fetch-Site` alone decides the origin check when present. Private pages get `X-Robots-Tag: noindex`, CSP `img-src` lists four photograph hosts, and odd species addresses are redirected 301 to their slug.

Probe them:

- **`X-Photo-Removed-At` is client-supplied.** What can a holder of the bearer token and the drop proof do by lying about it? Can a vault's photographs be made undeletable? Can a newer upload be removed?
- **The global cap on outside services is shared by everyone.** How cheaply can one client exhaust it, through which routes, and what does every other visitor's frost watch and name picker show while it is exhausted? Is that refusal said as a refusal (rule 2)?
- **Fail-closed admission and `unadmit`.** Find a sequence where a vault holds objects but is not counted, or is counted twice, or has its place given back while it holds something. Include a Worker killed between the write and the meta update.
- **The holds.** Each lapses after 60 seconds. A photograph whose PUT takes longer than that (a slow phone uploading 4 MB) can lose its hold mid-write. What then?
- **The origin rule.** Find a real request a browser sends that `Sec-Fetch-Site` handling now refuses or lets through wrongly: the installed app, a service-worker request, a redirect.
- **The 301 for odd species addresses.** Can it loop, be used as an open redirect, or mint unbounded cache keys?

### 4. The corpus and search (`src/lib/server/dossiers.ts` `searchAnswer`, `relaxedQuery` in `src/lib/core/search.ts`, `src/routes/api/search/+server.ts`, `src/lib/ui/index.svelte.ts` `searchCatalogue`, `src/lib/dossier/index-entry.ts` `englishNames`, `src/routes/species/[slug]/+page.server.ts`)

Search now:

- skips rank markers (var., subsp., f., cv. and their spellings);
- reads "x" and "×" as hybrid marks;
- drops a pasted author citation;
- searches every English common name;
- on no match, searches the first two words again and says "Showing results for …". The front page reads that from the `x-search-relaxed` header; the species 404's "Did you mean" uses it too.

Other corpus changes:

- A refused or unreadable index answers 503, never the fixture.
- An R2 error keeps the corpus already held.
- A dossier the index lists but cannot be read answers 503.
- `/api/dossier` is `no-store`.
- Search answers are kept a day in the Worker's cache, keyed by the cleaned query.

Probe them:

- **The relaxed retry.** It can answer a query with a different species than the one typed. Find a grower's query where "Showing results for" leads somewhere misleading, such as a hybrid, a cultivar, a genus-only name or a misspelt genus. Find one where the retry should fire and does not. Check what the add form's picker and the import do with a relaxed answer: they get it as a plain list.
- **Two spellings, two answers.** On the live site, find two spellings of one query answered differently: case, accents, a doubled word, a trailing rank, curly quotes.
- **The common name shown.** The displayed name is GBIF's first English name. "String-Of-Beads Senecio" for Curio rowleyanus is one example. How widespread is this on the live corpus? Propose a rule, with no hand-picked names, that chooses a better one.
- **Privacy of the search cache.** It holds query text for a day. Is that stated where the grower reads about privacy, and is any query from a private page (a plant number, a name typed on "Your species") ever sent?

### 5. The public pages (`src/routes/+page.svelte`, `+page.server.ts` `feature`; `src/routes/species/[slug]/+page.svelte`; `src/lib/ui/ref/*`; `src/lib/core/sheet.ts`, `arch.ts`, `arch-tables.json`; `src/routes/compare/*`; `src/routes/about/*`; `src/lib/share/card.ts`)

- **The front page.** A visitor on a desktop sees one species' figures and chart ("This is what every species page shows"), read from the corpus on every render the page cache does not hold. On a phone it is a link, so the search and first catalogue row stay on the first screen. The welcome line offers a sample collection.
- **The species page.** Cards are closed at rest, there is one "How this section is made" per section, a season card shows the reader's months, the figures carry grower labels ("Coldest nights in the wild"), and a missing photograph leaves no grey box.
- **The archetype table.** It never raises a habitat floor. Its minimum is shown as a convention with no source.

Read them against rules 1 to 3:

- Is any sentence on a species page, the front page's feature, compare or the share card not a quotation, a sourced figure or a labelled rule reading?
- Does "Coldest nights in the wild" or "Warmest days in the wild" say more than the figure (a 1st-percentile night at a typical spot in the range)?
- Is the convention minimum shown anywhere without saying it has no source?
- On a phone and at 1280 wide, is the front page's first screen clear about what the site is?

Check `/about/how` and `/about/formats` line by line against the code. They were rewritten by several agents and reconciled by hand.

### 6. The private pages and the new grower features (`src/lib/import/*`, `src/routes/plants/import/+page.svelte`; `src/lib/export/ics.ts`, `rhythms.ts`; `src/lib/ui/grow/*`; `src/lib/db/demo.ts`, `vault.ts` DB_NAME; `src/routes/today/+page.svelte`, `plants/+page.svelte`, `labels/+page.svelte`, `backup/+page.svelte`, `sync/+page.svelte`; `tests/e2e/r60-grow.spec.ts`)

- **Import.** It takes a list pasted one plant per line, or a CSV with `,`, `;` or tab separators. Names are checked as the add form checks them. A number already used is replaced by the next free one. Missing places are made only if ticked.
  - Attack it: formula cells, a 10,000-row sheet, mixed line endings, a BOM in the middle, quoted newlines, `09/03/2024`, duplicate numbers inside the file, a place path with " › " inside a name.
  - Is the commit all-or-nothing? What does a full phone halfway through leave behind?
- **The watering calendar (`.ics`).** It has one repeating all-day event per place and per plant with its own rhythm, and dry months listed as `EXDATE` for two years.
  - Validate it against RFC 5545 and import it into Google Calendar, Apple Calendar and Outlook if you can.
  - All-day dates across time zones and daylight saving, a rhythm of 1 day, and a place with every month dry.
- **The sample collection.** It is a separate IndexedDB database chosen at page load from a `sessionStorage` flag.
  - Open the sample in one tab and the grower's collection in another. Do the BroadcastChannel, the service worker, the frost watch, the sync engine or the persist request cross between them?
  - Can anything of the sample reach the grower's log, a backup or a vault? Can leaving the sample fail and leave the grower in it?
- **The label code.** It is `/plants/<id>#s=<slug>&n=<name>`, and a phone without that plant shows "This label is from someone's collection: <name>". Try hostile values in `n` and `s`. Does the fragment ever reach the server or a referrer?
- **Select mode, the iPhone card, the persist request and the Wanted list.** Does each Undo undo exactly what was done?
- **Today, the backup preview and report, the sync page's words, settings, labels (A4 outside the US and Canada), focus after Undo, forced colours, and 44 px targets.** Check each at 390×844, at 320 px with 200% text, and at 1280, in light and dark. Run axe or a screen reader on the plant page, Today, import and the sample.

### 7. The harness

Reviewers' tests that reproduced fixed bugs were rewritten to assert the fixes. Eleven server tests and four clock tests were reworded this way. The round says each was checked by reverting the fix.

- **Mutation-check the rewrites yourself.** Revert one fix and see whether its test fails. Start with the clock tests, `r60-review-backup.test.ts` and the sync-engine photo-removal test.
- **The new e2e helper.** It writes changes straight into the page's IndexedDB and now waits for the stores. Find other e2e tests that depend on timing.
- **Run the suites.** Run the unit suite on Node 22 and Node 24, and the e2e suite, on Windows if you can. Say what you ran, where, and the counts.

## What is not in scope

These were left open on purpose; argue with any of them if you think it matters before launch:

- the prune race across two checkouts (one operator publishes);
- the per-/64 daily byte cap with no /48 total;
- `sheetsIn`'s fallback;
- photo credits by author on catalogue tiles, which needs a corpus field.

The data-model list (operation ids, an undo history, a move operation for places, per-device sequence numbers) is future work.

## How to report

Number your findings. For each, give:

- the file and line (or route and request);
- what the code does;
- what it should do;
- a reproduction, or the reasoning that stands in for one;
- the smallest fix.

Mark each confirmed (reproduced) or suspected (read, not run). Rank by what a reviewer on Show HN would find first, then by data loss, then by everything else. Then list the triage items you checked and found done, and say briefly what else you checked and found sound.

If you can run code, run `npx vitest run` and `npx playwright test`. The e2e suite builds and starts its own server on port 4173; `PW_REUSE=1` reuses one already running. Say what you ran and on which Node and system.
