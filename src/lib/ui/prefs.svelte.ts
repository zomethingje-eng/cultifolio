/**
 * Preferences kept on this device that are not the site or the units. One so far: whether pages about your own plants
 * may show the reference's photograph of the species (fetched from iNaturalist or the GBIF cache, which then learn which
 * species this address grows). Off unless the grower turns it on: a private page makes no third-party request by
 * default (round twelve, A1). Public species pages are unaffected; they show the photograph the visitor came to see.
 */
import { browser } from '$app/environment';

const KEY = 'cultifolio.prefs';
interface Prefs {
  referencePhotos: boolean;
  /** The "Kept on this device" line on Today, hidden at the grower's request (round forty-nine, 3). */
  hideKeeping?: boolean;
}
const DEFAULTS: Prefs = { referencePhotos: false };

class PrefStore {
  current = $state<Prefs>({ ...DEFAULTS });
  /** Whether this device has ever saved preferences: a restore applies a backup's only where it has not. */
  stored = $state(false);
  loaded = $state(false);
  load() {
    if (this.loaded || !browser) return;
    try {
      const s = localStorage.getItem(KEY);
      const v = s ? (JSON.parse(s) as Partial<Prefs>) : null;
      this.current = { ...DEFAULTS, referencePhotos: v?.referencePhotos === true, hideKeeping: v?.hideKeeping === true };
      this.stored = !!s;
    } catch {
      this.current = { ...DEFAULTS };
    }
    this.loaded = true;
    // Two tabs, one switch: turned off in Settings in one tab, the other stops fetching too, without a reload (round seventeen, 9).
    if (!this.listening) {
      this.listening = true;
      window.addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) { this.loaded = false; this.load(); } });
    }
  }
  private listening = false;
  set(p: Partial<Prefs>) {
    this.current = { ...this.current, ...p };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.current));
      this.stored = true;
    } catch {
      /* a private window keeps it for the page */
    }
  }
  get hideKeeping(): boolean {
    return this.loaded && !!this.current.hideKeeping;
  }
  set hideKeeping(v: boolean) {
    this.set({ hideKeeping: v });
  }
  /** True only once loaded and switched on: before the store loads, no request goes out. */
  get referencePhotos(): boolean {
    return this.loaded && this.current.referencePhotos;
  }
}

export const prefs = new PrefStore();
