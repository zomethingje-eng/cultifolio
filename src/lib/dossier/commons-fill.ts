/**
 * Photographs for a dossier that has none or few, from Wikimedia Commons' category for the species (round sixty-eight, fourth
 * part). The builder has asked Commons since round sixteen, but Commons began answering every file's address with a
 * tracking query, the builder's test of the file's extension failed on every one, and no Commons photograph reached the
 * corpus: of 3,160 species with none, a sample of 100 found 15 with openly licensed photographs in their category. One
 * request a species, under its accepted name, the way the build asks when Wikidata names no other category.
 */
import type { JsonFetcher } from './fetch';
import type { Dossier } from './schema';
import { commonsPhotos } from './sources/commons';

export type CommonsFill = { added: number } | { none: true } | { failed: string };

/** What a dossier records when Commons has no openly licensed photograph for it: a later fill passes it by, so a stopped fill resumes. */
export const COMMONS_NONE = 'no openly licensed photograph in the Commons category of this name';

/** Whether this fill has already asked for this dossier: told there is none, or given photographs (its record names the category asked). */
export const askedCommons = (d: Pick<Dossier, 'upstream'>) => {
  const c = d.upstream?.commons;
  return c?.detail === COMMONS_NONE || (c?.status === 'ok' && !!c.detail?.startsWith('Category:'));
};

/**
 * The species the fill asks for: those with fewer than six photographs, the threshold at which the build already asks
 * GBIF's open-licence records (round sixty-eight, fourth part). A species with a full gallery, mostly research-grade
 * wild photographs, is not given Commons' category as well, which mixes in herbarium sheets, drawings and the odd
 * misfiled picture; it gets Commons at its next build, as every species does.
 */
export const COMMONS_FILL_BELOW = 6;
export const wantsCommons = (d: Pick<Dossier, 'photos' | 'upstream'>) => (d.photos?.length ?? 0) < COMMONS_FILL_BELOW && !askedCommons(d);

export async function fillCommons(d: Pick<Dossier, 'key' | 'photos' | 'upstream'> & { name: { scientific: string; synonyms?: string[] } }, f: JsonFetcher, now = () => new Date().toISOString()): Promise<CommonsFill> {
  // The species' older names go with it, so a file named under one is the species and one named as another is not (round sixty-nine; triage-68 K1).
  const r = await commonsPhotos(f, d.name.scientific, 12, { scientific: d.name.scientific, synonyms: d.name.synonyms ?? [] });
  if (r.status === 'ok') {
    const have = new Set((d.photos ?? []).map((p) => p.id));
    const fresh = r.data.filter((p) => !have.has(p.id));
    d.photos = [...(d.photos ?? []), ...fresh];
    d.upstream.commons = { status: 'ok', at: now(), detail: `Category:${d.name.scientific}` };
    return { added: fresh.length };
  }
  if (r.status === 'none') {
    d.upstream.commons = { status: 'none', at: now(), detail: COMMONS_NONE };
    return { none: true };
  }
  // A refusal or a failure changes nothing on the page: the dossier keeps what it said, and a later fill asks again.
  return { failed: r.status === 'skipped' ? 'not asked' : r.detail };
}
