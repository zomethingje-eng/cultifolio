# Round 116: keeping a collection on an iPhone or iPad (MYPLANTS 26)

The tracker hand-off's round 26, one of the two the owner put before the Show HN. It rests on his device test and
decision of 23 November 2026 (docs/PLAN-IPHONE.md). The test found that Safari and the Home Screen app keep separate
collections, and that a label scanned with the Camera opens Safari. He decided on sync first, with a warning on install.

## What changed

- **The "keep your plants" sheet** (`KeepSheet.svelte`, `keep-sheet.svelte.ts`):
  - It shows once after the first plant in Safari on an iPhone or iPad, and again a week after it last showed, while
    there is no sync and no backup.
  - It never shows in the Home Screen app, on Android or on a desktop, or in the example.
  - The plant list's line opens it at any time.
  - It holds the state in a line (the plants, the last backup, sync) and the reason in one sentence (what Safari may
    delete after seven days unused).
  - Then the three ways, sync first and marked recommended:
    1. **Sync**, which keeps Safari, the Home Screen app and other devices the same, so a label always finds its plant.
    2. **The Home Screen**, which says the app starts empty, how to move the plants across, and that labels open Safari,
       so without sync the collection is best kept in Safari.
    3. **A backup.**
  - "Remind me in a week".
  - It is a native modal dialog, loaded on demand: the root layout loads no tracker module on every page (round 60).
- **The list's line** on an iPhone in Safari reads "Kept in Safari on this device only, which may delete it after seven
  days unused: keep your plants". Elsewhere it reads as before.
- **Retired.** Round 60's card before the first plant ("add Cultifolio to your Home Screen before adding plants") and the
  install bar's iPhone line both asked an iPhone to add the Home Screen with no warning. Under the decision that splits
  the collection from where labels open. The install bar stays for Chrome and Edge, whose installed app shares the
  browser's storage.
- /about/how says what Safari may clear and what the sheet offers, and lists the sheet's key (rule 5). /changes has the
  round.

## Tests

- `tests/unit/r116a-keep-sheet.test.ts`: when the sheet is due, and the line's words on each device.
- `tests/e2e/r116b-keep-sheet.spec.ts`: as Safari on an iPhone (its user agent and `navigator.standalone`):
  - the sheet after the first plant: its state, its reason, sync first, the Home Screen warning, the backup;
  - "Remind me in a week", and again a week on;
  - the list's line opening it;
  - not in the Home Screen app, and not on a desktop.
- r60 13 now holds that no card and no bar ask an iPhone for the Home Screen, and that the sheet comes after the first
  plant.
- All of these FAILED on 1764df3.
- Not tested: `navigator.storage.persist()` on a real iPhone (the device test's fourth question, not run).

## The gate and the deploy

(Written when they have run.)
