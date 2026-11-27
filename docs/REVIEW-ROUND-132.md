# Round 132: a plant's page, its photographs (MYPLANTS 31, item 1)

The plant hand-off's round 31, item 1: the leading photograph, a strip beneath it with each one's month, "First beside
latest", and a camera button that adds one. Built in the clone on 27 November 2026.

## Done

- The page already led with its cover photograph and, under it, the strip by date with each photograph's month and a
  comparison of the first and the latest (round sixty). This round gives the comparison the hand-off's name, "First beside
  latest" (and "Close" while it is open), and puts "+ Photo" beside it (`#ptl-add`), which opens the page's own photo
  box ("Take a photo", "Choose photos") and brings it into view, so the box is not drawn twice.
- With no photograph the page shows the photo box and the reference photograph's line, as before.
- /changes.

## Not yet

- **The one-line folds** (MYPLANTS 31 item 7). Identity is one line with its state already (round 124). Provenance,
  folded, would hide the field number, ITF2's provenance, the earlier holders and the plants of an accession, which a
  grower reads at a glance and some thirty tests read open; Season and Papers are their own short components. Left for
  the owner to weigh: fold Provenance to one line ("from a club plant sale, 2025-03-12", or "none yet"), or keep it open.

## The component harness (a fix the gate asked for)

- The second gate stopped at its unit tests: r85q-picker's five failed with `EPERM: operation not permitted, rmdir
  node_modules\.vite\deps`, then a null browser. Every file that mounts a component starts its own Vite server, and all
  of them shared `node_modules/.vite`; two clearing its deps at once met Windows' lock on the folder. The same failure
  stopped gates and the clone's suites in rounds 125 to 132 (r85q-behaviour 2, r85q-guards, r85q-species-page), each
  passing alone. `tests/unit/helpers/mount.ts` now gives each worker its own cache (`cacheDir` in the worker's stub
  folder under the system's temporary folder). The clone's whole unit suite: 6,611, every one.

## Tests

- r132b (browser, 1, at phone width too): two photographs, "First beside latest" opens the pair and says "Close", "+
  Photo" opens the photo box. FAILED on 8d52011.
- r87p and r87rec on the new /changes lines (the strip unchanged).

## Gate and deploy

(Written at the gate.)
