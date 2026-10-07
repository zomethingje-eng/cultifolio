/**
 * Adopted in round sixty-one from docs/review-60/tests (the harness review); "PASSES"/"FAILS" below describe round-sixty code.
 * Harness review of round sixty: "the habitat months are said once" (sheet.ts `yours`, guarded by `reader !== at`). The
 * round's test reads the sheet's `short` line only; the card's lead line (`plain.lead`) uses `yours`, and dropping the
 * guard there passed the suite ("the rain comes July to September (July to September at the habitat)").
 * PASSES on round-sixty code; FAILS under that mutation.
 * Adopted in round sixty-one (agent H; docs/review-60/harness.md). Run: `npx vitest run tests/unit/r61h-sheet-lead.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { cultivationSheet } from '$core/sheet';

const mk = (tmax: number[], tmin: number[], pr: number[]) => tmax.map((t, i) => ({ tmax: t, tmin: tmin[i], tmean: (t + tmin[i]) / 2, precipMm: pr[i], rh: 55 }));

describe('harness review', () => {
  it('the card\'s lead line says the habitat months once when the reader shares the habitat\'s hemisphere', () => {
    const m = mk([18, 21, 25, 30, 33, 35, 34, 33, 31, 27, 22, 18], [4, 6, 9, 14, 18, 22, 22, 22, 19, 15, 9, 4], [5, 5, 5, 5, 8, 20, 90, 95, 60, 10, 5, 5]);
    const { rows } = cultivationSheet({ scientific: 'Ariocarpus fissuratus', family: 'Cactaceae', months: m as never, lat: 29, readerLat: 52 });
    const lead = rows.find((r) => r.k === 'Its year')!.plain!.lead;
    expect(lead).toBe('Wet summers: the rain comes July to September, read as a summer growing season.');
    // and for a reader in the other hemisphere the habitat's months are given once, in brackets
    const south = cultivationSheet({ scientific: 'Ariocarpus fissuratus', family: 'Cactaceae', months: m as never, lat: 29, readerLat: -34 }).rows.find((r) => r.k === 'Its year')!.plain!.lead;
    expect(south.match(/July to September/g)).toHaveLength(1);
  });
});
