/**
 * The reader's units as page state: seeded from the server (cookie or
 * language), changed from Settings or any temperature figure, kept in a
 * cookie so the next page is rendered right the first time. A device
 * preference, not a synced one: a phone in Fahrenheit and a laptop in
 * Celsius is a choice, not a conflict.
 */
import { browser } from '$app/environment';
import { METRIC, type Units } from '$core/units';

class UnitsStore {
  current = $state<Units>(METRIC);
  seed(u: Units) {
    this.current = u;
  }
  set(u: Units) {
    this.current = u;
    if (!browser) return;
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
