# Review round forty-five: the home page's shift, and my own pass over rounds forty-one to forty-four

The author's runs on an idle laptop after round forty-four: species page CLS 0 (the fonts, as round forty-four said); home page CLS 0.085, unchanged across every run since the first. Then a read of everything deployed since round forty that no outside reviewer has seen: the species-page cache in `hooks.server.ts`, the etag revalidation, the `<picture>`, the font fallbacks, the batch labels and the `acc` migration.

## The home page

1. **The welcome was inserted after hydration** (1; reproduced). With the fonts and the photographs held out of the measurement, a throttled load of the home page at phone width shifted by 0.08, and the sources named it: the "New here" paragraph, which only rendered once the collection had opened, was inserted above the featured strip and pushed it down by eighty pixels, about two seconds in. A stranger's first screen is exactly the case it was built for and exactly the case it moved. It is in the server's HTML now. A device that dismissed it hides it before first paint: app.html's inline line, which already reads the theme from localStorage, sets a flag the stylesheet hides the paragraph by, and the component's state catches up at mount; the CSP's hash of that line is updated with it (svelte.config.js). The same throttled load now shifts by 0. The e2e test for the welcome checks that the server's HTML carries it and that the flag is set after a dismissal, which also proves the inline line still runs under the CSP.

## The cache, read adversarially

2. **The key carried the whole query** (own). Any query string minted its own copy: `?x=1`, a tracking tag, the live check's own timestamp. The page reads one parameter, `was`, so the key carries the path, `was`, the units and the hemisphere; a query the page never reads shares the plain copy. The hemisphere cookie went into the key as typed; it is one of two values now, anything else counting as unset, so a cookie with `&` in it cannot shape the key. Tests for both. The live check no longer assumes its fresh query forces a render (the copy from its own earlier request may answer), and reports which it got.
3. **`store.head` is guarded** (own): the revalidation calls it only when the store has it, so a test's or a dev server's store without `head` falls back to a read as before.

Read and found sound: a `?was=` that is not on the record is not printed, and is in the key; a 404, a redirect, a non-HTML answer and a cookie-setting answer are never stored; HEAD requests neither look up nor store (a HEAD body stored under the key would have answered later GETs empty); the stored copy drops `vary` and carries a public lifetime only under the Worker's own key, while the reader's copy keeps `private`; the service worker's own species cache is unaffected. A corpus upload mid-minute is served up to a minute stale, as before the change. A `<picture>` for a photograph on a host the sizes do not cover names the same file in both places and preloads it once. A device without any of the named local faces skips every fallback entry, as before. The batch label's QR carries the record id, which `/plants/` and `/propagation/` both accept and which a renumbering does not change.

## Counts

413 unit tests on 42 files, 83 e2e, local live check 9 of 9. A deploy is needed for the CSP hash and the welcome; the measurement is the author's next incognito run of the home page, where CLS should read 0.
