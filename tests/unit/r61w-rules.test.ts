/**
 * Sentences the public pages generate, against rules 1 to 3 and against /about/how (round sixty-one; adopted from
 * docs/review-60/tests/visitor-words--rules.test.ts, the visitor and words review of round sixty). Every `it` here
 * failed on the base of round sixty-one (shown before the fixes); each is a guard now, the ties asserted positively.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cultivationSheet } from '$core/sheet';
import { generatedNote, careLine } from '$core/note';
import { climograph } from '$climate/climograph';

const ex = { minAbs: 4, minP01: 6.5, maxP99: 29, frostDaysPerYear: 0, years: 40 };
// The fixture's Copiapoa cinerea: January and February share the warmest mean day, 22 °C.
const tmax = [22, 22, 21, 20, 18, 17, 17, 17, 17, 18, 19, 20];
const tmin = [16, 16, 15, 14, 12, 10, 9, 10, 11, 11, 13, 14];
const rain = [4, 3, 5, 5, 7, 13, 10, 5, 5, 5, 5, 5];
const cinerea = tmax.map((t, i) => ({ tmax: t, tmin: tmin[i], tmean: (t + tmin[i]) / 2, precipMm: rain[i], dli: 30 + i, rh: 78 }));

describe('rule 2: a refused or pending climate is never "not on file"', () => {
  for (const climateStatus of ['refused', 'pending'] as const) {
    it(`an epiphyte whose climate is ${climateStatus} is not told "No habitat figure is on file"`, () => {
      const sh = cultivationSheet({ scientific: 'Tillandsia ionantha', family: 'Bromeliaceae', climateStatus, months: null });
      const text = sh.rows.map((r) => `${r.s} ${r.why} ${r.short ?? ''} ${r.plain?.lead ?? ''}`).join(' ');
      // Today: "No habitat figure is on file for this species, so no cold floor is read." for a source that refused.
      expect(text).not.toMatch(/on file/);
      const note = generatedNote({ scientific: 'Tillandsia ionantha', family: 'Bromeliaceae', climateStatus, months: null });
      expect(note?.text ?? '').not.toMatch(/No habitat cold figure on file/);
    });
  }
});

describe('ties: a month shared by several is not named as one (round sixty claimed this for rain only)', () => {
  it('the sheet does not name January alone as the warmest month when February is as warm', () => {
    const sh = cultivationSheet({ scientific: 'Copiapoa cinerea', family: 'Cactaceae', months: cinerea, extremes: ex, lat: -28.55 });
    const t = sh.rows.find((r) => r.k === 'Temperature')!.s;
    expect(t).not.toMatch(/mean daily high 22\.0 °C in January[^ ]/); // the labels' words (round sixty-two, second pass; the words review's 5e)
    expect(t).toMatch(/mean daily high 22\.0 °C in January and February/);
  });
  it("the climograph's reading does not name January alone either", () => {
    const g = climograph({ months: cinerea, p10: cinerea, p90: cinerea, cells: 40, extremes: ex });
    expect(g.alt).not.toMatch(/to 22 °C in Jan;/);
    expect(g.alt).toMatch(/to 22 °C in Jan and Feb;/);
  });
});

describe("the convention minimum is never printed without saying it has no source", () => {
  it('a label line for a species with no habitat climate does not print a bare "group min"', () => {
    const line = careLine({ scientific: 'Tillandsia ionantha', family: 'Bromeliaceae', climateStatus: 'none', months: null });
    // Today: "group min 10 °C", on a label that stays in a pot for years.
    expect(line).not.toMatch(/^group min \d+ °C$/);
    expect(line).toMatch(/convention, no source/);
  });
});

describe('the share card says whose months its chart is in', () => {
  it('the species page passes the habitat hemisphere to the share card', () => {
    const src = readFileSync('src/routes/species/[slug]/+page.svelte', 'utf8');
    const call = src.slice(src.indexOf('<ShareCard input={{'), src.indexOf('}} />', src.indexOf('<ShareCard input={{')));
    // card.ts draws "habitat months, southern hemisphere" only when `south` is given; the page never gives it.
    expect(call).toMatch(/\bsouth\b/);
  });
});

describe('/about/how: "What the device keeps outside the collection, every key"', () => {
  it('names every localStorage and sessionStorage key the code uses', () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|svelte|html)$/.test(f)) files.push(p); } };
    walk('src');
    const keys = new Set<string>();
    for (const f of files) {
      const s = readFileSync(f, 'utf8');
      if (!/localStorage|sessionStorage/.test(s)) continue;
      for (const m of s.matchAll(/['"](cultifolio\.[A-Za-z.]+)['"]/g)) keys.add(m[1]);
    }
    // Cookies are listed apart; these two are not storage keys.
    keys.delete('cultifolio.units');
    keys.delete('cultifolio.hemi');
    const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8');
    const missing = [...keys].filter((k) => !how.includes(k)).sort();
    // Today: cultifolio.backupNudgeHidden, cultifolio.iosFirstHidden, cultifolio.persistAfterFirst.
    expect(missing).toEqual([]);
  });
});
