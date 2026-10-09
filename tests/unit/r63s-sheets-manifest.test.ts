/**
 * Round sixty-three, agent S (S5): `sheetsIn`'s fallback, left in round fifty-nine ("reads dossiers as the bucket holds
 * them now; it runs only when a bucket's sheet file is missing"). Under a manifest the build always writes every bucket's
 * sheet file (the manifest is refused without them), so a sheet file that cannot be read there is a fault of the store,
 * and deriving the bucket from the dossiers read them as the store holds them now, which after an upload is another
 * corpus than the one the request holds, at a few hundred reads. Now it is refused, said as a refusal (rule 2), and
 * asked again shortly; only a corpus with no manifest (the fixture corpus) derives its buckets.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { sheetsIn, SheetsUnreadable, _forgetRefusedSheets } from '$lib/server/sheets';
import { corpusNow } from '$lib/server/dossiers';

beforeEach(() => _forgetRefusedSheets());

describe("a bucket's sheet file that cannot be read under a manifest", () => {
  it('is refused, and no dossier is read', async () => {
    const asked: string[] = [];
    const fetch = (async (u: string) => { asked.push(String(u)); return new Response('', { status: 404 }); }) as unknown as typeof globalThis.fetch;
    const platform = { env: {} } as never;
    const c0 = await corpusNow(platform, fetch);
    const b = '00';
    const c = { ...c0, manifest: { files: { [`sheets/${b}.json`]: 'a'.repeat(16) } } };
    asked.length = 0;
    const r = await sheetsIn(c as never, platform, fetch, b).catch((e) => e);
    expect(r).toBeInstanceOf(SheetsUnreadable);
    expect(asked.filter((u) => !u.includes('a'.repeat(16)))).toEqual([]); // the product file alone was asked for
  });

  it('GUARD: a corpus with no manifest still derives its buckets from the dossiers', async () => {
    const fetch = (async () => new Response('', { status: 404 })) as unknown as typeof globalThis.fetch;
    const platform = { env: {} } as never;
    const c = await corpusNow(platform, fetch);
    expect(c.manifest ?? null).toBeNull();
    const all = await Promise.all(['00', '01', '02', '03'].map((b) => sheetsIn(c, platform, fetch, b)));
    expect(all.flat().length).toBeGreaterThan(0);
  });
});
