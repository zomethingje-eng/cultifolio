# Round sixty-nine, agent X: the example collection (X1 to X9)

The agent's harness refused its write of this file, so its report was returned as a message and saved here at the merge. Its need patches were `needs/R.diff`, `needs/P.diff` and `needs/unowned.diff` in its copy; at the merge the P and unowned needs were taken from its copy's own edits, and the R need was replaced by R's own `requireMeta` and a pending-Replace flag (`REVIEW-ROUND-69.md`).

## 1. Per item

**X1. `?left=sample` deleted too much (S-C1).** `demo.ts`: `readyToLeave` writes a one-use token (`LEAVING` = `cultifolio.sampleLeaving`) and returns it; `leaveDemo` goes to `leftAddress(to, token)` (`?left=<token>`). Leave's own `sampleLeft` mark stays. `app.html` marks the delete from the address only when the address token equals the stored one, drops the stored token whenever the address has `left=`, and any `left=` still takes the tab out of the example. CSP hash in `svelte.config.js` updated. A Leave called off keeps its token (the r62g 8 race). `sampleClosedHere` and the closed bar's "Go to my own collection" go to `/`. Test: `r69x-left.test.ts` (4, all failing on the base). Updated: `r62g-sample`, `r62bg-sample`, `r63v-example`, `r67v-example`, `r67v-scope`, `r61g-sample`.

**X2. A tab that was away when another tab left (R46-19, R46-28).** A new random value goes to `GEN` (`cultifolio.sampleGen`, local storage) at Leave's `pagehide` (a Leave called off writes none), in `finishLeaving`, in "Delete it", and when an over-age leftover holding records is deleted. `enterDemo` notes the generation in `TAB_GEN` (`cultifolio.demo.gen`); `app.html` compares them before paint and, on a mismatch, sets `cultifolio.sampleClosed`, so the tab opens the grower's own and says why. A missing note counts as equal (old-build tabs stay until the first Leave after the deploy). `freshOnRestore` reloads a stale page from the back-forward cache; `keepSampleOpen` also listens for a `storage` event on `GEN`. Typed input: after any `input` event, `sampleClosedHere` does not navigate. Places has `beforeNavigate` and `beforeunload` guards; the plant and batch forms count a place typed in the picker as dirty. The leftover offer is noted only when answered ("Not now", `#example-left-later`); a leftover unchanged for `LEFTOVER_DAYS` (30) is deleted. Tests: `r69x-left` (8; all fail on the base but a guard), `r69x-leftover` (3; 2 fail on the base, the 29-day case a guard), `r67v-leftover` updated.

**X3. "Keep it as my own" (S-C2, IND-4, R46-5).** New `ui/grow/keep-draft.ts`: `keepAsOwn` writes `cultifolio.keepDraft`, calls `hold(true)` to set the form's own guard aside, and goes to `/plants/new?kept=1`, `/propagation/new?kept=1` or `/places?kept=1#add`; a declined or called-off Leave releases the hold and drops the draft. `takeDraft` reads it once, outside the example, only with `kept` in the address, with typed readers. `plants/new` (`draftOf`, `applyDraft`) covers every field and re-checks the species key; `propagation/new` every field but the parent plant; Places the name, kind and parent. The place travels by name and kind: the grower's own place of that name is picked, or the picker's New… opens filled in. Nothing typed goes in the address. Test: `r69x-keep` (8, all failing on the base), including a source check that every bound field is in `draftOf`.

**X4. A pending Replace (S-C3).** `ownEmpty()` also requires no pending replacement and no malformed change. Test: `r69x-empty` with the real vault and a promote stopped by refused log puts.

**X5. The places-only banner (IND-7).** `enterExample` pressed before the collection has settled writes `'?'`, waits up to 10 s for the settled test, notes the result and goes. The hint is taken as a yes, never a no; `hadOwn()` returns `boolean | null`, and "Add your first plant" is offered only when it is `false`. Tests: 3 in `r69x-empty`.

**X6. The seed without Web Locks (IND-6).** The seed's commit requires no seed's mark (`demoSeedSeq`) and, without locks, that the claim is still this tab's; a refused commit returns false and shows nothing. The claim is cleared only by its owner. Tests: `r69x-seed` (2), two tabs as two module graphs: on the base the stale tab writes 24 plants, with the fix 12.

**X7. Add links inside the example.** Wanted's "Got it" (`PlantsFoot.svelte`) and Labels' add link here; "Sow seed", a place's adds, Today's "Add one", search's link and the error page's two as needs. Test: `r69x-links` (one per file).

**X8. The "Example" chip.** New `ui/grow/ExampleChip.svelte`: no script, hidden by `html:not([data-demo])`, links to `#demobar`; placed in the layout's top bar; a `LAYOUT_GROW` entry in `check-bundle.mjs`.

**X9. The closed state's wording.** The `CLOSED_WORDS` exception applies on My plants, a plant's page and a batch's page, and My plants' storage notice is not shown in the example. Typed text is kept through X2's input rule.

**E2E.** New `tests/e2e/r69x-example.spec.ts` (6 tests: Keep on the plant form, Keep on Places, the tab that was away, typed Places text kept, the closed bar's link, the chip). Three are tagged `@chromium`, relying on `window.open` copying session storage.

## 2. Needs
For R: `replacePending()` and a meta condition checked in the write's own transaction. For P: the layout chip, "Sow seed", the adds on `places/[id]`, Today's "Add one", the about-page keys (`cultifolio.sampleGen` local; `cultifolio.demo.gen`, `cultifolio.keepDraft`, `cultifolio.sampleLeaving` session) and the leftover sentence, and the Keep URL in `r67v-example.spec.ts`. Unowned: `LocationPicker.svelte` (bindable `typed`, a `start` prop), `+page.svelte` and `+error.svelte` add links, the `CLOSED_WORDS` exception on three pages, `check-bundle.mjs`.

Sentences for `/about/formats#sample`: one commit (one transaction) with the claim and mark checked in it; the one-use token for `?left=`; Keep carrying everything typed through session storage; the leftover offered until answered and deleted after 30 days unchanged; every Leave writing a generation so a tab that was away opens your own collection; a page with something typed not sent away; "empty" excluding a pending replacement and unreadable changes; the top bar saying Example.

## 3. Not done
R46-28's race ("See the example" pressed before the Leave page's delete takes the lock) is untouched: suspected, not assigned. S-C1's extra safeguard (an example id in the seed's commit) was not added: the token closes the hole.

## 5. Runs
Unit suite with the needs applied in the copy: 280 files, 2,379 passed, 1 failed (`fold-rules`, from R's vault change), 1 skipped. svelte-check: 0 errors. Playwright not run.
