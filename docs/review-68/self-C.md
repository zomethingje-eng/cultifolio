# Self-review of rounds sixty-seven and sixty-eight: reviewer C

Area: the example collection and the first visit (round 67, agent V; REVIEW-ROUND-67 section 1 and section 7's Leave fix; REVIEW-PROMPT-68 section 4; triage-66 V1 to V10). Copy: `/tmp/rv68/C`, commit 1609c19.

Method: read `demo.ts`, `demo-seed.ts`, `example.svelte.ts`, `DemoBar.svelte`, `ExampleOffer.svelte`, `ExampleAddLine.svelte`, `TrySample.svelte`, `PlantsEmpty.svelte`, `app.html`, the layout, `take-over.ts`, `stored.ts`, `keep-ask.ts`, the vault's `openVault`/`blocking`/`storeIn`, the collection's `putWith`/`recordCount`, the add forms, Today, Places, Propagation, and every reader of `PAGE_IN_DEMO`, `inDemo()` and `sampleTab()`. The area's unit tests pass (r67v-*, r63fv-*, r63v-*, r62g-sample, r60f-demo, r61g-sample, r61h-demo-isolation, r61h-csp-hash, r62h-storage-keys-by-store: 79 of 79). Two reproduction files were written in the copy, with the existing harness (fake-indexeddb, the `r67v-locks` stand-in, app.html's first script run against stood-in storage):

- `tests/unit/zz-rv-C-left.test.ts` (C1), 2 of 2 pass, so the faults are shown.
- `tests/unit/zz-rv-C-empty.test.ts` (C4), 1 of 1 passes, so the fault is shown.

Playwright was not run.

## Findings

### C1. A tab that was ever out of the example turns `?left=sample` back into a delete, and the delete takes an example opened afterwards (should)

**Status:** confirmed (unit test).

**Where:**
- `src/app.html:20`, the first script: `if(/[?&]left=sample(&|$)/.test(location.search)&&sessionStorage.getItem('cultifolio.sampleOut')==='1')sessionStorage.setItem('cultifolio.sampleLeft','1')`.
- `src/lib/db/demo.ts:209-218` (`sampleClosedHere`), `demo.ts:389-402` (`finishLeaving`).
- `src/lib/ui/grow/DemoBar.svelte:85`, the closed bar's link `href="/?left=sample"`.

**What the code does:**
- Section 7 of the account says the address marks a delete "only in a tab Leave itself marked as out". The code tests `cultifolio.sampleOut`, which is set by more than Leave:
  - `sampleClosedHere`, in every tab another tab's Leave sent home;
  - the address itself, by the same script;
  - `markLeftByAddress`;
  - a Leave that was called off (the comment at `readyToLeave` says so).
- `sampleOut` is never cleared for the tab's life, and `enterDemo` keeps it too. So in any such tab, the closed bar's own "Go to my own collection", a sent-home tab's navigation, or a stale or copied `/?left=sample` all mark a delete.
- `finishLeaving` then queues an exclusive lock on `cultifolio-sample-open` and deletes whatever example database exists when it is granted. That need not be the database the visitor confirmed leaving. It counts nothing and asks nothing.

**Reproduction (zz-rv-C-left, first test):**
1. Tab B, an example tab, is closed by another tab's Leave (`sampleClosedHere`). Its "Leave site?" is answered Cancel, so it stays closed.
2. In tab A the visitor opens the example again: a fresh seed with its mark, then adds a plant. Tab A holds the open lock.
3. In tab B the visitor presses "Go to my own collection". app.html sets `sampleLeft`. `finishLeaving` answers `'blocked'`, and the page says "it goes when that tab is closed".
4. Tab A reloads or is closed, and so lets go of the lock. The queued delete runs, and `cultifolio-demo`, with the visitor's new plant, is gone.

No question is asked and no leftover offer can be made. On a reload, tab A's new page opens a fresh example and seeds it again. The second test shows that a copied `?left=sample` opened in a tab that left the example earlier sets `sampleLeft`. So the account's "a copied link, a bookmark or the history deletes nothing" holds only in a tab that has never been out. The e2e V6 test opens the link in a new page, which has no `sampleOut`, so it cannot see this.

**What it should do:** delete only the example the visitor confirmed leaving, and only from the tab that pressed Leave.

