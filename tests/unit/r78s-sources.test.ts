/**
 * Round seventy-eight, agent S: the selection's sources are asked politely and kept (scripts/select-species-sources.ts):
 * an answer is saved before it is read, a second run asks nothing, an offline run asks nothing and names what is
 * missing, GBIF is asked at most once a second, and the header is the project's own. On the base the module is missing.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cached, gbifLiving, GAP_MS, type Cache } from '../../scripts/select-species-sources';
import { USER_AGENT } from '../../src/lib/dossier/fetch';

const dirs: string[] = [];
const cache = (offline = false): Cache => {
  const dir = mkdtempSync(join(tmpdir(), 'r78s-'));
  dirs.push(dir);
  return { dir, offline, asked: {}, missing: [] };
};
afterEach(() => {
  vi.unstubAllGlobals();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('the sources, kept and asked politely', () => {
  it('saves each answer, asks again for nothing, and sends the project header with no personal address', async () => {
    const calls: Array<{ url: string; at: number; ua: string }> = [];
    vi.stubGlobal('fetch', async (url: string, init: { headers: Record<string, string> }) => {
      calls.push({ url, at: Date.now(), ua: init.headers['user-agent'] });
      return new Response(JSON.stringify({ n: calls.length }), { status: 200 });
    });
    const c = cache();
    expect(await cached(c, 'gbif/a.json', 'https://api.gbif.org/v1/a')).toEqual({ n: 1 });
    expect(await cached(c, 'gbif/b.json', 'https://api.gbif.org/v1/b')).toEqual({ n: 2 });
    expect(await cached(c, 'gbif/a.json', 'https://api.gbif.org/v1/a')).toEqual({ n: 1 }); // kept: not asked again
    expect(calls.length).toBe(2);
    expect(existsSync(join(c.dir, 'gbif/a.json'))).toBe(true);
    expect(c.asked).toEqual({ 'api.gbif.org': 2 });
    // At most one request a second to GBIF.
    expect(GAP_MS['api.gbif.org']).toBeGreaterThanOrEqual(1000);
    expect(GAP_MS['api.inaturalist.org']).toBeGreaterThanOrEqual(2000);
    expect(calls[1].at - calls[0].at).toBeGreaterThanOrEqual(GAP_MS['api.gbif.org'] - 20);
    expect(calls[0].ua).toBe(USER_AGENT);
    expect(USER_AGENT).not.toMatch(/gmail|yahoo|hotmail|outlook/i);
  });
  it('offline, asks nothing and lists what is missing', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const c = cache(true);
    expect(await cached(c, 'inat/page-001.json', 'https://api.inaturalist.org/v1/x')).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect(c.missing).toEqual(['inat/page-001.json']);
  });
  it('never keeps an answer that is not JSON, and stops on a refusal without saving it', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>Just a moment...</html>', { status: 200 }));
    const c = cache();
    await expect(cached(c, 'x.json', 'https://api.gbif.org/v1/x')).rejects.toThrow();
    expect(existsSync(join(c.dir, 'x.json'))).toBe(false);
    vi.stubGlobal('fetch', async () => new Response('{"error":"Internal Server Error"}', { status: 404 }));
    await expect(cached(c, 'y.json', 'https://api.gbif.org/v1/y')).rejects.toThrow(/HTTP 404/);
    expect(existsSync(join(c.dir, 'y.json'))).toBe(false);
  });
  it("reads every living-specimen dataset, its publisher and its records by species, from the kept files", async () => {
    const answers: Record<string, unknown> = {
      'occurrence/search?kingdomKey=6&basisOfRecord=LIVING_SPECIMEN&limit=0&facet=datasetKey': { count: 7, facets: [{ field: 'DATASET_KEY', counts: [{ name: 'd1', count: 7 }] }] },
      'dataset/d1': { key: 'd1', title: 'Living plant collection of Meise Botanic Garden', publishingOrganizationKey: 'o1' },
      'organization/o1': { title: 'Meise Botanic Garden' },
      'datasetKey=d1': { count: 7, facets: [{ field: 'SPECIES_KEY', counts: [{ name: '2777724', count: 5 }, { name: '5362063', count: 2 }] }] }
    };
    vi.stubGlobal('fetch', async (url: string) => {
      const hit = Object.keys(answers).find((k) => url.includes(k) && (k !== 'occurrence/search?kingdomKey=6&basisOfRecord=LIVING_SPECIMEN&limit=0&facet=datasetKey' || url.includes('facet=datasetKey')));
      return new Response(JSON.stringify(hit ? answers[hit] : {}), { status: 200 });
    });
    const c = cache();
    const r = await gbifLiving(c, () => {});
    expect(r.total).toBe(7);
    expect(r.datasets).toHaveLength(1);
    expect(r.datasets[0].publisher).toBe('Meise Botanic Garden');
    expect([...r.datasets[0].species!]).toEqual([['2777724', 5], ['5362063', 2]]);
    expect(JSON.parse(readFileSync(join(c.dir, 'gbif/species/d1-0.json'), 'utf8')).count).toBe(7);
  }, 20_000);
});
