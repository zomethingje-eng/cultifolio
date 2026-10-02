/**
 * The catalogue's rows, built once per index load and grouping, and the front page's window of them (round forty-seven, 1):
 * the page used to carry every row; it carries sixty, or up to thirty past an opened row, and the API serves the rest.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { catalogueOf } from '$lib/server/catalogue';
import { _forgetIndex, type IndexEntry } from '$lib/server/dossiers';
import { load, _WINDOW } from '../../src/routes/+page.server';
import { GET as rowsGET } from '../../src/routes/api/rows/+server';

const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
/** Three hundred genera, A to Z and back, three species each, every other one with a climate. */
const bigIndex = (): IndexEntry[] => {
  const out: IndexEntry[] = [];
  let key = 1;
  for (let g = 0; g < 300; g++) {
    const genus = String.fromCharCode(65 + (g % 26)) + 'enus' + String(g).padStart(3, '0');
    for (let s = 0; s < 3; s++) out.push({ key: key++, slug: `${genus.toLowerCase()}-sp${s}`, name: `${genus} sp${s}`, family: 'F', climate: (g + s) % 2 ? 'ok' : 'none', open: s, thumb: s === 0 ? 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/medium.jpg' : undefined } as unknown as IndexEntry);
  }
  return out;
};
const store = (idx: IndexEntry[]) => ({ get: async () => ({ text: async () => JSON.stringify(idx), json: async () => idx, etag: '"big"' }), head: async () => ({ etag: '"big"' }) });
const platformWith = (idx: IndexEntry[]) => ({ env: { STORE: store(idx) } }) as unknown as App.Platform;
const pageAt = (platform: App.Platform, q: string) => load({ platform, fetch: noStatic, setHeaders: () => {}, url: new URL(`http://x/?${q}`), cookies: { get: () => undefined }, request: new Request('http://x/') } as never) as Promise<{ rows: Array<{ id: string; letter: string; items?: unknown[] }>; rowCount: number; start: number; letterAt: Record<string, number>; letters: string[]; open: string }>;

describe('the catalogue rows (round forty-seven, 1)', () => {
  beforeEach(() => _forgetIndex());
  it('are built once per index and grouping, with the first row of each letter indexed', () => {
    const idx = bigIndex();
    const a = catalogueOf(idx, 'genus', 'all');
    expect(catalogueOf(idx, 'genus', 'all')).toBe(a);
    expect(catalogueOf(idx, 'genus', 'climate')).not.toBe(a);
    expect(a.rows.length).toBe(300);
    expect(a.letters.length).toBe(26);
    expect(a.rows[a.letterAt.B].letter).toBe('B');
    expect(a.rows[a.letterAt.B - 1].letter).toBe('A');
    expect(a.itemsOf(a.rows[0].id)?.length).toBe(3);
    expect(catalogueOf(idx, 'genus', 'climate').rows.every((r) => r.withClimate === r.count)).toBe(true);
  });
  it('the page carries a window of sixty, from a letter when asked, and reaches an opened row beyond the window', async () => {
    const p = platformWith(bigIndex());
    const top = await pageAt(p, '');
    expect(top.rows.length).toBe(_WINDOW);
    expect(top.rowCount).toBe(300);
    expect(top.start).toBe(0);
    expect(top.rows.every((r) => r.items === undefined)).toBe(true);
    const fromM = await pageAt(p, 'from=M');
    expect(fromM.start).toBe(top.letterAt.M);
    expect(fromM.rows[0].letter).toBe('M');
    const cat = catalogueOf(await (await import('$lib/server/dossiers')).getIndex(p, noStatic), 'genus', 'all');
    const far = cat.rows[250].id;
    const opened = await pageAt(p, `open=${far}`);
    expect(opened.open).toBe(far);
    expect(opened.rows.length).toBe(280); // from the top to thirty past the opened row (rows 0 to 279)
    expect(opened.rows.find((r) => r.id === far)?.items?.length).toBe(3);
    expect(opened.rows.filter((r) => r.items).length).toBe(1);
  });
  it('the API serves a window by position, capped, and nothing past the end', async () => {
    const p = platformWith(bigIndex());
    const ask = async (q: string) => (await (await rowsGET({ url: new URL(`http://x/api/rows?${q}`), platform: p, fetch: noStatic } as never)).json()) as { at: number; count: number; rows: Array<{ id: string }> };
    const a = await ask('by=genus&at=60&n=160');
    expect(a.at).toBe(60);
    expect(a.count).toBe(300);
    expect(a.rows.length).toBe(160);
    expect((await ask('by=genus&at=0&n=1000')).rows.length).toBe(200);
    expect((await ask('by=genus&at=290&n=160')).rows.length).toBe(10);
    expect((await ask('by=genus&at=300&n=160')).rows).toEqual([]);
    const cat = catalogueOf(await (await import('$lib/server/dossiers')).getIndex(p, noStatic), 'genus', 'all');
    expect(a.rows[0].id).toBe(cat.rows[60].id);
  });
});
