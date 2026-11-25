# Round 119: the first ten minutes (MYPLANTS 27)

The tracker hand-off's round 27 (myplants-handoff/MYPLANTS.md, screen 1 and 3 of its first mock). Built in the clone
(Desktop\AI Work\cultifolio-check) on 24 November 2026 while round 118's gate ran in the project.

## Done

### a) The empty page

- **Three ways in** as large rows (`src/lib/ui/grow/WayRows.svelte`, the list in `ways.ts`): Add a plant (the primary),
  Photo walk, Import a list, each with one line under it.
- **What you get**, three short lines: a number and a label; Today; the habitat beside your space.
- **Quiet links:** the example collection (the same button, `#try-sample`, drawn as a link), "Join your sync" (`/sync#join`,
  which now opens the key's field) and "restore a backup".
- The numbered steps (round fifty-eight) are gone, with "Nothing here yet" and the separate import line (PlantsEmpty).
  The frost watch's site is asked on Today, as it was.
- The page's line: "Your plants, each under its own number. Kept on this device, with no account."
- **The top bar's +** on a phone (900 px and under, in the plant sections) opens the four ways in, Sow seed the fourth, as
  a small dialog loaded when first opened (the root layout carries none of it). Escape or the scrim closes it and gives
  focus back. From 901 px, and without scripts, it is the add form's link as before.

### b) Placing a plant

- **Spaces as chips** on the card "Your plant against its habitat": with six spaces or fewer each is a chip by its full
  path, "+ New space" last, which opens the picker; more than six, the picker as before. One tap places the plant
  (`movePlantsUndoable`) and the card's comparison shows at once.
- **The fixed line** under the comparison: "It compares. It does not say what the plant will do."
- **Three small steps** in a row on a growing plant's page: Placed, Photograph, First measurement, each marked once done,
  shown until all three are (the old list showed only while two or more were left).
- **"Added as 2026-0013 · Undo"**: one plant added is said as the watering's toast is, with Undo, which removes the plant
  (its number stays reserved) and opens the list.

### c) The example

- **Reference photographs on in the example** only (`prefs.referencePhotos` is true while the page is in the example):
  plants without a photograph of their own show the species' photograph, which the plant page already credits as "species
  photograph"; a list row marks one "ref".
- **The example's keys.** The sample's Welwitschia (5411106) opened on the plant page's "the reference files it under
  another key" notice. On the live site both Copiapoas' keys (5384013, 5384999) are not the reference's either (the live
  API answers 404 to all three; the reference holds 5275521, 7284333 and 7284225). The test corpus holds the old keys, so
  changing the seed would break the example in every test. Instead, inside the example only, a plant whose key the
  reference has moved from takes the reference's key by itself, as the notice's button would, and the notice is not shown.
  A grower's own plant is still asked.
- **No path leaves a new user on the spaces list:** the empty page links no space form now; a space is made from the
  plant's card ("+ New space") or the add form's picker, both in place.

## Decisions

- The comparison is round 107's line (one figure pair with its sources). The mock's second figure (rain against a watering
  rhythm) needs MYPLANTS 28's rhythm per space and is left to it.
- The + menu is a dialog of links, not a menu of menuitems: each is a page to go to.
- The example's keys are mended on the page, not in the seed (above).

## Tests

- r119b (browser, 4): the empty page; the phone's + (desktop: the link); "Added as" with Undo, the chips and the steps;
  Undo removes the plant. FAILED on 19ec7a8.
- Moved: r60-grow, r64f and r63v V2 read `#first-ways` where "Nothing here yet" stood; r63fv 3 reaches /places#add by the
  top bar's "Add a space"; smoke-3's site test reads that the empty page asks for no site, and its setup test reads
  "Placed"; smoke-4 reads "Added as"; r107b 2 taps the Bench 2 chip; r84k's added words.

## Gate and deploy

- Gated with round 120 (the clone's Chromium suite first: four faults fixed there, and four in its unit suite).
  svelte-check 0 errors in 1,903 files; the hybrid table made again after the day's growth, 523.
- The app gate, WebKit and Firefox at one worker each: the first run failed r87s3 3 once (the look: Today's new state label
  and the card's space chips in boxes with round corners); the second failed it in Firefox twice (the label kept the theme's
  `pill` class, whose fill reached it) and r87t3 2.4 once in WebKit (the report's link, 11.8 s, then 2.6 s on its retry).
  The label is `spacestate` now, the chips 3 px corners. The third run: 6,560 unit tests, 2,994 browser tests, every test
  first time in every engine.
- Committed as aa450b2 with round 120 and pushed on 25 November 2026. The first `node scripts/deploy.mjs` stopped
  at one unit test; the second deployed, live check 24 of 24.
