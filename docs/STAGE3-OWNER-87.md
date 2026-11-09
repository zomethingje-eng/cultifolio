# Round 87, stage 3: the owner's notes

Stage 3 is the tracker: identity and provenance (t1), lineage, batches and flowering (t2), and the season, papers,
labels, the sheet and the app lock (t3). Nothing here needs a download or a plan: it ships with the app. Four things
are the owner's: read what changes for your own collection, press one BCSS link once, know the lock's way back, and
know what a device still on the old version shows. Everything below was read in the merged code (branch r87final) on
9 November 2026; /about/how (#collection to #lineage) and /about/formats say the same for every reader.

## 1. What changes for your own collection

Nothing is rewritten. Every new thing is a field on a kind every version already reads (a plant, a batch, a log line,
a photograph), so the log you have now is read as it is, and the first change you make writes only that change. The
fold rules stay at 8. A collection from round 86 reads here with nothing stated, no item, no deaccession, no season and
no paper (tests/unit/r87t1-log, r87t2-lineage-log and r87t3-log, "a log of round eighty-six read here").

What you will see on the first open:

- **No longer held** (My plants, the ⋯ menu). Plants you marked dead before are listed there, under "marked dead"
  (they have no reason yet), and plants you removed under "Removed", each with Restore. Recording a death now records the plant as no
  longer held, died, on that day; Died, given away, lost, propagation failed, stolen and reaccessioned are the reasons.
- **Field numbers** are kept as typed and read as code and number where they read as one (SB 829 is SB and 829). The
  plant's page shows that reading and the BCSS link (step 2).
- **Provenance**: where your own provenance word means the same in ITF2 (wild-collected, F1), the plant's page shows the
  ITF2 code and says it was read from the word. Nothing is written until you set a code yourself.
- **Growing season**: a plant's page suggests one from its species page's habitat reading, names the rule, and writes
  nothing until you confirm it or set your own. Once set, Today lists the plant as resting in its rest months, with no
  Water button, and the watering calendar leaves those months out.
- **Items**: an offset, division or bulb split can now be split off as 2026-0012/A, /B. The plants of one accession
  share name, identification and provenance; edit those on any of them and each is changed. Renumber now on an item
  gives it the accession's next letter; a plant renumbered takes its items to its new number. An import links a plant
  numbered as an item to its accession's line in the sheet, or by number only when your plant of that number has the
  same name, and says which lines it did not link.
- **Lineage**: "Taken from one of my plants" on the add form, crosses (a Pollinated line with its pollen parent), grafts,
  fruit set, Flowered this week in past years on Today, the flowering calendar and the photo walk (both under the ⋯
  menu on My plants). Batches you already have keep the parent they stated. Removing a Pollinated line a batch names
  as its cross asks first, naming the batches; the batch's page then says its line was removed, and brings it back.
- **Papers**: a plant's page has a Papers section for a CITES permit, a phytosanitary certificate or an invoice (PDF,
  JPEG or PNG, up to 10 MB, thirty a plant, 300 MB for the whole collection). They are kept, synced and backed up as
  photographs are, and are not encrypted on the device. The Backup page shows how much of the 300 MB they hold, and
  warns from 240 MB.
- **The sync vault** keeps its last 64 MB of the 2 GB for your changes: a photograph or a paper past 2 GB less 64 MB
  is refused, and the changes still sync. Before, a vault filled with photographs refused the next edit too.
- **Labels**: a label printed now carries the plant's number in its QR code and, after a #, a six-character tag made
  from the plant's identity (/plants/2026-0012#i=k3x9q2). The page opens the plant holding the number only when the tag
  is that plant's. A label of a plant renumbered since lists that plant and the one holding the number now, and opens
  neither; a label from another collection says this collection does not hold that plant under that identity. Labels
  you printed before carry the plant's identity and still open it. New: label tape of 12, 18 and 24 mm (the 12 mm code
  is drawn at error correction L, so it stays 29 squares a side with the tag), a backup label of the number alone, and a
  large number.
- **The plants sheet** (My plants, Download as a spreadsheet, and the backup's plants.csv) has many more columns: the
  identity and provenance under ITF2's column names, taken from and taken as, the season, photographs and papers, the id
  last. An import of it reads the identity, provenance and taken-from columns back. Print a collection report is new.
- **The backup page's merge preview** counts papers and pinned views apart ("3 papers", "2 pinned views").
- **The app lock** is off until you set it in Settings (step 3).

## 2. The BCSS link: press it once

The lookup link is built from what the BCSS site's own search uses, `https://fieldnos.bcss.org.uk/fieldno.php?FieldNo=`
and the number as typed. That host answers a script with Cloudflare's browser check, so the result page itself could
not be read from here: the parameter name is not yet proved.

1. Open a plant with a field number you know is in the database (SB 829, say). Under its field number, press "Look up
   at BCSS Field Number Database". It opens in a new tab. Its address should read
   `https://fieldnos.bcss.org.uk/fieldno.php?FieldNo=SB%20829`. A "Just a moment" check first is the BCSS site's own.
2. Expected: the database's entry for that number (the collector, the plant, the place).
3. If instead it shows the database's empty search page, or "not found" for a number its own search finds, the
   parameter is wrong. Write down the address its own search gives for that number and pass it to the next round: the
   link is one constant (`BCSS_LOOKUP` in `src/lib/core/identity.ts`), and /about/how#bcss says what is sent. Until
   then the link still takes you to the database, where the number can be typed.

The page never asks BCSS anything by itself; the number goes only when you press the link.

## 3. The app lock: what it is, and the way back

Settings, App lock. It is a screen over the app on a device others use, not encryption: the collection, its photographs
and papers, and the sync key stay in the browser's storage unencrypted, and anyone who can read that storage (developer
tools, the device's files) can read them, lock or no lock. The passcode is kept on that device only, as a salted hash,
never synced and never in a backup, so each device has its own lock or none. The about pages are never behind it.

It can be set only while that device syncs, or within a day of a backup made on it, so a way back exists:

1. On the lock screen, press **Forgot the passcode?**
2. Either type this device's **sync key** (any case; another device that syncs the same collection shows it under Sync,
   Add another device), and press Open with the key;
