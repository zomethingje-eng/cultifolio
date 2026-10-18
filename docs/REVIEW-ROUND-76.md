# Round seventy-six: the Worker without the whole index, and the photograph strip

Round 76 has two parts, one agent each:

- **W** carries out round 76 of `SCALE-STUDY.md`'s plan.
- **P** fixes the front page's photograph strip.

Their reports are `review-76/W.md` and `P.md`. `FOLD_RULES` stays 8 and the device database stays at version 4. This round has a corpus step.

## 1. The Worker's lookups from the build's files (W)

- **`--index` writes new files** beside today's, named in the manifest:
  - `names/<h>.json`, 128 name files;
  - the catalogue's row files;
  - `genera.json`;
  - `featured.json`, the strip's pool, chosen by the same rule as before;
  - the sitemap's file.
- **Each Commons photograph's judgement is stored in its dossier** at `--index` (`judged`). A page no longer needs every name in the reference to decide which photographs to show.
- **Under a manifest with these files, the Worker reads none of the index except for the search.**
  - That covers species pages and their older-name redirects, merged pages, ambiguous older names, the 404s, the dossier API, the home page, the catalogue and the sitemap.
  - The search still reads the index once per copy; round 77 replaces it.
- **Under a manifest without them (today's live corpus), the Worker reads the index as before.** This is tested. So the deploy and the corpus step can come in either order.
- **The proof on the real corpus** (`scripts/dev/scale/r76-proof.ts`, output in `results/r76-proof.txt`) found 0 differences across:
  - 251,023 name keys and 85,360 addresses, resolved through the files against today's maps;
  - every dossier's shown photographs, with the stored judgement against today's;
  - the merged pages, which redirect as before.
- **Cold starts in node, today's corpus → after:**
  - a species page, 550 ms and 45 MB → 75 ms and 5.5 MB;
  - the same page at 50,000 synthetic species, 2,630 ms and 217 MB → 81 ms and 6.7 MB.
  - In workerd (local) the same shape. A first search at 50,000 still takes 97 MB, near Cloudflare's 128 MB; round 77 is that.
- **The about pages** say what the Worker now reads and what a dossier stores.

## 2. The photograph strip on a phone (P, the owner's decision)

- **The strip is drawn once, between the welcome and the search, at every width.** A phone's alphabetical list is no longer broken by three photographs after its first rows.
  - The desktop's first screen is pixel-identical.
  - Requests, bytes and layout shift are unchanged at 390 and 320 px and on a desktop.
  - The first photograph's preload now applies on a phone too.
- **Credits are never cut** (rule 4). They are whole on the strip, the catalogue's tiles, the species page's photograph band and its related strip, at 320 and 390 px, on a desktop and at 200% text, with each row's cards of even height.
- `tests/e2e/r76p-strip.spec.ts` has four tests, all failing on r76base.

## 3. Runs

- **Unit:** 3,987 passed, 8 skipped; `tsc` and `svelte-check` clean.
- **Strict Chromium and the Chromium phone at four workers:** 501 passed, 5 skipped, one failure.
  - The failure was r67v V9, which pinned a whole catalogue row above a small phone's tab bar.
  - With the strip above the search, the first screen of an iPhone SE (375 by 548) is the welcome, the strip and the top of the search, with the first row below.
  - That is the owner's decision. V9 now checks that the strip's first photograph is whole and that the search starts above the tab bar at 375 by 548, 390 by 664 and 360 by 640. It passes.
- **The owner's first `--tier=app`:** 1,394 passed, 17 skipped, 4 failed and 2 flaky. All six were tests, not the app.
  - **r76p strip 2 (WebKit, Firefox):** it pinned the desktop's positions to Chromium's pixels, and the other engines set the same text a pixel apart. It now allows 2 px.
  - **r76p strip 4 (Firefox, 1280 px):** it measured the inline spans of the photograph's credit, which have no box of their own; Firefox gives such a span a scroll size. Only boxes that could clip are measured now. The credit itself is wrapped, with no overflow hidden.
  - **smoke-2 "removing asks twice" (Firefox):** the test ran past its 30 seconds since round 75's waits; it has 60 now.
  - **r62l clock 3 (WebKit):** WebKit wrote its cancelled-fetch message without the words before the address. The test now reads the address and the ending.
  - **The 400-plant backup (WebKit):** a quiet window of 15 seconds was too short while the merge worked without touching the database. It is 45 seconds now.
  - These specs then passed strictly in Chromium and the phone: 90 passed.
  - **My mistake:** the first form of r62l's change was two patterns, which round 69's guard (`r69p-harness`) cannot read, and the owner's next run stopped at the unit tests. It is one pattern again, the guard now also holds the new wording, and the whole unit suite passes (3,987).
- **The owner's next `--tier=app`:** 1,399 passed, 17 skipped, and one flaky test: WebKit's 400-plant backup.
  - Its trace showed the second restore never began. The file was chosen and its preview drawn, but the press on Merge left the buttons enabled. The first restore, a minute and a half of storing in WebKit, had worked.
  - The press landed while the page, opened by address after the wipe, was still settling as its collection opened.
  - The test now waits for the page and its collection before choosing the file, and checks the press began the merge, pressing once more if it did not.
  - The whole unit suite passes; the test passes in Chromium.

## 4. The owner's steps

1. The test run, then the commit and the deploy.
2. The corpus step:
   - `node scripts/corpus-step.mjs`;
   - a review stop at `--index`: "index: 8945 species", about 889 dossiers written anew, each only gaining `judged`, and about 227 more files in the manifest;
   - then the upload and the live check.
3. The cold start's CPU with `wrangler tail`, as DEPLOY.md section 3 says.
4. **Optional, later:** the 50,000-species memory test on a Worker and bucket of its own (`wrangler.scale.jsonc`), which never touches the live bucket.
