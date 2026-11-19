# Round 96: a page's Commons photographs from its item's sitelink where P373's category is empty (the plan)

Written 19 November 2026, after round 95 went live (ee3ee0d, corpus eb2c790bb6785f8a). Round 95's walk left one
regression for a later round (docs/REVIEW-ROUND-95.md, "The online build"): Heberdenia bahamensis went from 11
photographs to none.

## The answer

One change of code, with its test, then that one page built again online. Corpus tier: the app is not changed.

## The case (read 2026-11-19)

- Heberdenia bahamensis, k2840712 (Kew's id; no GBIF key), Wikidata item Q15304926.
- The item's Commons category (P373): "Heberdenia excelsa". Commons: 0 files, 0 pages, 0 subcategories.
- The item's Commons sitelink (commonswiki): "Category:Heberdenia bahamensis". Commons: 11 files.
- The page as served: `upstream.commons` "none", no detail; 0 photographs.

The build read P373's category, else the name's (build.ts for a page with a GBIF key, build-kew.ts for one without). An
item's P373 and its Commons sitelink are two statements of the same thing; here they disagree, and the one read is empty.

## 1. The rule (src/lib/dossier/sources/commons.ts, `itemCommonsPhotos`)

- P373's category is read first, as before; with no P373, the name's (Kew's name or the page's), as before.
- Only where P373's category holds no file at all (Commons answers no member of type file, before any photograph rule)
  is the item's Commons sitelink asked: one request, `wbgetentities&ids=<item>&props=sitelinks&sitefilter=commonswiki`,
  for that page only. Every other page asks exactly what it asked before; the build's batched entity reads are unchanged.
- The sitelink's category is read when it is a category ("Category:…") and names another category than P373 (compared
  as Commons compares names: underscores as spaces, first letter capital). Its files pass the same photograph rules, by
  the page's own names.
- Not read: a sitelink that is a gallery (a page, not a category); no sitelink; the same category. A P373 category whose
  files the rules all leave out is not empty, and the sitelink is not asked (rule 3: matched by rule, never guessed).
- The record (`upstream.commons.detail`) says which category was read and why: 'read Commons category "Heberdenia
  bahamensis", the item's (Q15304926) Commons sitelink, since its P373 category "Heberdenia excelsa" holds no files'. Where
  the sitelink is not read, the detail says why (no sitelink, a gallery, the same category).
- Rule 2: a sitelink Wikidata refused or did not answer makes Commons' status that failure, with its reason, never
  "none".
- No new figure on a page; no about page states how the Commons category is chosen, before or after (rule 5 holds).

Test: tests/unit/r96a-commons-sitelink.test.ts (10 cases; on ee3ee0d every case but the guards FAILED: the function did
not exist, and P373's category alone gives no photograph).

## 2. The gate

`node scripts/predeploy.mjs --tier=corpus`: the unit tests, then the browser suite in Chromium desktop and phone.

Passed 19 November 2026 on the third run: 697 files, 6,290 unit tests passed (10 skipped); Chromium 1,027 passed, 7
skipped, every test first time. The two runs before it, and why:

- First: tests/unit/r69k-index-seam.test.ts read build.ts for the old call `commons.commonsPhotos(f, cat, …)`. Changed
  to the new call, with the same names passed; the seam it guards (GBIF before Commons, the species' names to Commons)
  holds.
- Second: tests/unit/r85m-merge.test.ts, Vite's dependency cache on Windows (EPERM renaming node_modules/.vite/deps), a
  file race, not this change; it passed on the first and third runs.
- Run from Git Bash, r88s and r89a fail: `tar` there is GNU tar, which does not read a zip; the builder needs Windows'
  own (C:\Windows\System32\tar.exe). The gate is run from PowerShell or CMD.

## 3. The data (planned, not run)

Once the change is committed (the owner's word), in its own CMD window, after a day's daily run has stopped and never at
midnight UTC:

```
node scripts\corpus-step.mjs --plan scripts\corpus-plan-r96-commons.txt
```

The plan: backup; `dossier --keys scripts/rebuild-r96.txt --grid climate --bulk bulk` (the one page, online: one
iNaturalist taxon of the day's 4,000); a `stop` to read the page's Commons record (expect B = 1); the fills a build does
not carry (Kew's published-in, the stage-2 sources, flowering) and the index, as round 95's online build was followed; a
review with its checks; upload; live check.

## Not in this round

- A page with no P373 reads the name's category, as before. Its item's Commons sitelink could be read in place of the
  name (an item's statement over a match by name). Not measured: how many pages have a sitelink and no P373, and how many
  of those read a different category by name. A later round, with its own count.
- Pages other than Heberdenia bahamensis with an empty P373 category: none known. Round 95's drops.txt listed only this
  one among pages that lost photographs; a page that never had them would not be listed. A count over the index's
  Wikidata items would say, at one Commons request per item with P373.
