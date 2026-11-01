/**
 * Round eighty-five, agent U: outside review A19 ("204 catch sites say nothing") and A23's class of them.
 *
 * The rule, as /about and the code's own comments promise it: a failure is said, or the code says why it need not be.
 * Every `catch` in the app's source either does something (rethrows, returns a value its caller reads, sets a state a
 * page shows, logs) or carries its reason beside it. What this test refuses is the handler that does neither: an empty
 * `catch {}` block, or `.catch(() => {})` / `.catch(() => undefined)`, with no comment inside it, after it on its line,
 * or on the line just above it.
 *
 * This reads the source, which is what the rule is about: it holds no behaviour, only that no failure is dropped without
 * a stated reason. On r85base it found 52 such handlers; each now acts (the refold after a change of the clock says its
 * failure, `CLOCK_FOLD_FAILED`) or says why it need not (the service worker's housekeeping, an edge cache's copy not kept,
 * a transaction aborted on purpose).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '../..');

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|js|svelte)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const BLOCK = /catch\s*(\([^)]*\))?\s*\{(\s*)\}/g;
const ARROW = /\.catch\(\s*(?:async\s*)?\(\s*\w*\s*\)\s*=>\s*(\{\s*\}|undefined|void 0)\s*\)/g;

/** Every handler in `text` that neither acts nor says why, as `line: text`. */
export function silentCatches(text: string): string[] {
  const out: string[] = [];
  for (const rx of [BLOCK, ARROW]) {
    rx.lastIndex = 0;
    for (let m = rx.exec(text); m; m = rx.exec(text)) {
      const start = text.lastIndexOf('\n', m.index) + 1;
      const endAt = text.indexOf('\n', m.index + m[0].length);
      const end = endAt < 0 ? text.length : endAt;
      const after = text.slice(m.index + m[0].length, end);
      const prev = text.slice(text.lastIndexOf('\n', Math.max(0, start - 2)) + 1, Math.max(0, start - 1)).trim();
      const said = /\/\/|\/\*/.test(after) || prev.startsWith('//') || prev.startsWith('*') || prev.endsWith('*/');
      if (!said) out.push(`${text.slice(0, m.index).split('\n').length}: ${text.slice(start, end).trim().slice(0, 120)}`);
    }
  }
  return out;
}

describe('every catch acts or says why (A19)', () => {
  it('the rule reads a silent handler as silent and a reasoned one as said', () => {
    expect(silentCatches('try { a(); } catch {}')).toHaveLength(1);
    expect(silentCatches('p.catch(() => {});')).toHaveLength(1);
    expect(silentCatches('p.catch((e) => undefined);')).toHaveLength(1);
    expect(silentCatches('try { a(); } catch { /* the next run asks again */ }')).toEqual([]);
    expect(silentCatches('p.catch(() => { /* housekeeping */ });')).toEqual([]);
    expect(silentCatches('p.catch(() => {}); // aborted on purpose')).toEqual([]);
    expect(silentCatches('// the copy is a convenience\np.catch(() => {});')).toEqual([]);
    expect(silentCatches('p.catch((e) => { console.warn(e); });')).toEqual([]);
    expect(silentCatches('p.catch(() => null);')).toEqual([]); // a value the caller reads
  });
  it('no handler in src/ drops a failure without a word', () => {
    const found: string[] = [];
    for (const f of files(join(ROOT, 'src'))) for (const s of silentCatches(readFileSync(f, 'utf8'))) found.push(`${relative(ROOT, f)}:${s}`);
    expect(found).toEqual([]);
  });
});
