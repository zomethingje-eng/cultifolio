/**
 * Round eighty-seven, the stage-2 check's six: `--check-summaries` found six pages quoting another plant's article (Mentha
 * ×rotundifolia showing Mentha longifolia's, Salix ×pendulina S. babylonica's, and four more), and an online build had
 * taken two of them again that afternoon: the builder and `--fill summaries` take a title that is one of the page's older
 * names, though it is another page's own name. Now a build, `--fill summaries` and `--fill summary-owners` take such a
 * summary off by the check's own rule (`takeOffAnotherPlants`), the record saying whose article it is, and the check then
 * passes.
 *
 * On 0e62e0e: `--fill summary-owners` was no fill (exit 2), `--fill summaries --offline` kept the summary, and the check
 * exited 2 on it.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ReferenceNames, takeOffAnotherPlants, checkSummaryTitles, type SummaryPage } from '$dossier/summary-check';

const ROOT = resolve('.');
const builder = (cwd: string, ...args: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href, join(ROOT, 'scripts/build-dossiers.ts'), ...args], { cwd, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(ROOT, 'tsconfig.json') } });
const DOS = JSON.parse(readFileSync('tests/unit/fixtures/r86r-dossiers.json', 'utf8')).dossiers as Record<string, Record<string, any>>;

type P = SummaryPage & { summary?: unknown; ids?: Record<string, unknown>; links?: Record<string, unknown>; upstream?: Record<string, unknown> };
const page = (key: string, scientific: string, title: string | null, synonyms: string[] = []): P => ({
  key, name: { scientific, synonyms }, ...(title ? { summary: { title } } : {}), ids: { wikipedia: title ?? undefined }, links: { wikipedia: 'x' },
  upstream: { wikipedia: { status: 'ok', detail: title ? `Wikipedia redirects ${scientific} to ${title}, an older name of this species (${title})` : undefined } }
});

describe('r87w: another plant\'s article taken off by the check\'s rule', () => {
  it('takes off the summary whose title is another page\'s name, even when it is one of this page\'s older names', () => {
    const rot = page('k125305', 'Mentha × rotundifolia', 'Mentha longifolia', ['Mentha longifolia auct.']);
    const lon = page('k124916', 'Mentha longifolia', 'Mentha longifolia');
    const own = page('k1', 'Lithops lesliei', 'Lithops lesliei');
    const names = new ReferenceNames();
    for (const p of [rot, lon, own]) names.add(p);
    const out = takeOffAnotherPlants([rot, lon, own], names, null, () => '2026-11-13T17:00:00.000Z');
    expect(out.map((x) => x.page.key)).toEqual(['k125305']);
    expect(rot.summary).toBeUndefined();
    expect(rot.ids?.wikipedia).toBeUndefined();
    expect(rot.links?.wikipedia).toBeUndefined();
    expect(rot.upstream?.wikipedia).toEqual({ status: 'none', at: '2026-11-13T17:00:00.000Z', detail: "Wikipedia's article Mentha longifolia is another plant's (the article of Mentha longifolia [k124916], another page of the reference, reached through Wikipedia's redirect from Mentha × rotundifolia): no summary is shown" });
    expect(lon.summary).toEqual({ title: 'Mentha longifolia' });
    // The check then finds no fault, and a second pass takes nothing.
    expect(checkSummaryTitles([rot, lon, own]).by['another-plant']).toBe(0);
    expect(takeOffAnotherPlants([rot, lon, own], names, null, () => 'x')).toEqual([]);
  });
});

describe('r87w: on the real builder', () => {
  const folder = () => {
    const dir = mkdtempSync(join(tmpdir(), 'r87w-'));
    mkdirSync(join(dir, 'static/s/v3'), { recursive: true });
    // Two pages: "Begonia faustinoi" holding the other page's name among its older names and its article as its summary,
    // reached through Wikipedia's redirect, as Salix ×pendulina held S. babylonica's; the other page under its own name.
    const a = structuredClone(DOS.k361567), b = structuredClone(DOS.k294532);
    a.name.synonyms = [...(a.name.synonyms ?? []), `${b.name.scientific} auct.`];
    a.summary = { text: 'Another plant.', source: 'wikipedia', url: 'https://en.wikipedia.org/wiki/x', licence: 'CC BY-SA 4.0', title: b.name.scientific };
    a.ids.wikipedia = b.name.scientific;
    a.upstream.wikipedia = { status: 'ok', at: '2026-11-13T00:00:00.000Z', detail: `Wikipedia redirects ${a.name.scientific} to ${b.name.scientific}, an older name of this species (${b.name.scientific})` };
    b.summary = { text: 'Its own.', source: 'wikipedia', url: 'https://en.wikipedia.org/wiki/y', licence: 'CC BY-SA 4.0', title: b.name.scientific };
    for (const d of [a, b]) writeFileSync(join(dir, `static/s/v3/${d.key}.json`), JSON.stringify(d));
    return { dir, a, b };
  };
  const read = (dir: string, key: string) => JSON.parse(readFileSync(join(dir, `static/s/v3/${key}.json`), 'utf8'));

  it('the check fails on it; --fill summary-owners takes it off, saying whose; then the check passes', () => {
    const { dir, a, b } = folder();
    expect(builder(dir, '--check-summaries').status).toBe(2);
    const r = builder(dir, '--fill', 'summary-owners');
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.stdout).toContain("1 summary another plant's article, taken off (the rule --check-summaries reads):");
    expect(r.stdout).toContain(`${a.key} ${a.name.scientific}\tWikipedia's article ${b.name.scientific} is another plant's (the article of ${b.name.scientific} [${b.key}], another page of the reference, reached through Wikipedia's redirect from ${a.name.scientific}): no summary is shown`);
    const now = read(dir, a.key);
    expect(now.summary).toBeUndefined();
    expect(now.ids.wikipedia).toBeUndefined();
    expect(now.upstream.wikipedia.status).toBe('none');
    expect(read(dir, b.key).summary.title).toBe(b.name.scientific);
    const check = builder(dir, '--check-summaries');
    expect(check.status, check.stdout).toBe(0);
    expect(check.stdout).toContain("No page quotes another plant's article.");
  }, 180_000);

  it('--fill summaries takes it off too, after its own reading', () => {
    const { dir, a } = folder();
    const r = builder(dir, '--fill', 'summaries', '--offline');
    expect(r.stdout + r.stderr).toContain("1 summary another plant's article, taken off");
    expect(read(dir, a.key).summary).toBeUndefined();
  }, 180_000);

  it('every build takes it off the pages it wrote, after Kew\'s names', () => {
    const src = readFileSync('scripts/build-dossiers.ts', 'utf8');
    const at = src.indexOf('if (builtNow) summaryOwnersStep(builtNow);');
    expect(at).toBeGreaterThan(src.indexOf('await fillKewPublishedStep(built);'));
    expect(at).toBeLessThan(src.indexOf('const drops = dropsAsWritten('));
  });
});
