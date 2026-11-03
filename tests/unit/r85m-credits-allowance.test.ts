/**
 * Round eighty-five, the owner's credits run of 3 November 2026: `--fill credits` made iNaturalist's 4,000 requests of the
 * day by 20:42 UTC, then went on through every page left, each request refused unsent by the day's allowance, and said
 * "4106 requests not answered: run --fill credits again", which the plan read as "a source did not answer ... in an hour
 * or so". The second run an hour later asked nothing and said the same. At the allowance the fill now stops, says it is
 * the day's allowance, and says to run it again tomorrow, after midnight UTC, which `corpus-step` reads as the allowance.
 *
 * FAILS on 91896bb: the run goes on, prints "requests not answered" and no allowance line.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { UNFINISHED } from '../../scripts/corpus-step.mjs';

const root = resolve('.');
/** Two fixture pages whose iNaturalist credits carry no day read, and a fake API that answers nothing it is not given. */
function folder() {
  const dir = mkdtempSync(join(tmpdir(), 'r85m-credits-'));
  const v3 = join(dir, 'static/s/v3');
  mkdirSync(v3, { recursive: true });
  for (const k of ['k2735933', 'k339841']) writeFileSync(join(v3, `${k}.json`), readFileSync(`fixtures/dossiers/s/v3/${k}.json`));
  writeFileSync(join(dir, 'fake.mjs'), `import { appendFileSync } from 'node:fs';\nglobalThis.fetch = async (u) => { appendFileSync(${JSON.stringify(join(dir, 'asked.txt'))}, String(u) + '\\n'); throw new TypeError('fetch failed'); };\n`);
  return { dir, v3 };
}
const fill = (dir: string, extra: string[] = []) =>
  spawnSync(process.execPath, ['--import', pathToFileURL(join(dir, 'fake.mjs')).href, '--import', pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href, join(root, 'scripts/build-dossiers.ts'), '--fill', 'credits', '--no-cache', ...extra], { cwd: dir, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(root, 'tsconfig.json'), CULTIFOLIO_SLOW_RETRY_MS: '5', CULTIFOLIO_INAT_WAITS: '0' } });
const asked = (dir: string) => (existsSync(join(dir, 'asked.txt')) ? readFileSync(join(dir, 'asked.txt'), 'utf8').trim().split('\n').filter(Boolean) : []);
const unread = (v3: string, k: string) => (JSON.parse(readFileSync(join(v3, `${k}.json`), 'utf8')).photos as Array<{ src: string; read?: string }>).filter((p) => p.src === 'inat' && !p.read).length;

describe("--fill credits at iNaturalist's day's allowance", () => {
  it('stops, sends nothing to iNaturalist, says it is the allowance and tomorrow, and exits unfinished', () => {
    const { dir, v3 } = folder();
    const before = [unread(v3, 'k2735933'), unread(v3, 'k339841')];
    const r = fill(dir, ['--inat-budget', '0']);
    expect(r.status).toBe(3);
    expect(asked(dir).filter((u) => u.includes('inaturalist.org'))).toEqual([]);
    const line = r.stdout.split('\n').find((l) => UNFINISHED.test(l)) ?? '';
    // The first line the plan reads is the allowance's, which it says as "tomorrow, after midnight UTC".
    expect(line).toMatch(/today's allowance of 0 requests is spent \(UTC [\d-]+\)/);
    expect(line).toMatch(/run --fill credits again tomorrow, after midnight UTC/);
    expect(line).toMatch(/allowance of \d+ requests is spent/); // corpus-step's test for "the day's allowance is spent"
    expect(r.stdout).not.toMatch(/requests not answered/);
    expect([unread(v3, 'k2735933'), unread(v3, 'k339841')]).toEqual(before); // nothing stamped, nothing lost
    rmSync(dir, { recursive: true, force: true });
  }, 180_000);

  it('guard: a source that does not answer, under the allowance, is still "not answered", to be asked again', () => {
    const { dir } = folder();
    const r = fill(dir, ['--inat-budget', '100']);
    expect(r.status).toBe(3);
    expect(asked(dir).some((u) => u.includes('inaturalist.org'))).toBe(true);
    expect(r.stdout).toMatch(/\d+ requests not answered: run --fill credits again; it reads only what is left\./);
    expect(r.stdout).not.toMatch(/allowance of \d+ requests is spent/);
    rmSync(dir, { recursive: true, force: true });
  }, 180_000);
});
