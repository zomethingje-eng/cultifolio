/**
 * Settings kept in the browser's storage, each read and written with its scope said (round sixty-one; review B's
 * suggestion, the triage's decision 10). A setting was a direct `localStorage` call wherever it was used, so the units,
 * the frost site and the label sheet chosen inside the sample collection became the grower's own (the grower review,
 * 14; the records review, 17; B1), and the next setting would have done the same.
 *
 * - `device`: about this browser and the person at it (units, appearance, preferences, the label stock in the printer).
 *   Outside the sample it is `localStorage`, under the key the about pages name. Inside the sample it is read from there
 *   (the sample shows the grower's own units), but a change is kept for this tab only, never written over the grower's.
 * - `collection`: about one collection (the frost site, the last place a plant was added to). Inside the sample it is
 *   the tab's own and nothing of the grower's is read.
 * - `tab`: for this tab only, in `sessionStorage` (the plants picked on the labels page, the compare tray chosen in the
 *   sample), so a reload keeps it and closing the tab ends it (round sixty-two).
 *
 * Inside the sample a write goes to `sessionStorage` under `cultifolio.demo.` and the key: it is gone with the tab, and
 * Leave clears it. Nothing here writes a cookie; a store that also keeps a cookie (the units, the hemisphere) asks
 * `sampleTab()` first and writes none from the sample.
 */
import { inDemo } from '$lib/db/demo';

export type Scope = 'device' | 'collection' | 'tab';
/** The prefix of a sample tab's own copies (sessionStorage). */
export const SAMPLE_PREFIX = 'cultifolio.demo.';

/** A sample tab's copy of a key: `cultifolio.units` is `cultifolio.demo.units`. */
const sampleKey = (key: string) => SAMPLE_PREFIX + key.replace(/^cultifolio\./, '');

/** Whether this tab is the sample collection's: its settings are its own. */
export const sampleTab = (): boolean => inDemo();

export function readSetting(key: string, scope: Scope): string | null {
  try {
    if (scope === 'tab') return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(inDemo() ? sampleKey(key) : key);
    if (inDemo()) {
      const own = sessionStorage.getItem(sampleKey(key));
      if (own !== null || scope === 'collection') return own;
    }
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null; // no storage (a private window, a blocked site): the default, as before
  }
}

/** Write (or remove, with null). False when the browser refused; a private window keeps the value for the page. */
export function writeSetting(key: string, scope: Scope, value: string | null): boolean {
  try {
    // 'device' and 'collection' write the same way (the scope decides what the sample reads); 'tab' is this tab's only.
    const store = inDemo() || scope === 'tab' ? sessionStorage : localStorage;
    const k = inDemo() ? sampleKey(key) : key;
    if (value === null) store.removeItem(k);
    else store.setItem(k, value);
    return true;
  } catch {
    return false;
  }
}
