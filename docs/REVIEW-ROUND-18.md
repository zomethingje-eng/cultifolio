# Review round eighteen: two reviews of `7c463c0`, triaged

The first reviewer's round eighteen (eighteen findings, with two areas no round had covered: whether `/about/formats` lets a reader decode their data without the app, and keyboard and screen-reader use of the collection pages) and the second reviewer's tenth pass (three findings, one shared). Every finding was checked in the source and is real; all twenty are done. "A-n" is the first review's numbering, "B-n" the second's; B-1 is A-4 with a second reproduction, and B-3 extends A-9.

## The "read your data without the app" promise

1. **`/about/formats` described the vault id and the key input wrongly, so a reader following it decrypted nothing** (A-1; the reviewer's one thing to fix, and one of them wrote a reader from the page alone to prove it). The page said the id was "the first 26 symbols of SHA-256 in the same alphabet"; the code maps each of the first 26 digest bytes to `ALPHABET[b mod 30]`. It never said HKDF's input is the 30 symbols with the dashes removed, or that each derived key is 32 bytes, or that the ciphertext carries a 128-bit tag. Every sealed blob's associated data starts with the vault id, so either mistake opens nothing. The page now states all of it exactly, and a new unit test (`tests/unit/formats-doc.test.ts`) is that reader: it derives the keys and the id from the page's words with WebCrypto and nothing from `crypto.ts`, and opens a batch the app sealed. If the page and the code drift again, it fails.
2. **The backup section got field meanings and names wrong** (A-2). Events and photos join to plants by the plant's record id in `acc` (`r1`), not by the accession number, and a sowing's own events by the sowing's id; the manifest's keys are `format, v, exported, device, app, counts{…}, photosMissing, scheme`; the batch endpoint takes the batch name (`<hour>-0000-<device>-<fingerprint>`), not `<hlc>-<hash>`; and the accession, event, photo, location, sowing, taxon and setting shapes are now listed field by field with the id semantics said in bold.

## Lost or wrong data

3. **A catch-up already under way when a `refold` arrived put the displaced change back** (A-3; the case round seventeen's item 3 closes, reopened in one interleaving). `catchUp` read the log, awaited the ledger, then applied; a rebuild that finished during the wait was undone. The fold carries a generation that every rebuild bumps, and a catch-up that began before one applies nothing.
4. **A stale run still wrote into the new vault's meta through `note()` and `setFull()`** (A-4, B-1; reproduced both ways: a late 507 for the old vault marked the new one full, and a late batch body, whose open failed with the stop error, was set aside in the new vault's quarantine as bad ciphertext). Both take the run's meta and refuse a stale one; the keys are read before the try in `takeBatch` and the photo pull, so a stop is never caught as a decryption failure; `pushBatch` carries the run's meta through its splits. Engine tests for both reproductions.
5. **A slow key check could overwrite the key after the grower had changed the name** (A-5; the shape of round seventeen's bench fix). The reference's answer is taken only if the name is still the one asked about.
6. **Homonyms: a failed request repaired a plant to the other species, and the plant's pages still used the plain slug** (A-6; not in today's corpus). A failed second-bucket request now answers "not reached" rather than the other species' sheet; the plant page's species links take the sheet's slug; the species page's "Yours" row and the front page's ownership chip match by reference key as well as by slug.
7. **Overlapping name lookups could replace the menu with results for text since changed** (B-2; reproduced live with a delayed answer). Every keystroke bumps a request generation; a search or an exact check that is no longer the latest writes nothing, suggestions, warning or highlight.

## Wrong or unmarked figure

8. **The catalogue tile and the species page gave different "wild records" figures** (A-7; live: "22 wild records" on the tile, "104 in range · 22 open" on the page). The index carries the openly licensed count only; the tile says "22 open records", the same figure the page calls open.
9. **Skipped extremes still printed the CHELSA mean night on the label, and the plant page said nothing about refused or skipped extremes** (A-8; not in today's corpus). Skipped is treated as refused on the label and counted; the plant page's habitat sentence says the extremes were not checked, or not asked for.
10. **The refused-range note described a map marker the build does not make, and the no-open-points caption and the empty fact still said "in range"** (A-9, B-3; not in today's corpus). The refused sentence says no marker or envelope is derived and what the map shows; the caption and the fact branch on `rangeTested` before the counts.
11. **After the prune, pages said the photo sources "were not asked", and Commons was reopened though nothing asks it again** (A-10; only after the prune is run). The reopened sources are iNaturalist's only, with a detail the page words as "answered, but every photograph they gave lacked an author to credit"; the corpus has one wording for a CC0 photograph without an author, "author not stated", in the build and the pass alike.

## Blocked or silent

12. **"Stop syncing" during a run left the sync icon spinning until a reload** (A-11). `dropped()` clears the busy flag. Engine test.
13. **A device whose stored sync meta predated the arrival cursor failed every run in its first page load** (A-12). The conversion branch registered the keys under the old meta object; they go under the one the engine keeps. Engine test with the old shape.

## Keyboard and screen reader

14. **The photo viewer did not hold focus or return it** (A-13). The rest of the page is `inert` while it is open (every sibling of the dialog and of its ancestors, since it sits deep in the page), and focus returns to the thumbnail on close.
15. **Confirm and toggle buttons dropped focus to the top of the page** (A-14). A control replaced by another (× → "Remove?", "Remove this plant" → "Yes, remove", Archive ↔ Mark growing, the batch page's ×, "Remove place") moves focus to its replacement after the render (`src/lib/ui/focus.ts`).
16. **Form errors not announced or tied to their fields** (A-15). The vault-key error has `role="alert"` and the field `aria-invalid` and `aria-describedby`; the "Use my own number" checkbox and its box have names, and the taken-number message is an alert tied to the box.
17. **The /plants and /sowings filter chips showed the selection by colour alone** (A-16). `aria-pressed`, as the front page and Settings chips have.

## Claims and small things

18. **The photo-credit claims did not match the corpus** (A-17). `/about/how` says each photograph carries its licence and its author where the source names one, and what happens when it does not; the Show HN draft names Wikimedia Commons beside GBIF and iNaturalist and drops "credited by name".
19. **A `?loc=` naming a removed bench also dropped the last-used one** (A-18). An unknown `loc` falls back to it.

## After the fixes

`npx svelte-check --threshold warning` clean; `npx vitest run` 35 files, 329 tests; `npx playwright test tests/e2e/smoke.spec.ts --workers=1` 66 tests, no retries. `/about/formats` is prerendered, so the deploy is what publishes it; nothing else for the deployer. The prune pass need not be run again: the wording change it carries is for the next time it runs.
