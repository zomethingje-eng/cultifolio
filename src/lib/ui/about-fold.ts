/**
 * The about pages read as summaries, the rules under each folded one tap away (round eighty-five; the reviews' S11 and
 * A22: /about/how was 23,000 words, every rule shown). Two things a folded list must still do, for both pages.
 *
 * - `revealHash`: an address that names a rule inside a folded list (/about/how#set-aside, a link from a species page)
 *   opens every list around it and brings it into view, on load and whenever the address's fragment changes. Browsers
 *   that open a `<details>` for a fragment themselves do no harm; those that do not would land on a closed list.
 * - `printOpens`: printing opens every folded list, and closes again afterwards the ones the reader had closed, so a
 *   printed page carries every rule.
 *
 * Each returns the function that undoes it. `root` and `win` are for the tests.
 */
export function revealHash(root: Document = document, win: Window = window): () => void {
  const reveal = () => {
    const id = decodeURIComponent(win.location.hash.slice(1));
    const t = id ? root.getElementById(id) : null;
    if (!t) return;
    let opened = false;
    for (let d = t.closest('details'); d; d = d.parentElement?.closest('details') ?? null) {
      if (!d.open) { d.open = true; opened = true; }
    }
    if (opened) t.scrollIntoView();
  };
  reveal();
  win.addEventListener('hashchange', reveal);
  return () => win.removeEventListener('hashchange', reveal);
}

export function printOpens(root: Document = document, win: Window = window): () => void {
  let opened: HTMLDetailsElement[] = [];
  const before = () => { opened = [...root.querySelectorAll<HTMLDetailsElement>('article.prose details:not([open])')]; for (const d of opened) d.open = true; };
  const after = () => { for (const d of opened) d.open = false; opened = []; };
  win.addEventListener('beforeprint', before);
  win.addEventListener('afterprint', after);
  return () => { win.removeEventListener('beforeprint', before); win.removeEventListener('afterprint', after); };
}
