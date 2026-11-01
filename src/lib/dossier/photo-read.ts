/**
 * The day a photograph's credit was read from its source (round eighty-five, the owner's decision 7; outside review B2:
 * two Hibiscus rosa-sinensis credits named an observer iNaturalist no longer names, and the page could not say when its
 * credit was read). Each photograph carries `read` (YYYY-MM-DD): the day a build or a fill read its credit and licence,
 * from the source's answer or the source's download; the page says it beside the credit.
 *
 *   - A build that asked its sources stamps every photograph it was answered with (`stampRead`).
 *   - Any write stamps a photograph the page did not hold before (`stampNew`): whatever path brought it, it was read that
 *     day. A photograph held before keeps its day, or none: a credit carried is never said to be read again.
 *   - `--fill credits` reads the credit and licence of every stored iNaturalist and Commons photograph again
 *     (`creditsFill`), corrects a credit that changed, drops one whose licence is no longer open or whose file is gone,
 *     and stamps the day.
 *
 * Pure but for the fill's fetcher.
 */
import type { JsonFetcher } from './fetch';
import { licenceTag, isOpen } from '../core/licence';
import { cc0Credit } from './sources/inat';
import { creditWithoutMail } from './photo-kind';
import { commonsAuthor, commonsLicence, commonsCredit } from './photo-credit';

type Stamped = { src?: string; id: string; read?: string };

/** Every photograph read that day: `read` set to it. */
export function stampRead<P extends Stamped>(photos: readonly P[], day: string): P[] {
  return photos.map((p) => (p.read === day ? p : { ...p, read: day }));
}

/** A photograph the page did not hold before (by source and id) stamped with the day; one it held keeps its own day, or none. */
export function stampNew<P extends Stamped>(before: readonly Stamped[] | null | undefined, photos: readonly P[], day: string): P[] {
  const held = new Map((before ?? []).map((p) => [`${p.src}:${p.id}`, p.read]));
  return photos.map((p) => {
    if (p.read) return p;
    const k = `${p.src}:${p.id}`;
    if (!held.has(k)) return { ...p, read: day };
    const was = held.get(k);
    return was ? { ...p, read: was } : p;
  });
}

