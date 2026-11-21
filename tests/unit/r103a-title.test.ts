/**
 * Round 103 (docs/PLAN-103.md, c; the launch review's round 2): every species page has a descriptive title, within 60
 * characters before " · Cultifolio" where a true description fits, and never its name alone. The names are the page's own
 * (a common name only where the page holds one), never cut.
 *
 * On f7f2867: a page without a habitat climate was titled by its name alone ("Lithops lesliei"), and Echeveria elegans's
 * title ran to 73 characters: the tests below marked "f7f2867" FAILED.
 *
 * The audit over a built index runs only with INDEX=<path>: INDEX=static/s/v3/index.json npx vitest run tests/unit/r103a-title.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { speciesTitle, TITLE_ROOM, type HeadInput } from '$lib/ui/ref/head';

const months = (dli: boolean) => Array.from({ length: 12 }, () => ({ tmax: 25, tmin: 10, precipMm: 30, ...(dli ? { dli: 30 } : {}) }));
const page = (o: Partial<HeadInput> & { sci: string }): HeadInput => ({
  name: { scientific: o.sci },
  common: o.common ?? null,
  climate: o.climate ?? { status: 'ok', months: months(true), extremes: { minP01: 2, years: 40 } },
  native: o.native ?? 1,
  photos: o.photos ?? 10,
  summary: false
});

describe('r103a: a descriptive title on every species page', () => {
  it('f7f2867: a page with no habitat climate is described by what it holds, not titled by its name alone', () => {
    expect(speciesTitle(page({ sci: 'Lithops lesliei', climate: { status: 'none' }, photos: 36, native: 4 }))).toBe('Lithops lesliei: native range and photographs');
    expect(speciesTitle(page({ sci: 'Refusia testii', climate: { status: 'refused' }, photos: 0 }))).toBe('Refusia testii: native range');
    expect(speciesTitle(page({ sci: 'Pendia lenta', climate: { status: 'pending' }, native: 0 }))).toBe('Pendia lenta: photographs');
    expect(speciesTitle(page({ sci: 'Nullia nihil', climate: { status: 'none' }, native: 0, photos: 0 }))).toBe('Nullia nihil: names and registers');
  });

  it('f7f2867: a long title takes the description that fits in 60 characters', () => {
    const t = speciesTitle(page({ sci: 'Echeveria elegans', common: 'Mexican snowball' }));
    expect(t).toBe('Echeveria elegans (Mexican snowball): habitat climate');
    expect(t.length).toBeLessThanOrEqual(TITLE_ROOM);
    // Within the room, the full list as before.
    expect(speciesTitle(page({ sci: 'Copiapoa cinerea' }))).toBe('Copiapoa cinerea: habitat rain, cold nights and light');
    expect(speciesTitle(page({ sci: 'Copiapoa cinereax', common: 'Grey' }))).toBe('Copiapoa cinereax (Grey): habitat climate and photographs');
  });

  it('where nothing fits, the shortest true description is added and the names are never cut', () => {
    const sci = 'Turbinicarpus pseudomacrochele subsp. krainzianus';
    const common = 'Krainz\'s tiny pincushion';
    const t = speciesTitle(page({ sci, common }));
    expect(t).toBe(`${sci} (${common}): habitat climate`);
    expect(speciesTitle(page({ sci, common, climate: { status: 'none' }, photos: 0 }))).toBe(`${sci} (${common}): native range`);
  });

  it('a common name only where the page holds one, and not the genus again', () => {
    expect(speciesTitle(page({ sci: 'Welwitschia mirabilis', common: 'Welwitschia' }))).toBe('Welwitschia mirabilis: habitat rain, cold nights and light');
    expect(speciesTitle(page({ sci: 'Lithops lesliei', climate: { status: 'none' } }))).not.toContain('(');
  });

  it('each part is true of the page: no light without DLI, no cold nights without the extremes, no photographs without one', () => {
    expect(speciesTitle(page({ sci: 'Copiapoa cinerea', climate: { status: 'ok', months: months(false), extremes: null } }))).toBe('Copiapoa cinerea: habitat rain');
    const long = speciesTitle(page({ sci: 'Echeveria elegans', common: 'Mexican snowballs', photos: 0 }));
    expect(long).not.toContain('photographs');
  });

  it.skipIf(!process.env.INDEX)('audit: on a built index, no title is a name alone, and how many fit in 60', () => {
    const idx = JSON.parse(readFileSync(process.env.INDEX!, 'utf8')) as Array<{ name: string; common?: string | string[]; climate: string; photos?: number; origin?: string[] }>;
    let within = 0;
    for (const r of idx) {
      const common = Array.isArray(r.common) ? r.common[0] : r.common;
      const t = speciesTitle(page({ sci: r.name, common: common ?? null, climate: r.climate === 'ok' ? undefined : { status: r.climate }, photos: r.photos ?? 0, native: r.origin?.length ?? 0 }));
      expect(t, r.name).toMatch(/: [a-z]/);
      if (t.length <= TITLE_ROOM) within++;
    }
    console.log(`r103a audit: ${idx.length} pages, every one described; ${within} within ${TITLE_ROOM} characters, ${idx.length - within} longer (the names and the shortest true description together pass it)`);
  });
});
