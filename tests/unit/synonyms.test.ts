import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/dossiers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/dossiers')>()),
  getIndex: async () => [
    { key: 2776776, slug: 'haworthiopsis-attenuata', name: 'Haworthiopsis attenuata', photos: 0, open: 0, climate: 'ok' },
    { key: 4201127, slug: 'tylecodon-paniculatus', name: 'Tylecodon paniculatus', photos: 0, open: 0, climate: 'ok', syn: ['Cotyledon paniculata', 'Cotyledon tardiflora'] }
  ]
}));

import { nameFromSlug, synonymOf, synonymInIndex } from '$lib/server/synonyms';

const gbif = (body: unknown) => (async (_url: string) => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

describe('an old name at a species address (round thirty, R2-8)', () => {
  it('turns a slug back into a name the backbone can match', () => {
    expect(nameFromSlug('haworthia-attenuata')).toBe('Haworthia attenuata');
    expect(nameFromSlug('haworthia-attenuata-var-radula')).toBe('Haworthia attenuata var. radula');
    expect(nameFromSlug('')).toBe('');
  });
  it('a synonym whose accepted species is in the reference gives its slug; one whose accepted species is not gives the name; an accepted or unknown name gives nothing', async () => {
    const asked: string[] = [];
    // the reply as the live service gives it: `status: "SYNONYM"`, no `synonym` boolean
    const f = (url: string) => { asked.push(url); return gbif({ usageKey: 2780322, acceptedUsageKey: 2776776, status: 'SYNONYM', confidence: 100, matchType: 'EXACT', canonicalName: 'Haworthia attenuata', species: 'Haworthiopsis attenuata', speciesKey: 2776776 })(url); };
    const a = await synonymOf(undefined, f as unknown as typeof fetch, 'haworthia-attenuata', undefined, null);
    expect(a).toEqual({ matched: 'Haworthia attenuata', acceptedKey: 2776776, acceptedName: 'Haworthiopsis attenuata', slug: 'haworthiopsis-attenuata' });
    expect(asked[0]).toContain('kingdom=Plantae');
    expect(asked[0]).toContain('name=Haworthia%20attenuata');
    const b = await synonymOf(undefined, gbif({ synonym: true, matchType: 'EXACT', canonicalName: 'Cotyledon paniculata', species: 'Tylecodon paniculatus', acceptedUsageKey: 99 }), 'cotyledon-paniculata', undefined, null);
    expect(b).toMatchObject({ slug: null, acceptedName: 'Tylecodon paniculatus' });
    expect(await synonymOf(undefined, gbif({ status: 'ACCEPTED', matchType: 'EXACT', usageKey: 5 }), 'aloe-vera', undefined, null)).toBeNull();
    expect(await synonymOf(undefined, gbif({ matchType: 'NONE' }), 'nosuch-plant', undefined, null)).toBeNull();
    expect(await synonymOf(undefined, gbif({ synonym: true, matchType: 'HIGHERRANK', acceptedUsageKey: 2776776, species: 'x' }), 'haworthia-attenuata', undefined, null)).toBeNull(); // a match at a higher rank is not this name
    expect(await synonymOf(undefined, gbif({}), 'haworthia', undefined, null)).toBeNull(); // a bare genus is not asked
    // A service that does not answer is not a name that is no synonym (round fifty-nine)
    expect(await synonymOf(undefined, (async () => new Response('busy', { status: 503 })) as unknown as typeof fetch, 'haworthia-attenuata', undefined, null)).toBe('unchecked');
    expect(await synonymOf(undefined, (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch, 'haworthia-attenuata', undefined, null)).toBe('unchecked');
  });
  it('a name the index lists under a species is answered from the index, with no request (round thirty-two, 2)', async () => {
    const asked: string[] = [];
    const f = (url: string) => { asked.push(url); return gbif({ matchType: 'HIGHERRANK', usageKey: 2406, canonicalName: 'Crassulaceae' })(url); }; // what the live service says to "Cotyledon paniculata"
    const a = await synonymInIndex(undefined, f as unknown as typeof fetch, 'cotyledon-paniculata');
    expect(a).toEqual({ matched: 'Cotyledon paniculata', acceptedKey: 4201127, acceptedName: 'Tylecodon paniculatus', slug: 'tylecodon-paniculatus' });
    expect(asked).toEqual([]);
    expect(await synonymInIndex(undefined, f as unknown as typeof fetch, 'cotyledon-nosuch')).toBeNull();
    expect(await synonymInIndex(undefined, f as unknown as typeof fetch, 'tylecodon')).toBeNull();
    // the backbone alone would have made this a 404
    expect(await synonymOf(undefined, f as unknown as typeof fetch, 'cotyledon-paniculata', undefined, null)).toBeNull();
  });
});
