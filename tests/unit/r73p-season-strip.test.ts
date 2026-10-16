/**
 * Round seventy-three, agent P (REVIEW-ROUND-72 §6): on a page with a frozen wet season every wet month read, to a screen
 * reader, "the rainy season (no growing season read: nights below freezing)": the strip's name said it, each shaded month
 * said it again, and the key a last time. It is said once now, in the list's name; a shaded month says "shaded"; what the
 * rule reads is unchanged. FAILED on r73base: the phrase 8 times in Rubus parviflorus's strip (its name, six wet months, the key).
 */
import { describe, it, expect } from 'vitest';
import { growingYear } from '$core/sheet';
import { seasonStrip } from '$lib/ui/ref/season';

const M = (rows: [number, number, number, number][]) => rows.map(([tmax, tmin, tmean, precipMm]) => ({ tmax, tmin, tmean, precipMm }));
// Rubus parviflorus (7872219), the live dossier's median year (r72f-season.test.ts).
const rubus = M([[4.7, -1.3, 1.9, 185], [6.1, -1, 2.8, 139], [8.5, 0.4, 4.9, 128], [11.5, 2.5, 7.4, 87], [15.4, 6.3, 11, 78], [19.3, 10, 14.2, 70], [22.9, 12.4, 17.3, 39], [23, 12.8, 17.3, 40], [19.4, 10.6, 14.5, 62], [13.4, 6.5, 9.5, 104], [7.4, 1.6, 4.4, 179], [4, -1.6, 1.4, 193]]);
const PHRASE = 'the rainy season (no growing season read: nights below freezing)';
const count = (s: string, w: string) => s.split(w).length - 1;
/** What a screen reader is read of the strip and its key: the markup with every aria-hidden element taken out. */
function spoken(html: string): string {
  let out = html;
  for (;;) {
    const at = out.search(/<div[^>]*aria-hidden="true"[^>]*>/);
    if (at < 0) return out;
    let depth = 0, i = at;
    const re = /<\/?div\b[^>]*>/g;
    re.lastIndex = at;
    for (let m = re.exec(out); m; m = re.exec(out)) { depth += m[0].startsWith('</') ? -1 : 1; if (depth === 0) { i = m.index + m[0].length; break; } }
    out = out.slice(0, at) + out.slice(i);
  }
}

describe('r73p: the month strip says what its shading is once', async () => {
  const { render } = await import('svelte/server');
  const { default: Glance } = await import('$lib/ui/ref/Glance.svelte');
  const year = growingYear(rubus, 49.3)!;
  const body = render(Glance, { props: { months: rubus, year, seasonLead: 'Wet winters: the rain comes November to March, with nights below freezing; no growing season read.', seasonRule: 'rain rule, CHELSA', readerLat: 49.3 } }).body;
  const strip = body.slice(body.search(/<ol class="strip\b/), body.indexOf('</ol>') + 5);
  it('the rule reads what it read (guard)', () => {
    expect(seasonStrip(year, rubus, 49.3)?.shadeIs).toBe(PHRASE);
    expect(strip).toContain(`aria-label="Months, January to December; shaded: ${PHRASE}"`);
  });
  it('a shaded month says "shaded"; the phrase is read once, in the list\'s name', () => {
    const shaded = strip.match(/<li class="[^"]*\bon\b[^"]*"/g) ?? [];
    expect(shaded.length).toBeGreaterThanOrEqual(5);
    expect(count(strip, '>, shaded<')).toBe(shaded.length);
    expect(count(spoken(body), PHRASE)).toBe(1); // r73base: 8 (the name, six months, the key)
  });
  it('the key still shows it, once, as a legend', () => {
    const key = body.slice(body.search(/<div class="sub key\b/));
    expect(key.slice(0, key.indexOf('</div>'))).toContain(PHRASE);
    expect(count(body, PHRASE)).toBe(2); // the list's name and the drawn key
  });
});
