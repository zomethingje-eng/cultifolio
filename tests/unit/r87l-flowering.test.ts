/**
 * Round eighty-seven, stage 2 (links agent), item 1: flowering by month. iNaturalist's research-grade, wild observations
 * annotated "Flowering" (term 12, value 13), one histogram request a taxon (`floweringUrl`), read into the page's
 * `flowering` with its day by `--fill flowering`, which resumes, stops at the day's allowance and records a page asked
 * and not answered as not checked; the page's strip says "not asked" until then, marks few records, and keeps the months
 * as observed. Each test fails on the base, where none of it exists.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import { floweringUrl, floweringMonths, FLOWERING_TERM } from '$dossier/sources/inat';
import { fillFlowering, floweringWanted, floweringLine, floweringLeft, heldBack, STOP_AFTER_FAILURES } from '$dossier/flowering';
import { dayBudget } from '$dossier/day-budget';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';
import { floweringView, floweringMonthsWords } from '$lib/ui/ref/links-words';
import { Dossier as DossierSchema } from '$dossier/schema';
import * as v from 'valibot';
import Flowering from '$lib/ui/ref/Flowering.svelte';

const answer = (m: number[]) => ({ total_results: 12, page: 1, per_page: 12, results: { month_of_year: Object.fromEntries(m.map((n, i) => [String(i + 1), n])) } });
const page = (key: string, inat?: number, extra: Record<string, unknown> = {}) => ({ key, name: { scientific: `Plant ${key}` }, ids: inat ? { inat } : {}, ...extra });
const memStore = (pages: Record<string, unknown>) => {
  const m = new Map(Object.entries(pages).map(([k, d]) => [k, structuredClone(d)]));
  return { m, files: () => [...m.keys()], read: <T,>(f: string) => structuredClone(m.get(f)) as T, write: (f: string, d: unknown) => void m.set(f, structuredClone(d)) };
};
const html = (props: Record<string, unknown>) => render(Flowering, { props: props as never }).body.replace(/<!--[^]*?-->/g, '').replace(/\s+/g, ' ');

describe('the request: the histogram the brief names, research grade, wild', () => {
  it('asks month_of_year of observed dates for the Flowering annotation, not captive, research grade', () => {
    const u = new URL(floweringUrl(48845));
    expect(u.origin + u.pathname).toBe('https://api.inaturalist.org/v1/observations/histogram');
    expect(Object.fromEntries(u.searchParams)).toEqual({ taxon_id: '48845', term_id: '12', term_value_id: '13', captive: 'false', quality_grade: 'research', date_field: 'observed', interval: 'month_of_year' });
    expect(FLOWERING_TERM).toEqual({ term: 12, value: 13 });
  });
  it("reads iNaturalist's answer (as asked of Plantae on 2026-11-09), January first, and refuses any other shape", () => {
    expect(floweringMonths({ total_results: 12, page: 1, per_page: 12, results: { month_of_year: { '1': 233014, '2': 298849, '3': 704932, '4': 1325100, '5': 1327908, '6': 1077286, '7': 941679, '8': 726886, '9': 606301, '10': 452920, '11': 272677, '12': 215051 } } })).toEqual([233014, 298849, 704932, 1325100, 1327908, 1077286, 941679, 726886, 606301, 452920, 272677, 215051]);
    expect(floweringMonths({ results: { month_of_year: { '1': 3 } } })).toBeNull();
    expect(floweringMonths({ error: 'Unknown taxon_id 48845', status: 422 })).toBeNull();
  });
});

describe('--fill flowering: resumable, with its day, under the day\'s allowance', () => {
  const day = '2026-11-09';
  it('reads each page with a taxon, writes its counts and day, passes by a page read, and says "not asked" for one with no taxon', async () => {
    const s = memStore({ 'k1.json': page('k1', 10), 'k2.json': page('k2'), 'k3.json': page('k3', 30, { flowering: { taxon: 30, months: Array(12).fill(1), read: '2026-11-01' } }) });
    const f = fixtureFetcher({ [floweringUrl(10)]: answer([0, 0, 1, 4, 9, 2, 0, 0, 0, 0, 0, 0]) });
    const c = await fillFlowering(s, f, day);
    expect(s.m.get('k1.json')).toMatchObject({ flowering: { taxon: 10, months: [0, 0, 1, 4, 9, 2, 0, 0, 0, 0, 0, 0], read: day } });
    expect((s.m.get('k2.json') as { flowering?: unknown }).flowering).toBeUndefined();
    expect((s.m.get('k3.json') as { flowering: { read: string } }).flowering.read).toBe('2026-11-01');
    expect(c).toMatchObject({ asked: 1, read: 1, noTaxon: 1, before: 1, unanswered: 0 });
    expect(floweringLine(c, day, floweringLeft(s))).toBe('  1 pages asked of iNaturalist on 2026-11-09: 1 read (0 with no flowering observation of a wild plant), 0 not answered; 1 read before and passed by; 1 with no iNaturalist taxon, not asked; 0 left to ask.');
  });
  it('a page whose taxon changed since its read is asked again; --again asks every page', () => {
    expect(floweringWanted({ ids: { inat: 5 }, flowering: { taxon: 4, months: Array(12).fill(0), read: 'x' } })).toBe(true);
    expect(floweringWanted({ ids: { inat: 5 }, flowering: { taxon: 5, months: Array(12).fill(0), read: 'x' } })).toBe(false);
    expect(floweringWanted({ ids: { inat: 5 }, flowering: { taxon: 5, months: Array(12).fill(0), read: 'x' } }, true)).toBe(true);
    expect(floweringWanted({ ids: {} })).toBe(false);
  });
  it('a page asked and not answered keeps the day and why ("not checked"), and is asked again by the next run', async () => {
    const s = memStore({ 'k1.json': page('k1', 10) });
    await fillFlowering(s, fixtureFetcher({ [floweringUrl(10)]: { __status: 'error', status: 'error', detail: 'api.inaturalist.org 500' } }), day);
    const d = s.m.get('k1.json') as { flowering: { unanswered?: string; months?: number[]; read: string } };
    expect(d.flowering).toEqual({ taxon: 10, read: day, unanswered: 'api.inaturalist.org 500' });
    expect(floweringWanted(d as never)).toBe(true);
    expect(floweringView({ ids: { inat: 10 }, flowering: d.flowering as never }).state).toBe('not-checked');
  });
  it('stops at the day\'s allowance as --fill credits does: nothing written for the page held back, and it is left to ask', async () => {
    const s = memStore({ 'k1.json': page('k1', 10), 'k2.json': page('k2', 20), 'k3.json': page('k3', 30) });
    const counts = new Map<string, number>();
    const inner = fixtureFetcher({ [floweringUrl(10)]: answer(Array(12).fill(2)), [floweringUrl(20)]: answer(Array(12).fill(3)), [floweringUrl(30)]: answer(Array(12).fill(4)) });
    const f = dayBudget(inner, 'api.inaturalist.org', 2, { read: (d) => counts.get(d) ?? 0, write: (d, n) => void counts.set(d, n) }, () => day);
    const c = await fillFlowering(s, f, day);
    expect(c.asked).toBe(2);
    expect(c.held).toMatch(/today's allowance of 2 requests is spent/);
    expect((s.m.get('k3.json') as { flowering?: unknown }).flowering).toBeUndefined();
    expect(floweringLeft(s)).toBe(1);
    expect(heldBack(c.held)).toBe(true);
  });
  it(`stops after ${STOP_AFTER_FAILURES} requests in a row not answered`, async () => {
    const pages = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`k${i + 1}.json`, page(`k${i + 1}`, i + 1)]));
    const s = memStore(pages);
    let asked = 0;
    const f: JsonFetcher = async () => { asked++; return { status: 'error', detail: 'api.inaturalist.org 502' } as never; };
    const c = await fillFlowering(s, f, day);
    expect(asked).toBe(STOP_AFTER_FAILURES);
    expect(c.held).toBe(`${STOP_AFTER_FAILURES} requests in a row not answered`);
  });
  it('the schema keeps the field (a dossier that carries it parses; one with eleven months does not)', () => {
    const base = { v: 3, key: 'k1', slug: 'x', built: 'x', builtBy: 'node', name: { scientific: 'X', status: 'accepted', synonyms: [], vernacular: [] }, ids: {}, distribution: { native: [], introduced: [], source: 'x', boxes: [] }, occurrences: { open: [], nOpenInRange: 0, nRestrictedInRange: 0, nOutsideRange: 0, restrictedShiftKm: null, thin: true, datasets: [] }, climate: { status: 'none' }, photos: [], literature: [], links: {}, upstream: {} };
    expect(v.parse(DossierSchema, { ...base, flowering: { taxon: 1, months: Array(12).fill(0), read: '2026-11-09' } }).flowering?.taxon).toBe(1);
    expect(() => v.parse(DossierSchema, { ...base, flowering: { taxon: 1, months: Array(11).fill(0), read: '2026-11-09' } })).toThrow();
  });
});

describe('the strip on the page', () => {
  const okClimate = (lat: number, used?: 'north' | 'south') => ({ status: 'ok', at: { lat, lon: 0 }, ...(used ? { hemispheres: { north: 5, south: 5, used } } : {}) });
  it('"Not asked" until filled, with why', () => {
    expect(html({ dossier: { ids: { inat: 7 } } })).toContain('Not asked: iNaturalist has not been asked for this page yet.');
    expect(html({ dossier: { ids: {} } })).toContain('Not asked: this page has no iNaturalist taxon to ask.');
    expect(html({ dossier: { ids: { inat: 7 }, flowering: { taxon: 6, months: Array(12).fill(1), read: 'x' } } })).toContain('Not asked');
  });
  it('twelve counts, January first, the caption with its source and day, the link to what was counted', () => {
    const h = html({ dossier: { ids: { inat: 7 }, flowering: { taxon: 7, months: [0, 0, 3, 9, 14, 6, 1, 0, 0, 0, 0, 0], read: '2026-11-09' } } });
    expect(h).toContain('Flowering observations of wild plants, iNaturalist, read 2026-11-09');
    expect(h.match(/<li\b/g)?.length).toBe(12);
    expect(h).toMatch(/<span class="n[^"]*">0<\/span>.*<span class="mo[^"]*">Jan<\/span>/);
    expect(h).toContain('https://www.inaturalist.org/observations?taxon_id=7&amp;term_id=12&amp;term_value_id=13&amp;captive=false&amp;quality_grade=research');
    expect(h).toContain('33 observations');
    expect(h).not.toContain('from few records');
  });
  it('the few-records rule: under 12 observations marked and shown as read', () => {
    const h = html({ dossier: { ids: { inat: 7 }, flowering: { taxon: 7, months: [0, 0, 1, 4, 3, 0, 0, 0, 0, 0, 0, 0], read: '2026-11-09' } } });
    expect(h).toContain('from few records: 8');
    expect(h).toContain('From few records: 8 observations; a page says so under 12, and shows the counts as read.');
    expect(h.match(/<li\b/g)?.length).toBe(12);
  });
  it('twelve zeros is iNaturalist\'s answer, said as that, never "none" or "does not flower"', () => {
    const h = html({ dossier: { ids: { inat: 7 }, flowering: { taxon: 7, months: Array(12).fill(0), read: '2026-11-09' } } });
    expect(h).toContain('No research-grade observation of a wild plant is annotated flowering on iNaturalist.');
    expect(h).not.toMatch(/does not flower|\bnone\b/i);
  });
  it('southern months: the calendar months as observed, never shifted, and said so (as the climate chart keeps the habitat\'s)', () => {
    const months = [9, 8, 7, 1, 0, 0, 0, 0, 2, 6, 9, 10];
    const south = floweringView({ ids: { inat: 7 }, flowering: { taxon: 7, months, read: 'x' }, climate: okClimate(-30) as never });
    expect(south.state === 'read' && south.months.map((m) => m.n)).toEqual(months);
    expect(south.state === 'read' && south.south).toBe(true);
    expect(floweringMonthsWords(true)).toBe('Calendar months, as each plant was observed; not moved to your hemisphere. The habitat lies south of the equator, where these months fall in the other season.');
    const both = floweringView({ ids: { inat: 7 }, flowering: { taxon: 7, months, read: 'x' }, climate: okClimate(5, 'south') as never });
    expect(both.state === 'read' && both.south).toBe(true);
    const north = floweringView({ ids: { inat: 7 }, flowering: { taxon: 7, months, read: 'x' }, climate: okClimate(40) as never });
    expect(north.state === 'read' && north.south).toBe(false);
  });
});