3. or choose a **backup file of this collection** (`.cultifolio.zip`). It is read on the device and not restored: it is
   taken as this collection's when it holds changes this device's log holds (ten, or all of them when the log has
   fewer).
4. Either one opens the app and takes the passcode off. Set a new one in Settings.
5. With neither the key nor a file, clearing this site's data in the browser's settings takes the lock off, and the
   collection on this device with it. Do that only where the collection is also on another device or in a backup.

If you stop syncing on a locked device, the Sync page says first that the key is a way back, and offers Take the lock
off first and Back up first. If you stop anyway, the device keeps a SHA-256 hash of the key it synced with beside the
lock, so that key still opens it; the lock screen says which way back the device has. Keep the key.

After five wrong passcodes the screen waits 30 seconds, and a reload, another tab or a new window does not reset the
count or the wait (they are kept in the browser's storage beside the lock). It asks again when the app opens in a new
tab or window, and after the app has been out of sight for the time set (at once, 1, 5 or 15 minutes); a reload of an
unlocked tab stays unlocked. While locked, the tab's title is "Locked · Cultifolio", never the plant's number and name.

The passcode's hash is PBKDF2-SHA-256 at 600,000 rounds (OWASP's figure). Measured in the browser test on the test
machine: 94 ms a check (139 ms in the phone project); Chromium's CPU throttle does not slow WebCrypto, so a slow phone
was not measured. Someone with the device's storage can still find a short passcode from the hash: the lock is a screen
against a casual look.

## 4. A device still on the old version (round 86)

A phone or browser that has not yet taken the new version reads every new record safely: no change is refused, no
sync bundle is set aside, and its fold is the same as here (the three log tests above, run against round 86's own log
module). What it shows and does not, until it updates (a full reload takes the new version):

- **Papers**: not shown. Each paper is a photograph record without a picture's width and height, so the old version
  keeps it as a record waiting for a field, syncs it and backs up its file. Its My plants page says "N waiting: N records
  wait for a field this device does not have … not shown until it comes", its Sync page counts them under "Could not be
  read here", and Today's line about backup and sync, where shown, adds "N records waiting". Nothing is lost; the notes go when the device updates.
- **No longer held**: a plant recorded as no longer held shows there as dead (died, propagation failed) or archived (the
  other reasons), since the status is written with the reason, but the reason itself is not shown. Its own "Mark
  growing" sets the status only and leaves the reason: on the new version that plant is growing and held, is not listed
  under No longer held, and its next edit there clears the stale reason, day and note.
- **Items** (2026-0012/A) are listed under their own numbers in My plants, and each row links to
  `/plants/2026-0012/A` with the "/" as it is. Round 86 has no page at that address, so the row opens "page not found"
  (404) there. Open and edit items on the new version, where the same link opens the item. An edit of the name,
  identification or provenance of the accession's first plant on round 86 changes that one plant, not each of the
  accession's: make those edits on the new version too.
- **Renumber now on an item**: two devices that each split one plant offline both make 2026-0012/A. The new version's
  Renumber gives the later one 2026-0012/B. Round 86's gives it a bare 2026-0013 and leaves its item fields; the new
  version then lists it as a plant of its own, not under 2026-0012 (measured with round 86's real code in the review's
  harness). Press Renumber on the new version.
- **Renames**: a rename on round 86 writes its log line ("Renamed from … to …") and no Earlier names entry. The new
  version shows the earlier name from that line at once, and the plant's next edit writes it into the history. A name
  with " to " twice in it (a cultivar such as 'Road to Rio') is not read from a line, since where it ends cannot be told.
- **Growing season**: not read. The old Today still lists a resting plant as due, with a Water button, in its rest
  months.
- **Identity, provenance, lineage**: the new fields are carried and not shown; a fruit-set line is shown by its word
  ("fruit"). A sheet downloaded there has the old columns only.
- **Pinned views** (stage 2): not shown; its backup page calls a file's pins "the numbering scheme" when it merges one.
- **Labels**: both versions open a plant from a label by its number or its identity, so labels printed on either open
  on either. Round 86 does not read the tag after the #: a label printed on the new version opens there the plant
  holding that number on that device, with no check that it is the plant the label was printed for.
- **A vault near full**: the server's room for the log applies to every version at once. A round 86 device whose
  photograph is refused for room while its changes are taken tries one photograph again at each sync that sends
  changes (its "vault full" is cleared by a batch taken), which on mobile data is up to 12 MB a sync until it updates.
- **The lock** is not read there: a device on the old version has no lock until it updates and one is set on it.
