# Review round forty-four: the layout shift that was the fonts

The author's Lighthouse runs after round forty-three, in an incognito window: species page 82 (FCP 1.8 s, LCP 4.2 s, CLS 0.099), home page 86 (FCP 1.6 s, LCP 3.8 s, CLS 0.086). "Document request latency" had left the species page's list, which was round forty-three's point. The layout shift had not, and I had read it wrong twice: first as the grower's own strip replacing the visitor's on the home page, then as the "Yours:" line arriving in the species card. Both are real for a grower and neither is what an incognito window sees. (Lighthouse's IndexedDB warning appears in incognito too: the page opens the vault on load, so the store exists by the time the audit begins. It does not mean the window held a collection.)

## Reproduced

With the local Worker and the font files held back 1.5 s in Playwright at a 390 px viewport, the shifts appear and name their sources: 0.17 on the species page (the facts block and the buttons move up as the headings reflow) and 0.03 on the home page; with the fonts arriving at once, 0. The two web faces every page sets in, Newsreader for headings and prose and Public Sans for the interface, are preloaded but still arrive after the first paint on a throttled phone, and until then the text is set in Georgia or Segoe UI (Windows), Noto Serif or Roboto (Android), Georgia or Helvetica Neue (iOS), whose line heights and widths differ from the web fonts'. When they land, every line changes height and the page below it moves.

## Changed

1. **Fallback faces with the web fonts' metrics** (1; the second reviewer's round thirty-eight suggestion, declined then for want of a measurement). Each local face the stacks fall back to is declared again as its own `@font-face` with `ascent-override`, `descent-override`, `line-gap-override` and `size-adjust` set so a line set in it is the height and nearly the width it will be in the web font; the stacks name these faces before the plain ones. The figures are computed from the fonts' own tables (capsize's metrics for Newsreader, Public Sans, Georgia, Times New Roman, Noto Serif, Segoe UI, Roboto, Helvetica Neue and Arial), not tuned by eye. A device without a given local face skips that entry, as it did before. DM Mono, which sets only small labels, is left alone.

This sandbox has none of those local faces, so the change is verified here only by the build and the e2e suite (83 passing), and on the author's machine by the next Lighthouse run, where CLS should fall to near zero on both pages and the score rise by its weight (about 25 points of the 100 are CLS).

## Counts

413 unit tests on 42 files, 83 e2e, local live check 9 of 9. One file changed.
