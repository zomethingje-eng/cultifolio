/**
 * Round eighty-six, the final review's U5: a species page opened with `?was=` under a name its record says Kew's file
 * places in another plant reads which page here holds the name from the genus's `@` search file (`kewHolders`). That
 * file not read was a 503 for the whole page; now the page is shown, its line says the holder was not checked, never
 * that no page holds it (rule 2), and it is kept by no one.
 *
 * 1. The page: shown, `wasKew` with no holder and `unchecked`, `Cache-Control: no-store`; with the file read, the holder
 *    and the page's own cache, as before.
 * 2. The line: "not checked", never "no page of the reference holds it", for a name Kew accepts elsewhere or holds for
 *    another plant.
 *
 * On the final review's base (bac6183): 1 FAILED (the load threw the 503); 2 FAILED (the line said "and no page of the
 * reference holds it" with no holder read).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { error } from '@sveltejs/kit';

const state = vi.hoisted(() => ({ unread: false }));
vi.mock('$lib/server/dossiers', async (importOriginal) => {
  const real = await importOriginal<typeof import('$lib/server/dossiers')>();
  // The key reader's own refusal (`keyReader.need`): the 503 a file the directory names but the bucket cannot give is.
  return { ...real, kewHolders: (async (...a: Parameters<typeof real.kewHolders>) => (state.unread ? error(503, { message: 'unreadable' }) : real.kewHolders(...a))) as typeof real.kewHolders };
});

import { load } from '../../src/routes/species/[slug]/+page.server';
import { wasLine, type Part } from '$lib/ui/ref/was-words';
import type { IndexEntry, Loaded } from '$lib/server/dossiers';
import type { PageId } from '$core/page-id';

const F = 'tests/unit/fixtures/r86n';
const json = (f: string) => JSON.parse(readFileSync(`${F}/${f}`, 'utf8'));
type Dos = { key: string; slug: string; ids: Record<string, unknown>; name: Record<string, unknown> & { scientific: string; kew?: Record<string, unknown> } };
const ALBISSIMA = json('k500252.json') as Dos;
const DINTERI: Dos = { ...ALBISSIMA, key: 'k500298', slug: 'anacampseros-dinteri', ids: { ...ALBISSIMA.ids, gbif: 5646651 }, name: { ...ALBISSIMA.name, scientific: 'Anacampseros dinteri', authorship: 'Schönland', synonyms: ['Anacampseros dinteri Schönland'], kew: { entry: '500298', synonyms: ['Anacampseros schmidtii'], acceptedElsewhere: [], file: '2026-06-04' }, gbif: undefined } };
const entry = (d: Dos, extra: Partial<IndexEntry> = {}): IndexEntry => ({ key: d.key as PageId, gbif: d.ids.gbif as number, slug: d.slug, name: d.name.scientific, photos: 0, open: 0, climate: 'ok', ...extra });
const corpus = () => {
  const idx: IndexEntry[] = [entry(ALBISSIMA, { syn: ['Avonia albissima', 'Anacampseros avasmontana'] }), entry(DINTERI, { syn: ['Avonia dinteri'], kew: ['Anacampseros schmidtii'] })];
  return { at: Date.now(), idx, bySlug: new Map(idx.map((e) => [e.slug, e.key])), corpus: 'r86f', etag: null, fromStore: true, manifest: null, buckets: 32 } as unknown as Loaded;
};
const STORE = { get: async (path: string) => { const d = [ALBISSIMA, DINTERI].find((x) => path.endsWith(`/${x.key}.json`)); return d ? { json: async () => structuredClone(d) } : null; } };
let ip = 10;
function event(slug: string, search: string) {
  const url = new URL(`http://x/species/${slug}${search}`);
  const headers: Record<string, string> = {};
  const addr = `198.51.100.${ip++}`;
  const ev = { params: { slug }, platform: { env: { STORE } }, fetch: (async () => new Response('{"matchType":"NONE"}')) as typeof fetch, setHeaders: (h: Record<string, string>) => { for (const k of Object.keys(h)) if (k in headers) throw new Error(`${k} set twice`); Object.assign(headers, h); }, cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => addr, locals: { corpus: corpus() }, isDataRequest: true } as never;
  return { ev, headers };
}
type Data = { was: string | null; wasBelow: boolean; wasKew: { accepted: boolean; holder: { slug: string; name: string } | null; unchecked?: true } | null; d: Dos & { name: Dos['name'] & { synonyms: string[] } } };
const text = (ps: Part[]) => ps.map((p) => p.t).join('');
const lineOf = (data: Data) => {
  const kew = data.d.name.kew as { synonyms?: string[]; elsewhere?: string[]; acceptedElsewhere?: string[] };
  const gbifName = (data.d.name.gbif as { scientific?: string } | undefined)?.scientific ?? null;
  return text(wasLine({ was: data.was!, heading: data.d.name.scientific, gbifName, gbifSynonyms: data.d.name.synonyms, kewSynonyms: kew.synonyms ?? null, below: data.wasBelow, kewElsewhere: kew.elsewhere ?? null, kewAcceptedElsewhere: kew.acceptedElsewhere ?? null, kewHolder: data.wasKew?.holder ?? null, kewHolderUnchecked: !!data.wasKew?.unchecked }));
};

describe("1. the genus's @ search file not read", () => {
  it('?was=Anacampseros schmidtii on Anacampseros albissima: shown, the holder not checked, kept by no one', async () => {
    state.unread = true;
    try {
      const { ev, headers } = event('anacampseros-albissima', '?was=Anacampseros%20schmidtii');
      const data = (await load(ev)) as Data;
      expect(data.was).toBe('Anacampseros schmidtii');
      expect(data.wasKew).toEqual({ accepted: false, holder: null, unchecked: true });
      expect(headers['cache-control']).toBe('no-store');
      const t = lineOf(data);
      expect(t).toContain('Whether a page of the reference holds it was not checked');
      expect(t).not.toContain('no page');
    } finally { state.unread = false; }
  });
  it('guard: read, the holder named and the page kept a minute, as before', async () => {
    const { ev, headers } = event('anacampseros-albissima', '?was=Anacampseros%20schmidtii');
    const data = (await load(ev)) as Data;
    expect(data.wasKew).toEqual({ accepted: false, holder: { slug: 'anacampseros-dinteri', name: 'Anacampseros dinteri' } });
    expect(headers['cache-control']).toBe('private, max-age=60');
    expect(lineOf(data)).not.toContain('not checked');
  });
  it('a page opened with no ?was= is kept a minute, as before', async () => {
    const { ev, headers } = event('anacampseros-dinteri', '');
    await load(ev);
    expect(headers['cache-control']).toBe('private, max-age=60');
    expect(headers.vary).toBe('accept-language, cookie');
  });
});

describe('2. the line, the holder not checked', () => {
  const base = { was: 'Anacampseros grisea', heading: 'Anacampseros albissima', gbifName: 'Avonia albissima', gbifSynonyms: [], kewSynonyms: [], kewElsewhere: ['Anacampseros grisea (G.Will.) Dreher'], kewHolder: null };
  it('a name Kew accepts as a species of its own: never "no page of the reference holds it"', () => {
    const t = text(wasLine({ ...base, kewAcceptedElsewhere: ['Anacampseros grisea (G.Will.) Dreher'], kewHolderUnchecked: true }));
    expect(t).toContain("Kew's World Checklist accepts it as a species of its own, apart from Anacampseros albissima.");
    expect(t).toContain('Whether a page of the reference holds it was not checked');
    expect(t).not.toContain('no page');
    // Read, and none holds it: said so, as before.
    expect(text(wasLine({ ...base, kewAcceptedElsewhere: ['Anacampseros grisea (G.Will.) Dreher'] }))).toContain('and no page of the reference holds it.');
  });
});
