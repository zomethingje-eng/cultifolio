# Round fifty-seven: compatibility for data nobody has

No review. Nobody uses the app yet, the owner included, so every path that existed only to read what an earlier build wrote protects nothing. Before launch is the cheapest moment there will ever be to drop it: from the first outside user, every format shipped is a format read for good. The rule for this round: keep what reads the formats this build writes; remove the rest. The corpus build pipeline is out of scope (it reads the owner's real corpus), as is robustness that is not about an old format.

## 1. The collection on the device

1. **The v2 Herbarium importer** is gone: `src/lib/import/v2.ts`, its branch on the backup page, the `/plants/import` redirect, its tests, and every mention on the public pages and the empty states. Herbarium v2 was a proof of concept nobody used.
2. **`importedOn`** is gone: the stamp a file merge wrote on a record whose id carried no date, its place in the field types, Today's fallback, the day-counter branch, and the fold's exception that kept it from counting as an edit. FOLD_RULES is 3, so every device folds its log once.
3. **The changes-only JSON backup** is gone. Only the `.cultifolio.zip` is read; a JSON file is "not a Cultifolio backup".
4. **Mending.** `mendChange` put right what earlier builds wrote with the wrong type (a v2 file's numeric price, a count as text) or in the v2 importer's words ("leaf cutting", "Wild collected"), on every read of the vault. It is gone, and the vault's reads return what is stored. A value of the wrong type in a file or a batch is now left out and named like any other unreadable value.
5. **The free-text `location`** from before places were records is gone: the field, the "Make it a place" list on the Places page, its conversion, and the fallbacks on the plants list, the plant page, the labels, the place page and the plants CSV.
6. **The taxon `removed` flag**, which only a v2 overlay set, is gone with the follow button's check for it.
7. **The numbering scheme in device storage.** The scheme is a synced setting record; the copy written to `meta` for builds that read it there, the fallback that read it back, and the backup manifest's `scheme` field (with the merge and replace paths that applied it to a device on the default) are gone. A backup carries the setting record in its log like any other change.
8. **Small storage fallbacks:** the clock offset stored as a bare number, the corpus id stored as a bare string, and the site-wide hemisphere cookie that builds before round sixteen set.

Kept, deliberately: `accNo`/`sowNo` still fall back to the id when a record has no number field. No current path writes such a record, but tests build records that way and the fallback is one expression; the formats page no longer presents it as a format.

## 2. Sync

1. **Batch names** are `<hour>-0000-<device>-<fingerprint>` and nothing else; the full-HLC names of earlier builds, with or without an unkeyed hash, are refused.
2. **The push headers** (`X-Batch-Plain`, `X-Device`) are required; a photograph's upload must carry its removal proof. Every object on the server is therefore stored with the metadata the dedup and the removal check read, and the server's byte comparison for objects stored "before hashes were kept" is gone.
3. **Seals open under their own binding only.** A photograph opened under its id, then under the plain `vaultId|photo` if that failed; a batch likewise under its name, then the plain form. Only the bound form is tried now, which also closes the downgrade the second attempt allowed.
4. **Set-aside entries** carry their kind; the guess from the error text for entries from before round fifteen is gone. The retry of batches an earlier build of *this* device set aside stays: that is forward compatibility with a newer peer, not an old format.

The owner's test vaults on the server, if any, hold batches under the old names or seals and will not open on this build: stop syncing on each device and create a new vault.

## 3. The reference

1. **`n` is required** on `/api/entries` and `/api/sheets`; a request without it is a 400, not taken as thirty-two. The live check names the count `/api/corpus` announces.
2. **The thirty-two sheet files beside the index** are no longer written by `--index` nor read by the Worker; sheets come from the manifest's products, or are derived from the dossiers for the fixture corpus. DEPLOY.md says how to remove the old files from the bucket.

## 4. The snapshot keyed to the rules, not the build

The fold snapshot was keyed to the build, so every deploy made every device fold its whole log once. It is keyed to FOLD_RULES (with the device and the clock correction, as before), so a deploy that leaves the fold as it was keeps every snapshot. An open older shell still cannot overwrite a snapshot folded under newer rules (the round fifty-five guard, now by rules number). That is safe only while the number moves whenever the fold does, so `tests/unit/fold-rules.test.ts` holds an md5 of the fold's source as written (apply, the hold and the park, the required fields, the kinds, and the collection's methods that build, restore and save the snapshot; whitespace aside, so line endings do not matter) to the number it was recorded under, and fails with instructions when the source changes and the number does not. Checked by mutation: changing one comparison in `apply` fails it.

## Not touched

The corpus pipeline (old GBIF thumbnail forms mended at parse, rows carried from earlier dossier builds, the herbarium-sheet filtering), since that is the owner's real data; validation leniency that is not about a format (editing a plant whose stored date is already wrong); the vault's upgrade steps, which are how a new database is created.

## Counts

468 unit tests on 49 files (one new: the fold-rules guard; the importer's twelve and the legacy formats' tests gone), 99 e2e (the large-backup test now builds a zip), local live check 10 of 10.
