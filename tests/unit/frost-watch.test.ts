/**
 * The frost watch publishes only the answer to its current read (round fifty-five, 5; the second reviewer's finding 7):
 * a slow answer for the site before it was changed must not overwrite the site after.
 */
import { describe, it, expect, vi } from 'vitest';

type Answer = { ok: true; body: { risk: { level: string; text: string } } };
const pending: Array<{ lat: number; resolve: (a: Answer) => void }> = [];
vi.mock('$lib/weather/client', () => ({
  FORECAST_TTL_MS: 30 * 60_000,
  forecastRefusal: () => 'Frost not checked',
  getForecast: (lat: number) => new Promise<Answer>((resolve) => pending.push({ lat, resolve }))
}));

describe('the frost watch', () => {
  it('a slow answer for the old site does not overwrite the new site\'s risk, and the old site\'s reading is not shown meanwhile', async () => {
    const { site } = await import('$lib/ui/site.svelte');
    const { frost } = await import('$lib/ui/frost.svelte');
    site.current = { lat: 10, lon: 10 };
    const a = frost.check();
    site.current = { lat: 20, lon: 20 };
    const b = frost.check();
    expect(frost.risk).toBeNull();
    pending.find((p) => p.lat === 20)!.resolve({ ok: true, body: { risk: { level: 'none', text: 'No frost at B' } } });
    await b;
    pending.find((p) => p.lat === 10)!.resolve({ ok: true, body: { risk: { level: 'frost', text: 'Frost at A' } } });
    await a;
    expect(frost.risk?.text).toBe('No frost at B');
    await frost.check(); // fresh: the answer held stands
    expect(frost.risk?.text).toBe('No frost at B');
  });
});
