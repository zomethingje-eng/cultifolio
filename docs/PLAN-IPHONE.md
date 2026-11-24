# Keeping a collection on an iPhone (MYPLANTS 26): the device test and the decision

The tracker hand-off's round 26 begins with a test on a real iPhone, its answers reported before anything is built. The
owner ran it on cultifolio.com on 23 November 2026, on the live site as deployed that day.

## The answers

| # | The question | The answer |
|---|---|---|
| 1 | Two plants added in Safari; the site added to the Home Screen and opened from there. Are the plants there? | **No.** |
| 2 | A plant added in the Home Screen app; the site opened in Safari. Is it there? | **No.** |
| 3 | A label's code scanned with the Camera: does it open in Safari or in the Home Screen app? | **Safari.** |
| 4 | What `navigator.storage.persist()` answers in each | Not run (it needs a test page). |

- Answers 1 and 2 are as the hand-off assumed, from WebKit's page and OpenPWA's test: Safari and the Home Screen app
  keep separate collections.
- Answer 3 is the case the hand-off left to the owner: labels on an iPhone find a plant only where the collection is
  in Safari, or synced into it.
- The owner first gave 1 and 2 as "yes", then said he had them backwards; "no, no, Safari" is the corrected record.

## The owner's decision (23 November 2026)

**Sync first, and a warning on install.**
- The sheet recommends sync. It is the one way that keeps Safari and the Home Screen app the same, so a scanned label
  always finds the plant.
- "Add to Home Screen" stays as an option. It says the app starts empty, walks through both steps (sync or a backup
  here, then "I have a key" or Restore there), and says that labels scanned with the Camera open Safari, so without
  sync the collection is best kept in Safari.
- A backup stays the third way.

## What is built (round 26, after round 115)

The sheet as the hand-off draws it, with the decision above:
- It shows once after the first plant in Safari on an iPhone or iPad, and from the list's storage line at any time.
- It never shows in the Home Screen app, on Android or on a desktop, nor once sync is on or a backup has been taken.
- "Remind me in a week" brings it back after seven days.
- The list's line changes from "back up or install the app" to words true on that device.
- The privacy page and /about/how say what a browser may clear and what the site asks of it (rule 5).
