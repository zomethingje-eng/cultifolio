# Round seventy-four, the agent's report

Branch `r74`, from `r74base` (`f908a19`). `FOLD_RULES` stays 8 and the database stays at version 4. No stored field, kind or record type changed.

## 1. "Places" becomes "My spaces"

### What changed

**Navigation (`+layout.svelte`):**

- The menu, the top bar and the phone's tab bar say "My spaces", and the crumb follows.
- The tab icon is chosen by the new label.
- The top bar's "+" says "Add a space".

**Pages:**

- **`places/` and `places/[id]`:**
  - the title "My spaces · Cultifolio", the heading, the crumb and the form labels;
  - "New space", "No spaces yet" and "Remove space", with the removal sentence;
  - the frost lines, "with no space" and the aria labels;
  - "Space" as the fallback title.
- **`plants/`:** "By space", "All spaces" and the first steps.
- **`plants/[acc]`:** "Give it a space", "Space cleared", "Habitat vs this space", and the light and cold lines.
- **`plants/new` and `plants/import`:** the space picker, "new spaces" and the path questions.
- **`today`:** "space by space", "By space", "No space", "Watched spaces" and the rule text.
- **Also changed:** `propagation/[id]`, `settings`, `backup` (the counts), `offline`, `sync`, `species/[slug]` and the welcome line.

**Shared code:**

- `LocationPicker` and `SelectMode` ("Move to a space").
- `ExampleAddLine`, `DemoBar`, `CalendarExport`, `Glance`, `WaitingRecord` and `held-words`.
- `collection.svelte.ts` (its error sentences and the removal note) and `backup.ts`.
- `rhythms.ts`: it writes "plants with no space". The calendar UID keeps `water-place-`.
- `csv.ts`: the column label is now "Space". A header "space" is read, and "place" still is.
- `weather/client.ts`: a 400 now says "the coordinates are not a place on Earth".

**About pages and README:**

- `/about/how`: the hemisphere rule, the comparison, the frost watch, the privacy list, the storage keys and the glossary.
- `/about/formats`: the kinds, the id prefix, the fields, the example paragraph, the import and the calendar.
- The README.

### What did not change

- **Addresses and names that must stay stable:** the addresses `/places`, `/places/<id>` and the `/benches` redirect; `?place=`; the element ids; `locationId`; the kind `location`; the draft's form name; and the import field key (it is hashed).
- **Uses of "place" that are not a grower's space:**
  - the geographic ones;
  - Kew's "unplaced";
  - a vault's place under the sync limits;
  - orders ("has no place in it");
  - idioms ("in place of").

## 2. The example collection is opt-in

- **`ExampleOffer.svelte`** draws the page's own empty state. Under it, on a device whose own collection is empty, it adds one button: "Show the example collection".
  - With the button: "A sample kept apart from your own collection, which you can close at any time."
  - It is shown only once the collection and the sync key are read.
  - After a press, the page says "Opening the example collection…".
- **`offersHere`** replaces `entersHere`. `TrySample` on My plants uses the same words.
- **The tab's left mark `cultifolio.sampleOut` is removed.** That covers `OUT`, `leftHere`, `markOut`, `markLeftByAddress` and its write in `app.html`. The CSP hash for `app.html`'s inline script is recomputed.
- **Unchanged:** Leave, the second-tab notice, the offer and deletion of a sample left behind, and the `?left=` token.
- **About pages:** `/about/formats#sample` is rewritten. `/about/how` no longer mentions the removed key.

## 3. The front page's demonstration is gone

- **`+page.server.ts`:** no dossier read, and no `feature`.
- **`+page.svelte`:** these are gone:
  - the `Feature` type and the feature block;
  - the cultivation sheet and the chart geometry;
  - the `wide` media query, its styles and five imports.
- **The chart components** stay, since other pages use them.
- **`/about/how#feature`** now says only how the photographs are chosen. The anchor is kept.

### First visit

