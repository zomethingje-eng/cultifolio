/**
 * Round eighty-seven's review of stage 2, the derived figures' items: the USDA sum and its zone (M1), the Köppen 70% line
 * tested unrounded and printed as tested, the typical cell's stated-wild rule taken out (S4), and the /about/how
 * sentences of these (S7). Each test fails on the base (9311e8b): the page printed "−12.2 × 9 ÷ 5 + 32 = 10.0 °F, in
 * zone 7b", a share of 69.6% as "70% of the rain or more in summer", and the plan asked for a stated-wild walk.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { hardinessOf, usdaOfShown, usdaRange, rhsBand } from '$dossier/hardiness';
import { koppenOf, koppenReasons } from '$dossier/koppen';
import { FiguresTally } from '$dossier/habitat-figures';
import Hardiness from '$lib/ui/ref/Hardiness.svelte';

const text = (html: string) => html.replace(/<!--[^]*?-->/g, '').replace(/<[^>]+>/g, '').replace(/&rsquo;/g, '’').replace(/\s+/g, ' ');
const lows = (c: number) => ({ from: 1981, t: Array(44).fill(c) });

/** The printed sum read back: "A °C = A × 9 ÷ 5 + 32 = F °F, in zone Z (lo to hi °F)". */
function sumOf(t: string) {
  const m = /: (−?[\d.]+) °C = (−?[\d.]+) × 9 ÷ 5 \+ 32 = (−?[\d.]+) °F, in zone (\w+(?: \w+)*?)(?: \((−?\d+) to (−?\d+) °F\))?\./.exec(t);
  if (!m) throw new Error(t);
  const n = (s: string) => Number(s.replace('−', '-'));
  return { c: n(m[1]), c2: n(m[2]), f: n(m[3]), zone: m[4], lo: m[5] === undefined ? null : n(m[5]), hi: m[6] === undefined ? null : n(m[6]) };
}

describe('M1: every printed USDA sum is true, and its zone follows from the °F printed', () => {
  // The mean °C as the series gives it, unrounded; the review's −12.24 and 4.44, and the edges of zones either side.
  const means = [-12.24, 4.44, 10.0, 9.94, -15.0, -15.06, -51.1, -51.2, 21.1, 21.2, -3, 0.04, -0.05];
  for (const mean of means) {
    it(`a mean of ${mean} °C`, () => {
      const h = hardinessOf({ status: 'ok', extremes: { years: 44, minAbs: mean - 5, lows: lows(mean) } })!;
      const t = text(render(Hardiness as never, { props: { hardiness: h, extremesShown: true, units: 'metric' } } as never).body);
      const s = sumOf(t);
      expect(s.c).toBe(s.c2);
      // The sum, in hundredths of a degree so no float decides it.
      expect(Math.round(s.c * 10) * 18 + 3200).toBe(Math.round(s.f * 100));
      // The zone is the printed °F's, and the range printed holds it (a lower edge in, the upper edge the next zone's).
      expect(s.zone).toBe(h.usda!.zone);
      if (s.lo !== null) { expect(s.f).toBeGreaterThanOrEqual(s.lo); expect(s.f).toBeLessThan(s.hi!); }
      else expect(s.zone).toMatch(s.f < -60 ? /^below 1a$/ : /^above 13b$/);
    });
  }
  it('the review\'s two: −12.24 °C is 10.04 °F, zone 8a (it printed 10.0 °F, zone 7b); 4.44 °C is 39.92 °F, zone 10b', () => {
    expect(usdaOfShown(-12.24)).toEqual({ c: -12.2, f: 10.04, fText: '10.04', zone: '8a' });
    expect(usdaOfShown(4.44)).toMatchObject({ c: 4.4, f: 39.92, fText: '39.92', zone: '10b' });
    expect(usdaRange('10b')).toBe('35 to 40 °F');
    // An edge exactly: 10.0 °C is 50 °F, the first of 12a; 9.9 °C is 49.82 °F, 11b.
    expect(usdaOfShown(10)).toMatchObject({ fText: '50.0', zone: '12a' });
    expect(usdaOfShown(9.9)).toMatchObject({ fText: '49.82', zone: '11b' });
    expect(usdaOfShown(-15)).toMatchObject({ fText: '5.0', zone: '7b' });
    expect(usdaOfShown(-51.2)).toMatchObject({ fText: '-60.16', zone: 'below 1a' });
    expect(usdaOfShown(21.2)).toMatchObject({ fText: '70.16', zone: 'above 13b' });
  });
  it('a record written before (its zone the unrounded mean\'s) is printed from its mean as shown, so its sum still holds', () => {
    const before = { usda: { years: 44, from: 1981, to: 2024, meanC: -12.2, meanF: 10, zone: '7b' }, rhs: { lowC: -20, band: 'H6', years: 44 }, src: 'NASA POWER' };
    const t = text(render(Hardiness as never, { props: { hardiness: before, extremesShown: true, units: 'metric' } } as never).body);
    expect(t).toContain('−12.2 °C = −12.2 × 9 ÷ 5 + 32 = 10.04 °F, in zone 8a (10 to 15 °F).');
    expect(t).toMatch(/USDA zone of the habitat ?8a/);
  });
});

