/**
 * Round seventy-three, the harness (agent H): the smoke split, and the race that withdrew it in round seventy-two.
 *
 * smoke.spec.ts ran its 119 tests in one worker. Round seventy-two split it into four files and withdrew the split when one
 * test failed beside the other parts in three runs of three. The cause was no state the files share: the removal's Undo
 * is raised as the app's own navigation to /plants begins, and a toast goes at a navigation that lands more than 600 ms
 * after it was raised (src/lib/ui/toast.svelte.ts, onNavigate). Four smoke files at once on a loaded machine made that
 * navigation take 1.1 s, and the Undo was gone. With the navigation held 800 ms the old test fails every time.
 *
 * So this guard reads the specs:
 * - the four smoke files, each calling the shared hooks, and no smoke.spec.ts beside them;
 * - a test that presses a removal the app answers by navigating ("Yes, remove") and then reads the toast on the page it
 *   lands on holds Date.now() still before the press (the test is about the toast's words or its Undo, never its time);
 * - the same test reads the plant page's photograph state only after the species' sheet has answered: under that load
 *   the sheet took past the 5 s an assertion waits, which round seventy-two read as the photograph failing to say so;
 * - r62g 3 is given its write's time in WebKit (192 s of its 240 on the owner's PC).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = resolve(__dirname, '../e2e');
const specs = readdirSync(dir).filter((f) => f.endsWith('.spec.ts'));
/** Each top-level `test(` block of a spec, by its title, with its source. */
function blocks(src: string): { title: string; body: string }[] {
  const starts = [...src.matchAll(/^test(?:\.\w+)?\((['"`])(.*?)\1/gm)].map((m) => ({ at: m.index!, title: m[2] }));
  return starts.map((s, i) => ({ title: s.title, body: src.slice(s.at, starts[i + 1]?.at ?? src.length) }));
}

describe('the smoke tests run as four files, each in order (round seventy-three)', () => {
  it('smoke-1 to smoke-4 are there, and smoke.spec.ts is not', () => {
    expect(existsSync(join(dir, 'smoke.spec.ts'))).toBe(false);
    for (const n of [1, 2, 3, 4]) expect(existsSync(join(dir, `smoke-${n}.spec.ts`)), `smoke-${n}.spec.ts`).toBe(true);
  });
  it('each runs the hooks smoke.spec.ts ran (the own pages, the Save trace, the warm-up)', () => {
    for (const n of [1, 2, 3, 4]) expect(readFileSync(join(dir, `smoke-${n}.spec.ts`), 'utf8')).toMatch(/^smokeSetup\(\);$/m);
  });
});

describe("a toast read after the app's own navigation is read with the clock held (round seventy-three)", () => {
  /** A press the app answers with a toast and a navigation begun together: removing a plant, a place or a batch. */
  const REMOVE = /name: (?:`Yes, remove[^`]*`|'Yes, remove[^']*')/;
  /** The toast read, before the test itself loads another page. */
  // r73p-toast's subject is the toast's timing itself, on a slow device: it must not hold the clock (the merge of round seventy-three).
  const offenders = () => specs.filter((f) => f !== 'r73p-toast.spec.ts').flatMap((f) => blocks(readFileSync(join(dir, f), 'utf8')).flatMap((b) => {
    const out: string[] = [];
    for (const m of b.body.matchAll(new RegExp(REMOVE.source, 'g'))) {
      const after = b.body.slice(m.index!);
      const next = after.search(/page\.(goto|reload)\(/);
      const read = after.search(/\.toast\b/);
      if (read < 0 || (next >= 0 && next < read)) continue;
      if (!/clock\.setFixedTime\(/.test(b.body.slice(0, m.index!))) out.push(`${f}: ${b.title}`);
    }
    return out;
  }));
  it('finds the removals it is about (the guard reads something)', () => {
    const removals = specs.flatMap((f) => blocks(readFileSync(join(dir, f), 'utf8')).filter((b) => REMOVE.test(b.body)));
    expect(removals.length).toBeGreaterThanOrEqual(3);
  });
  it('every such test holds Date.now() still before the press', () => {
    expect(offenders()).toEqual([]);
  });
});

describe("the plant page's photograph state is read after the reference's answer (round seventy-three)", () => {
  it('smoke-2 "removing asks twice" waits for the species link before reading that the photograph did not load', () => {
    const b = blocks(readFileSync(join(dir, 'smoke-2.spec.ts'), 'utf8')).find((x) => x.title.startsWith('removing asks twice'));
    const body = b?.body ?? '';
    const answered = body.indexOf("page.locator('#species-link')).toBeVisible(");
    const read = body.indexOf("The reference's photograph did not load.");
    expect(answered).toBeGreaterThan(0);
    expect(answered).toBeLessThan(read);
  });
});

describe("WebKit's slowest test has its write's time (round seventy-three; the owner's run of round seventy-two)", () => {
  it('r62g 3 adds the 12,000 requests of its write at the WebKit pace', () => {
    const b = blocks(readFileSync(join(dir, 'r62g-import.spec.ts'), 'utf8')).find((x) => x.title.startsWith('r62g 3:'));
    expect(b?.body).toMatch(/allowWrites\(12_000 \* WEBKIT_MS_PER_REQUEST\)/);
  });
});