Measured with round 73's `firstvisit.cjs`, the same way on both builds: a fresh Chromium context per page, with the worker's requests included.

| Page | Requests | kB |
|---|---|---|
| Front, desktop | 55 → 55 | 376 → 365 |
| Front, phone | 55 → 55 | 376 → 365 |
| Species | 59 → 60 | 600 → 600 |
| 404 | 34 → 34 | 225 → 225 |
| My plants (a grower's first page) | 225 → 226 | 1,087 → 1,082 |

**Front page:**

- HTML: 17,010 → 14,352 bytes as sent.
- Scripts: 187.1 → 178.3 kB.

**No request is saved.** The chart modules are shared with Today. The bundler split one chunk differently, which accounts for the one extra request on the species page and My plants.

## 4. Words for every grower

- **Front page:** the title, og:title and meta description say "a reference for the plants people grow".
  - The introduction reads "A reference for the plants people grow, {live count} species so far, each with its habitat climate where its records allow one."
  - The welcome line reads "Keep your plants' record on this device: …".
- **Link preview:** `OG_ALT`, `og.html` and `static/og.png` (redrawn with `og.mjs`).
- **README:** "for anyone who grows plants at home, indoors, on a patio or in a greenhouse, from succulents to leafy plants and orchids".
- **Unchanged, as factual:**
  - the account of how the species list was derived;
  - the care-group labels;
  - the search's generic nouns;
  - the caudex measurement fields;
  - the example collection's "The cacti, in full sun.";
  - the "Collector genera" label, which names no plant kind.

## Tests

### New

- **`tests/unit/r74-spaces.test.ts`** (with `helpers/visible-text.ts`) reads the markup, attributes and strings in `src`.
  - Each allowed "place" is named by its words, and an allowed entry no longer found fails.
  - On the base, 4 of 5 fail (189 pieces of text, among others). The fifth is a guard.
- **`tests/unit/r74-growers.test.ts`** reads every visible string, the OG text, `og.html`, the manifest, `app.html` and the README.
  - On the base, all four fail.

### The example

- **Unit:** `r63v-example`, `r63fv-example`, `r67v-example`, `r69x-empty`, `r69x-left` and `r67v-leftover` now test `offersHere`, or that no left mark is written.
- **e2e, `r63v-visitor` V2:** "an empty device's Today, by tab, link or address, does not open the example; its button does". The other example tests press the button first.
  - On the base, `#see-example` was not found, because the page had gone into the example.

### The front page

These fail on the base:

- `r61q-refusal-walk`: no dossier read, and no feature.
- `r61w-words` and `r62w-words`: no feature, chart or figures.
- `r61w-pages`: no species shown whole.

The CHELSA chart test moved to the species page. It passes on both, so it is a guard.

### Updated for the new words

About 30 spec files, plus `formats-doc`, `r60f-grow`, `r62w-words`, `r62bw-words`, `r63u-fonts`, `smoke-1`, `r67v-example` V9 and `r63v-visitor` V3. The `ownPages` helper only wrote the removed mark, so it is deleted with its 37 uses.

## Runs

- **Strict Chromium and the Chromium phone at four workers:** 485 passed, 5 skipped, 0 flaky, 15.8 minutes. This was before the words-for-every-grower change; the specs that change touches passed afterwards (169).
- **Unit suite:** 3,923 passed, 8 skipped. `tsc` and `svelte-check` are clean.
- **`r63s-concurrent-deletes`:** fails 1 run in 10 on the base too, and passed here. No server or sync code changed.

## The phone tab bar

- **At 100% text and 320 px:** "spaces" needs 42 px of a 60 px column. The label wraps as "My / spaces", never inside a word.
- **At 200% text:** the bar was already icons on the base, and still is.
- **The r62ba tests pass**, including 320 px at 200%.

## Not done

- WebKit and Firefox: the owner's run.
- The backup sheet's `location` header and the `water-place-` calendar UID stay, as they are formats.
- Many code comments still say "place".
