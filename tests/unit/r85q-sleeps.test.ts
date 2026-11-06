/**
 * Round eighty-five, Q (outside review A23): the browser specs wait for a state, not a fixed time. 88 fixed sleeps in 30
 * files on r85base; each became a wait for what it stood for (a check that has answered, a page gone quiet, the database
 * gone quiet, frames drawn, the page's clock run on), except six that wait out a timer of the app's own or the browser's,
 * which nothing on the page shows the end of. Each of those says so on its line, and a new fixed sleep must too: a
 * sleep with no reason fails here. FAILED on r85base: 63 sleeps gave no such reason.
 *
 * (`goneQuiet` in tests/e2e/helpers/settled.ts is what a negative waits for now: no request of the page's for a span, then
 * two frames. A slow engine is given the time it takes; a page that never goes quiet fails there, saying so.)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'tests/e2e';
const files = [...readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => join(dir, f)), ...readdirSync(join(dir, 'helpers')).filter((f) => f.endsWith('.ts')).map((f) => join(dir, 'helpers', f))];
const sleeps = files.flatMap((f) => readFileSync(f, 'utf8').split('\n').map((l, i) => ({ at: `${f}:${i + 1}`, l })).filter(({ l }) => /\.waitForTimeout\(/.test(l) && !/^\s*(\/\/|\*)/.test(l)));

describe('the browser specs wait for a state (A23)', () => {
  it('every fixed sleep left says why no state can be waited for: a timer of the app or the browser, or a rate read over time', () => {
    const bare = sleeps.filter(({ l }) => !/(\/\/|\/\*) a negative|the app's own (rule|timer)|the browser's own timer/.test(l));
    expect(bare.map(({ at }) => at)).toEqual([]);
  });
  it('they are few: eight, each named in its reason (round eighty-six added two negatives: no thumbnail asked while the lead is held)', () => {
    expect(sleeps.length).toBeLessThanOrEqual(8);
  });
});
