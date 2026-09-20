# Review prompt, round five

Paste everything below the line to the reviewing model. Give it the repository (`https://github.com/zomethingje-eng/cultifolio`, commit `fb2e8b4` or later) and, if it can run code, a checkout with `npm install` done. It does not need the corpus or the climate grid: `npm run dossier -- --fixtures` writes three synthetic dossiers that every page renders from, and `npm run dev` serves them.

---

You are reviewing Cultifolio, a SvelteKit 5 application on Cloudflare Workers: a species reference for cactus, succulent and bulb growers (about 9,000 species, each with a page derived from public data) and a private collection tracker (plants, benches, sowings, labels, photographs, encrypted sync between a grower's own devices). It is heading for a Show HN. The author is a senior analyst who reads code well but does not write it for a living, and has built this with an AI assistant over four review rounds. The previous round's findings and fixes are in `docs/REVIEW-ROUND-4.md`; the running engineering log is `docs/DEVLOG.md`. Read both first, then `README.md` and `src/routes/about/how`.

Your job is a fifth round: an adversarial review of the app as it stands, with reproductions, not impressions. Find what is wrong, what is misleading, what will break, and what a careful engineer would change before strangers use it. Assume the previous rounds missed things; they did.

## The rules the project holds itself to

Judge everything against these, because they are what the author claims, and a claim the code does not keep is a finding.

1. Accuracy first. Every figure on a species page states its source. Nothing on a species page is written by a person or a language model: every sentence is a figure with its source, a labelled reading of a curve or rule, a quoted and credited source, or the method's fixed wording.
2. A refusal is not an absence. When an upstream source did not answer, the page says "not checked", never "none". Look for any place a refusal, an error, a timeout or a skipped source is rendered as if the source had answered with nothing.
3. Nothing derived is smoothed, guessed, or inferred beyond what the rule states. Check the rules in `src/lib/core/sheet.ts`, `src/lib/core/note.ts`, `src/lib/climate/`, `src/lib/dossier/build.ts` against what the pages say they do.
4. The collection is the grower's alone: on device, in IndexedDB, synced only if they set it up, encrypted so the server never reads it. No accounts, no analytics.
5. The v1 corpus folder and the v2 sibling project are out of scope; only this repository.

## What changed since round four (look here hardest)

- Dossier schema v2: a climate envelope (median, 10th and 90th percentile across habitat grid cells) replaces the single-point habitat climate. `src/lib/climate/provider.ts`, `src/lib/dossier/schema.ts`, `src/lib/dossier/build.ts`.
- The species page was reordered into reading order (Summary, Cultivation, Climate, Habitat, Photographs, Papers, Registers), the Wikipedia lead is quoted to four sentences with an abbreviation-aware splitter (`src/lib/core/text.ts`), and the climate is drawn as a climograph (`src/lib/climate/climograph.ts`, `src/lib/ui/Climograph.svelte`) with the month table under a disclosure.
- The Species tab is a state switch: the whole catalogue for a visitor with no collection, the grower's own list (grown plus followed) once they have one, with search over the whole corpus. `src/routes/+page.svelte`, `src/lib/db/species-list.ts`, a `followed` flag on the taxon record, `src/lib/ui/FollowButton.svelte`.
- Photographs now come first from GBIF's Darwin Core Archive download (`multimedia.txt`), merged behind iNaturalist and Commons; `--fill gbif` in `scripts/build-dossiers.ts`, `MediaIndex` in `src/lib/dossier/bulk.ts`.
- Sync integrity work from round four: batch names, byte-compare, quarantine, HLC drift guard. `src/lib/sync/`, `src/lib/server/`, `src/routes/api/sync/`.

## What to do

Work in this order and report in this order.

### 1. Run it

`npm install`, `npm run dossier -- --fixtures`, `npm run test` (vitest, expect 181 passing), `npm run check`, `npm run build`, then `npm run dev` and open `/`, `/species/copiapoa-cinerea`, `/species/welwitschia-mirabilis`, `/species/refusia-testii` (a fixture whose sources refused), `/plants`, `/benches`, `/sowings`, `/labels`, `/frost`, `/backup`, `/sync`, `/about/how`. If Playwright is available, `npm run e2e` (wrangler's local runtime is flaky under parallel load; a test that passes alone passes). Report anything that fails to run before anything else.

### 2. Walk the flows as a grower would

Do each of these end to end in the browser and note every point where the app is confusing, wrong, slow, or asks for something it should already know.

- New visitor: land on `/`, search a species, open it, read the page top to bottom. Does the order make sense? Does the climograph read correctly without the caption? Is the "10th–90th percentile across N habitat cells" band explained well enough that a reader will not take it for year-to-year variability? Does the cultivation section say anything a grower could act on, and is every sentence in it traceable to a figure?
- First plant: "Add one to my plants" from a species page, fill the form, land on the plant page. Then `/`: it should now show your species, not the catalogue. Follow a second species without owning one. Browse all, come back.
- Collection: make a bench with coordinates, move the plant onto it, log an event, add a photograph (the app resizes and stores it locally), print labels, look at `/frost` (a forecast for the bench's coordinates).
- Sowing: sow seed from a species page, record germination, pot up.
- Backup and restore: export, wipe (private window), import. Does everything come back, including photographs, followed species and notes?
- Sync: set up sync between two browser profiles with the same key. Change the same plant on both while one is offline, bring it back. Read `src/lib/sync/engine.svelte.ts` and try to construct a sequence that loses a change, duplicates one, or leaves the two devices disagreeing without saying so.
- Offline: load a species page, go offline, reload it; go to one you have not loaded.
- Phone width (390 px): every page, every button reachable, no horizontal scroll, the climograph legible.

### 3. Attack the derivations

`tests/qa/derivations.probe.test.ts` (run with `QA_PROBES=1 npx vitest run tests/qa`) shows how the previous round probed the rules. Add your own. Targets:

- `src/lib/climate/provider.ts` `envelope()`: fewer than three cells, cells all identical, cells straddling the antimeridian, a cell at sea (elevation below zero), a species with records at 4,000 m and at the coast. Does the "typical cell" choice (coldest night nearest the median) do what the caption says?
- `src/lib/core/geo.ts`: longitude wrap, the runner-up window rule, the cell-centre snap. Can a restricted record's coordinate ever leak into the marker?
- `src/lib/dossier/build.ts`: the dedupe rule (open kept over restricted at the same coordinate), the 10 km uncertainty filter, extinct regions, homonym handling (`ambiguous`), synonym following to an accepted species and what happens when the accepted taxon is a subspecies or is not served.
- `src/lib/core/sheet.ts` and `note.ts`: read every rule and every sentence template. Is there any sentence a grower would read as advice that the rule does not justify? Does the hemisphere shift in the note do the right thing for a reader on the equator, or with no bench coordinates?
- `src/lib/climate/climograph.ts`: per-species axes, a rain axis with one 400 mm month, all-zero rain, an equatorial flat year, the cold quarter wrapping the year, extremes far outside the monthly range. Does the `<desc>` text match the drawing?
- `src/lib/core/text.ts` `firstSentences`: botanical text that breaks it (e.g. "...described by L. in Sp. Pl. 1753. It grows...", "Haw. f. rubra", ellipses, a sentence ending in a quoted name, non-English Wikipedia leads).
- `src/lib/dossier/fetch.ts`: retries, Retry-After as date and seconds, the throttled-run rule, host cooling. Can a burst of 429s from one host stall another? Can a refused host be retried too soon?
- `src/lib/dossier/bulk.ts`: `OccIndex` sampling (is the per-species sample unbiased?), `withMedia` ownership when a record carries a subspecies key, `MediaIndex` licence filtering, the WCVP homonym resolution by authorship.

### 4. Attack the collection, sync and server

- `src/lib/db/`: record shapes, the field-diff commit model, ids that embed the device id, the location tree with cycle cut. Try to make two accessions share a number, an event with no plant, a location that is its own ancestor, a taxon record with `followed` and `myNotes` out of step with the plant list.
- `src/lib/sync/crypto.ts`: what is encrypted, what is authenticated (AAD), what a server operator can learn (record counts, timing, sizes, device ids?). Is the key derivation what the About page says it is?
- `src/routes/api/sync/` and `src/lib/server/`: the 200/409 byte-compare, quarantine, 4xx bisect, the storage allowance and the documented race on it (a Durable Object is deferred; say whether that deferral is acceptable for launch). Can a malicious client with a valid key fill another user's vault? Can a client without a key learn anything? Rate limits?
- `src/routes/api/names/+server.ts`: an open proxy to GBIF's suggest endpoint with an edge cache. Abuse surface, cache key correctness, error handling.
- Service worker (`src/service-worker.ts`): what it caches, what it must never cache (sync responses, other people's HTML), update behaviour.

### 5. Code quality, honestly

Not style. Look for: duplicated rules that will drift apart (the same threshold written in two places), functions that have grown past what their comment says, types that lie (`as never`, `as unknown as`), error paths that swallow, tests that test the mock, dead code, and any place where a reviewer would need the author present to understand why. Name files and lines.

### 6. Launch readiness

Given a Show HN audience, what would you fix before, and what would you leave? List the three things most likely to embarrass the author in the first hour, and the three most likely to lose a grower's data in the first month.

## How to report

- Findings first, ranked by severity: data loss or wrong figure on a page; a claim the page makes that the code does not keep; a flow a grower cannot complete; then everything else.
- Every finding: file and line, what you did to reproduce it (command, input, URL, sequence of clicks), what happened, what should happen, and a proposed fix. If you could not reproduce it without the corpus, say so and give the reasoning instead.
- No finding without a reproduction or a line of code. "Consider adding tests" is not a finding.
- Separate "wrong" from "I would have done it differently". Both are welcome; label them.
- If the previous round's fix for something is itself wrong or incomplete, say which finding in `REVIEW-ROUND-4.md` and why.
- Prose, not bullet soup, except for the ranked list of findings. Write for someone who will act on it tomorrow.

Do not summarise the app back to the author. Do not praise it. If you find nothing in an area, say you looked and what you tried.
