/**
 * Round seventy-two (REVIEW-TRIAGE-71 D7): a fill that stops before every dossier was answered exits 3, so the one
 * command (and anyone reading the end of a run) knows to run it again; r72base exited 0 and said so only in a sentence.
 * Runs the script on fixture dossiers with every request failing. FAILED on r72base (exit 0).
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { classify } from '../../scripts/corpus-step.mjs';

const ROOT = resolve('.');

describe('an unfinished fill exits 3', () => {
  it('--fill kew-links with GBIF not answering: the sentence, and exit 3', () => {
    const dir = mkdtempSync(join(tmpdir(), 'r72d-exit-'));
    const v2 = join(dir, 'static/s/v3');
    mkdirSync(v2, { recursive: true });
    for (const f of readdirSync(join(ROOT, 'fixtures/dossiers/s/v3')).filter((x) => /^[kg]\d+\.json$/.test(x))) copyFileSync(join(ROOT, 'fixtures/dossiers/s/v3', f), join(v2, f));
    // Every request fails as a dropped connection does.
    writeFileSync(join(dir, 'offline.mjs'), "globalThis.fetch = async () => { throw new TypeError('fetch failed'); };\n");
    const r = spawnSync(process.execPath, ['--import', pathToFileURL(join(dir, 'offline.mjs')).href, '--import', pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href, join(ROOT, 'scripts/build-dossiers.ts'), '--fill', 'kew-links', '--no-cache'], { cwd: dir, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(ROOT, 'tsconfig.json') } });
    expect(r.stdout).toMatch(/GBIF did not answer \(api\.gbif\.org fetch failed\); run --fill kew-links again/);
    expect(r.status).toBe(3); // r72base: 0
    expect(classify({ code: r.status ?? 1, output: r.stdout, dropsWritten: false })).toEqual({ status: 'unfinished', why: 'GBIF did not answer (api.gbif.org fetch failed)' });
  }, 120_000);
});
