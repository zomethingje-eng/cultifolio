/**
 * A town for the frost watch's site (round 107; the first hand-off's round 7: "offer typing a town instead" of the
 * browser's location). Asked of OpenStreetMap's Nominatim from the server (`/api/place`), never from the browser, so the
 * visitor's address is not Nominatim's to see; asked on a press, never as the visitor types (Nominatim's usage policy
 * forbids searching as one types), five answers, each a name and its coordinates to choose from. Nothing is kept by the
 * server but the answer, in the Worker's cache for a week, under the words asked.
 *
 * Nominatim's data is OpenStreetMap's, under the Open Database Licence: credited where the answers are shown
 * (`PLACE_CREDIT`).
 */
export const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
export const PLACE_CREDIT = 'Places from OpenStreetMap (© OpenStreetMap contributors, ODbL), through Nominatim';
/**
 * Why the frost watch asks where you are, said before the browser asks (round 107; the first hand-off's round 7). True of
 * the code: the site is kept in this browser (`cultifolio.frost.site`), and a forecast is asked for its position rounded
 * to two decimals (`weather/client.ts`), about a kilometre, through this site's server to MET Norway.
 */
export const LOCATION_WHY = 'Your location gives the forecast for your nights. It is kept on this device; only its position, rounded to about a kilometre, goes to MET Norway, through this site.';
/** The words of a place asked: two to 100 characters, a name as typed. */
export const PLACE_MIN = 2;
export const PLACE_MAX = 100;
/** How many answers are offered. */
export const PLACE_ANSWERS = 5;

/** The words asked, trimmed and with runs of spaces made one; null where they cannot be a place's name. */
export function placeQuery(raw: string | null | undefined): string | null {
  const q = (raw ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return q.length >= PLACE_MIN && q.length <= PLACE_MAX ? q : null;
}

export function nominatimUrl(q: string): string {
  const u = new URL(NOMINATIM);
  u.searchParams.set('q', q);
  u.searchParams.set('format', 'jsonv2');
  u.searchParams.set('limit', String(PLACE_ANSWERS));
  u.searchParams.set('accept-language', 'en');
  return u.toString();
}

export interface Place {
  /** Nominatim's own name for the place, as it gives it ("Kew, London Borough of Richmond upon Thames, …"). */
  name: string;
  /** Three decimals, as "Use my location" keeps them (about a hundred metres). */
  lat: number;
  lon: number;
}

/** Nominatim's answer read: places with a name and coordinates in range, at most five; anything else read as none. */
export function readPlaces(body: unknown): Place[] {
  if (!Array.isArray(body)) return [];
  const out: Place[] = [];
  for (const r of body) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const lat = Number(o.lat), lon = Number(o.lon);
    const name = typeof o.display_name === 'string' ? o.display_name.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    out.push({ name, lat: +lat.toFixed(3), lon: +lon.toFixed(3) });
    if (out.length === PLACE_ANSWERS) break;
  }
  return out;
}

/** The site's name from a place chosen: its first part ("Kew"), as a grower would name it. */
export const shortPlace = (p: Place): string => p.name.split(',')[0].trim() || p.name;