**Smallest fix:**
- Have `readyToLeave` write a one-off token, put it in the address (`?left=<token>`), and have app.html mark the delete only when the token matches the tab's stored one, clearing it as it reads it.
- Point `sampleClosedHere` and the closed bar at `/` instead. `CLOSED_NOTE` already takes the flag off.
- Belt and braces: write a random example id in the seed's commit (`opts.meta`), carry it with the token, and in `finishLeaving`, under the lock, delete only a database holding that id. Any other database goes to `dropLeftoverSample`.

### C2. "Keep it as my own" carries only the species (or a place's name), and the form's own guard asks "Leave site?" in the middle (should)

**Status:** confirmed by reading; the e2e test shows the dialog is accepted.

**Where:**
- `src/routes/plants/new/+page.svelte:236`, `src/routes/propagation/new/+page.svelte:217`, `src/routes/places/+page.svelte:115`.
- The guard: `plants/new/+page.svelte:101-111` and `:224`.

**What the code does:**
- `keep()` builds `/plants/new?species=…&key=…`. Everything else typed is dropped: the date acquired, source, price, form, count, provenance, field number, own number, last watered, notes and place. The batch form likewise carries only the species.
- `leaveExample` sets `location.href`. The form is `dirty` once a species is typed, so `guardUnload` calls `preventDefault`. The browser then asks the generic "Leave site? Changes you made may not be saved" just after the visitor pressed a button promising to keep them. With records added, `confirm` asks first, so there are two dialogs.
- The e2e test (`r67v-example.spec.ts:235`) accepts every dialog and checks only the species.

**Where the account goes too far:** REVIEW-ROUND-67 section 1 says it "leaves with what was typed". The plant and batch forms have no photograph field, so none is lost. The place is the example's own and rightly not carried, but nothing says it was dropped.

**What it should do:** carry every field the form can read back, or say plainly on the button's line what is carried ("the species is carried; the rest is not"). Either way, no browser prompt.

**Smallest fix:**
- Set `saved = true` (or a `leaving` flag the guard reads) before `leaveExample(keep())`.
- Either serialise the draft into the address or the tab's `sessionStorage` for the own form to read once, or change the line's words to say only the species is carried.

### C3. "Empty" ignores a replacement from a backup that is waiting to finish, so the example opens over the grower's collection (should)

**Status:** confirmed (zz-rv-C-empty).

**Where:** `src/lib/ui/grow/example.svelte.ts:31-34` (`ownEmpty`), with `vault.ts:178-180` and `:273-279`.

**What the code does:**
- A Replace stopped by a full device leaves the live log wiped and `staging-pending` set. The grower's whole collection is then in `cultifolio-staging`.
- After R1, the collection opens anyway: `ready` is true and `recordCount` is 0. The reason is said only by a vault notice.
- `ownEmpty()` checks the fold, the frost site, held and parked changes and sync, and nothing else. So for a grower without sync, Today, Places and Propagation go into the example by themselves.
- That navigation drops the notice ("It finishes when there is room…"). The bar offers "Add your first plant", and the seed writes about 150 changes into a second database on a device that is out of space.

**Reproduction (zz-rv-C-empty):**
1. A grower's plant; a backup of one plant staged.
2. Live `changes` puts refused with `QuotaExceededError` during `promote`.
3. The next load: `collection.ready === true`, `recordCount === 0`, `getMeta('staging-pending') === true`, `ownEmpty() === true`.

**Same kind, read not run:** `collection.malformed` (changes this build could not fold, R10) is also not counted. The formats page says "nothing at all in its log".

**Smallest fix:** expose the pending flag (and `malformed`) on the collection, and add `!collection.replacePending && collection.malformed === 0` to `ownEmpty()`.

### C4. Some add paths inside the example do not lead out, against `/about/formats` (minor)

**Status:** confirmed by reading.

**What the code does:** `/about/formats#sample` says every other way to add something of your own, "starting a propagation" among them, leaves the example first. These links are plain links that open the form inside the example:
- the species page's "Sow seed" (`species/[slug]/+page.svelte:399`);
- the Wanted list's "Got it" (`PlantsFoot.svelte:59`). The seed follows Aloe polyphylla, so this link shows on the example's My plants;
- the front page's "add it as a plant" for an unmatched search (`+page.svelte:817`);
- `+error.svelte:44` and `:47`;
- Labels' "Add a plant" (`labels/+page.svelte:319`).

The form then shows the line that the plant joins the example, so nothing is lost silently. But it is an add the account says cannot happen, and it adds to the example.

