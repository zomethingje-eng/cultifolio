/**
 * Round seventy, agent P (triage-69 P4, R47-12): the weather alerts outside the states. Puerto Rico, the US Virgin
 * Islands, Guam, the Northern Mariana Islands, American Samoa and the Aleutians west of 170° W are asked of the National
 * Weather Service (each answered 200 for its point on 2026-10-12); a point inside a box that the NWS answers "out of
 * bounds" (Toronto, checked the same day) has no alerts service, said as that, not as an NWS that did not answer; and only
 * alerts read make "All clear.". Failed on the base: the territories were not US, Toronto's 400 was "unanswered", and
 * `alertsRead` did not exist.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isUS, nwsOutOfBounds } from '$lib/weather/forecast';
import { alertsRead, alertsUnchecked } from '$lib/ui/alert-words';
import { resetRateLimits } from '$lib/server/sync';
import { fakeKV, countersNs } from './helpers/fake-sync';

const PLACES: Array<[string, number, number]> = [
  ['San Juan, Puerto Rico', 18.47, -66.11],
  ['Charlotte Amalie, US Virgin Islands', 18.34, -64.93],
  ['Hagåtña, Guam', 13.47, 144.75],
  ['Saipan, Northern Mariana Islands', 15.18, 145.75],
  ['Pago Pago, American Samoa', -14.28, -170.7],
  ['Atka, the Aleutians', 52.2, -174.2],
  ['Adak, the Aleutians', 51.88, -176.66],
  ['Amchitka, the Aleutians, east longitude', 51.5, 179.0],
  ['Attu, the Aleutians', 52.9, 173.2]
];

describe('the places the NWS is asked for', () => {
  for (const [name, lat, lon] of PLACES) it(`${name} is asked of the NWS`, () => expect(isUS(lat, lon)).toBe(true));
  it('guard: the states as before, and places no US service covers are not asked', () => {
    for (const [lat, lon] of [[40.38, -80.05], [61.2, -149.9], [21.3, -157.86]] as const) expect(isUS(lat, lon)).toBe(true);
    for (const [lat, lon] of [[-24.9, -70.4], [51.5, -0.1], [55.0, 166.0], [35.7, 139.7], [-33.9, 18.4], [23.1, -82.4]] as const) expect(isUS(lat, lon)).toBe(false);
  });
  it('the NWS\'s "out of bounds" is read as such, and no other answer is', () => {
    expect(nwsOutOfBounds(400, { title: 'Invalid Parameter', status: 400, detail: 'Parameter "point" is invalid: out of bounds' })).toBe(true);
    expect(nwsOutOfBounds(400, { detail: 'Parameter "point" is invalid' })).toBe(false);
    expect(nwsOutOfBounds(500, { detail: 'out of bounds' })).toBe(false);
    expect(nwsOutOfBounds(400, null)).toBe(false);
  });
});

describe('the forecast route', () => {
  const T = Date.UTC(2026, 9, 12, 12, 0, 0);
  beforeEach(() => { resetRateLimits(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  const metBody = () => JSON.stringify({ properties: { timeseries: [{ time: '2026-10-12T18:00:00Z', data: { instant: { details: { air_temperature: 12 } }, next_6_hours: { details: { air_temperature_min: 10, air_temperature_max: 15 } } } }] } });
  async function ask(lat: number, lon: number, nws: (u: string) => Response) {
    const platform = { env: { QUEUE: fakeKV(), COUNTERS: countersNs() } };
    const asked: string[] = [];
    const fetch = vi.fn(async (u: string) => { asked.push(new URL(u).host); return new URL(u).host === 'api.met.no' ? new Response(metBody(), { headers: { 'content-type': 'application/json' } }) : nws(u); });
    const { GET } = await import('../../src/routes/api/forecast/+server');
    const r = (await GET({ url: new URL(`https://x/api/forecast?lat=${lat}&lon=${lon}`), platform, fetch, getClientAddress: () => '198.51.100.7' } as never)) as Response;
    return { status: r.status, body: (await r.json()) as { alertsStatus: string; attribution: string[] }, asked };
  }
  it('San Juan is asked of the NWS, and its "none" is read', async () => {
    const r = await ask(18.47, -66.11, () => new Response(JSON.stringify({ features: [] }), { headers: { 'content-type': 'application/geo+json' } }));
    expect(r.asked).toContain('api.weather.gov');
    expect(r.body.alertsStatus).toBe('none');
    expect(alertsRead(r.body.alertsStatus)).toBe(true);
  });
  it('Toronto, inside the box, answered "out of bounds", has no alerts service, and the NWS is not credited', async () => {
    const r = await ask(43.7, -79.4, () => new Response(JSON.stringify({ title: 'Invalid Parameter', status: 400, detail: 'Parameter "point" is invalid: out of bounds' }), { status: 400, headers: { 'content-type': 'application/problem+json' } }));
    expect(r.status).toBe(200);
    expect(r.body.alertsStatus).toBe('n/a'); // the base: 'unanswered', "the National Weather Service did not answer"
    expect(alertsUnchecked(r.body.alertsStatus)).toBe(false);
    expect(alertsRead(r.body.alertsStatus)).toBe(false);
    expect(r.body.attribution.join(' ')).not.toMatch(/National Weather Service/);
  });
  it('guard: another 400, or a 500, is still the NWS not answering', async () => {
    const r = await ask(40.38, -80.05, () => new Response('{}', { status: 500 }));
    expect(r.body.alertsStatus).toBe('unanswered');
  });
});

describe('only alerts read are "All clear."', () => {
  it('ok and none are read; n/a, refused, unanswered and a forecast with no status are not', () => {
    expect(['ok', 'none'].map(alertsRead)).toEqual([true, true]);
    expect(['n/a', 'refused', 'unanswered', undefined, null].map(alertsRead)).toEqual([false, false, false, false, false]);
  });
  it('the place page says "All clear." and "frost: clear" only where the alerts were read', async () => {
    const page = (await import('node:fs')).readFileSync('src/routes/places/[id]/+page.svelte', 'utf8');
    expect(page).toMatch(/\(alertsSeen \? 'All clear\.' : 'Forecast clear\.'\)/);
    expect(page).toMatch(/alertsSeen \? 'frost: clear' : 'forecast clear'/);
    expect(page).toMatch(/const alertsSeen = \$derived\(alertsRead\(forecast\?\.alertsStatus\)\)/);
  });
});

describe('/about/how says where the alerts are read (H229)', () => {
  it('each place the sentence names is asked of the NWS, and the sentence says no other service\'s alerts are read', async () => {
    const { said } = await import('../about-pages');
    const s = said('how', 'The frost watch asks MET Norway');
    const named = /in the US and its territories \(([^)]*)\)/.exec(s.text);
    expect(named, s.where).not.toBeNull();
    const AT: Record<string, [number, number]> = { 'Puerto Rico': [18.47, -66.11], 'the US Virgin Islands': [18.34, -64.93], Guam: [13.47, 144.75], 'the Northern Mariana Islands': [15.18, 145.75], 'American Samoa': [-14.28, -170.7] };
    // Round seventy-one (E's S-E1): "and all of Alaska, the Aleutians, St Lawrence Island and the Pribilofs included".
    const ALASKA: Record<string, [number, number]> = { Alaska: [61.22, -149.9], 'the Aleutians': [52.9, 173.2], 'St Lawrence Island': [63.78, -171.74], 'the Pribilofs': [57.13, -170.28] };
    const [territories, north] = named![1].split(/, and all of /);
    const places = territories.split(/, | and /);
    expect(places.sort()).toEqual(Object.keys(AT).sort());
    for (const p of places) expect(isUS(...AT[p]), p).toBe(true);
    const far = north.replace(/ included$/, '').split(/, | and /);
    expect(far.sort(), s.where).toEqual(Object.keys(ALASKA).sort());
    for (const p of far) expect(isUS(...ALASKA[p]), p).toBe(true);
    expect(isUS(52.9, 173.2)).toBe(true);
    expect(said('how', "The National Weather Service's are the only weather alerts read").text).toMatch(/a place it does not cover says its forecast is clear, never "All clear\."/);
  });
});
