/**
 * Round eighty-one, agent A: the owner's decision on review D2. A page's care group is taken only where Kew's lifeform for
 * the species (the dossier's `distribution.kew`) agrees with the table's listing; otherwise no group. The four group
 * temperatures (tropical foliage 12 °C, orchid 13 °C, epiphyte 10 °C, fern or moss 5 °C) are gone from arch.ts, the
 * sheet, the label and /about/how.
 * FAILED on r81base: archFor took no Kew words, so groundsel (Senecio vulgaris, an annual) was "a cactus or succulent",
 * bitter melon a bulb, Ficus carica a tropical foliage plant; ARCH held `minC`; a Monstera with no climate printed
 * "group min 12 °C (convention, no source)" and /about/how listed the four figures.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { archFor, listedFor, ARCH } from '$core/arch';
import { cultivationSheet } from '$core/sheet';
import { careLine, careParts } from '$core/note';

// Kew's words for each, from wcvp_names.csv of 2026-06-04 (lifeform_description, climate_description).
const KEW: Record<string, [string, string, string, string]> = {
  'Senecio vulgaris': ['Asteraceae', 'annual', 'temperate', ''],
  'Euphorbia peplus': ['Euphorbiaceae', 'annual', 'temperate', ''],
  'Momordica charantia': ['Cucurbitaceae', 'climbing annual', 'wet tropical', ''],
  'Phyllanthus emblica': ['Phyllanthaceae', 'tree', 'wet tropical', ''],
  'Ficus carica': ['Moraceae', 'tree', 'temperate', ''],
  'Rhododendron ponticum': ['Ericaceae', 'shrub or tree', 'temperate', 'temperate'],
  'Copiapoa cinerea': ['Cactaceae', 'succulent subshrub', 'desert or dry shrubland', 'arid'],
  'Ficus elastica': ['Moraceae', 'tree', 'wet tropical', 'tropical'],
  'Tillandsia ionantha': ['Bromeliaceae', 'epiphyte', 'seasonally dry tropical', 'epiphyte'],
  'Phalaenopsis amabilis': ['Orchidaceae', 'epiphyte', 'wet tropical', 'orchid'],
  'Galanthus nivalis': ['Amaryllidaceae', 'bulbous geophyte', 'temperate', 'geophyte'],
  'Drosera capensis': ['Droseraceae', 'perennial', 'subtropical', 'carnivore'],
  'Brocchinia micrantha': ['Bromeliaceae', 'perennial or lithophyte', 'wet tropical', ''],
  'Brocchinia reducta': ['Bromeliaceae', 'perennial', 'wet tropical', 'carnivore']
};

describe('r81a D2: a group only where Kew agrees', () => {
  it('each listing stands or falls by Kew\'s lifeform (and, for the two climate groups, its climate)', () => {
    for (const [name, [family, lifeform, climate, want]] of Object.entries(KEW)) {
      expect(archFor(name, family, { lifeform, climate })?.arch.key ?? '', name).toBe(want);
    }
  });
  it('the table still lists the mixed genera; the page no longer takes them', () => {
    expect(listedFor('Senecio vulgaris', 'Asteraceae')?.arch.key).toBe('arid');
    expect(listedFor('Momordica charantia', 'Cucurbitaceae')?.arch.key).toBe('geophyte');
    expect(listedFor('Ficus carica', 'Moraceae')?.arch.key).toBe('tropical');
  });
  it('no Kew words, no group; semisucculent counts as succulent; subtropical is not tropical; a pseudobulb is no bulb', () => {
    expect(archFor('Copiapoa cinerea', 'Cactaceae', null)).toBeNull();
    expect(archFor('Copiapoa cinerea', 'Cactaceae', { climate: 'desert or dry shrubland' })).toBeNull();
    expect(archFor('Adenium obesum', 'Apocynaceae', { lifeform: 'semisucculent shrub' })?.arch.key).toBe('arid');
    expect(archFor('Adenium multiflorum', 'Apocynaceae', { lifeform: 'shrub' })).toBeNull();
    expect(archFor('Strelitzia reginae', 'Strelitziaceae', { lifeform: 'perennial', climate: 'subtropical' })).toBeNull();
    expect(archFor('Albuca spiralis', 'Asparagaceae', { lifeform: 'pseudobulbous geophyte' })?.arch.key).toBe('geophyte');
    expect(archFor('Albuca spiralis', 'Asparagaceae', { lifeform: 'pseudobulbous epiphyte' })).toBeNull();
  });
  it('the page says where the table lists it and what Kew says', () => {
    const { arch } = cultivationSheet({ scientific: 'Copiapoa cinerea', family: 'Cactaceae', kew: { lifeform: 'succulent subshrub', climate: 'desert or dry shrubland' } });
    expect(arch!.why).toBe('listed under the genus Copiapoa in the reference\'s list of growers\' groups, and Kew describes it as “succulent subshrub”');
    expect(cultivationSheet({ scientific: 'Senecio vulgaris', family: 'Asteraceae', kew: { lifeform: 'annual', climate: 'temperate' } }).arch).toBeNull();
  });
  it('the species page passes the dossier\'s Kew words to the sheet', () => {
    expect(readFileSync('src/routes/species/[slug]/+page.svelte', 'utf8')).toMatch(/const sheetIn = \$derived\(\{[^\n]*kew: d\.distribution\.kew \?\? null \}\);/);
  });
});

describe('r81a: the four group temperatures are removed', () => {
  it('no group carries a figure', () => {
    for (const a of Object.values(ARCH)) expect(Object.keys(a)).not.toContain('minC');
    expect(readFileSync('src/lib/core/arch.ts', 'utf8')).not.toMatch(/minC|conventionOf/);
  });
  it('with no climate there is no sheet row and no label figure, whatever the group', () => {
    for (const [name, family, lifeform, climate] of [['Monstera deliciosa', 'Araceae', 'climber', 'wet tropical'], ['Phalaenopsis amabilis', 'Orchidaceae', 'epiphyte', 'wet tropical'], ['Tillandsia ionantha', 'Bromeliaceae', 'epiphyte', 'seasonally dry tropical'], ['Nephrolepis exaltata', 'Nephrolepidaceae', 'perennial', 'wet tropical']]) {
      const kew = { lifeform, climate };
      expect(cultivationSheet({ scientific: name, family, kew }).rows, name).toEqual([]);
      expect(careLine({ scientific: name, family, kew, climateStatus: 'none' }), name).toBe('');
    }
  });
  it('the species page, the labels page and /about/how say no figure', () => {
    const page = readFileSync('src/routes/species/[slug]/+page.svelte', 'utf8');
    expect(page).not.toMatch(/convention\.text|minC/);
    expect(readFileSync('src/routes/labels/+page.svelte', 'utf8')).not.toMatch(/conventionLines|convention, no source/);
    const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8');
    expect(how).not.toMatch(/tropical foliage plant 12 °C|orchid 13 °C|epiphyte 10 °C|fern or moss 5 °C|<b>Convention<\/b>|group's convention instead/);
    expect(how).toContain("a page takes its listing only where Kew's own description of the species");
  });
});

describe('r81a W6: the label line as whole clauses', () => {
  it('careParts is careLine in clauses, each a figure with its source', () => {
    const m = Array.from({ length: 12 }, (_, i) => ({ tmax: 26 - Math.abs(6 - i), tmin: 14 - Math.abs(6 - i), tmean: 20 - Math.abs(6 - i), precipMm: i >= 4 && i <= 7 ? 40 : 3, dli: 20 + 3 * i, rh: 55 }));
    const input = { scientific: 'Tylecodon pearsonii', family: 'Crassulaceae', months: m, lat: -30, extremes: { minAbs: 1.2, minP01: 4.1, maxP99: 38, frostDaysPerYear: 0, years: 44 } };
    const parts = careParts(input);
    expect(parts.length).toBe(3);
    expect(parts.join(' · ')).toBe(careLine(input));
    expect(parts[1]).toBe('floor 4.1 °C (1 in 100, NASA POWER)');
    for (const p of parts) expect(p).not.toContain(' · ');
  });
  it('the labels page shows them as clauses fitted whole, not a line clamped to an ellipsis', () => {
    const src = readFileSync('src/routes/labels/+page.svelte', 'utf8');
    expect(src).toMatch(/use:fitClauses/);
    expect(src).not.toMatch(/\.care \{[^}]*line-clamp/);
  });
});
