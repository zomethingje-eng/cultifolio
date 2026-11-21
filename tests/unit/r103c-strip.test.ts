/**
 * Round 103 (docs/PLAN-103.md, a and b; the launch review's round 2): the habitat in short, as drawn. With a climate, each
 * figure with its source and, under them, the records and grid cells it is read from; with none, the state and the page's
 * reason, never a blank cell; pending said as pending (rule 2). A word with a tip is a button whose tip is empty until it
 * opens, so a closed tip adds nothing to the page's text.
 *
 * On f7f2867: the strip had no records line and drew nothing for a page without a climate, and there was no Term: the
 * first three tests FAILED (the fourth guards the figures it drew then).
 */
import { describe, it, expect } from 'vitest';
import HabitatLine from '$lib/ui/ref/HabitatLine.svelte';
import Term from '$lib/ui/ref/Term.svelte';
import { TERMS } from '$lib/ui/ref/terms';

const months = Array.from({ length: 12 }, (_, i) => ({ tmax: 25 + (i % 3), tmin: 8 + (i % 4), precipMm: 10 + i, dli: 20 + i }));
const draw = async (props: Record<string, unknown>) => {
  const { render } = await import('svelte/server');
  return render(HabitatLine, { props: { units: 'metric', ...props } as never }).body.replace(/<!--[\s\S]*?-->/g, '');
};
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('r103c: the habitat in short', () => {
  it('with a climate: the records and cells under the figures, with "How"', async () => {
    const h = await draw({ months, extremes: { minP01: -2.5 }, records: 521, cells: 48 });
    expect(text(h)).toContain('The wild habitat’s figures, from 521 records in 48 grid cells · How');
    expect(h).toContain('href="/about/how#climate"');
  });

  it('with no habitat climate: the state and the reason, no figure', async () => {
    const h = await draw({ months: [], state: 'none', why: 'None can be derived: 69 in-range records at 66 places, none placed to within 10 km.' });
    expect(text(h)).toContain('No habitat climate. None can be derived: 69 in-range records at 66 places, none placed to within 10 km.');
    expect(h).not.toContain('<dl');
    expect(h).toContain('href="#s-climate"');
  });

  it('pending is said as pending, not as none (rule 2)', async () => {
    const h = text(await draw({ months: [], state: 'pending', why: 'It has not been derived yet; this is not a refusal.' }));
    expect(h).toContain('Habitat climate pending. It has not been derived yet; this is not a refusal.');
    expect(h).not.toContain('No habitat climate');
  });

  it('each figure keeps its source; a closed tip adds no words', async () => {
    const h = await draw({ months, extremes: { minP01: -2.5 }, records: 3, cells: 2 });
    const t = text(h);
    expect(t).toMatch(/Cold floor [-−]?2\.5 °C 1 night in 100 colder NASA POWER/);
    expect(t).toMatch(/Rain \d+ mm a year, monthly medians added CHELSA/);
    expect(t).toMatch(/Open-sky light 20–31 DLI lowest to highest month CHELSA/);
    expect(t).not.toContain(TERMS.coldFloor.tip.slice(0, 30));
    expect(h).toMatch(/<button type="button" class="tw[^"]*" aria-expanded="false"/);
  });

  it('a term is a named button, its tip region empty until opened', async () => {
    const { render } = await import('svelte/server');
    const h = render(Term, { props: { k: 'dli' } }).body.replace(/<!--[\s\S]*?-->/g, '');
    expect(h).toMatch(/<button[^>]*>DLI<\/button>/);
    expect(h).not.toContain('aria-describedby');
    expect(h).toMatch(/<span class="tip[^"]*" id="tip-[^"]+" role="status" hidden=""><\/span>/);
  });
});
