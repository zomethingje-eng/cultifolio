# Review round twenty-five: two reviews of `4f05f87`, triaged

The second reviewer's sixteenth pass (three findings, all in the new care summary; Lighthouse 99–100 on every page and view, zero axe violations) and the first reviewer's round twenty-four, whose walk added what months bring: sixty plants, a seventy-nine-line log, and New Year's Eve. Every finding was checked in the source or reproduced; all are real and all are done except the one editing feature deferred below. "R1-n" is the second reviewer's; "R2-n" the first reviewer's.

## One watering figure

1. **The care aggregates could disagree with the row, and excluded exactly twenty-one days** (R1-1, R1-2, R2-1). Today, the Due chip, the list's filter, the row, the plant page's card and the place card each computed "since watered" for themselves; the chip said "21+" and Today "three weeks or more" while both tested `> 21`; and a future-dated line (2027 typed for 2026) stood as the last watering for a year, so a thirsty plant fell out of every count. Now the collection has the one figure: `lastWatered` (the latest watering dated today or earlier), `careDays` (days since it, or since the record was made when nothing is logged) and `due` (growing plants at `DUE_DAYS` or more, inclusive), and every surface reads those. The log form refuses a date after today with a sentence, as the batch page does. I could not reproduce the second reviewer's thirty-day case on the production build here, and the round-twenty-four test's own navigation race (R1-3) explains their suite run; the shared selector removes the duplication that made the surfaces able to differ at all. e2e: a watering exactly twenty-one days back, then a fresh load of `/plants` (row "21 d ago", chip 1) and `/` ("1 of 1 plants not watered…"), then a 2099 date refused.

## The log

2. **The "notes replaced" line fired on every ordinary cross-device edit** (R2-2). Round twenty-four asked "did I write the text being replaced", which is true of a text the other device read and edited from. A notes edit now carries `notesBase`, the stamp of the notes it was made from, in the same commit; a device receiving an edit logs its own replaced text only when the edit's base is not the text it holds, that is, when the edit was made blind to it. The check runs on pulls, restores and imports alike, since a backup file is the one channel two unsynced devices share. The plant page's editor passes the stamp it opened on, and logs an overwrite itself only when the overwritten text was this device's own (another tab's); a text from another device is that device's to log. The formats page lists the field. Unit tests: a blind edit logs once; an edit made from this device's text logs nothing; a losing change and the same device's other tab log nothing; a restore that replaces notes written here logs them; an edit records what it was based on. The engine test's held count is two, the notes and their base.
3. **A long log was a wall** (R2-12). Fifteen lines, then "Show all 79 entries"; lines the app wrote or a place-wide action made (`auto`) are set quieter, with the reason on hover. Editing an entry in place is deferred (below).

## Records

4. **Editing a nothospecies renamed it to the bare genus** (R2-3). "× Graptoveria titubans" is filed as `Graptoveria titubans` with the hybrid kind; the edit form took a species-shaped name with that kind for a cross and cut it to the genus, dropping the key and logging a rename. A name with an epithet keeps it; only a cross written out, or a bare genus, files as the genus.
5. **Numbering across New Year disagreed with itself** (R2-4). Plants took the clock's year while batches and pot-ups took their date's, and the add form's preview took the moment it was rendered. A plant is numbered for the year of its acquired date, the preview follows the form's date, and the add form's and the batch form's default dates follow the day store like the batch page's.
6. **A recorded count of 0 read as a first strike** (R2-5). Only a positive count sets the first-strike day.
7. **After Replace from backup, the sync page led with Rejoin, which would merge the old vault back** (R2-6). The former-vault record now says why it was left; after a replace the page explains that rejoining merges the vault's records into the restored collection, leads with "Set up a new vault for the restored collection", and offers the rejoin second, named for what it does. Another tab hearing of the stop re-reads the record, so it leads the same way without a reload.
8. **The batch page could flip its dates back to yesterday for a minute after midnight** (R2-7). Its forms now start from the day store, which checks the day when it starts, so the forms and the store cannot disagree.

## What the site says

9. **Two more renewing TTLs, and the isolate's memory** (R2-8). The KV fallback's creation keys (used wherever the counter object is not bound, `wrangler.dev.jsonc` included) now expire at the fixed moment the byte counter does; the rate limiter drops windows older than the current one on each call rather than at five thousand entries; `/about/how` says the running Worker's memory holds only the current ten minutes. Unit test on the fallback's expiry.
10. **The formats test: six checks that compared text with itself, and the facts it missed** (R2-9). `NameKind` and `PhotoDateFrom` are named unions now and the page's lists are compared with them; the manifest's keys are compared both ways; the merge rule ("greatest t") is asserted against the fold with two orders of arrival; `readonly` fields are read; the photo route's methods and the log route's are read from the route modules' exports; the listing reply's field names come from `BatchRef` and `listBatches`'s signature; the bearer scheme is tested against the Worker's `BEARER` pattern; `device.json`'s keys are `DeviceSettings`'s, now a real interface; `changes.json` is checked against the writer. Each new check was confirmed to fail against a mutated page.
11. **Two deploy-time slips** (R2-10). The live check takes its species page from the deployment's own sitemap unless `LIVE_CHECK_SPECIES` names one, so a corpus without `lithops-lesliei` no longer fails a good deploy; DEPLOY.md documents the variable and no longer says KV counts vaults per address.

## Living with it

12. **/plants at sixty plants: no sort, a literal search, and a Back button that forgot** (R2-11). The query, the chip and the sort live in the URL, so Back returns to the same list and a filtered list can be bookmarked; every word typed must be found somewhere ("humilis bench"); notes and the source are searched; a sort select offers newest number, name, longest since watered, and place. e2e.
13. **A flagged row printed its status twice at desktop width** (R2-13). The theme's `.azrow.accrow .fam` outranked the page's `.phoneonly`; the page's rule now names the same selector.
14. **The place's Last audit card ignored the plants that audit missed** (R2-14). It says "N not seen at it" and counts the ninety-day set the way Today does (a plant never audited is not "unseen").
15. **Offline wording** (R2-15). "8 field changes kept here"; and when the browser is online but the server did not answer, "Server not reached", sent "when the server answers again".
16. **Small wording** (R2-16). "frost: Frost forecast:" says its level once; two batches sown the same day order by which was made first; the place card no longer says "the longest waiting the same"; "this year" is "in the last twelve months" on Today and the chip.

## Deferred

Editing a log entry in place (R2-12, part). Removal with the line rewritten is what the log offers today; an editor for a line's date, note and figures is a feature for after the post, with the compare entry, the share card's legend and the three design notes from round twenty-four.

## After the changes

`npx svelte-check --threshold warning` clean; `npx vitest run` 36 files, 353 tests; `npx playwright test tests/e2e/smoke.spec.ts --workers=1` 69 tests, no retries; the local live check's seven upstream-free checks pass with the species page taken from the sitemap. For the deployer: nothing beyond `npm run deploy`; no variable, binding or migration changes.
