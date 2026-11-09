/**
 * The figures a build works out from a page's own climate (round eighty-seven, derived agent): `hardiness` (USDA's zone of
 * the mean yearly low, the RHS band of the record low; `hardiness.ts`) and `koppen` (the Köppen–Geiger class of the
 * median year; `koppen.ts`). Written on every page a build or the walk writes, from the climate it writes, so a figure is
 * never left from a climate the page no longer has. And the walk's count of them, printed at its end.
 */
import { setAsideExtremes, type Dossier } from './schema';
import { hardinessOf } from './hardiness';
import { koppenOf } from './koppen';

type Page = { climate: Dossier['climate']; hardiness?: Dossier['hardiness']; koppen?: Dossier['koppen'] };

/** Sets (or clears) the page's `hardiness` and `koppen` from its climate as shown. */
export function deriveFigures(d: Page): void {
  const c = setAsideExtremes(d.climate);
  const h = hardinessOf(c as Parameters<typeof hardinessOf>[0]);
  const k = c.status === 'ok' ? koppenOf(c.months) : null;
  if (h) d.hardiness = h; else delete d.hardiness;
  if (k) d.koppen = k; else delete d.koppen;
}

/** The walk's count of what it worked out. */
export class FiguresTally {
  pages = 0;
  koppen = 0;
  koppenBoundary = 0;
  byFirst = new Map<string, number>();
  usda = 0;
  usdaNotHeld = 0;
  usdaShort = 0;
  rhs = 0;
  add(d: Page & { key?: string; name?: { scientific?: string } }): void {
    this.pages++;
    if (d.koppen) {
      if (d.koppen.cls) { this.koppen++; const f = d.koppen.cls[0]; this.byFirst.set(f, (this.byFirst.get(f) ?? 0) + 1); }
      else this.koppenBoundary++;
    }
    if (d.hardiness) {
      this.rhs++;
      if (d.hardiness.usda) this.usda++;
      else if (/not held/.test(d.hardiness.usdaWhy ?? '')) this.usdaNotHeld++;
      else this.usdaShort++;
    }
  }
  /** The walk's lines (the build's end, and the dry run's). */
  lines(dry = false): string[] {
    const would = dry ? 'would be ' : '';
    const first = [...this.byFirst].sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => `${k} ${n}`).join(', ');
    return [
      `${this.pages} page${this.pages === 1 ? '' : 's'} ${dry ? 'derived' : 'written'}: ${this.koppen} ${would}given a Köppen–Geiger class (${first || 'none'})${this.koppenBoundary ? `, ${this.koppenBoundary} on Peel and others' 10 °C boundary, given none` : ''}; ${this.rhs} ${would}given an RHS band of the record low, ${this.usda} of them a USDA zone of the mean yearly low${this.usdaNotHeld ? ` (${this.usdaNotHeld} without the yearly lows held: extremes carried from a build before)` : ''}${this.usdaShort ? ` (${this.usdaShort} with fewer than 20 complete years)` : ''}`
    ];
  }
}

