# Round eighty-four, agent K: the add form and the names a grower types

Copy `/tmp/claude-0/rev84/K/`, branch `r84`, seven commits on `r84base`. Every change is in the app, so it arrives with **step 1 (the deploy)**. It is right over today's corpus and over the re-derived one, because nothing reads a new index field. Nothing is needed on the PC except the WebKit and Firefox runs of the two new specs (below).

## Done

**C1, C2, A22: the picker** (`src/lib/ui/SpeciesPicker.svelte`)
- **The list opens only while the field or its list has focus.** Every place that set `open = true` now reads `focused()`. An answer that lands after the grower has left the field updates the pill and the line only. A focus back into the field shows the list again.
- **A press outside the picker closes the list at once.** This is a capturing `pointerdown` on the window.
- **`check()` never opens the list.** Its search is `quiet`.
- **Add waits for the reference's own search for the text in the field.** The search's promise is kept (`current`), and `check()` awaits it whatever has answered already. This is the case where the name service had filled the list and the search was still out.
- **A late answer that resolves the name also clears "Add as typed"** (`armed = false`). Before, the button kept its "Add as typed" label.
- **The status room is held under a press.** On `pointerdown` outside the picker, the room under the field is fixed at its height and top margin, with `overflow: hidden`. It is released at the click the press makes, or 600 ms after the finger lifts, or on `pointercancel`, or after 10 s at most. Words that arrive between finger-down and finger-up can no longer move Add from under the finger, so the press is not lost. This is A22's mechanism for the WebKit failure. The picker on the plant page's Edit form and on the propagation form gets the same rules.
- **Tests:** `tests/e2e/r84k-picker.spec.ts` 1 to 3.
  - Test 1 types, leaves the field while `/api/search` and `/api/names` are held, then releases them. It expects the list closed, and that a tap on Space picks nothing.
  - Test 2 is the WebKit state. The name service answers at once without the exact name, the search is held, and Add is pressed. It expects "Checking the name…", then the plant added on one press with the key 5384999 read back from IndexedDB.
  - Test 3 runs at 320 px. It holds a mouse press on Add while the name service's long refusal arrives. Add must not move, and the press must be taken.
  - **On the base build:** 1 fails (the list opens; desktop), 2 fails (the first press armed "Add as typed"), and 3 fails (Add moved from y 849 to 924 under the finger).

**S3: a cultivar in any quotes** (`src/lib/core/names.ts`)
- Any of `' " ‘ ’ “ ”` now opens and closes a cultivar.
- An opening quote must start the text or follow a space or a bracket, so the apostrophe in "St. John’s wort" opens nothing.
- `tidyName`'s "cv." rule, the paste reader's cultivar cell (`src/lib/import/paste.ts`) and the import's name comparison (`commit.ts`) accept the same quotes.
- **Tests:** unit `r84k-names` covers six quote pairs; e2e `r84k-plant` 1 types `Echeveria ’Lola’`.

**W5, A9: a cultivar under a genus is "a cultivar, species not stated"**
- `parseName` gives `kind: 'cultivar'` to a cultivar under a genus with no species. A hybrid is only a cross written out, a named nothospecies, a nothogenus (`× Graptoveria 'Fred Ives'`), `Genus × 'Name'`, or what the grower picks on the Edit form.
- The new `speciesNotStated()` names the case.
- The import follows the same rule.
  - `commit.ts` files these lines as cultivars.
  - The new `ownVerdict()` in `check.ts` reads a cross or a genus cultivar from the line itself. A cross, a cultivar and the bare genus share one `checkKey`, so before, the first such line decided the others.
  - The import page counts "cultivars with no species named, filed under the genus" and labels the row the same way.
- The picker's pill reads "cultivar, species not stated", with the line "Filed under the genus *Echeveria*. Name its species before the quotes if you know it, for its species page." The form asks no Parentage, `check()` asks nothing, and the catalogue is not searched for it.
- The add form's "How to write cultivars and hybrids" now gives `Echeveria 'Blue Curls'` as a cultivar, and `Echeveria × 'Blue Curls'` for a hybrid whose parents are not known.
- The plant page reads "cultivar, species not stated". There is no "No species page under this name" and no species link. The habitat card says "No species named. A cultivar filed under its genus; name its species to compare its habitat."
- **Old records:** see Decisions.
- **Tests:** unit `r84k-names`; e2e `r84k-plant` 1 and 2. All fail on the base.
- The old unit assertion in `core.test.ts` ("is a hybrid of unstated parentage") is rewritten to the new rule.

