/**
 * Round eighty-one, H (review-w 3, review-d 3): every hybrid of the reference loses its sign, and some their POWO and IPNI
 * links. Kew's names with their sign, by page id (`$core/hybrids`, made by `scripts/hybrid-names.ts`), are shown on the
 * page and written into the index by `--index`; the address and the matching read the name without it.
 *
 * On r81base every case here fails: `$core/hybrids` does not exist, the index's maps key the name as written (a signed
 * entry was not found under "mentha piperita"), a genus row put "Mentha × piperita" before "Mentha aquatica", and
 * `/species/mentha-x-piperita` was a 404 (it was asked of GBIF as "Mentha x piperita").
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { hybridOf, signedName, hybridLinks, signEntries, hybridCount, unsigned, HYBRIDS_KEW_DAY, withKewLinks } from '$core/hybrids';
import { nameOrder, withoutSign, slugify } from '$core/names';
import { listHybrids } from '../../scripts/hybrid-names';
import { indexMaps, plainName, buildOlderFiles } from '$dossier/lookups';
import { indexLookup, addressOf } from '$lib/server/lookup';
import type { IndexEntry } from '$dossier/index-entry';
import type { PageId } from '$core/page-id';

const list = listHybrids(readFileSync('scripts/species-list.txt', 'utf8'));
const table = JSON.parse(readFileSync('src/lib/core/hybrids.json', 'utf8')) as { rows: Record<string, { name: string; ipni?: string; powo?: string; parents?: string }> };

describe('the table is the species list’s hybrids, by Kew’s plant_name_id', () => {
  it('485 hybrids, 473 nothospecies and 12 nothogenera, each under the list’s own name', () => {
    expect(list.size).toBe(485);
    expect(hybridCount()).toBe(485);
    expect(Object.keys(table.rows).sort()).toEqual([...list.keys()].sort());
    for (const [id, name] of list) expect(table.rows[id].name).toBe(name);
    expect(Object.values(table.rows).filter((r) => r.name.startsWith('× ')).length).toBe(12);
  });
  it('Kew’s file gives each the same name, a hybrid marker, acceptance and the numbers kept (where Kew’s file is here)', async () => {
    const csv = ['bulk/wcvp_names.csv', '/home/claude/r73data/bulk/wcvp_names.csv'].find((p) => existsSync(p));
    if (!csv) return; // the owner's PC and this sandbox have it; a checkout without Kew's file checks the list alone
    const rl = createInterface({ input: createReadStream(csv, { encoding: 'utf8' }), crlfDelay: Infinity });
    let h: string[] | null = null;
    let seen = 0;
    for await (const line of rl) {
      const c = line.split('|');
      if (!h) { h = c; continue; }
      const r = table.rows[c[0]];
      if (!r) continue;
      const row = Object.fromEntries(h.map((k, i) => [k, c[i] ?? '']));
      expect(row.taxon_name).toBe(r.name);
      expect(row.genus_hybrid === '×' || row.species_hybrid === '×').toBe(true);
      expect(row.taxon_status).toBe('Accepted');
      expect(r.ipni ?? '').toBe(row.ipni_id);
      expect(r.powo ?? '').toBe(row.powo_id);
      seen++;
    }
    expect(seen).toBe(485);
  }, 120_000);
});

describe('the name a page shows', () => {
  it('a hybrid page shows Kew’s name with its sign; another page, or another name on that page, is as it is', () => {
    expect(signedName('k125188', 'Mentha piperita')).toBe('Mentha × piperita');
    expect(signedName('k524742', 'Astrolista bicarinata')).toBe('× Astrolista bicarinata');
    expect(signedName('k125188', 'Mentha × piperita')).toBe('Mentha × piperita'); // twice is once
    expect(signedName('k125188', 'Mentha spicata')).toBe('Mentha spicata'); // the page rebuilt under another name keeps it
    expect(signedName('k2781020', 'Echeveria affinis')).toBe('Echeveria affinis');
    expect(signedName('g8707933', 'Mentha piperita')).toBe('Mentha piperita'); // only a Kew entry's page
    expect(hybridOf('k125188')?.parents).toBe('M. aquatica × M. spicata');
    expect(unsigned('× Astrolista bicarinata')).toBe('Astrolista bicarinata');
  });
  it('the reviewers’ examples (review-d 3) all carry the sign', () => {
    const want: Record<string, string> = { 'Citrus limon': 'Citrus × limon', 'Fragaria ananassa': 'Fragaria × ananassa', 'Musa paradisiaca': 'Musa × paradisiaca', 'Lavandula intermedia': 'Lavandula × intermedia', 'Aloe schimperi': 'Aloe × schimperi', 'Brassarda juncea': '× Brassarda juncea' };
    const byName = new Map(Object.entries(table.rows).map(([id, r]) => [withoutSign(r.name), { id, r }]));
    for (const [plain, signed] of Object.entries(want)) {
      const x = byName.get(plain)!;
      expect(signedName(`k${x.id}`, plain)).toBe(signed);
    }
  });
  it('Kew’s numbers link a hybrid whose record has neither; a "-4" number opens POWO and is never an IPNI record', () => {
    const fragaria = Object.entries(table.rows).find(([, r]) => r.name === 'Fragaria × ananassa')!;
    expect(fragaria[1].ipni).toBe('30117681-2'); // review-d 3's own reading of Kew's file
    expect(hybridLinks(`k${fragaria[0]}`)).toEqual({ ipni: '30117681-2', powo: 'urn:lsid:ipni.org:names:30117681-2' });
    expect(hybridLinks('k2647165')).toEqual({ powo: 'urn:lsid:ipni.org:names:2647165-4' });
    expect(hybridLinks('k2781020')).toEqual({});
  });
});

const entry = (key: string, name: string, slug = slugify(withoutSign(name))): IndexEntry => ({ key: key as PageId, slug, name, origin: [], photos: 0, open: 0, climate: 'ok' }) as IndexEntry;

describe('the index with the sign: found by the name without it, ordered as a checklist orders it', () => {
  const plainIndex = [entry('k2807641', 'Mentha aquatica'), entry('k125606', 'Mentha longifolia'), entry('k125188', 'Mentha piperita'), entry('k125890', 'Mentha pulegium'), entry('k524742', 'Astrolista bicarinata'), entry('k99', 'Astroloba corrugata')];
  const index = signEntries(plainIndex);
  it('`--index` signs the hybrids’ entries and no other, in the same order, the slugs as they were', () => {
    expect(index.map((e) => e.name)).toEqual(['Mentha aquatica', 'Mentha longifolia', 'Mentha × piperita', 'Mentha pulegium', '× Astrolista bicarinata', 'Astroloba corrugata']);
    expect(index.map((e) => e.slug)).toEqual(plainIndex.map((e) => e.slug));
    expect(index[0]).toBe(plainIndex[0]); // an entry it does not sign is the same object
  });
  it('the accepted-name map keys every name without the sign, so a name asked without it finds the hybrid', () => {
    const m = indexMaps(index);
    expect(m.byName.get('mentha piperita')?.key).toBe('k125188');
    expect(m.byName.get('astrolista bicarinata')?.key).toBe('k524742');
    expect(m.byName.has('mentha × piperita')).toBe(false);
    expect(plainName('Mentha × piperita')).toBe('mentha piperita');
    expect(m.byGenus.get('Mentha')!.map((e) => e.name)).toEqual(['Mentha aquatica', 'Mentha longifolia', 'Mentha × piperita', 'Mentha pulegium']);
    expect(m.byGenus.get('Astrolista')!.map((e) => e.key)).toEqual(['k524742']);
    // the name files the Worker reads carry the same keys
    const older = buildOlderFiles(index);
    const keys = [...older.values()].flatMap((f) => Object.keys(f));
    expect(keys).toContain('mentha piperita');
    expect(keys.some((k) => k.includes('×'))).toBe(false);
  });
  it('names in order past the sign', () => {
    expect(['Mentha spicata', 'Mentha × piperita', 'Mentha aquatica'].sort(nameOrder)).toEqual(['Mentha aquatica', 'Mentha × piperita', 'Mentha spicata']);
    expect(['Astroloba corrugata', '× Astrolista bicarinata'].sort(nameOrder)).toEqual(['× Astrolista bicarinata', 'Astroloba corrugata']);
  });
  it('an address written with the sign moves to the page’s own, which is without it', async () => {
    const look = indexLookup(index);
    expect(await addressOf(look, 'mentha-x-piperita')).toEqual({ kind: 'move', slug: 'mentha-piperita' });
    expect(await addressOf(look, 'x-astrolista-bicarinata')).toEqual({ kind: 'move', slug: 'astrolista-bicarinata' });
    expect(await addressOf(look, 'mentha-piperita')).toEqual({ kind: 'page', key: 'k125188' });
    expect((await addressOf(look, 'mentha-x-nonsense')).kind).not.toBe('move');
  });
});

describe('/about/how says what the table holds', () => {
  it('the count and the day of Kew’s file are the table’s', () => {
    const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8');
    const m = /\((\d+) hybrids, from Kew's file of (\d{4}-\d{2}-\d{2})\)/.exec(how);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(hybridCount());
    expect(m![2]).toBe(HYBRIDS_KEW_DAY);
  });
});

describe('the live pages’ records (copies the reviewers read on 2026-10-23, review-d 3)', () => {
  const live = JSON.parse(readFileSync('tests/unit/fixtures/r81h-live-hybrids.json', 'utf8')) as Record<string, { key: string; name: string; ids: { ipni?: string; powo?: string }; links: Record<string, string> }>;
  it('28 hybrid pages: each is shown with its sign; the 7 that linked neither POWO nor IPNI link Kew’s entry, the 21 others as they were', () => {
    const pages = Object.values(live);
    expect(pages.length).toBe(28);
    const unlinked = pages.filter((d) => !d.ids.ipni && !d.ids.powo);
    expect(unlinked.map((d) => signedName(d.key, d.name)).sort()).toEqual(['Adiantum × tracyi', 'Drosera × hybrida', 'Fragaria × ananassa', 'Sarracenia × farnhamii', 'Sarracenia × flavopurpurea', 'Solidago × lutea', 'Utricularia × neglecta']);
    for (const d of pages) {
      expect(signedName(d.key, d.name)).toContain('×');
      const w = withKewLinks(d.key, d.ids, d.links);
      if (unlinked.includes(d)) {
        expect(w.kew).toBe(true);
        expect(w.links.powo).toBe(`https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:${hybridOf(d.key)!.powo}`);
        expect(w.links.ipni).toBe(`https://www.ipni.org/n/${hybridOf(d.key)!.ipni}`);
        expect(Object.keys(w.links).slice(0, 3)).toEqual(['gbif', 'powo', 'ipni'].filter((k) => k !== 'gbif' || !!d.links.gbif));
      } else expect(w).toEqual({ ids: d.ids, links: d.links, kew: false });
    }
  });
});
