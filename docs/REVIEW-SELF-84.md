# Round eighty-four: the deep review after round eighty-three

Cultifolio is live: the Worker built from `ba78fb9` (deployed 2026-10-29), over corpus `e8885155673882ba` (48,357 species). That corpus is round 83's climate repair of the full build. On 2026-10-29 five reviewers walked the live site and read the code. They changed nothing:

- **W:** the desktop grower, and appearance.
- **P:** the phone grower, and mobile against PC.
- **D:** the data.
- **C:** the code, the server and the suites.
- **S:** search, and the claims the pages make.

The coordinator then reproduced the main findings. The five reports are in `docs/review-84/`. P's WebKit walk for the owner's PC is `round84-webkit-walk.mjs`.

## Verdict

**Works with faults: close to ready for the public.**

- **Nothing loses a grower's data.**
- **Server, headers, security and sync are sound.** No security fault was found.
- **Both test suites are green.** That is 4,796 unit tests, and 693 strict browser tests in Chromium and on the phone.
- **The data matches its primary sources at 99 to 100%:**
  - native ranges equal Kew's on 600 of 600 pages;
  - 1,714 of 1,714 photographs are the observation, licence and observer they claim;
  - no open record of 101,130 tested lies outside its native range;
  - all eleven merged addresses redirect.
- **Every journey works.** All thirteen shared journeys complete on desktop and at eleven phone sizes, and all ten of round 81's phone faults are fixed bar one partial.

Six things should be fixed before the site is shown to the public. Three are honesty faults a careful visitor would catch: the wrong reason for missing extremes, the range drawn as rectangles, and stale sentences on /about/how. Two are usability faults with real consequences: the species list reopening over the form, and the climate chart unreadable on the commonest Android width. The sixth, the names at the top of about 500 pages, needs your decision first.

## Scores

| Area | Score | Reason |
|---|---|---|
| User experience | 8 | Every journey completes. Older names, a cultivar called a hybrid and the reopening list are the rough edges. |
| Appearance | 7 | Calm and consistent. But the "range" maps are rectangles, the figure cards are cramped on desktop, and some lead photographs are weak. |
| Mobile | 8 | Every flow works at 11 sizes. The one real fault is the climate chart at 360 and 320 px. |
| Data quality | 7 | Names, ranges, records, licences and photograph identity are at 99 to 100%. Three rule-level faults each touch hundreds of pages. |
| Code quality | 8 | The Worker, security and sync are good. One real race in the picker, and many fixes are tested only by matching their own source text. |
| Performance | 7 | Warm pages are fast and a desktop species page paints in about 0.2 s. A cold front page on a throttled phone is busy for 1.26 s. |
| Accessibility | 8.5 | Visible focus, named charts and maps, a proper combobox, and 44 px targets almost everywhere. |
| Honesty of claims | 6 | The "not checked" and "from few records" lines are right everywhere. The extremes reason and nine statements on the about pages are wrong. |

The two outside reviews of `8f2b495` scored data at 7 and 5, and honesty at 7 and 5. Data has moved up: credits, the hybrid sign and the homonyms are fixed. Honesty is held back by stale text, not by the data.

## Fix before showing the public

1. **The species list reopens over the add form after the field is left, and a tap meant for the next field picks a species (C1, major; reproduced live).**
   - **What happens.** On an iPhone 13 profile, type "Haworthia" and close the keyboard. A second later the list opens again and covers Space and Acquired. One tap on Space files "Haworthia cooperi".
   - **Why.** `SpeciesPicker.svelte` sets `open = true` whenever a search answers (lines 169 and 172), without checking that the field still has focus. Nothing closes the list on a tap outside it.
   - **Link to the WebKit failure.** The labels test that failed on your PC was caught in exactly this state: the list open after the field was left.
   - **Fix.** Open the list only while the field has focus, and close it on a tap outside. Add a browser test.
   - **C2, the same area.** Add pressed while the reference's search is still out can arm "Add as typed" for a name the reference holds. It is minor, and fixed by having `check()` wait for that search.

