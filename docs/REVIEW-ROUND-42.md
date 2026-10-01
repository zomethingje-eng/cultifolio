# Review round forty-two: the first Lighthouse runs against the deployed `adbbc81`

The author's Lighthouse runs, mobile preset, of the Welwitschia page (Performance 74; FCP 1.8 s, LCP 5.6 s, CLS 0.121, TBT 50 ms) and the home page (81; FCP 2.0 s, LCP 4.4 s, CLS 0.085, TBT 10 ms); Accessibility, Best Practices and SEO 100 on both. Both runs had the author's collection in IndexedDB, so the stranger's load is a little lighter than measured. Each figure was traced to the source before anything was changed.

## What the numbers say

Text paints at under two seconds on both pages and the main thread is quiet; the four seconds between FCP and LCP is the first-screen photograph, which lives on a third party's host (iNaturalist's S3 or GBIF's image cache). Three causes in the source, all on the species page, one shared with the home page:

- The browser learned of the photograph's host only when the parser reached the `<img>` in the body, after the stylesheet and the font preloads, and then paid DNS, TCP and TLS to it before the first byte.
- `sizes="(max-width: 640px) 100vw"` with a srcset of 500 w and 1024 w: a 390 px phone at 3× asked for 1,170 px and took the 1024 px file ("improve image delivery, 285 KiB"), into a 150 px band cropped to cover, which shows about a third of it.
- The band had `max-height: 150px` and no height, so the page laid out without it and shifted down when it landed: the CLS, and the "image elements do not have explicit width and height" diagnostic. The home page's tiles carry `width`/`height` already, which is why its CLS is lower.

## Changed

1. **The photograph is preloaded from the head, one size by surface, into a fixed box** (1). The species page's head carries two `preload` links for the hero, `(max-width: 640px)` for the 500 px file and `(min-width: 641px)` with the srcset for a 480 px box, and a `preconnect` to its host; the `<img>` is a `<picture>` whose phone source is the 500 px file alone, so a phone's density no longer promotes it (the rule of round thirty-five, R2-7, applied to the hero); and under 640 px the band is 150 px tall before the photograph lands. The home page preloads the first featured tile and preconnects to the hosts of the first three. `photoHosts()` names the origins, each once, and only the two the reference's photographs are known to live on. Unit test for the helper; two e2e tests, one holding the photograph's request open and measuring the box at 150 px before anything arrives.

## Not ours

"Use efficient cache lifetimes" (325 and 824 KiB) and "Modern HTTP, 290 ms" are the photo hosts' cache headers and one host's HTTP/1.1; nothing on this side changes them. The home page's remaining CLS of 0.085 is not the tiles, which reserve their space; the "layout shift culprits" row names the element, and it is asked for. "Agentic Browsing" scored 1/2 on the species page and 2/2 on the home page; the failing check is not in the paste and is asked for rather than guessed at.

## What to expect

LCP on the species page should fall by one to two seconds (the download is a third of the bytes and starts with the stylesheet) and CLS to near zero; the home page's LCP by less, since its first tile was already eager with priority. The measurement is the author's, in an incognito window, after the deploy.

## Counts

407 unit tests on 41 files, 83 e2e (two new), local live check 8 of 8.
