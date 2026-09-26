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
}
const DEFAULTS: Prefs = { referencePhotos: false };

class PrefStore {
  current = $state<Prefs>({ ...DEFAULTS });
  loaded = $state(false);
  load() {
    if (this.loaded || !browser) return;
    try {
      const s = localStorage.getItem(KEY);
      const v = s ? (JSON.parse(s) as Partial<Prefs>) : null;
      this.current = { ...DEFAULTS, referencePhotos: v?.referencePhotos === true };
    } catch {
      this.current = { ...DEFAULTS };
    }
    this.loaded = true;
  }
  set(p: Partial<Prefs>) {
    this.current = { ...this.current, ...p };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.current));
    } catch {
      /* a private window keeps it for the page */
    }
  }
  /** True only once loaded and switched on: before the store loads, no request goes out. */
  get referencePhotos(): boolean {
    return this.loaded && this.current.referencePhotos;
  }
}

export const prefs = new PrefStore();
