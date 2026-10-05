/**
 * Your site: one place with coordinates that the frost watch, the hemisphere
 * of the months in the notes, and the forecast on the front page read. Kept
 * on this device (the same key the frost page always used, so nothing set
 * before is lost); a place with coordinates stands in for it when it is not set.
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
    // The path-scoped hemisphere cookies, written here if the site is set (round seventeen, 8).
    this.writeCookie(this.current);
  }
  private writeCookie(s: Site | null) {
    try {
      const v = s ? s.lat < 0 ? 's' : 'n' : null;
      for (const path of ['/species', '/compare']) document.cookie = v ? `cultifolio.hemi=${v}; path=${path}; max-age=31536000; samesite=lax` : `cultifolio.hemi=; path=${path}; max-age=0; samesite=lax`;
    } catch {
      /* no document: nothing to seed */
    }
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
    // The cookie is scoped to the two paths that read it, so it rides on no other request, sync and the API included
    // (round sixteen, 11); an older path=/ copy is expired.
    this.writeCookie(s);
  }
}
export const site = new SiteStore();

/**
 * The reader's latitude for the hemisphere of the months: the site, else the first place with coordinates. One helper
 * for the species page's rule, the labels and Today: Today read the site alone, so a grower with a place at −33.9 and
 * no site was told a Copiapoa was out of its cooler months in October (round sixty; the self-review's 10).
 */
export function readerLat(places: ReadonlyArray<{ lat?: number | null }>, s: Site | null = site.current): number | null {
  return s?.lat ?? places.map((l) => l.lat).find((x): x is number => x != null) ?? null;
}
