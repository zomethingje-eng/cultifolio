/**
 * triage-outside, A3 (partly fixed): the provider now says a 0 m lapse correction is a correction ("lapse-corrected 0 m
 * at 6.5 °C/km"), but the species sheet's "How" for Warmth and air still chooses its words by `lapseAppliedM`'s truth
 * (sheet.ts:407), so the same dossier says "without lapse correction" on the page. The fixture's Copiapoa cinerea shows
 * it at http://127.0.0.1:4300/species/copiapoa-cinerea.
 *
 * Run from the repository root:
 *   cp /tmp/r62rev/out/tests/triage-outside--a3-lapse-sheet.test.ts tests/unit/ && npx vitest run tests/unit/triage-outside--a3-lapse-sheet.test.ts
 */
import { describe, it, expect } from 'vitest';
import { cultivationSheet } from '$lib/core/sheet';

const months = Array.from({ length: 12 }, (_, i) => ({ m: i + 1, tmax: 22 + 4 * Math.cos((i / 12) * 2 * Math.PI), tmin: 12 + 3 * Math.cos((i / 12) * 2 * Math.PI), precipMm: 2, dli: 30, rh: 78, vpd: 0.5, wind: 3 }));

describe('the sheet says a 0 m lapse correction as the provider does (A3)', () => {
  it('a correction of 0 m is not "without lapse correction"', () => {
    const s = cultivationSheet({ scientific: 'Copiapoa cinerea', family: 'Cactaceae', months: months as never, lat: -25, extremes: { years: 40, minAbs: 4, minP01: 6.5, maxP99: 29, frostDaysPerYear: 0, lapseAppliedM: 0 } as never, extremesStatus: 'ok' });
    const how = s.rows.filter((r) => r.card === 'Warmth and air').map((r) => r.why).join(' ');
    expect(how).toContain('NASA POWER');
    expect(how).not.toContain('without lapse correction'); // this code: "…at a typical spot in the range, without lapse correction; …"
  });
});
