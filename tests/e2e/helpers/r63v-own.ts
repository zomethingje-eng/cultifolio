/**
 * Round sixty-three (V2): on a device whose own collection is empty, Today, Places and Propagation open the example
 * collection by themselves, unless the tab has left the example. A spec about the grower's own pages that starts on a
 * fresh device starts as such a tab, so those pages are the grower's own and empty, as a grower who has seen the example
 * finds them. Passed to `context.addInitScript` (every page of the context, on every load).
 */
export function ownPages(): void {
  try { sessionStorage.setItem('cultifolio.sampleOut', '1'); } catch { /* no storage: the example is never opened by itself either */ }
}
