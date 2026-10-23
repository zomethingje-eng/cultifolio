/**
 * Back closes what is open on a page (round eighty-one; the phone review's 8): the photo viewer, the menu, the Record form.
 * On Android the back gesture is how a phone closes a full-screen photograph or a sheet, and it left the page instead,
 * with anything typed in the form. Opening one adds a history entry of the page itself (the framework's shallow routing,
 * `page.state.layers`, the open ones in the order opened, so the viewer opened over the Record form closes alone), so
 * Back takes that entry away and the layer closes; closing it by its own button takes the entry
 * away too, so the next Back leaves the page as before. While a layer is open, a link inside the app replaces its entry
 * rather than stacking on it (the body's `data-sveltekit-replacestate`, read by the router at the click), so Back from
 * the next page comes back to this one, not to this one with its layer.
 *
 * Called while a component starts. `open` says whether the layer is shown; `close` closes it as its own button does. It
 * returns `settle`, for code that closes the layer and then moves the app on by itself (the menu's "See the example
 * collection"): awaited after the close, the step back has landed, so it cannot land after the move and undo it.
 */
import { pushState } from '$app/navigation';
import { navigating, page } from '$app/state';
import { tick, untrack } from 'svelte';

const shown = new Set<string>();
const mark = () => {
  if (typeof document === 'undefined') return;
  if (shown.size) document.body.setAttribute('data-sveltekit-replacestate', '');
  else document.body.removeAttribute('data-sveltekit-replacestate');
};

export function backLayer(name: string, open: () => boolean, close: () => void): { settle: () => Promise<void> } {
  /** This layer's entry is the one the history stands at. */
  let mine = false;
  /** The last step back, landed (its popstate, or a second at most). */
  let landed: Promise<void> = Promise.resolve();
  const top = () => (page.state.layers ?? []).at(-1) === name;
  const drop = () => {
    if (!mine) return;
    mine = false;
    shown.delete(name);
    mark();
    // Not when Back took it already, or the app has moved to another page, or one opened over it is still open; not while
    // a move is under way, which a step back would land after and undo.
    if (!top() || navigating.type) return;
    // At once, in the same turn as the close: a step back taken later could land on a reload or a move begun meanwhile.
    // The router puts the page back where it was when the layer opened; a page scrolled since (a form filled in) stays put.
    const x = scrollX, y = scrollY;
    landed = new Promise<void>((done) => {
      addEventListener('popstate', () => { scrollTo(x, y); done(); }, { once: true });
      setTimeout(done, 1000);
    });
    history.back();
  };
  $effect(() => {
    if (open()) {
      untrack(() => {
        if (mine) return;
        try {
          pushState('', { ...page.state, layers: [...(page.state.layers ?? []), name] });
        } catch {
          return; // before the router has started: the layer works without the entry
        }
        mine = true;
        shown.add(name);
        mark();
      });
    } else untrack(drop);
  });
  $effect(() => {
    const listed = (page.state.layers ?? []).includes(name);
    untrack(() => {
      if (!mine || listed) return;
      // Back (or the app's own move) took the entry away: the layer closes as its own button closes it.
      mine = false;
      shown.delete(name);
      mark();
      if (open()) close();
    });
  });
  $effect(() => () => untrack(drop));
  return {
    settle: async () => {
      await tick(); // the close's effect has run, and taken the step back
      await landed;
    }
  };
}
