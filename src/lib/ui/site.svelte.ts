/**
 * Your site: one place with coordinates that the frost watch, the hemisphere
 * of the months in the notes, and the forecast on the front page read. Kept
 * on this device (the same key the frost page always used, so nothing set
 * before is lost); a bench with coordinates stands in for it when it is not set.
 */
import { browser } from '$app/environment';

const KEY = 'cultifolio.frost.site';
export interface Site {
  lat: number;
  lon: number;
  name?: string;
}

class SiteStore {
  current = $state<Site | null>(null);
  loaded = $state(false);
  load() {
    if (this.loaded || !browser) return;
    try {
      const s = localStorage.getItem(KEY);
      const v = s ? (JSON.parse(s) as Partial<Site>) : null;
      this.current = v && typeof v.lat === 'number' && typeof v.lon === 'number' && Math.abs(v.lat) <= 90 && Math.abs(v.lon) <= 180 ? { lat: v.lat, lon: v.lon, name: typeof v.name === 'string' ? v.name : undefined } : null;
    } catch {
      this.current = null;
    }
    this.loaded = true;
  }
  set(s: Site | null) {
    this.current = s;
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    } catch {
      /* a private window keeps it for the page */
    }
    // The hemisphere alone goes in a cookie, so the server renders a southern grower's months southern from the first
    // paint (and for a reader without JavaScript), the way the units cookie seeds the units. The site itself stays here.
    try {
      document.cookie = s ? `cultifolio.hemi=${s.lat < 0 ? 's' : 'n'}; path=/; max-age=31536000; samesite=lax` : 'cultifolio.hemi=; path=/; max-age=0; samesite=lax';
    } catch {
      /* no document: nothing to seed */
    }
  }
}
export const site = new SiteStore();
