/**
 * Markup drawn once, on the server, into a page's HTML, and not again into the data the page hydrates from (round
 * eighty-three; the species page's weight).
 *
 * A page's load returns its data, and SvelteKit writes that data into the HTML whole, for the browser's copy of the page
 * to take over from the server's ("hydration"). Whatever the page draws from it is then in the HTML twice: once drawn, once
 * as the data it was drawn from. The regional map of Sempervivum tectorum was its 1,052 records' places twice, 29 kB
 * of markup and 16 kB of data, read by nothing in the browser once the page had loaded.
 *
 * So a page may hand its load a piece of markup by name (`drawOnce`). The load returns in its data only a short mark,
 * which the page puts where the markup goes with `{@html}`; the hook (`placeDrawn`, src/hooks.server.ts) puts the markup
 * in the mark's place in the HTML as it is sent. In the browser the page's `{@html}` holds the mark too, and Svelte, which
 * never redraws an `{@html}` block's server markup while it takes the page over (its documented `hydration_html_changed`:
 * "the client value will be ignored in favour of the server value"), keeps the markup the server sent.
 *
 * Only for a page's own HTML: a move inside the app asks for the page's data alone (`__data.json`), which no hook turns
 * into HTML, so a data request returns what the page draws from, as before, and the page draws it in the browser. The
 * offline page, which opens a kept page from its data, and a tab of the build before, which reads that data with its own
 * scripts, see the data they always did.
 */
export type Drawn = Map<string, string>;

/** The mark the page's data carries in the markup's place: an element no page has, so it cannot be met in a page's own text. */
export const markOf = (name: string) => `<i data-drawn="${name.replace(/[^a-z0-9-]/g, '')}" hidden></i>`;

/** The markup kept for the HTML, under its name; returns the mark the page puts in its place. */
export function drawOnce(locals: { drawn?: Drawn } | undefined, name: string, html: string): string | null {
  if (!locals) return null;
  (locals.drawn ??= new Map()).set(markOf(name), html);
  return markOf(name);
}

/** The HTML with each kept piece of markup in its mark's place, once; a mark not met is left (the page shows nothing there, never another's markup). */
export function placeDrawn(html: string, drawn: Drawn | undefined): string {
  if (!drawn?.size) return html;
  for (const [mark, markup] of drawn) {
    const at = html.indexOf(mark);
    if (at < 0) continue;
    html = html.slice(0, at) + markup + html.slice(at + mark.length);
    drawn.delete(mark);
  }
  return html;
}
