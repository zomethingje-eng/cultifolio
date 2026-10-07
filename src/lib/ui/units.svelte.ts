/**
 * The reader's units as page state: seeded from the server (cookie or
 * language), changed from Settings or any temperature figure, kept in a
 * cookie so the next page is rendered right the first time. A device
 * preference, not a synced one: a phone in Fahrenheit and a laptop in
 * Celsius is a choice, not a conflict.
 */
import { browser } from '$app/environment';
import { METRIC, parseUnits, unitsForLocale, type Units } from '$core/units';
import { readSetting, sampleTab, writeSetting } from '$lib/ui/stored';

const KEY = 'cultifolio.units';

/** The cookie as this browser holds it now: the service worker serves some shells from its cache, so the HTML's own idea of the units can be stale. */
function fromCookie(): Units | null {
  if (!browser) return null;
  try {
    return parseUnits(document.cookie.match(/(?:^|;\s*)cultifolio\.units=([^;]+)/)?.[1]);
  } catch {
    return null;
  }
}

class UnitsStore {
  current = $state<Units>(METRIC);
  /** The cookie first; then what the server saw; then, on a page the server did not render (the collection's), the browser's own language, so a plant page and a species page agree. */
  seed(u?: Units) {
    // The sample collection's tab keeps its own choice, for the tab only (round sixty-one; the grower review, 14).
    const own = browser && sampleTab() ? parseUnits(readSetting(KEY, 'device')) : null;
    this.current = own ?? fromCookie() ?? u ?? (browser ? unitsForLocale(navigator.language) : METRIC);
  }
  set(u: Units) {
    this.current = u;
    if (!browser) return;
    // Never the cookie from the sample: it was the device's, and the grower's own pages were in °F after a visit (round sixty-one; the grower review, 14).
    if (sampleTab()) { writeSetting(KEY, 'device', u); return; }
    try {
      document.cookie = `cultifolio.units=${u}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      /* a browser that refuses cookies still gets the page it is on */
    }
  }
  toggle() {
    this.set(this.current === 'us' ? 'metric' : 'us');
  }
}
export const units = new UnitsStore();
