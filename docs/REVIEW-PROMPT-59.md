# Review prompt, round fifty-nine

Paste everything below the line to the reviewing model. Give it the repository (`https://github.com/zomethingje-eng/cultifolio`, commit `741180f` or later), a checkout with `npm install` done if it can run code, and the live site `https://cultifolio.com` (the real corpus, 8,947 species, manifest `a3c8836c03981617` with `short.json`; a checkout serves a four-species fixture corpus with no manifest). The round's own account is `docs/REVIEW-ROUND-59.md`; the self-review it answered is `docs/REVIEW-SELF-58.md`; the engineering log is `docs/DEVLOG.md`, last paragraph; `docs/DEPLOY.md` section 5 is the corpus refresh and the prune.

---

You are reviewing Cultifolio, a SvelteKit 2 / Svelte 5 (runes) application on Cloudflare Workers: a species reference for cactus, succulent and bulb growers (8,947 species, each page derived from public data: GBIF, Kew's WCVP, CHELSA, NASA POWER, iNaturalist, Wikimedia Commons, Wikipedia) and a private collection tracker that lives in the browser as an append-only change log, synced end-to-end encrypted when the grower chooses. It is heading for Show HN. Nobody uses it yet, the author included.

Round fifty-nine answered three reviews of round fifty-eight, the author's own the hardest. That review found round fifty-eight's account overstated what it had done, and that thirteen of 45 mutations of its fixes were caught by no test. This round touched 86 files (about 2,600 lines added, 580 removed) and then two follow-ups: three end-to-end tests that navigated away before a save had landed (found on a Windows run), and a species description cut mid-word. Its interface pass was written by a separate agent in a copy and merged after review. The round claims it now "states only what a test or a measurement shows". Test that claim first. Your job is to find what is wrong. Reproductions, not impressions: a finding names a file and line, or a request and its answer, or a sequence of steps and what appeared.

## The rules the project holds itself to

A claim the code does not keep is a finding.

1. Every figure on a species page states its source. Nothing on a species page is written by a person or a language model: every sentence is a quoted passage, marked and credited, a figure with its source, or a labelled reading of a fixed rule. No AI images.
2. A refusal is not an absence. A source that did not answer is "not checked", never "none"; a refused request is said as a refusal, never as "nothing matches".
3. Nothing derived is smoothed, guessed or inferred beyond what the rule states.
4. The collection is the grower's alone: on the device, synced only if they set it up, encrypted so the server never reads it. No accounts, no analytics, no third-party scripts. `/about/how` lists every request the site's pages make and every host they load from; `/about/formats` states every format and rule. Both must be true of the code at this commit.
5. The log is the collection. Anything else the device keeps (a snapshot, an index, a cache) is a reading of the log and must be droppable without loss; and no reading of the log may write to the log.

## What changed (look here hardest)

### 1. The sync server (`src/lib/server/sync.ts` `admitVault`, `storeCounted`, `deleteCounted`, `ensureVault`, `readBody`; `src/lib/server/counters.ts`; `src/hooks.server.ts` `_foreignWrite`; `tests/unit/sync-accounting.test.ts`, `sync-hardening.test.ts`, `counters.test.ts`)

The "vaults" counter object now records each vault it has counted (`f:<vault id>`) and answers `counted`, `already`, `total` or `unavailable`; a vault is admitted before its first write, and past the ceiling the upload gets a 503 (`VaultsClosed`). A vault's byte object holds in-flight bytes (`p`), taken with the bytes and released when the upload lands or fails; `setBytes` from a recount adds them back. `take` uses today's row and ignores the listing's base once a row exists. A removed object's bytes are given back once, under `g:<key>:<etag>:<uploaded>`, swept with the day keys. Two creations of one vault at once: the meta is written with `onlyIf`. `readBody` allocates on the first chunk. The origin check now refuses every cross-site non-GET/HEAD/OPTIONS on any path, because the old one tested the raw path and `/api/%73ync/vault` passed it.

- Walk the counter object through: twenty first uploads to one vault at once; a first upload whose `fill` call throws (the code marks nothing and retries on the next upload; can a vault then hold objects indefinitely without being counted?); a vault counted, emptied by removals, and abandoned; a vault that holds nothing when the ceiling is reached (the grower's upload is refused; what does the device show, and does it retry forever?).
- The in-flight bytes. An upload that takes bytes and whose Worker is killed before `release` runs leaves `p` raised. What lowers it again? Can a vault be locked out of its own allowance by uploads that never finished?
- The give token. Is `key:etag:uploaded` unique per stored object across a remove-and-re-upload of the same bytes under the same name? Can two DELETEs of one object, or a DELETE racing a PUT of the same name, still give bytes back twice or not at all?
- What grows without bound in the counter objects' storage now (`f:` keys are never swept by design)? Is that a cost or a privacy problem at the ceiling's size?
- The origin rule. Is there any same-origin write that a real browser sends with a `Sec-Fetch-Site` or `Origin` the hook now refuses (a form post after a redirect, a service-worker-initiated request, a request from the installed app)?

### 2. The corpus, search and the species page (`src/lib/server/dossiers.ts` `searchAnswer`, `corpusNow`, the rejected-manifest path; `src/lib/core/search.ts` `rankedWords`; `src/routes/species/[slug]/+page.server.ts`; `src/lib/server/synonyms.ts`; `src/lib/dossier/photo-size.ts` `shownAt`; `src/service-worker.ts`; `src/lib/core/text.ts` `clip`)

The short path is chosen from the words the search ranks; a query whose exact candidates pass 2,000 is charged as a whole-index pass; `search`, `searchmiss` and `reference` also count by /48. A rejected manifest keeps the corpus held before, its etag is remembered, and a manifest whose species count differs from its index is refused. The hook loads the corpus once into `event.locals.corpus` and the page cache's key, the home page's rows and the species page's load all read it. A species 404 whose synonym check could not reach GBIF says "not checked" and is not cached. A lead photograph whose original is on a host other than iNaturalist, Commons or GBIF's cache is loaded from its GBIF thumbnail. The species description is cut at a word, and the fallback names only what the page has.

- `rankedWords` against the ranking. Find a query for which the path chosen and the words ranked still disagree, or two spellings of one query that are answered differently.
- The rejected manifest. Upload order during a refresh (products, then manifest), a manifest uploaded twice, a manifest that is valid but names an index not yet uploaded, and a Worker deployed with a longer required-products list than the corpus has. In each, what corpus does the site serve, and for how long?
- `locals.corpus` is loaded only when the page is one the cache holds. Which routes still load their own corpus, and can any of them combine two in one response?
- The page cache's key decodes the path. Can two different pages now share a key, or one page mint unbounded keys (encoded slashes, invalid escapes, mixed case)?
- `shownAt` and the description. Is any photograph on any public page still loaded from a host `/about/how` does not name? Does `og:image` still point at a full-size original anywhere? Is any species description longer than 155 characters, cut mid-word, or claiming a climate, range or photograph the page lacks?

### 3. The clock, holds and the collection (`src/lib/core/hlc.ts` `clockChecked`, `trustServerTime`; `src/lib/core/log.ts` hold and park rules, FOLD_RULES 4; `src/lib/db/collection.svelte.ts`; `src/lib/db/vault.ts` `touchFold`, `writeFold`; `src/lib/sync/engine.svelte.ts`; `src/lib/core/notes.ts`; `tests/unit/clock-park.test.ts`, `rule5.test.ts`, `notes-replaced.test.ts`, `fold-snapshot.test.ts`)

Changes are now held or parked only once the device's clock has been confirmed by the sync server's `Date` header within a trust window; before that, everything folds. A device whose clock reads earlier than its own last change says so under the top bar and acts on nothing. No path renumbers a record on its own any more: two records under one number show a notice and a button, and only the button writes. A restored record yields its old number to the record that has held it since, with a note. "Notes replaced" skips held and parked edits, pairs each edit with its base by the same writer, and covers species notes (`myNotesBase`); the plant page no longer writes a line for them. A tab that finds the sync lock taken retries in five seconds; the lock's reload replaces the sync record whole. The fold-rules guard hashes `log.ts`, `hlc.ts`, the whole of `vault.ts` and the collection's load, rebuild and catch-up (recorded `de78b243ee3ae5749ee5586fffa6a8ff`, FOLD_RULES 4).

- The unchecked clock. A device that has never synced restores a backup made by a device five years ahead, or imports changes stamped far in the future by any other path. Nothing is held, so they fold. Does the device's own HLC then advance to those stamps, so that every later edit it makes is stamped years ahead, and what does that do to a second device once they sync? Is the "not yet checked" state ever said to the grower?
- The clock line. Set the clock back three days, then forward a year, then back to true, with and without sync. Is the line always right, and does anything get parked, unparked or written along the way?
- Duplicate numbers without automatic repair. While two plants share a number, what do `/plants/<number>`, the labels page, a printed QR code, the plants list and a backup's CSV do? Is any of them ambiguous in a way that loses or misdirects a grower's write?
- Rule 5 again. Round fifty-nine claims nothing writes on a reading. List every path that writes to the log and its trigger; one triggered by opening a page, a load, a catch-up, a rebuild, a pull that brings nothing, or a restore beyond the restored record and its note is a finding.
- `notes.ts`. Two devices editing the species notes blind; an edit whose base is a parked stamp; a held edit that comes due across a reload. Does the species page ever list a text the grower saw, or miss one they did not?
- The guard. Name a change to code that shapes a snapshot that the hash still does not cover (the engine is not hashed; does anything there shape what a snapshot holds?).

### 4. The harness (`tests/unit/helpers/isolate.ts`, `sync-engine.test.ts`, `backup-parked.test.ts`, `tests/e2e/smoke.spec.ts`)

The sync tests' server keeps its KV per bucket across a device's reboot; booted engines' timers are cleared; BroadcastChannels a test opened are closed and the whole meta store is cleared between tests in three files; the lock tests wait on the push reaching the server instead of 50 ms. The self-review's proposed tests were added, and four were checked here by reverting the fix (the photo proof, the decoded cache key, the backup's parked set, the focus handler). The e2e suite waits for a hydration marker (`html[data-ready]`) before typing in settings, warms the server before the first test, and waits for forms to close before navigating.

- Find a test that still passes with its fix reverted. Start with the round's own list in `REVIEW-ROUND-59.md` section 5.2 and the tests it did not mutation-check.
- Find other e2e tests that navigate, reload or sync while a write is still in flight. The round fixed three by hand; a search for the pattern may have missed some.
- Run the unit suite on Node 22 and Node 24 (Node 24 exposes `navigator.locks`), and the e2e suite, ideally on Windows as well as Linux. Say what you ran, where, and the counts.

### 5. The interface and accessibility (much of it written by an agent)

At 390×844 and at 1280 wide, in light and dark:

- Focus. `src/lib/ui/focus.ts` scrolls a focused element clear of whatever is drawn at the top and bottom edges on every `focusin`. Try it with a phone's on-screen keyboard open, in the lightbox and other dialogs, in the plants list's sideways-scrolling chip row, and with a screen reader's own focus. Does it ever scroll when it should not, fight the browser, or move the page while the grower is typing?
- The place form's refusals, Today's resting rows worded by rule, the separators and wrapping the round claims at 390 and at 200% text, and the skip link on a private page loaded directly.
- axe or a screen reader on the plant page, the species page, Today and the place page. Verify each accessibility claim in `REVIEW-ROUND-59.md` section 4 by measurement; a claim the round marks as measured "in that pass" without a test is the first to check.

### 6. Words and claims

Read the species page, compare, Today and the front page against rules 1 to 3; the In short leads were rewritten this round ("Under 120 mm of rain a year…", "No rainy season: 70% of the rain takes N months…", "Cold floor X: one night in a hundred at a typical spot in the range is colder"). Check `/about/how`'s privacy list and full detail, and `/about/formats`' byte-counting paragraph, against the code: every request a page makes, every host it loads from, and every counter the server keeps.

## What is not in scope

Two items the round left open on purpose: an address's daily byte cap is per /64 with no /48 total, and `sheetsIn`'s fallback reads dossiers as the bucket holds them now. Argue with either if you think it matters before launch. The data-model list (operation ids, an undo history, a move operation for places, per-device sequence numbers) is future work, and the measurements in `REVIEW-ROUND-56.md` stand unless you show them wrong.

## How to report

Number your findings. For each: the file and line (or route and request), what the code does, what it should do, a reproduction or the reasoning that stands in for one, and the smallest fix. Mark each confirmed (reproduced) or suspected (read, not run). Rank by what a reviewer on Show HN would find first, then by data loss, then by everything else. Say briefly what you checked and found sound. If you can run code, run `npx vitest run` and `npx playwright test` (the e2e suite builds and starts its own server on port 4173; `PW_REUSE=1` reuses one already running), and say what you ran and on which Node and system.