2. **Pages whose cold extremes round 83 set aside give the wrong reason (D1 and S1, major; reproduced).**
   - **What happens.** Eulychnia acida's headline card says "the weather cell's ground is too far off". Its Climate section says the true reason: the 1-in-100 night was warmer than the coldest month's mean low.
   - **How many.** The page contradicts itself on roughly 400 to 600 pages.
   - **Why.** `src/lib/core/sheet.ts` lines 266 to 278 key the words on one status, which now has three causes.
   - **Fix.** Word each cause, Worker only.

3. **The maps draw Kew's regions as labelled rectangles (W1, major).**
   - **What happens.** The Cape Provinces is half sea. The close-up of Echeveria desmetiana is one green field.
   - **Why.** `still.ts` `boxRects` draws boxes, though the region shapes exist (round 83).
   - **Fix.** Draw the shapes, simplified, from one cached static file as the coastline is.
   - **Linked: 125 regions are still tested by box in the climate (D2).** Those regions are 125 of 369, including France, Britain, Japan, Turkey, Greece, both Mexican Northwest and Southwest, and the Cape Provinces. 67% of pages have at least one.
     - **The effect.** These boxes let in records where Kew says the plant is introduced. The snowdrop's typical spot is in Belgian Limburg (50.875 N, 5.475 E), where Kew holds Galanthus nivalis as introduced; I confirmed it on the live dossier. Lemon balm's map marker is in Belgium too.
     - **The cause.** The shapes script rejects a whole region for one remote ring (Marion Island in the Western Cape, the Bonin Islands in Japan) or one unplaced province (Great Britain).
     - **The fix.** A shapes-script fix, then a re-derivation on your PC like round 83's.

4. **The climate chart is unreadable at 360 and 320 px (P1, major).**
   - **What happens.** At 360 px, the commonest Android width, the chart is drawn 720 px wide and shrunk, so its labels are 4.3 to 4.9 px tall.
   - **Why.** `Climograph.svelte:30` draws at the shown width only from 340 px up.
   - **Fix.** Use the shown width down to about 260 px.

5. **/about/how says things that are no longer true, and is too long to read (S4, S5, D6, S6).**
   - **Out of date:**
     - "until the upload… a search by one of Kew's names finds nothing", when the upload is live;
     - "the corrections of round 83 reach a page when it is next derived", when they have been;
     - "a hybrid gets no climate", when 253 of 485 do;
     - a dated figure, and four search examples the live site no longer gives.
   - **Too long.** The page is 22,753 words, with one sentence of about 1,280 words.
   - **Fix.** Rewrite those passages in the present tense, and break the six longest paragraphs into lists under their headings. Add a seam test that runs the page's quoted search examples.

6. **The heading on 500 pages is not Kew's accepted name for the page's own entry (D3; your decision).**
   - **What happens.** The pages are keyed on Kew's ids but headed with GBIF's name for the key. That splits the owner's own genera: the "Huernia" row lists 25 of Kew's 75 Huernia, and the rest appear as Ceropegia. The same happens to Orbea, Stapelia, Caralluma, Echidnopsis, Anacampseros and Manfreda (76 of Kew's genera in all).
   - **Malformed names among them:**
     - `k3313620` is Kew's Ceropegia dodomaensis Heiduk & D.Styles (I confirmed it in Kew's file), but is headed "Ceropegia tanzaniensis (Peckover)", with a truncated author;
     - a subspecies is headed "Conophytum calculus vanzylii", with no rank.
   - **Recommendation:** on `k` pages, head with Kew's accepted name and list GBIF's name among the older names. Kew is the reference's stated authority for names, and Kew's genera are what stapeliad and Anacampseros growers use. This is an index-time change plus a re-derivation.

## Fix in round 84, smaller

- **Search: "snowdrop" puts Galanthus nivalis 24th (S2, reproduced).** The same happens to "saffron" (Crocus sativus) and "pepper" (Piper nigrum). The causes are a shared one-word common name and the alphabet. S measured a fix in `search.ts` that ranks the species whose own common name is the word ahead of those that only contain it.
- **The add form and names:**
  - **W5:** a cultivar under a genus ("Echeveria 'Lola'") is filed and shown as a hybrid with "parentage not stated".
  - **S3:** a cultivar in ’…’ quotes is filed with no key and no cultivar; the catalogue's search reads it right (`names.ts:81`).
  - **W6:** an older name typed or imported ("Aloe aristata") gives a plant with no link to Aristaloe aristata, though the species address redirects.
