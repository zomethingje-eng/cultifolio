# Contributing

Thanks for looking. A few things to know before opening a pull request.

**What the app is for.** A species reference that shows its sources, and a
collection record that stays on the grower's device. Two rules govern every
change: every derived number states its source and method, and a figure the
app cannot derive is left out and said to be missing, never filled in. Read
`/about/how` in the running app before touching anything under
`src/lib/core/` or `src/lib/dossier/`.

**Running it.**

    npm install
    npm run build && npm run preview     # wrangler dev on :8787, with a local R2 and KV
    npm test                             # vitest (unit) then Playwright (e2e) against the preview

The e2e suite drives real browsers through the fixture corpus in
`fixtures/dossiers/`; it needs no network. A real corpus is built with
`npm run dossier` (see docs/DEVLOG.md) and is not committed.

**Tests are not optional.** Every change to the merge rule, the habitat
centre, the growing year, the backup format or the sync wire format needs a
test that would have failed before it. The e2e file walks user paths end to
end; add a step to an existing path rather than a new test when one fits.

**Style.** Prose in the UI is plain and specific: no marketing, no
exclamation marks, no "simply". Numbers carry units. A sentence that could be
wrong for some species should say when.

**Data licences.** Anything that reaches a page must be CC0, CC BY or
CC BY-SA and must carry its attribution. A source that will not say its
licence is not a source.

**Security.** See SECURITY.md. The sync server is zero-knowledge by design;
a change that lets it read a plant name is a bug, however convenient.

**Licence.** The app is AGPL-3.0; `scripts/` is MIT. By contributing you
agree your contribution is licensed the same way as the code it lands in.
