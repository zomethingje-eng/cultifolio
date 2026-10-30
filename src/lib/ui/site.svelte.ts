/**
 * Your site: one place with coordinates that the frost watch, the hemisphere
 * of the months in the notes, and the forecast on the front page read. Kept
 * on this device (the same key the frost page always used, so nothing set
 * before is lost); a place with coordinates stands in for it when it is not set.
 */
import { browser } from '$app/environment';
import { readSetting, sampleTab, writeSetting } from '$lib/ui/stored';
import { secureAttr } from './cookie';

const KEY = 'cultifolio.frost.site';
/**
 * The longest site name kept, from Settings or a file's `device.json` (round eighty-four; outside review A16): a place's name, as
 * Settings writes it from a search, is a few words. A 3 MB name in a file was read whole, stored and drawn on every page
 * that names the site. A longer one is cut at a word and marked; control characters and runs of spaces go.
 */
export const SITE_NAME_MAX = 120;
export function siteName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const flat = v.slice(0, SITE_NAME_MAX * 4).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  if (flat.length <= SITE_NAME_MAX) return flat;
  const cut = flat.slice(0, SITE_NAME_MAX - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > SITE_NAME_MAX / 2 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

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
      const s = readSetting(KEY, 'collection'); // the sample's own, never the grower's (round sixty-one)
      const v = s ? (JSON.parse(s) as Partial<Site>) : null;
      this.current = v && typeof v.lat === 'number' && typeof v.lon === 'number' && Math.abs(v.lat) <= 90 && Math.abs(v.lon) <= 180 ? { lat: v.lat, lon: v.lon, name: siteName(v.name) ?? undefined } : null; // bounded as a restored one is (round eighty-four; A16)
    } catch {
      this.current = null;
    }
    this.loaded = true;
    // The path-scoped hemisphere cookies, written here if the site is set (round seventeen, 8).
    this.writeCookie(this.current);
  }
  private writeCookie(s: Site | null) {
    if (sampleTab()) return; // the hemisphere cookie is the device's: never written from the sample (round sixty-one; the records review, 17)
    try {
      const v = s ? s.lat < 0 ? 's' : 'n' : null;
      for (const path of ['/species', '/compare']) document.cookie = v ? `cultifolio.hemi=${v}; path=${path}; max-age=31536000; samesite=lax${secureAttr()}` : `cultifolio.hemi=; path=${path}; max-age=0; samesite=lax${secureAttr()}`;
    } catch {
      /* no document: nothing to seed */
    }
  }
  set(s: Site | null) {
    this.current = s;
    writeSetting(KEY, 'collection', s ? JSON.stringify(s) : null); // a private window keeps it for the page
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
