# Round 112: the species suggestions on "Add a plant"

The tracker review's first round (MYPLANTS 25 in the owner's hand-off of 23 November 2026), a repair that goes before
every other round. The owner was away from 24 November and had said: "continue all progress, including these new
handoffs, the daily runs, etc, while i'm away. You can push, commit and deploy as needed". The code was written on
23 November while the photograph copy held the lock. The gate, the commit and the deploy waited until the copy had
finished.

## What was broken, read against the code

1. **No background.** The list is `<ul class="menu card">` in `src/lib/ui/SpeciesPicker.svelte`. Round 87's look added
   "No cards: a block of figures is its rules" to `src/lib/ui/theme.css`. That rule sets every `.card` to
   `background: transparent` with no shadow, so the floating list lost its background.
   - Every other use of `.card` is an inline block of figures (the stat cards on a plant's, a space's, a batch's and the
     sync page, a photograph, the payoff, the location picker's "new" box), where the rule is meant.
   - So the list alone takes its own background (`--card`, the page's colour in both themes), a border and a shadow,
     and drops `.card`.
2. **The list moved.** The list was one array, with exact reference rows, then GBIF's exact species, then the genus,
   then similar spellings, then the rest of GBIF's. Each answer re-sorted it, so the reference's rows were inserted above
   GBIF's whenever the search was slower.

## What changed

- **Groups in fixed places** (`pickerGroups`, `src/lib/ui/picker-rows.ts`):
  - **Species pages**, first, at most six: exact rows, then similar spellings.
  - **Other names** ("no species page, so no habitat figures"), at most two: the genus with the rest kept as a cultivar,
    and GBIF's name spelt exactly as typed.
  - **GBIF's other names** behind one row, "N more names in GBIF ›". It opens them in place, below every row shown. A
    pick of it picks no name. Arrows reach it and Enter opens it.
- **Waiting is said.** A group whose source is still asked shows "Looking…" in its place. A search that answered no page
  says "No species page matches what is typed", or the search's own failure words (rule 2).
- **Stale answers dropped.** The picker's generation counter already did this (round eighteen, B2). Test 4 holds it.
- **Emphasis.** The part of the name not typed is bold (`emphasised`; `SpeciesName`'s `typed`). It applies word by word,
  past a hybrid sign and accents. A common name or a misspelling sets nothing apart.
- **Rows** are at least 48 px tall. A species page's row adds its rain season, as the browse rows give it.
- `/about/how` says the order and the "more" row. `/changes` has round 112.

## Where the hand-off did not hold, and what was done instead

- **No thumbnails in the rows.** A reference photograph needs its credit beside it (rule 4). A 48 px row has no room
  for one, which is also why the header's search shows none. The rows give the name, the family and the rain season.
- **No separate "the text as typed" row.** The form already keeps a name as typed. Its line says "Add keeps exactly what
  you typed", and Add arms to "Add as typed" (rounds 23 and 86, with many tests). A second way to the same thing would
  have to repeat that arming logic. Other names holds GBIF's name spelt as typed when GBIF knows it, which also files
  its key.
- **Similar spellings for a cultivar shape.** For a genus followed by capitalised words ("Echeveria Lola"), round 62 (A7)
  never put a similar spelling first. Under fixed groups the pages come first, so when the reference holds the genus,
  the similar spellings are left out and the genus with the cultivar is offered under Other names.
- **axe** is not among the project's packages, and `package.json` is the owner's to change. Test 7 checks by hand what
  axe would: the combobox's attributes, unique option ids, and headings that are not options.

## Report: the fossil genera (the hand-off's "Report if")

Asked of GBIF on 23 November, `species/suggest?q=welw&higherTaxonKey=6`, the filter this site's `/api/names` sends:

- **Welwitschiapites** (key 11695027) comes back as an accepted genus in Plantae, Tracheophyta, Gnetopsida. Nothing in
  the suggest answer marks it as fossil.
- Only its species profile (`/species/11695027/speciesProfiles`) says `extinct: true`, from the Paleobiology Database.
  Reading that would cost one more request per row, and other sources in the same profile list leave it unset.
- **Lithoxylon** did not match by name in Plantae.
- The answer for "welw" also holds genera matched through the author abbreviation "Welw." (Linariopsis, Sesamothamnus,
  Faroa and others).
- **Nothing is filtered** (rule 3). Under the new groups none of these is ever a first row: none is spelt as typed, so
  all sit behind "N more names in GBIF".
- **The owner decided on 23 November:** leave them as they are, unmarked, behind the "more" row.

## Tests

- `tests/unit/r112a-picker-groups.test.ts` (8 tests): the groups and the emphasis.
- `tests/e2e/r112b-picker.spec.ts`:
  1. Solid in both themes.
  2. With the search held two seconds, the pages are first from the start and do not move.
  3. With GBIF's names held back, the first page does not move.
  4. A stale answer is dropped.
  5. The "more" row opens in place.
  6. The review's six queries, against this build's own search, each begin with a species page while GBIF's names (a
     fossil genus first) answer first.
  7. The keyboard path.
  8. 48 px rows.
- On 1764df3, 1, 2, 5, 6 and 8 FAILED.
- Found by r112b 7 failing twice in the clone's full run: a highlight held its place, not its row, so the species pages
  arriving above a highlighted "more" row moved it down, and Enter picked the page now in its place. The highlight now
  follows its row (`rowId`). r112b 9 holds it, and r112b 7 waits for both answers before its arrows.
- `tests/e2e/r85k-add.spec.ts` 9 reads the second heading as "Other names".

## The gate and the deploy

Gated together as rounds 111 to 116 on 23 to 24 November 2026: svelte-check 0 errors in 1,891 files; 6,535 unit tests and 2,946 browser tests, every test first time in every engine, on the fourth run (WebKit and Firefox at one worker each). Committed as 83c266a, pushed, and deployed with node scripts/deploy.mjs on 24 November 00:25 EST as version e2b68573; live check 24 of 24, the front page's photographs every one from img.cultifolio.com.