describe('S7: the RHS band on an edge, as /about/how now says it', () => {
  it('an edge is the warmer band\'s, but for 15.0 °C, which is H1b (H1a is warmer than 15 °C)', () => {
    expect(rhsBand(15)).toBe('H1b');
    expect(rhsBand(15.01)).toBe('H1a');
    expect(rhsBand(10)).toBe('H1b');
    expect(rhsBand(-5)).toBe('H3');
    expect(rhsBand(-20)).toBe('H6');
    const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8');
    expect(how).toContain("A figure on a band's edge is in the warmer band, but for 15.0 °C, which is H1b, since H1a is warmer than 15 °C.");
  });
});

describe('Köppen: the 70% line tested unrounded, and printed as tested', () => {
  const year = (t: number[], p: number[]) => t.map((x, i) => ({ tmean: x, precipMm: p[i] }));
  const T = [5, 6, 8, 10, 14, 18, 20, 19, 16, 12, 8, 6];
  it('69.6% of the rain in summer: + 14, said "69.6%", never "70% or more" (the base rounded it to 0.70)', () => {
    // April to September 116 mm each (696), October to March 304: a share of 0.696.
    const k = koppenOf(year(T, [51, 51, 51, 116, 116, 116, 116, 116, 116, 51, 50, 50]))!;
    expect(k.pthBy).toBe('neither');
    expect(k.summerShare).toBe(0.696);
    expect(Math.abs(k.pth - (2 * k.mat + 14))).toBeLessThan(0.2);
    const r = koppenReasons(k);
    expect(r[0][2]).toContain(`+ 14: 69.6% of the rain in summer and 30.4% in winter, neither 70% or more)`);
    expect(r[0][2]).not.toContain('+ 28');
  });
  it('70.4%: + 28, said with its share (whole, as that is enough to show its side)', () => {
    const k = koppenOf(year(T, [49, 49, 50, 117, 117, 117, 117, 118, 118, 50, 49, 49]))!;
    expect(k.pthBy).toBe('summer');
    expect(koppenReasons(k)[0][2]).toContain('+ 28: 70% of the rain in summer, 70% or more)');
  });
  it('a share of 69.996%: as many places as show the side it is on', () => {
    // 0.69996 of the rain in summer: tested under 70%, printed 69.996 rounded to two places would be 70.00.
    const k = { ...koppenOf(year(T, [51, 51, 51, 116, 116, 116, 116, 116, 116, 51, 50, 50]))!, summerShare: 0.69996, pthBy: 'neither' as const };
    expect(koppenReasons(k)[0][2]).toContain('just under 70% of the rain in summer');
  });
});

describe('S4: the stated-wild typical cell is out', () => {
  it('the walk\'s lines say no typical cell chosen by it; the plan neither asks for it nor its flag', () => {
    const t = new FiguresTally();
    expect(t.lines()).toHaveLength(1);
    expect(t.lines(true).join('\n')).not.toMatch(/states wild|typical cell/);
    const plan = readFileSync('scripts/corpus-plan-r87s2.txt', 'utf8');
    expect(plan).not.toMatch(/typical-every-cell|typical-wild-moved|states wild/);
    expect(readFileSync('scripts/build-dossiers.ts', 'utf8')).not.toMatch(/typical-every-cell|wildTypical|statedWild/);
  });
  it('/about/how says the typical spot is every cell\'s, and nothing of research grade being "marked wild"', () => {
    const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8');
    expect(how).toContain("<li>The typical spot is the grid cell whose coldest month's mean nightly low is nearest the median of that figure across the range.</li>");
    expect(how).not.toMatch(/which iNaturalist gives only to a plant marked wild/);
  });
  it('/about/how says how CITES is matched, not "by IPNI identifier" for all three', () => {
    const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8');
    expect(how).toContain('The risk and the chromosome counts are matched to the page by its IPNI identifier, and CITES by the exact name the Appendices print, or by a synonym Kew holds of it that is no other page\'s name, never by a likeness of names.');
    expect(how).not.toContain('Three lines come from files read whole by the build, offline, and are matched to the page by its IPNI identifier');
  });
});
