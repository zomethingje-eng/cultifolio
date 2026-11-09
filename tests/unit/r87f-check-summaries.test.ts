/**
 * Round eighty-seven, the review of the pipeline's changes (S5), the data fix: `--check-summaries` said "No page quotes
 * another plant's article." when some summaries were not checked (22 of 430 in the review's sample): a summary with no
 * proof recorded may be another plant's article that is no page of the reference. Rule 2: it now says "none of the N
 * checked; M not checked", lists those in check-summaries-unchecked.txt, and exits 4, which the plan's runner reads as a
 * stop to read (`classify`), not as done and not as a failure.
 *
 * On r87s1 (381aea9): the words were "No page quotes another plant's article.", no list was written, and the exit was 0.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkSummaryTitles, summaryCheckWords, UNCHECKED_FILE, UNCHECKED_EXIT, type SummaryPage } from '$dossier/summary-check';
import { classify, stopSentence } from '../../scripts/corpus-step.mjs';

const ROOT = resolve('.');
const builder = (cwd: string, ...args: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href, join(ROOT, 'scripts/build-dossiers.ts'), ...args], { cwd, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(ROOT, 'tsconfig.json') } });
const DOS = JSON.parse(readFileSync('tests/unit/fixtures/r86r-dossiers.json', 'utf8')).dossiers as Record<string, Record<string, unknown> & { key: string; name: { scientific: string }; summary?: unknown; upstream: Record<string, unknown> }>;

const p = (key: string, scientific: string, title: string, detail?: string): SummaryPage => ({ key, name: { scientific, synonyms: [] }, summary: { title }, ...(detail ? { upstream: { wikipedia: { status: 'ok', detail } } } : {}) });

describe('"not checked" is said apart, never as none', () => {
  it('none of those checked, and how many were not, with the file', () => {
    const c = checkSummaryTitles([p('k1', 'Lithops lesliei', 'Lithops lesliei'), p('k2', 'Ceropegia elegans', 'Ceropegia'), p('k3', 'Aloe vera', 'Aloe vera')]);
    expect(c.unchecked).toEqual(['k2 Ceropegia elegans\tCeropegia: no proof is recorded; not checked: reading one needs Wikidata and Wikipedia (--fill summaries asks them)']);
    expect(summaryCheckWords(c, 'check-summaries.txt')[1]).toBe(`  None of the 2 summaries checked quotes another plant's article; 1 not checked (no proof recorded) → ${UNCHECKED_FILE}: read them, or run --fill summaries, which asks Wikidata and Wikipedia, and this check again.`); // r87s1: "No page quotes another plant's article."
    const all = checkSummaryTitles([p('k1', 'Lithops lesliei', 'Lithops lesliei')]);
    expect(all.unchecked).toEqual([]);
    expect(summaryCheckWords(all, 'x')[1]).toBe("  No page quotes another plant's article.");
  });
  it('with a fault too, the fault first and the unchecked after', () => {
    const c = checkSummaryTitles([p('k1', 'Mentha × rotundifolia', 'Mentha longifolia'), p('k2', 'Mentha longifolia', 'Mentha longifolia'), p('k3', 'Ceropegia elegans', 'Ceropegia')]);
    expect(summaryCheckWords(c, 'check-summaries.txt')[1]).toMatch(/^  Not ready to upload: 1 page quotes another plant's article .*\. And 1 not checked \(no proof recorded\) → check-summaries-unchecked\.txt: .*\.$/);
  });
  it('the plan\'s runner stops to read on the check\'s exit 4, and says what was not checked', () => {
    expect(UNCHECKED_EXIT).toBe(4);
    const output = "  2 dossiers read, …, 1 not checked (no proof recorded: --fill summaries asks Wikidata and Wikipedia), 0 another plant's article → check-summaries.txt (1 pages)\n  None of the 1 summary checked quotes another plant's article; 1 not checked (no proof recorded) → check-summaries-unchecked.txt: read them, or run --fill summaries, which asks Wikidata and Wikipedia, and this check again.\n";
    const r = classify({ code: 4, output, dropsWritten: false });
    expect(r).toEqual({ status: 'review', why: "None of the 1 summary checked quotes another plant's article; 1 not checked (no proof recorded) → check-summaries-unchecked.txt: read them, or run --fill summaries, which asks Wikidata and Wikipedia, and this check again" });
    expect(stopSentence({ line: 'dossier --check-summaries' }, r)).toBe(`Review: ${r.why}. When it is as expected, carry on with: node scripts/corpus-step.mjs --go-on`);
    expect(classify({ code: 2, output: '', dropsWritten: false }).status).toBe('failed'); // a fault stays a stop that fails
  });
});

describe('--check-summaries on the real builder', () => {
  it('lists the unchecked summaries and exits 4; checked all, it removes the list and exits 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'r87f-summ-'));
    mkdirSync(join(dir, 'static/s/v3'), { recursive: true });
    const a = structuredClone(DOS.k361567), b = structuredClone(DOS.k294532);
    a.summary = { text: 'A begonia.', source: 'wikipedia', url: 'https://en.wikipedia.org/wiki/Begonia', licence: 'CC BY-SA 4.0', title: 'Begonia' };
    a.upstream.wikipedia = { status: 'ok', at: '2026-10-21T00:00:00.000Z', detail: 'carried from build of 2026-10-21; this build: skipped' };
    b.summary = { text: 'Albuca fastigiata is a plant.', source: 'wikipedia', url: 'https://en.wikipedia.org/wiki/Albuca_fastigiata', licence: 'CC BY-SA 4.0', title: b.name.scientific };
    for (const d of [a, b]) writeFileSync(join(dir, `static/s/v3/${d.key}.json`), JSON.stringify(d));
    const r = builder(dir, '--check-summaries');
    expect(r.status, r.stderr).toBe(4); // r87s1: 0
    expect(r.stdout).toContain("None of the 1 summary checked quotes another plant's article; 1 not checked (no proof recorded) → check-summaries-unchecked.txt");
    expect(r.stdout).not.toContain('No page quotes');
    expect(readFileSync(join(dir, UNCHECKED_FILE), 'utf8')).toBe('k361567 Begonia faustinoi\tBegonia: no proof is recorded; not checked: reading one needs Wikidata and Wikipedia (--fill summaries asks them)\n');
    a.upstream.wikipedia = { status: 'ok', at: '2026-10-21T00:00:00.000Z', detail: "Wikipedia's article Begonia, whose one accepted species in Kew's WCVP is this species" };
    writeFileSync(join(dir, `static/s/v3/${a.key}.json`), JSON.stringify(a));
    const again = builder(dir, '--check-summaries');
    expect(again.status, again.stderr).toBe(0);
    expect(again.stdout).toContain("No page quotes another plant's article.");
    expect(existsSync(join(dir, UNCHECKED_FILE))).toBe(false);
  }, 120_000);
});