**Smallest fix:** add `onclick={(e) => addLeavesExample(e, href)}` to each.

### C5. The closed state's words and drafts are weaker than the account says (minor)

**Status:** confirmed by reading.

**Wrong advice after a refused write:** three pages print `This change was not saved: {lastWriteError}. Free space or back up now.` with no exception for `CLOSED_WORDS`:
- My plants (`plants/+page.svelte:256`);
- a plant's page (`plants/[acc]/+page.svelte:575`);
- a batch's page (`propagation/[id]/+page.svelte:354`).

On a closed page a refused watering or note therefore says "…what you typed is still here to copy. Free space or back up now". The link leads to Backup, which is shut in the example. The two add forms do make the exception. Also on My plants, `storageLow` is tested before the example's branch (`:257`), so a nearly full device shows "Back up now" inside the example (V7).

**Typed text lost:** "keeps what was typed on screen" holds only on pages with an unload guard. Places' add form, a batch's page, Today and the Wanted notes have none (no `beforeunload` or `beforeNavigate`). There `sampleClosedHere`'s `location.href` navigates at once and the text is gone.

**Smallest fix:**
- Make the same `CLOSED_WORDS` exception on the three notices, and test `PAGE_IN_DEMO` before `storageLow`.
- In `sampleClosedHere`, do not navigate when a text field holds text. Show the closed bar instead.

## Triage decisions in this area

| Item | Status | What was checked |
|---|---|---|
| V1 | Done in part | The top bar's "+", "Add one to my plants", New place, New batch, Start one, Import, the welcome's and My plants' adds, and the bar's words all lead out. The line is on all three forms. But see C2 (what "Keep" carries) and C4 (adds missed). |
| V2 | Done | `dropLeftoverSample` reads the leftover read-only and never creates it. It counts after the mark (or the repaired mark), keeps and offers once (`demoOfferedSeq`), and deletes when empty. "Delete it" runs under the lock. |
| V3 | Done | Every scope reads `PAGE_IN_DEMO`: `stored.ts`, both cookies, `keep-ask`, sync's three entry points, the hint, GrowLayer, IosFirst, CalendarExport, PlantsMenu, the seed, io/replace refusals. `inDemo()` remains only where the next page goes. `openVault` refuses before the cached handle when closed; `blocking` marks closed first; the lock is let go on close; the flag and copies go at `pagehide`; `clearExampleCopies` takes Labels' late write. Caveats in C5. |
| V4 | Done for what it names | Fold size including removed records, the frost site, held, parked, sync; the bar reads the same test (`cultifolio.demo.own`). Gap: C3. |
| V5 | Done | The seed's commit carries `meta.demoSeeded` and `markLast` in the same `storeIn` transaction (`vault.ts:479-482`). `seedState` repairs a missing mark from the pot-up line and reseeds a flag over an empty log. The no-locks claim lapses and is given back. `rebuild()` follows the seed. No order of reloads or tabs was found that seeds twice or never seeds. |
| V6 | Not as stated | The delete runs under the open lock, but "honoured only for a tab that was leaving" does not hold. See C1. |
| V7 | Done | No calendar file, no spreadsheet, "kept nowhere" on Today and My plants. Nit in C5. |
| V8 | Done | `Today.svelte:211,213`: no site of its own, no "use my location", nothing faked. |
| V9 | Done (words) | The row positions are e2e only, not run here. |
| V10 | Done | The line is drawn by the server and hidden or shown by `html[data-welcomed]` from app.html's first script. The CSP hash test passes. |
| Section 7's Leave fix | Done, but too wide | It mends r62g 8 by trusting `sampleOut`, which reopens S-A5 in the tabs C1 names. |

## Checked and found sound

- **No leak of settings or cookies from the example to the grower's collection:** last place, frost site, units cookie, hemisphere cookie, label picks, compare, the keep-data ask, the hint, sync, the outbox (`NO_OUTBOX`), the vault channel (named by database). No leak the other way: collection-scope settings read only the tab's copies.
- **Worker messages:** only `skip` and `version`, and nothing collection-specific.
- **Leftover read:** it aborts its own upgrade, so a missing database is not created. It closes on `versionchange`, so it never holds up a delete.
- **Seed boundary:** the mark is the commit's last arrival, and Leave counts by arrival number, not stamp, so an edit with an older stamp counts.
- **A Leave called off:** without the Navigation API, the page keeps its own scope for its life, so nothing is written as the grower's (r67v-scope).
