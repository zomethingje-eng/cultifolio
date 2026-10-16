/**
 * `--fill inat --bulk` for one dossier (round seventy-two, C1): whether its iNaturalist taxon takes in a taxon below the
 * species that Kew's file places under another species, and if so its iNaturalist sets asked again with such
 * observations left out. Kew's file says which pages can be touched (`KewInfra.hasElsewhereUnder`), so only those are
 * asked: their taxon's children (one request), then, where a child is such a name, the sets the page holds (one request
 * each). A set the page never held (six wild photographs already from GBIF's download) is not asked. The mark on the
 * wild row names Kew's file's day, so a rerun passes the page by.
 */
import type { JsonFetcher } from './fetch';
import type { Photo } from './schema';
import * as inat from './sources/inat';
import type { KewInfra, KewOwn } from './kew-infra';

type Row = { status: string; at?: string; detail?: string };
export type InatKewDossier = { key: number; name: { scientific: string; synonyms?: string[]; kew?: { entry?: string; synonyms?: string[]; acceptedElsewhere?: string[] } }; ids: { inat?: number; ipni?: string }; photos: Array<Pick<Photo, 'src'> & { captive?: boolean }>; upstream: Record<string, Row> };
export type InatKewResult =
  | { done: 'not a candidate' | 'read before' | 'unanswered' }
  | { done: 'refused'; detail?: string }
  | { done: 'marked'; asked: boolean }
  | { done: 'asked again'; placed: Array<[string, string]>; was: number; now: number };

export const kewMark = (day: string) => `descendants read against Kew's file of ${day}`;
/**
 * Round seventy-three: the mark of a page read with Kew's accepted species over GBIF's older names of the same words
 * (`KewInfra.widened`). A page read before under the older reading, whose reading this widens, is asked again once.
 */
export const KEW_OVER_GBIF = "Kew's accepted species read over GBIF's older names";

export async function inatKewFill(d: InatKewDossier, f: JsonFetcher, kew: KewInfra, day: string, now = () => new Date().toISOString()): Promise<InatKewResult> {
  const id = d.ids.inat;
  const own: KewOwn = { scientific: d.name.scientific, synonyms: d.name.synonyms ?? [], kewSynonyms: d.name.kew?.synonyms ?? [], acceptedElsewhere: d.name.kew?.acceptedElsewhere ?? [], kewEntry: d.name.kew?.entry || null, ipni: d.ids.ipni ?? null };
  if (!id || !kew.hasElsewhereUnder(own)) return { done: 'not a candidate' };
  const widened = kew.widened(own);
  const mark = widened ? `${kewMark(day)}; ${KEW_OVER_GBIF}` : kewMark(day);
  const row = d.upstream['inat.photos.wild'];
  const had = row?.detail ?? '';
  if (had.includes(kewMark(day)) && (!widened || had.includes(KEW_OVER_GBIF))) return { done: 'read before' };
  // A mark of the reading before is replaced, not repeated.
  const without = (x?: string) => (x ?? '').split('; ').filter((w) => w && w !== kewMark(day) && w !== KEW_OVER_GBIF).join('; ') || undefined;
  const stamp = (u: Row | undefined): Row => ({ status: u?.status ?? 'none', at: u?.at ?? now(), detail: [without(u?.detail), mark].filter(Boolean).join('; ') });
  const hadWild = d.photos.some((p) => p.src === 'inat' && !p.captive), hadCult = d.photos.some((p) => p.src === 'inat' && p.captive);
  if (!hadWild && !hadCult) { d.upstream['inat.photos.wild'] = stamp(row); return { done: 'marked', asked: false }; }
  const ch = await f<{ results?: Array<{ id: number; name: string }> }>(`${inat.INAT}/taxa?parent_id=${id}&per_page=200&is_active=true`);
  if (ch.status === 'refused') return { done: 'refused', detail: ch.detail };
  if (ch.status !== 'ok' && ch.status !== 'none') return { done: 'unanswered' };
  const placed = (ch.status === 'ok' ? ch.data.results ?? [] : []).map((c) => [c.name, kew.placedElsewhere(c.name, own)] as [string, string | null]).filter((x): x is [string, string] => !!x[1]);
  if (!placed.length) { d.upstream['inat.photos.wild'] = stamp(row); return { done: 'marked', asked: true }; }
  const owner = { key: d.key, kew: (t: string) => kew.placedElsewhere(t, own) };
  const wild = hadWild ? await inat.photos(f, id, true, 24, owner) : null;
  if (wild?.status === 'refused') return { done: 'refused', detail: wild.detail };
  const cult = hadCult ? await inat.photos(f, id, false, 12, owner) : null;
  if (cult?.status === 'refused') return { done: 'refused', detail: cult.detail };
  if ((wild && !['ok', 'none'].includes(wild.status)) || (cult && !['ok', 'none'].includes(cult.status))) return { done: 'unanswered' };
  const fresh = [...(wild?.status === 'ok' ? wild.data : []), ...(cult?.status === 'ok' ? cult.data : [])];
  const was = d.photos.filter((p) => p.src === 'inat').length;
  d.photos = [...fresh, ...d.photos.filter((p) => p.src !== 'inat' || (!wild && !p.captive) || (!cult && p.captive))];
  const t = now();
  d.upstream['inat.photos.wild'] = wild ? { status: wild.status, at: t, detail: `filled ${t.slice(0, 10)}; ${mark}` } : stamp(row);
  if (cult) d.upstream['inat.photos.cultivated'] = { status: cult.status, at: t, detail: `filled ${t.slice(0, 10)}` };
  return { done: 'asked again', placed, was, now: fresh.length };
}
