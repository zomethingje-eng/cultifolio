/**
 * Self-review of round sixty-one, server area: the frost watch asks a held call again after a minute, not half an hour
 * (kills mutation U12, which the round's tests let through). PASSES on f4ab4f8.
 * Run (once copied to tests/unit/): npx vitest run tests/unit/server--frost-held.test.ts
 */
import { describe, it, expect, vi } from 'vitest';

let calls = 0;
vi.mock('$lib/weather/client', () => ({
  FORECAST_TTL_MS: 30 * 60_000,
  forecastRefusal: () => 'Frost not checked: not asked',
  getForecast: async () => { calls++; return { ok: false, status: 503, held: true }; }
}));

describe('the frost watch and a held call', () => {
  it('asks again at the first look after a minute', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const t0 = Date.UTC(2026, 9, 4, 12);
    vi.setSystemTime(t0);
    const { site } = await import('$lib/ui/site.svelte');
    const { frost } = await import('$lib/ui/frost.svelte');
    site.current = { lat: 10, lon: 10 } as never;
    await frost.check();
    expect(calls).toBe(1);
    vi.setSystemTime(t0 + 30_000);
    await frost.check();
    expect(calls).toBe(1); // not within the minute
    vi.setSystemTime(t0 + 61_000);
    await frost.check();
    expect(calls).toBe(2);
    vi.useRealTimers();
  });
});