**W6: older names**
- **Picker rows.** A reference row found by an older name says so (S8, below).
- **Add.** When the name typed is an older name of a reference page, the first Add asks once, even when GBIF resolved the name as a synonym with a key of its own. The line reads "An older name of [Aristaloe aristata], which has a species page: pick it, or press "Add as typed" to keep exactly what you typed." The picker's new `olderFirst()` does this, and the add form calls it.
- **Plant page.** A plant with no species page under its name now says "No species page under this name", with or without a key. Before, a plant with a key said nothing. The page offers "Is it an older name?". On that press only, the name goes to the catalogue's search; the page otherwise asks by hash group, never by name. The answer is one of:
  - "An older name of [Aristaloe aristata]", linked, with "File it under Aristaloe aristata". This writes the reference's name and key, keeps the old name as "name as received", and logs "Renamed from Aloe aristata to Aristaloe aristata (the reference's name; the old one is an older name of it)";
  - ", nor is it an older name of one";
  - the search's silence, said, with "Try again".
- `readSearch` now returns the page's `slug` with a near answer. `r60f-import.test.ts`'s `toEqual` gains that field.
- **Tests:** `r84k-picker` 6 and `r84k-plant` 3. Both fail on the base.

**P6: Back with Record open** (`plants/[acc]`)
- Back (and Escape) closes the form and keeps what was typed. A toast says "Record closed. What you typed is kept: "Record…" opens it again." and has an "Open it" button. "Record…" reopens the draft with its kind and date.
- The Cancel button now drops the draft. On the base it was silently kept for the next Record….
- A draft belongs to its plant. It is cleared when the page shows another plant, which on the base carried it over.
- **Test:** `r84k-plant` 5. It fails on the base: no toast, and Cancel kept the text.

**W9.** A blank field number on the plant page reads "not stated", not "none". Test `r84k-plant` 4, which fails on the base.

**S8.** Picker rows found by an older name read "has a species page; older name: Haworthia fasciata subsp. armata". Rows found under another author's name read "older name under another author: …". Both use the catalogue's own `olderNameOf` and `homonymOf`. Test `r84k-picker` 4, which fails on the base.

**S9.**
- Quotes around the whole field are punctuation: `"Haworthia cooperi"` is Haworthia cooperi. Unit test.
- Reference rows are now offered whenever the search's relaxed reading begins with the typed genus and epithet. Before, the reading had to be exactly two words. So a pasted label ("Lithops lesliei (N.E.Br.) N.E.Br. subsp. lesliei var. lesliei C001 Kimberley") is offered Lithops lesliei. Test `r84k-picker` 5, which fails on the base.

**A16: the silent catch at `plants/new`.**
- When the last-watering line fails, the toast says so: "2026-0004 added, but its last watering was not saved (<the store's reason>). Record it on its page." It shows for 12 s, with Undo or Labels as before.
- The words are in the new `src/lib/ui/added-words.ts`, unit-tested.
- There is no browser test, because the second commit cannot be made to fail on its own without stubbing the store.

## Decisions I took

1. **Old records filed as a hybrid are read as written.** These are plants an earlier version filed as hybrids from "Genus 'Name'", with no parentage. The log cannot tell the app's guess from a grower who chose "A hybrid" on the Edit form, so `kindOf` and the stored `nameKind` are untouched, and no page writes on opening (rule 5).
   - The plant page of exactly that shape (hybrid, a cultivar, no parentage, a genus alone, no nothogenus sign) adds "Not a cross? File it as a cultivar, species not stated". One tap writes `nameKind: 'cultivar'` and the log line "Now recorded as a cultivar, species not stated".
   - Records with no `nameKind` at all, from before the field existed, keep `kindOf`'s old reading, because I did not touch U's `db/types.ts`.
   - New plants, imports and edits file the new rule.
