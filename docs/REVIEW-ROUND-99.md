# Round 99: the collection encrypted on the device (the plan and record)

Written 20 November 2026. The owner, of the items left open: "do everything"; then "move forward". Round 87's t3 proposal
(docs/about-87/t3.md, "Proposed, not built") is the starting point; where this plan departs from it, it says why.

## What it is

An opt-in setting under the app lock: **Encrypt the collection on this device.** With it on, what the collection says is
kept in the browser's database only as ciphertext, under a key that is in memory only while the app is unlocked. Someone
with a copy of the browser's files and without the passcode (or the sync key) reads which records exist and when they
changed, not what they say, nor the photographs, nor the papers, nor the sync key.

It is off unless the grower turns it on, and the example collection never has it.

## Decisions

**D1. One key, wrapped twice.** A random 256-bit data key encrypts. It is kept in the vault's own `meta` (`seal`), never
in the clear: wrapped (AES-256-GCM) under a key derived from the passcode (PBKDF2-SHA-256, 600,000 rounds, a random salt),
and, on a device that syncs, under a key derived from each sync key the device has synced with (HKDF-SHA-256, a random
salt). In the vault, not localStorage, so clearing one without the other cannot leave a vault no key opens unsaid.

**D2. What is sealed, and what is not.** Sealed: each change's `value` (bound to its stamp, kind, id and field, so a
sealed value cannot be moved to another record unseen); each photograph's and paper's bytes and thumbnail (bound to the
photograph's id); the sync record (it holds the sync key); the fold snapshot's records. Plain, so the indexes, the order
of arrival and the bookkeeping work as now: each change's stamp, kind, id, field and time written; the outbox and the
order of arrival; the numbers issued (plant and batch numbers); the parked stamps; the device's id; the day of the last
backup; the fold snapshot's rules, counter and time saved. /about/how says the list.

**D3. A cipher that runs inside the vault's transactions.** IndexedDB ends a transaction at the first wait on anything
else, and WebCrypto always waits. Several of the vault's transactions read a stored change's value and decide on it in
the same transaction (a stamp met twice, the numbers issued, the outbox's readable changes, the sync record's key): with
WebCrypto those reads could not stay in one transaction, and every one of them would have to be rebuilt. So the vault
has its own AES-256-GCM in TypeScript (`src/lib/crypto/aes-gcm.ts`), synchronous, used inside transactions; WebCrypto
encrypts and decrypts outside them (a page's whole log at load, the photographs, the fold snapshot). It is the standard
AES-GCM, so either opens what the other sealed: tested against NIST's vectors and against WebCrypto on thousands of
random keys, IVs, AAD and lengths. No new package (package.json is not changed).

**D4. Turning it on or off rewrites the vault record by record, in place.** Every read takes a record sealed or plain, so
a vault part-sealed is a whole vault: a cut-off midway (a closed tab, a full disk) leaves every record readable, and the
next unlock carries on (`sealing` in meta says which way). The proposal's staging copy is not needed for that, and would
double the room a large collection needs. The sealing runs in batches of 200 changes and one photograph at a time.

**D5. Nothing reads the vault until the key is there.** `openVault` waits, on a vault that holds `seal`, until the key
is in memory: every read and write of the app waits behind the lock screen as it is, and nothing above the vault changes.

**D6. Tabs.** A new tab asks for the passcode, as now. A reload of an unlocked tab asks the other open tabs of the app for
the key (a BroadcastChannel; the key never stored); with none open, it asks for the passcode. Locking a tab (Lock now, or
the time out of sight) forgets the key there and reloads the page, so nothing it showed stays in its memory.

**D7. Coming back without the passcode.** The sync key opens it (the data key's wrap under that key) and, as now, takes
the passcode off: the vault is unsealed back to plain, to be encrypted again in Settings. A backup file cannot open an
encrypted vault (it holds no key): the lock screen offers instead to clear this device's collection and restore it from
the file, which loses what was not in the file, and says so. With neither, clearing the site's data, as now.

**D8. Turned on only with a way back, and a passcode worth it.** As the lock: while sync is on or after a backup made in
the last day. And only with a passcode of 8 characters or more: a short passcode is found from the wrapped key in
minutes whatever the rounds, and the setting says so.

**D9. Backups stay plain.** A backup file is the collection as it is, unencrypted, and the setting says so.

**D10. DB_V 5.** Any tab of an older build lets go of the vault and reloads into this one (as round 62's 4), so no old tab
reads a sealed record as a change with no value; an older build opened after cannot open the vault at all.

**D11. What it does not do.** While unlocked, the page holds the collection in memory and shows it. Records written plain
before it was turned on may stay in the browser's own files until the browser compacts them; the setting says so. The
passcode's strength is the protection: 600,000 rounds slow each guess, they do not make a short passcode safe.

## The work

1. `src/lib/crypto/aes-gcm.ts`: AES-256-GCM, synchronous; tests against NIST SP 800-38D's vectors and WebCrypto.
2. `src/lib/db/seal.ts`: the key in memory, the wraps (PBKDF2, HKDF), the codec (a change, a meta record, a photograph),
   the gate, the tabs' hand-over.
3. `vault.ts`: every read and write through the codec; `sealVault`, `unsealVault`; DB_V 5.
4. The lock (`lock.svelte.ts`, `LockScreen.svelte`), Settings, the layout.
5. /about/how (#lock, #keys-kept, a new #sealed), /about/formats.
6. Tests: unit (the cipher, the codec, a vault part-sealed, every read path, the sealing resumed), browser (turned on with a
   plant and a photograph: no plant name, note or photograph byte in the database; reload asks; a second tab hands the key
   over; the sync key opens and unseals; turned off; the collection identical throughout).
7. The launch gate, the record, the commit; the deploy with the owner's word.

## The record

**What was built (20 November 2026).** The work's seven steps as planned, with three changes to the plan made as it went:
the sealed rules are the first item of /about/how's #lock list (li#sealed), not a section of their own, since the about
pages' visible-word limit (6,000) left no room for one; a tab that holds no key while the collection is encrypted shows
"asking another open tab for the key" (lock.handing) for up to 0.7 s before the passcode, where the first browser run
showed the collection's empty shell; and the lock's stored record carries `sealed: true`, so the lock screen knows the
collection is encrypted before the database opens. A full page load in the only open tab asks the passcode again (no
other tab holds the key), which the browser test now says.

**The tests.**
- r99a (the cipher): NIST SP 800-38D's test cases 13 to 16; 400 random keys, IVs, AAD and lengths, sealed here and opened
  by WebCrypto and the other way; a changed bit, other AAD or another key refused.
- r99b (the vault, 7): sealed, no plaintext in the database and every read the same; a new tab reads nothing until the
  passcode opens it; writes after sealing sealed; the fold's snapshot sealed but for its rules and times; a sync key this
  device syncs with opens it and another does not; cut off part-way, the vault reads whole and the next unlock finishes;
  unsealed, plain again with nothing lost.
- r99c (the browser, 2, in Chromium, Firefox and WebKit): turned on, no plant name or note in the database; a new tab
  locked, the wrong passcode refused and the right one opens the collection as it was; a reload takes the key from an
  open tab, or asks with none; turned off, every change plain and the collection the same. With no sync key, the lock
  screen deletes the collection on the device and goes to /backup.
- Pins moved with the change: r62bl (the vault version), r74 (DB_V 5), fold-rules (the snapshot's hash re-recorded,
  FOLD_RULES still 8, since the fold's rules did not change, only how its snapshot is stored), r62w (the derivation
  names on /about/formats), r87rec and r87p (round 99's entry on /changes), r76p strip 2's layout base (measured again).

**The launch gate.** Four runs; the fourth clean: svelte-check 0 errors, 6,341 unit tests in 704 files, 2,756 browser
tests, "every test passed first time in every engine; the deploy may go ahead".
1. Stopped on the pins above, and on r81b and r87f: round 100's key map was writing into `scripts/`, whose top-level
   files the index stamp hashes. The key map now writes to `bulk/colxr/` (not in git).
2. One WebKit phone test passed only on its retry: r69p P5 on /backup, the press "missed" because the summary moved 113 px
   under it. The move is the "keep your data" card (backup/+page.svelte, `collection.persisted !== true`), which appears
   when the browser answers `navigator.storage.persisted()`; under load that answer can come after the file preview.
   That race is older than this round and the page is not changed by it; run alone, the test passed 6 of 6.
3. Stopped in the unit tests (32 failed, every one a zip read): the gate was started from Git Bash, whose `tar` is GNU
   tar 1.35 and does not read zips. The builder reads them with Windows' own tar (bsdtar). Run from PowerShell, as the
   gate's instructions say, it passed.

**The deploy (20 November 2026).** Committed as 4e7d326 and pushed; `node scripts/deploy.mjs` from PowerShell ran
svelte-check and the unit tests again (the commit changed the stamp: 6,341 passed in 704 files), built, and deployed
version ef86cde7; the live check passed 23 of 23. On cultifolio.com, /changes shows round 99's entry and /about/how holds
li#sealed.
