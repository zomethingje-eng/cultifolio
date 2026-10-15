/**
 * Round seventy-one, agent E (self-review E1): the Bering Sea's Alaskan islands are asked of the National Weather
 * Service. The Alaska box stopped at 170° W and the Aleutians' box west of it at 55.5° N, so St Lawrence Island (Gambell,
 * Savoonga) and St Paul in the Pribilofs fell between them: never asked, and told the NWS "does not cover" them, though
 * it answers each (alerts/active?point=63.7800,-171.7400 and 57.1300,-170.2800: 200, checked 2026-10-15). Failed on the
 * base: `isUS` false for all three.
 */
import { describe, it, expect } from 'vitest';
import { isUS } from '$lib/weather/forecast';

const ASKED: Array<[string, number, number]> = [
  ['Gambell, St Lawrence Island', 63.78, -171.74],
  ['Savoonga, St Lawrence Island', 63.69, -170.48],
  ['St Paul, the Pribilofs', 57.13, -170.28]
];
describe('E1: every Alaskan island between the old boxes is asked of the NWS', () => {
  for (const [name, lat, lon] of ASKED) it(`${name} is asked`, () => expect(isUS(lat, lon)).toBe(true));
  it('guard: the places already asked still are, and places abroad still are not', () => {
    for (const [lat, lon] of [[56.6, -169.55], [51.88, -176.66], [52.93, 172.9], [61.2, -149.9], [53.87, -166.53], [55.92, -130.02]] as const) expect(isUS(lat, lon)).toBe(true);
    // Kamchatka, Hokkaido, Midway (the NWS answers it "out of bounds") and Chukotka west of the antimeridian.
    for (const [lat, lon] of [[53.0, 158.65], [43.06, 141.35], [28.2, -177.38], [64.73, 177.5]] as const) expect(isUS(lat, lon)).toBe(false);
  });
});
