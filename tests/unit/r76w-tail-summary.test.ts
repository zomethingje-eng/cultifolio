/**
 * Round seventy-six (W): `scripts/tail-summary.mjs`, which DEPLOY.md has the owner run on what `wrangler tail --format
 * json` wrote, says each request's outcome, CPU and address, and names any outcome that is not "ok" (`exceededMemory`
 * from the 50,000-species memory test). FAILS on r76base: the script is not there.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (text: string) => {
  const f = join(mkdtempSync(join(tmpdir(), 'tail-')), 'tail.json');
  writeFileSync(f, text);
  try { return { code: 0, out: execFileSync(process.execPath, ['scripts/tail-summary.mjs', f], { encoding: 'utf8' }) }; } catch (e) { const x = e as { status: number; stdout: string }; return { code: x.status, out: x.stdout }; }
};
const req = (url: string, outcome: string, cpuTime: number) => JSON.stringify({ outcome, cpuTime, wallTime: cpuTime + 40, event: { request: { url, method: 'GET' } }, logs: [{ message: ['a { brace "in" a log'] }] }, null, 2);

describe('the cold-start summary (round seventy-six)', () => {
  it('one line a request, the most CPU, and every outcome that is not ok', () => {
    const { code, out } = run(`${req('https://cultifolio.com/species/copiapoa-cinerea', 'ok', 41)}\n${req('https://cultifolio-scale.example.workers.dev/api/search?q=aloe', 'exceededMemory', 812)}\n`);
    expect(code).toBe(0);
    expect(out).toMatch(/ok\s+41\s+81\s+\/species\/copiapoa-cinerea/);
    expect(out).toMatch(/exceededMemory\s+812\s+852\s+\/api\/search\?q=aloe/);
    expect(out).toContain('the most CPU any took: 812 ms. 1 did not end "ok": exceededMemory.');
  });
  it('says so when the file holds no request', () => {
    expect(run('wrangler said something\n')).toMatchObject({ code: 1, out: expect.stringContaining('holds no requests') });
  });
});