/** An iNaturalist photograph's observation, from its page: its number ("…/observations/123") or its uuid (a wild photograph read from the open data), as a string. */
export const observationOf = (page: string | undefined): string | null => { const m = /\/observations\/(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i.exec(page ?? ''); return m ? m[1].toLowerCase() : null; };

/** What iNaturalist answers of an observation for the credits (v2, these fields only). */
export interface CreditObs { id: number; uuid?: string; photos?: Array<{ id: number; license_code?: string | null; attribution?: string | null }>; user?: { login?: string; name?: string | null }; /** Whether the observer, or iNaturalist's community, marks the plant captive or cultivated now (the merge, round eighty-five; review-d D13). */ captive?: boolean }
/** What Commons answers of a file for the credits (`imageinfo`'s `extmetadata`). */
export interface CreditFile { title: string; missing?: boolean; artist?: string; licence?: string }

/** One photograph's answer: its credit as read now, or why it is dropped, or null when the source did not say (it stays as it was). */
export type CreditRead = { credit: string; licence: 'cc0' | 'pd' | 'by' | 'by-sa' } | { drop: string } | null;

/** An iNaturalist photograph's credit as the build makes it (`inat.photos`), from the observation read again. */
export function inatCredit(photoId: string, o: CreditObs | undefined): CreditRead {
  if (!o) return null;
  const p = (o.photos ?? []).find((x) => String(x.id) === photoId);
  if (!p) return { drop: `iNaturalist's observation ${o.id} no longer holds photograph ${photoId}` };
  const tag = licenceTag(p.license_code ?? null);
  if (!isOpen(tag) || (tag !== 'cc0' && tag !== 'by' && tag !== 'by-sa')) return { drop: `photograph ${photoId} is no longer under an open licence on iNaturalist (${p.license_code ?? 'all rights reserved'})` };
  const line = tag === 'cc0' ? cc0Credit(p.attribution ?? '', o.user as Parameters<typeof cc0Credit>[1]) : p.attribution ?? '';
  if (!line && tag !== 'cc0') return { drop: `photograph ${photoId} no longer names its author on iNaturalist` };
  const credit = line ? creditWithoutMail({ src: 'inat', licence: tag, attribution: line }) : 'author not stated, CC0';
  if (!credit) return { drop: `photograph ${photoId}'s credit on iNaturalist is an e-mail address` };
  return { credit, licence: tag };
}

/** A Commons file's credit as the build makes it (`commonsPhoto`), from its description read again. */
export function commonsFileCredit(f: CreditFile | undefined): CreditRead {
  if (!f) return null;
  if (f.missing) return { drop: `Commons no longer holds ${f.title}` };
  const lic = (f.licence ?? '').trim();
  const tag = commonsLicence(lic);
  if (!tag) return { drop: `${f.title} is no longer under a licence this reference publishes (${lic || 'none stated'})` };
  const artist = commonsAuthor(f.artist);
  if (!artist && tag !== 'cc0' && tag !== 'pd') return { drop: `${f.title} no longer names its author` };
  return { credit: commonsCredit(artist, lic), licence: tag };
}

type CreditPhoto = { src: string; id: string; page?: string; attribution: string; licence: string; read?: string; captive?: boolean };
export interface CreditCounts { pages: number; read: number; changed: number; dropped: number; unread: number; lines: string[]; /** Photographs whose captive mark changed (the merge, round eighty-five). */ recaptive?: number }

/**
 * A page's photographs with the credits read again, in place: `obs` and `files` are the sources' answers (an absent one
 * leaves the photograph as it was, unstamped). Returns what changed, as lines for the log. Photographs of other
 * sources (GBIF's, read from their records by `--fill gbif-licence`) are left as they are.
 */
export function applyCredits(d: { key?: unknown; name?: { scientific?: string }; photos: CreditPhoto[] }, obs: ReadonlyMap<string, CreditObs>, files: ReadonlyMap<string, CreditFile>, day: string, c: CreditCounts): boolean {
  let touched = false;
  const keep: CreditPhoto[] = [];
  for (let p of d.photos) {
    const r = p.src === 'inat' ? (observationOf(p.page) != null ? inatCredit(p.id, obs.get(observationOf(p.page)!)) : null) : p.src === 'commons' ? commonsFileCredit(files.get(p.id)) : null;
    if (p.src === 'inat' || p.src === 'commons') { if (r) c.read++; else c.unread++; }
    if (!r) { keep.push(p); continue; }
    // The observation's captive mark read again with its credit (the merge, round eighty-five; review-d D13: three
    // photographs marked captive on iNaturalist since were shown as wild): the photograph takes the mark iNaturalist gives now.
    const o = p.src === 'inat' && !('drop' in r) ? obs.get(observationOf(p.page)!) : undefined;
    if (o && typeof o.captive === 'boolean' && o.captive !== !!p.captive) {
      c.lines.push(`${d.name?.scientific ?? ''} [${String(d.key)}]: inat ${p.id}: ${o.captive ? 'now marked captive or cultivated on iNaturalist' : 'no longer marked captive on iNaturalist'}`);
      c.recaptive = (c.recaptive ?? 0) + 1;
      p = { ...p, ...(o.captive ? { captive: true } : { captive: false }) };
      touched = true;
    }
    if ('drop' in r) { c.dropped++; c.lines.push(`${d.name?.scientific ?? ''} [${String(d.key)}]: dropped: ${r.drop}`); touched = true; continue; }
    if (r.credit !== p.attribution || r.licence !== p.licence) {
      c.changed++;
      c.lines.push(`${d.name?.scientific ?? ''} [${String(d.key)}]: ${p.src} ${p.id}: "${p.attribution}" → "${r.credit}"`);
      keep.push({ ...p, attribution: r.credit, licence: r.licence, read: day });
      touched = true;
      continue;
    }
    if (p.read !== day) { keep.push({ ...p, read: day }); touched = true; } else keep.push(p);
  }
  if (touched) d.photos = keep;
  return touched;
}

/** iNaturalist's observations, two hundred a request (`v2`, with only the credit's fields), by number or by uuid, as the batches ask (`inat-batch.ts`). */
export const CREDIT_OBS_URL = (ids: readonly string[]) => `https://api.inaturalist.org/v2/observations?${/^\d+$/.test(ids[0] ?? '') ? 'id' : 'uuid'}=${ids.join(',')}&per_page=200&fields=${encodeURIComponent('(id:!t,uuid:!t,captive:!t,photos:(id:!t,license_code:!t,attribution:!t),user:(login:!t,name:!t))')}`;
/** Commons' descriptions, fifty files a request. */
export const CREDIT_FILES_URL = (titles: readonly string[]) => `https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=extmetadata&iiextmetadatafilter=Artist|LicenseShortName&titles=${encodeURIComponent(titles.join('|'))}`;

/** Reads the observations' credits (all numbers, or all uuids); one the answer lacks is not in the map (its photograph then stays unstamped). Keyed by number and by uuid. */
export async function readObservations(f: JsonFetcher, ids: readonly string[]): Promise<Map<string, CreditObs> | null> {
  const r = await f<{ results?: CreditObs[] }>(CREDIT_OBS_URL(ids));
  if (r.status === 'none') return new Map();
  if (r.status !== 'ok') return null;
  return new Map((r.data.results ?? []).flatMap((o) => [[String(o.id), o] as const, ...(o.uuid ? [[o.uuid.toLowerCase(), o] as const] : [])]));
}
/** Reads the files' credits; a title Commons says is missing is marked so. */
export async function readFiles(f: JsonFetcher, titles: readonly string[]): Promise<Map<string, CreditFile> | null> {
  const r = await f<{ query?: { normalized?: Array<{ from: string; to: string }>; pages?: Array<{ title: string; missing?: boolean; imageinfo?: Array<{ extmetadata?: { Artist?: { value?: string }; LicenseShortName?: { value?: string } } }> }> } }>(CREDIT_FILES_URL(titles));
  if (r.status === 'none') return new Map();
  if (r.status !== 'ok') return null;
  const back = new Map((r.data.query?.normalized ?? []).map((n) => [n.to, n.from]));
  const out = new Map<string, CreditFile>();
  for (const p of r.data.query?.pages ?? []) {
    const title = back.get(p.title) ?? p.title;
    const m = p.imageinfo?.[0]?.extmetadata;
    out.set(title, { title, ...(p.missing ? { missing: true } : {}), ...(m?.Artist?.value ? { artist: m.Artist.value } : {}), ...(m?.LicenseShortName?.value ? { licence: m.LicenseShortName.value } : {}) });
  }
  return out;
}
