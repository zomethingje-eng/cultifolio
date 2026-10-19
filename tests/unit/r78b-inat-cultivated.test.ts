/**
 * Round seventy-eight, agent B: iNaturalist's cultivated photographs by the owner's rule of 2026-10-19. Observations
 * marked captive or cultivated, with open-licence photographs, whose identifications agree: at least two current
 * identifications, the community taxon the observation's own taxon, none disagreeing. On iNaturalist's recorded answers
 * of 2026-10-19 for Fuchsia triphylla, Mammillaria moelleriana and Crassula natalensis
 * (`fixtures/r78b-inat-cultivated.json`). Each case FAILED on r78base unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as inat from '$dossier/sources/inat';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher, type JsonFetcher, type FetchResult } from '$dossier/fetch';
import { welwitschia } from '../../fixtures/upstream';

type Obs = { id: number; captive?: boolean; taxon: { id: number; name: string; ancestor_ids?: number[] }; community_taxon_id?: number | null; num_identification_disagreements?: number; identifications: Array<{ current?: boolean; taxon: { id: number; ancestor_ids?: number[] | null } }>; photos: Array<{ id: number; license_code: string }> };
const rec = JSON.parse(readFileSync('tests/unit/fixtures/r78b-inat-cultivated.json', 'utf8')) as { answers: Record<string, { results: Obs[] }> };
const m = inat as unknown as {
  cultivatedUrl?: (t: number, n: number) => string;
  wildUrl?: (t: number, n: number) => string;
  agreedCaptive?: (o: Obs) => boolean;
  cultivatedSettled?: (u?: { status?: string; detail?: string }) => boolean;
  CULTIVATED_RULE?: string;
};
const need = <K extends keyof typeof m>(k: K) => { const v = m[k]; if (v === undefined) throw new Error(`sources/inat.ts has no ${String(k)}`); return v as NonNullable<(typeof m)[K]>; };
const URL = (t: number) => `https://api.inaturalist.org/v1/observations?taxon_id=${t}&photo_license=cc0,cc-by,cc-by-sa&photos=true&captive=true&identifications=most_agree&order_by=votes&per_page=12`;
const replay = (table: Record<string, unknown>): JsonFetcher => (async <T>(url: string): Promise<FetchResult<T>> => (url in table ? { status: 'ok', data: table[url] as T } : { status: 'refused', detail: `not recorded: ${url}` })) as JsonFetcher;
const fuchsia = () => JSON.parse(JSON.stringify(rec.answers[URL(498028)])) as { results: Obs[] };

describe('the request: iNaturalist\'s own filters', () => {
  it('captive or cultivated, open-licence photographs, identifications mostly agreeing; no research grade, which a captive observation never has', () => {
    expect(need('cultivatedUrl')(498028, 12)).toBe(URL(498028)); // base: quality_grade=research&captive=true
    expect(need('cultivatedUrl')(498028, 12)).not.toContain('quality_grade');
    // guard: the wild request is the base's, word for word
    expect(need('wildUrl')(498028, 24)).toBe('https://api.inaturalist.org/v1/observations?taxon_id=498028&photo_license=cc0,cc-by,cc-by-sa&photos=true&quality_grade=research&captive=false&order_by=votes&per_page=24');
  });
});

describe('the rule, on recorded answers', () => {
  it('Fuchsia triphylla: ten of twelve observations agree; the genus as community taxon, and a disagreeing identification, are not taken', () => {
    const agreed = need('agreedCaptive');
    const r = fuchsia().results;
    expect(r.filter((o) => agreed(o)).map((o) => o.id)).toEqual([114381066, 5904631, 19629441, 325943027, 205061421, 63904365, 252959870, 14603671, 28476130, 11554084]);
    const no = r.filter((o) => !agreed(o));
    expect(no.map((o) => [o.id, o.community_taxon_id, o.num_identification_disagreements])).toEqual([[92991407, 54713, 0], [29289640, 498028, 1]]);
  });
  it('one identification alone, an identification outside the taxon\'s line, or an observation not marked captive is not taken', () => {
    const agreed = need('agreedCaptive');
    const base = fuchsia().results.find((o) => o.id === 114381066)!;
    expect(agreed(base)).toBe(true);
    expect(agreed({ ...base, identifications: base.identifications.filter((i) => i.current).slice(0, 1) })).toBe(false);
    expect(agreed({ ...base, identifications: [...base.identifications, { current: true, taxon: { id: 163112, ancestor_ids: [47126, 163112] } }] })).toBe(false);
    expect(agreed({ ...base, captive: false })).toBe(false);
    // An identification of the genus (above the taxon) is not a disagreement: 19629441 carries one and is taken.
    expect(fuchsia().results.find((o) => o.id === 19629441)!.identifications.some((i) => i.current && i.taxon.id === 54713)).toBe(true);
  });
  it('the photographs: each of an agreed observation, open-licence, marked cultivated', async () => {
    need('cultivatedUrl');
    const r = await inat.photos(replay(rec.answers), 498028, false, 12);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    const agreedIds = new Set([114381066, 5904631, 19629441, 325943027, 205061421, 63904365, 252959870, 14603671, 28476130, 11554084].map((i) => `https://www.inaturalist.org/observations/${i}`));
    expect(r.data).toHaveLength(14);
    expect(r.data.every((p) => p.src === 'inat' && p.captive === true && ['cc0', 'by', 'by-sa'].includes(p.licence ?? '') && agreedIds.has(p.page ?? ''))).toBe(true);
    // Mammillaria moelleriana: one observation, four agreeing identifications; Crassula natalensis: none, which is "none".
    const mm = await inat.photos(replay(rec.answers), 207286, false, 12);
    expect(mm.status === 'ok' && mm.data.length).toBe(1);
    expect(await inat.photos(replay(rec.answers), 582940, false, 12)).toEqual({ status: 'none' });
  });
  it('rule 3: an agreed observation of a taxon below the species that Kew places under another species is left out, as for the wild set', async () => {
    need('cultivatedUrl');
    const a = fuchsia();
    a.results[0].taxon = { ...a.results[0].taxon, name: 'Fuchsia triphylla subsp. altera' };
    const r = await inat.photos(replay({ [URL(498028)]: a }), 498028, false, 12, { kew: (t) => (t.endsWith('altera') ? 'Fuchsia altera' : null) });
    expect(r.status === 'ok' && r.data.some((p) => p.page === 'https://www.inaturalist.org/observations/114381066')).toBe(false);
    expect(r.status === 'ok' && r.data.length).toBe(13);
  });
});

describe('the build and the fill', () => {
  it('a build records the set as asked by the rule; a refusal is not checked, never none (rule 2)', async () => {
    const RULE = need('CULTIVATED_RULE');
    const opts = (fetcher: JsonFetcher) => ({ fetcher, builtBy: 'node' as const, now: () => new Date('2026-10-19T12:00:00Z') });
    const ok = await buildDossier('Welwitschia', opts(fixtureFetcher(welwitschia())));
    expect(ok.ok && ok.dossier.upstream['inat.photos.cultivated']).toMatchObject({ status: 'ok', detail: RULE });
    expect(ok.ok && ok.dossier.photos.filter((p) => p.captive).length).toBe(3);
    const t = welwitschia() as Record<string, unknown>;
    for (const k of Object.keys(t)) if (k.includes('captive=true')) delete t[k];
    const no = await buildDossier('Welwitschia', opts(fixtureFetcher(t)));
    expect(no.ok && no.dossier.upstream['inat.photos.cultivated'].status).toBe('refused');
    expect(no.ok && no.dossier.photos.some((p) => p.captive)).toBe(false);
  });
  it('a record of the rule before is asked again by --fill inat; one of this rule is settled', () => {
    const settled = need('cultivatedSettled');
    const RULE = need('CULTIVATED_RULE');
    expect(settled({ status: 'none', detail: 'carried from build of 2026-09-19 (rederive)' })).toBe(false);
    expect(settled({ status: 'none', detail: `${RULE}; filled 2026-10-19` })).toBe(true);
    expect(settled({ status: 'ok', detail: RULE })).toBe(true);
    expect(settled({ status: 'error', detail: `${RULE}; api.inaturalist.org timeout` })).toBe(false);
    const script = readFileSync('scripts/build-dossiers.ts', 'utf8');
    expect(script).toContain("const cultDone = inat.cultivatedSettled(d.upstream?.['inat.photos.cultivated']);");
  });
});
