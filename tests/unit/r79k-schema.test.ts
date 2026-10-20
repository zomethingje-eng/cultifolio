/**
 * Round seventy-nine (K): a page without a GBIF key (the owner's decision 1). The dossier's `ids.gbif` is optional, in
 * version 3 still; the fixture Hesperocyparis lusitanica (k457911), built from Kew's file, parses, and its sheet, its
 * index entry and every reader of a GBIF key see the key's absence as the one sign (`$core/no-gbif`), and say "not checked"
 * with why, never "none". FAILED on r79base: `ids.gbif` was required, so the fixture did not parse, and
 * `$core/no-gbif` did not exist.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDossier, DOSSIER_V } from '../../src/lib/dossier/schema';
import { sheetOf } from '../../src/lib/dossier/sheet';
import { noGbif, NO_GBIF_WHY, NO_GBIF_CLIMATE } from '../../src/lib/core/no-gbif';
import { cultivationSheet } from '../../src/lib/core/sheet';
import { careLine, generatedNote } from '../../src/lib/core/note';
import { speciesDescription } from '../../src/lib/ui/ref/head';
import { catalogueFrom } from '../../src/lib/dossier/catalogue';

const raw = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k457911.json', 'utf8'));
const index = JSON.parse(readFileSync('fixtures/dossiers/index.json', 'utf8')) as Array<{ key: string; gbif?: number; climate: string; name: string }>;

describe('a dossier without a GBIF key', () => {
  it('parses in version 3, its id Kew\'s, with no GBIF key and no GBIF link', () => {
    const d = parseDossier(raw);
    expect(DOSSIER_V).toBe(3);
    expect(d.key).toBe('k457911');
    expect(d.ids.gbif).toBeUndefined();
    expect(d.links.gbif).toBeUndefined();
    expect(noGbif(d)).toBe(true);
    expect(noGbif(parseDossier(JSON.parse(readFileSync('fixtures/dossiers/s/v3/k2735933.json', 'utf8'))))).toBe(false);
  });
  it('records every GBIF source as not asked, with why, never none, and the climate pending with why', () => {
    const d = parseDossier(raw);
    for (const k of ['gbif.species', 'gbif.synonyms', 'gbif.vernacular', 'gbif.occurrences', 'gbif.media']) expect(d.upstream[k]).toMatchObject({ status: 'skipped', detail: NO_GBIF_WHY });
    expect(d.upstream.climate).toMatchObject({ status: 'skipped', detail: NO_GBIF_CLIMATE });
    expect(d.climate).toEqual({ status: 'pending', detail: NO_GBIF_CLIMATE });
    expect(Object.values(d.upstream).some((u) => u.status === 'none' && /gbif/i.test(u.detail ?? ''))).toBe(false);
    expect(d.upstream['kew.names']).toMatchObject({ status: 'ok', asOf: '2026-06-04' });
    expect(d.occurrences).toMatchObject({ open: [], nOpenInRange: 0, rangeTested: false });
    expect(d.centroid).toBeUndefined();
  });
  it('keeps the GBIF key out of its sheet and index entry, so a plant\'s key is compared with none', () => {
    const s = sheetOf(parseDossier(raw));
    expect('gbif' in s).toBe(false);
    expect(noGbif(s)).toBe(true);
    const e = index.find((x) => x.key === 'k457911')!;
    expect(e && !('gbif' in e)).toBe(true);
    expect(noGbif(e)).toBe(true);
    // Every other fixture page keeps its key.
    expect(index.filter((x) => x.key !== 'k457911').every((x) => typeof x.gbif === 'number')).toBe(true);
  });
  it('says the habitat climate was not checked, with why, on the sheet, the care line, the note and the head', () => {
    const sheet = cultivationSheet({ scientific: 'Hesperocyparis lusitanica', family: 'Cupressaceae', climateStatus: 'unchecked', months: null });
    expect(JSON.stringify(sheet)).not.toMatch(/pending/);
    expect(careLine({ scientific: 'Hesperocyparis lusitanica', climateStatus: 'unchecked', months: null })).toBe('climate not checked');
    const note = generatedNote({ scientific: 'Echeveria x', family: 'Crassulaceae', climateStatus: 'unchecked', months: null });
    if (note) expect(note.text).toContain("GBIF's records were not asked");
    expect(speciesDescription({ name: { scientific: 'Hesperocyparis lusitanica', family: 'Cupressaceae' }, common: null, climate: { status: 'unchecked' }, native: 11, photos: 0, summary: false } as never)).toContain('habitat climate not checked');
  });
  it('counts such a page as not checked in its catalogue row, never as pending', () => {
    const items = index.map((e) => ({ ...e, slug: e.name.toLowerCase().replace(/ /g, '-'), photos: 0, open: 0 })) as never[];
    const c = catalogueFrom(items, 'family', items.length, 2);
    const row = c.rows.find((r) => r.label === 'Cupressaceae')!;
    expect(row).toMatchObject({ count: 1, notChecked: 1, pending: 0 });
    // Welwitschia's climate is pending by a build still to run, and stays so.
    expect(c.rows.find((r) => r.label === 'Welwitschiaceae')).toMatchObject({ pending: 1, notChecked: 0 });
  });
});
