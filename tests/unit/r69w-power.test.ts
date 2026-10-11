/**
 * Round sixty-nine, agent W, applied at the merge with its patch to src/lib/dossier/build.ts (triage-68 W6, S-E7): NASA
 * POWER that did not answer (a timeout, a 5xx) is recorded in the dossier's upstream as `error`, and a refusal still as
 * `refused`; both stay "not checked" on the page.
 */
import { describe, it, expect } from 'vitest';
import { makeHeader, cellOf, encodeCell } from '$climate/grid';
import { memoryGridSource } from '$climate/source';
import { makeClimateProvider } from '$climate/provider';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher } from '$dossier/fetch';
import { copiapoa } from '../../fixtures/upstream';

const h = makeHeader({ built: '2026-09-14T00:00:00Z' });
const lat = -24.877, lon = -70.504;
function cell(): Record<string, number> {
  const v: Record<string, number> = { elev: 620 };
  for (let m = 1; m <= 12; m++) {
    const s = Math.cos(((m - 1) / 12) * 2 * Math.PI), mm = String(m).padStart(2, '0');
    Object.assign(v, { [`tasmax_${mm}`]: 22 + 4 * s, [`tasmin_${mm}`]: 12 + 3 * s, [`tas_${mm}`]: 17 + 3.5 * s, [`pr_${mm}`]: 1, [`rsds_${mm}`]: 18 + 8 * s, [`hurs_${mm}`]: 78, [`vpd_${mm}`]: 500, [`sfcWind_${mm}`]: 3 });
  }
  return v;
}
/** A provider over one grid cell whose NASA POWER call ends as `power` says; every envelope is that cell. */
function provider(power: { status: 'error' | 'refused'; detail: string }) {
  const p = makeClimateProvider({ grid: memoryGridSource(h, new Map([[cellOf(h, lat, lon).id, encodeCell(h, cell())]])), fetcher: fixtureFetcher({}, power as never) });
  return { envelope: () => p.at(lat, lon), at: p.at };
}
const build = (power: { status: 'error' | 'refused'; detail: string }) => buildDossier('Copiapoa cinerea', { fetcher: fixtureFetcher(copiapoa() as Record<string, unknown>), builtBy: 'node' as const, now: () => new Date('2026-10-11T12:00:00Z'), climate: provider(power) });

describe('W6 (S-E7): NASA POWER\'s failure is recorded as an error', () => {
  it('a timeout is `error` in the upstream record, with the words "did not answer"; a refusal is still `refused`', async () => {
    const failed = await build({ status: 'error', detail: 'timed out' });
    expect(failed.ok).toBe(true);
    if (!failed.ok) return;
    expect(failed.dossier.climate.status).toBe('ok');
    expect(failed.dossier.upstream['climate.extremes']).toMatchObject({ status: 'error', detail: expect.stringMatching(/^NASA POWER did not answer \(timed out\)/) });
    const refused = await build({ status: 'refused', detail: 'HTTP 429' });
    if (!refused.ok) return;
    expect(refused.dossier.upstream['climate.extremes']).toMatchObject({ status: 'refused', detail: expect.stringMatching(/^NASA POWER refused the request/) });
  });
});
