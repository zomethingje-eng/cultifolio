# Round 87, stage 2: the owner's steps

Three downloads into `bulk\`, one check of the CITES table, then the two plans. Everything here was read on 9 November
2026 (the sources agent's notes, `docs/about-87/sources.md`, give where each figure and licence was read).

Check each file's md5 in PowerShell with `Get-FileHash -Algorithm MD5 <file>`. The build checks the first three itself
and says "md5 as its publisher gives it", or "md5 NOT the one its publisher gives".
PowerShell prints the md5 in capitals; the build, and the CITES table's `# checked:` line in step 4, take it in either
case. The build also counts each file's rows against the release's own count (328,565, 32,063 and 1,664,014 below). A
file that is there but cannot be read whole (a broken or partial download, a zip without its `classification.csv`, a
header without a column the code reads) is printed as "COULD NOT BE READ", with why, and every page says "not asked"
for that source, never "none": download it again, check its size and md5, and run the step again.

## 1. Kew's predicted extinction risk (CC BY 4.0)

- From: https://zenodo.org/records/10605228/files/Angiosperm_extinction_risk_predictions_v1.csv?download=1
- Save as: `bulk\Angiosperm_extinction_risk_predictions_v1.csv` (keep the name: the version is read from it)
- Size: 55,277,287 bytes
- md5: `e6fbee92fe19b783345cda27fc18eddc`
- 328,565 rows.

## 2. ChromoDB, IAPT/IOPB chromosome data, version 3.1 (CC BY 4.0)

From https://zenodo.org/records/24057855, both files, their names kept:

| Save as | Size | md5 |
|---|---|---|
| `bulk\IOPB_IAPT_records_v3_1.csv` (32,063 records) | 5,924,887 bytes | `e5ad7aae7d1ab864d92d7e8ca5b904bd` |
| `bulk\IOPB_IAPT_biblio_v3_1.csv` (1,709 references) | 629,998 bytes | `462c7f9b934fa80bd055b741582da51a` |

The other three files of the record and its README are not read. Version 2.0 (Zenodo 18343310) is withdrawn by its
authors and must not be used. If a later version is out, take both its files: the newest beside its bibliography is
read, and the build says when this code does not know its md5.

## 3. WFO Plant List, release 2026-06 (CC0 1.0)

- From: https://zenodo.org/records/20782718, the file `_DwC_backbone_R.zip`
- Save as: `bulk\wfo_backbone_2026-06.zip` (the release is read from the name)
- Size: 121,660,019 bytes
- md5: `0e4486945cd9f7af548ca87eb9a870ed`

Do not unzip it: its `classification.csv` is 952,821,772 bytes, and the build streams it out of the zip (tar on
Windows 10 and later). Unzipped, it must be renamed `bulk\wfo_classification_2026-06.csv`.

## 4. CITES: check the table once, before it applies

**Until this check is done, every species page's CITES line says "not asked".** No page says a plant is listed or not
listed meanwhile, and /about/how says the table applies only once checked. Nothing on the site is false while it waits.

1. In a browser, open https://cites.org/eng/app/appendices.php. Read the edition in force ("valid from …") and
   cites.org's terms of use at the foot of the page. If the edition is not "valid from 5 March 2026", change the
   table's `# valid-from:` and `# edition:` lines too.
2. Download the edition's English PDF (now
   https://cites.org/sites/default/files/eng/app/2026/E-Appendices-2026-03-05.pdf) to `bulk\`, and take its md5.
3. Read its FLORA pages against `src\lib\dossier\cites-appendices.tsv`, row by row: each Appendix, name, annotation and
   parenthesis. Most likely to differ are the CoP20 rows, whose wording is the Notification's as relayed, and the
   Appendix III rows, which a Party can change at any time. Correct a row in place; add a row the PDF has and the
   table has not.
4. Set the header line `# checked: no` to `# checked: <YYYY-MM-DD> md5 <the PDF's md5>`, and commit.
5. Run `npm run dossier -- --fill sources --bulk bulk`, then `npm run dossier -- --index`, then
   `node scripts\corpus-step.mjs --plan scripts\corpus-plan-upload.txt`. The fill's CITES line then says
   "checked <day> against md5 <md5>: N pages listed", and the pages read the table.
   A synonym Kew holds that is spelt as another page's accepted name is read for no listing (the review of stage 2,
   S1): the listing is that other plant's, and the line says so.

The check can be done before the plan below (its `--fill sources` step then applies the table) or after it (then step 5).

## 5. The plans

1. `node scripts\corpus-step.mjs --plan scripts\corpus-plan-r87s2.txt`: the backup, the dry run and its review, the
   walk, the online `--keys` build, the offline fills, `--fill summaries` and `--fill elsewhere`, the index, the checks,
   the upload and the live check. Each review stop says what to read, what to expect, and when to stop.
   The review after `--fill sources` now holds the counts measured on these files against the index of 5 November
   (48,370 pages): WFO about 47,985 names found, 286 not decided and 99 not in its list; ChromoDB about 8,107 pages with
   counts and 123 not decided (77 of them records under the page's IPNI id named otherwise); 9 risk rows with no
   figures (Extinct in the Wild), said as such. It stops on "COULD NOT BE READ" as on an md5 that is not the
   publisher's. The stage's stated-wild choice of the typical cell is out (the review of stage 2, S4), so the dry run
   and the walk print no "typical cells chosen" line and ask NASA POWER for no new cell.
2. Then once a day: `node scripts\corpus-step.mjs --plan scripts\corpus-plan-r87-daily.txt`: `--fill flowering`
   (about 11 days) and `--fill bhl` (10 days at the least), then the index, the upload and the live check. Since round
   ninety both are `daily` steps: a fill that stops at its day's allowance hands over to the other, so each day's run
   uses both allowances, and the run stops before the index until both have finished. Nothing is typed by hand. Until
   a page is read, its flowering and BHL lines say "not asked".