- **The desktop figure cards (W3):** fill four of six columns, because the season card spans the grid (`Glance.svelte:136`). This is the first thing a grower reads on desktop.
- **The phone:**
  - **P2:** My plants with 400 plants shifts on load (CLS 0.29).
  - **P3:** in landscape, "+" sits in the notch.
  - **P4:** the compare pill stays on every collection page.
  - **P6:** Back with Record open drops the typed note.
  - **P7:** long reasons fill the first screen.
  - **P8:** 44 px inline buttons open gaps in sentences.
  - **P9:** the "from few records" counts are in a hover title only.
- **The data, by rule:**
  - **D4:** Xanthoceras sorbifolium keeps records from a wrong GBIF key while saying "not checked".
  - **D5:** 4 of 22 sampled hybrids lack their POWO link, though Kew has their IPNI ids.
  - **D9:** generic common names still head some pages ("Fig", "Ginger", "Tobacco", "Bamboo").
  - **S7:** Ferocactus hamatacanthus says its merged key came from Kew's synonymy.
- **Desktop polish:**
  - **W2:** weak leads; the gallery opens on near-duplicates; the licence is said twice in the credit.
  - **W7:** "Where this page came from" shows no sign that it opens.
  - **W8:** /backup says "never" right after a restore.
  - **W9:** a blank field number reads "none".
  - **W10:** printing shows buttons and leaves out the cultivation sheet.
  - **W11:** three different photo placeholders.
  - **W12:** a sentence written for the author in the name card.
  - **W13:** one manifest-icon console error, and the site's icons carry Anthropic C2PA metadata; strip it.

## For you to decide

1. **Kew's accepted name as the heading on `k` pages (D3).** Recommended: yes, for the reasons in item 6 above.
2. **Default points at a named locality (D7).** About one dropped point in four is a named place whose dataset states no accuracy, for example three Havana localities that hold 5 of Melocactus matanzanus's 9 records. Keeping them by reading the locality text would be a guess, which rule 3 rules out. The effect on climate is small, because such records rarely count toward it anyway. Recommended: keep the rule and say on /about/how that such records can be dropped.
3. **/about/how in lists rather than long sentences (S5).** Recommended: yes, with the substance unchanged.
4. **The compare pill on collection pages (P4).** Recommended: show it only on species and compare pages.

## Confirmed working (selected)

- **Round 82's fixes all hold on the live site:**
  - search by a headline name;
  - same-spelled names by another author;
  - the Replace lock;
  - "not checked" said once;
  - "author not stated";
  - the frost bar;
  - the few-records mark;
  - Compare's "+N";
  - the scroll-spy.
- **Round 83's fixes hold:**
  - the 302s for all eleven merged addresses, with the right caching;
  - the merged name first in search;
  - the 1-in-100 rule on all 35,023 pages that show extremes;
  - Picea omorika's climate in Serbia;
  - the mended photograph addresses;
  - the lighter page (126 kB), with nothing lost to scripts off, screen readers, print or offline;
  - a clean update from round 82's service worker.
- **The database at scale:** 2,000 plants and 20,000 log entries open, search and back up in time. Two tabs are safe.
- **Add pressed during the name check was never lost in Chromium:** 29 presses across two reviewers. The WebKit failure is now best explained by item 1.

## Not checked

- **A real iPhone and real WebKit.** The walk below covers what can be done.
- **Screen readers by ear.** The accessibility tree was read instead.
- **Two-device sync on the live server.** Not run, by the brief: it was reviewed from the code and the tests.

## For the owner's PC

**The WebKit walk** (optional, about 10 minutes, about 200 requests). Run it from the project folder:

```
node round84-webkit-walk.mjs --budget 260
```

It writes `webkit-walk-<date>\` beside it. Steps R01 to R04 press Add at once after typing, record whether the press is lost, and record whether the list was open.

**Two things only the iPhone can say:**

- When you type `Crassula ovata 'Gollum'` on the iPhone's keyboard, which quote marks does it write? (S3)
- Does the species list reopen over the form after you close the keyboard? (C1)