2. **Under a press, the status room is held rather than given a taller fixed height.** No fixed height fits every hint at 320 px and 200 % text: lines grow with the square of the text size against a fixed width. A taller reserve would also bring back the empty room that round 80 removed. Holding the room only for the length of a press keeps the layout tight and makes the press safe on every engine.
3. **An older name asks once on Add,** as an unknown name does, even when GBIF knows the old name as a synonym. A plant filed under the old name loses its species page, habitat and care line. The grower can still keep it with "Add as typed".
4. **The plant page sends the name to the search only when asked.** /about/how says a plant page asks by hash group, never by name, so the older-name check is a button and not automatic. **The about agent (A) needs one sentence in the privacy list:** "a plant page's "Is it an older name?" sends that plant's species name to the catalogue's search, as the search box does, only when you press it."
5. **Back and Escape keep the Record draft; Cancel drops it.** Cancel is the deliberate discard.
6. **A genus cultivar's taxon record keeps the genus key** found by the field's check, as hybrids did. It files no species key.

## Measured

- **Base build at 320 × 1800** (test 3): the name service's refusal arriving under a held press moved Add from y 849 to y 924, 75 px down. The click was lost and the button still read "Add". On this round's build Add stays at y 849, the press arms "Add as typed", and the room grows once the press is over.
- **Base build, test 2:** the first press armed "Add as typed" (review-c saw this 4 of 4). On this build the first press shows "Checking the name…" and adds with key 5384999, in Chromium and on the Chromium phone.
- **Unit:** the new `r84k-names` passes 18 of 18. On the base, 11 fail; the other 7 are regression guards (straight quotes, crosses, the toast's words with the module present). The 50 unit files that import names or the import pass 713 of 713, and the 37 that mention cultivars or kinds pass 698 of 698.
- **Browser:** the two new specs pass 19 of 19 in Chromium and on the phone, and test 1 passes again after its change. On the base build, all 19 fail.
  - In the first base run, phone test 1 passed: the page's own 150 ms blur timer closed the list after the answer landed.
  - The test now waits 400 ms past that timer before letting the answers in. That timer shows nothing a test could wait on instead.
  - With that wait, test 1 fails on the base in both projects.
- **Nearby specs**, 21 files (pickers, plant pages, import, steadiness, engines): 118 passed. The 8 flaky ones were page-setup timeouts at a load average of about 15, and all 32 tests in those 5 files passed alone with one worker.
- **Types:** `svelte-check` and `tsc --noEmit -p .` both report 0 errors.

## For the owner's PC

```
npx playwright test tests/e2e/r84k-picker.spec.ts tests/e2e/r84k-plant.spec.ts --project webkit --project phone-webkit --project firefox
```

This is also written in `docs/DEPLOY.md` under "Round eighty-four: the add form and the names a grower types (agent K)", with a two-step check on the phone after the deploy. Test 3 uses `page.mouse.down/up`. In WebKit the release falls back to `pointerup` + 600 ms if no `click` comes. If WebKit's labels walk (`P-s/round84-webkit-walk.mjs`) still loses a press, its trace should now show "Checking the name…" after the press, not "Add as typed".

## Touched outside my files

- `src/routes/plants/import/+page.svelte`: the 'genus' count and row, and `statusOf` reads `ownVerdict` first. This page is in no agent's list; it sits next to `src/lib/import/`.
- `tests/unit/core.test.ts`: one test rewritten to the W5 rule.
- `tests/unit/r60f-import.test.ts`: one `toEqual` gains `slug`.
- `docs/DEPLOY.md`: my section only.
- Not touched: `src/lib/db/types.ts` (`kindOf`), labels, Today, the list. They read a genus cultivar correctly as it is. Labels now ask the genus's hash group for a care line and get none, which is harmless.
- **For A (about pages):**
  - the privacy sentence in Decision 4;
  - `nameKind` "cultivar" now covers a cultivar under a genus alone, with `taxonName` the genus;
  - a cultivar in any quotes;
  - the picker's list opens only while its field has focus;
  - Add waits for the reference's search;
  - Back keeps a Record draft in memory only.

## Not done, with why

- **A9's "Echeveria × imbricata" returns three Echeveria species with no fallback marker.** It is not in my item and is a search wording question (N). The picker shows those rows as GBIF's.
- **There is no browser test for A16's toast.** The watering commit cannot be made to fail alone without stubbing IndexedDB. The words are unit-tested, and the wiring is three lines in `plants/new`.
- **I did not suppress A9's genus menu for a cultivar.** With C1 fixed, the menu shows only while the field has focus, and it is the way to correct a misspelt genus. The line under the field now says the plant is filed under its genus.
