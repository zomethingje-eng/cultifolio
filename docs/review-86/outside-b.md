# Outside review B, round eighty-six (condensed)

Reviewed 5 November 2026: source `e185eed25a3ae78c26d1b012d045f972938bfff6`, live corpus `48c27bf790016ccc`. Windows, Node 24.20.0. `npx vitest run`: 5,320 passed, 15 skipped. `node scripts/predeploy.mjs --browsers=all`: 2,219 passed, 17 skipped, 0 failed, 0 flaky, 47.4 minutes.

**Verdict.** Fix the credit-date display and enlarged-text clipping before calling the release one that keeps every stated promise. No demonstrated collection corruption or misassigned accepted name; the rich species page slow on a throttled phone.

| Area | /10 |
|---|---:|
| User experience | 8 |
| Appearance | 8 |
| Mobile | 8 |
| Data quality | 8 |
| Code quality | 8 |
| Performance | 7 |
| Accessibility | 8 |
| Honesty of claims | 7.5 |

## Findings

1. **A single photograph loses its credit-read date** (confirmed live). `/species/pseudolithos-migiurtinus` (`/api/dossier/k510687`): its one Commons photograph carries `read: 2026-11-02`; the page has no "Credits as read". `species/[slug]/+page.svelte:819` renders the gallery only when `photos.length > 1`; `Photos.svelte:41` puts the credits inside the `rest.length` branch. The helper test (`r85e-species-words.test.ts:134`) passed while the page left it out. Fix: render the read-date credit whatever the count; rendered tests with one photograph and none.
2. **A failed source response can become a credit-read date** (focused reproduction). `credit-days.ts:25` accepts any status but `skipped` as a fallback day: `creditDays([{src:'gbif'}], {'gbif.media': {status:'error', at:'2026-11-05…'}})` gives "Credits as read from GBIF on 2026-11-05". Fix: only an answered row lends a day; otherwise say the day was not recorded; test error, refused, none and ambiguous.
3. **Settings clips choice labels at 200% text** (375×667): "°F and inches" cut at the right edge, with no page-wide overflow. `theme.css:360–361` (segmented group, `overflow:hidden`, labels `nowrap`); the wrapping rule at settings 253–254 covered the length control only. Fix: wrap every settings segment; check each segment's contents, not only the page width.
4. **Rich-page phone LCP 5.6–5.8 s** (`/species/monstera-deliciosa`; 4× CPU, 150 ms, 1.6 Mbit/s down, 750 kbit/s up; three cold loads 5.688, 5.600, 5.844 s; the LCP element the lead photograph). The below-fold `/maps/land50.svg#land` took ~4.7 s (102,214 bytes transferred, 259,922 decoded); two Newsreader fonts and the page script also loaded late. Blocking map requests: median 4.80 s (−0.89 s). Fix: defer below-fold map resources until near the viewport, keeping space, range text, print and offline.
5. **"The opening of the article, quoted as written" is not what is shown.** `/about/how:313` against `sources/wikipedia.ts:27–28`, which reads Wikipedia's REST summary: Acer × freemanii's revision 1382870227 has "red maple" and "silver maple" in brackets that the summary and the dossier leave out (also Chlorophytum comosum, Abies × borisii-regis). Fix: say it is the summary endpoint's text, or quote a verified extract.
6. **The missing-country border policy differs from the brief.** `tdwg-shapes.ts:220` `ours` accepts a missing country, so the margin and coast branches (225, 229) admit a record outside all land with no country: a synthetic square with `countries.FRA=['FR']` admits (0.5, 1.02) as buffer and (0.5, 1.1) as coast. The glossary says "where it states one". Fix: decide the policy and align brief, documentation, code and tests; measure records lost before tightening.

## Other notes

- Mobile against desktop: the differences found are deliberate and right, except the one-photograph credit (1) and the settings segments (3).
- Sync: after Replace from a pre-sync backup the page showed the new-key form (`sync/+page.svelte:182,266`); needs a focused follow-up on the retained key. No third vault was made.
- Credits: 99 iNaturalist entries and one Commons entry are dated 2 November, outside the brief's "read again between 3 and 5 November" (a claim in the review prompt, not the site).
- 1,226 of 1,563 stored older-name strings matched direct checklist synonyms; 337 not established wrong, unverified.
- Upload still non-atomic (known, documented, signalled by `upload-partial.json`).
- Performance table (median LCP desktop / phone): front 0.48 / 2.82 s; Monstera 0.86 / 5.69 s; Monsonia lheritieri 0.67 / 2.39 s; My plants 30: 0.54 / 2.23 s; 400: 0.46 / 2.55 s; catalogue 0.65 / 3.12 s. CLS ≤ 0.0023 everywhere.
- Simplifications proposed: one photo-credit presenter for every count; one typed admission-policy object; rendered contract tests for promises users see (0/1/many photographs, failed refreshes, long authors, 200% text).
