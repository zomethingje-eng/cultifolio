/**
 * Round sixty-two, second pass, agent S (the words review, 18): the frost watch holds an answer whose NWS alerts were
 * refused for five minutes, as the client and the server keep it, not the forecast's half hour.
 */
import { describe, it, expect, vi } from 'vitest';

let calls = 0;
let status = 'refused';
vi.mock('$lib/weather/client', () => ({
  FORECAST_TTL_MS: 30 * 60_000,
  REFUSED_TTL_MS: 5 * 60_000,
  forecastRefusal: () => 'Frost not checked',
  getForecast: async () => { calls++; return { ok: true, at: Date.now(), body: { alertsStatus: status, risk: { level: 'none', text: 'clear' } } }; }
}));

describe('the frost watch and refused alerts', () => {
  it('reads again after five minutes, and an answered one after half an hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const t0 = Date.UTC(2026, 9, 4, 12);
    vi.setSystemTime(t0);
    const { site } = await import('$lib/ui/site.svelte');
    const { frost } = await import('$lib/ui/frost.svelte');
    site.current = { lat: 40.44, lon: -79.99 } as never;
    await frost.check();
    expect(calls).toBe(1);
    vi.setSystemTime(t0 + 4 * 60_000);
    await frost.check();
    expect(calls).toBe(1);
    status = 'none';
    vi.setSystemTime(t0 + 5 * 60_000 + 1);
    await frost.check();
    expect(calls).toBe(2);
    vi.setSystemTime(t0 + 20 * 60_000);
    await frost.check();
    expect(calls).toBe(2);
    vi.useRealTimers();
  });
});
