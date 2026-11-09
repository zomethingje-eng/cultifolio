/**
 * Round eighty-seven (pages): the round records as a changelog (plan D6), `$lib/changes/rounds`.
 *
 * 1. Every entry is a round with a record in docs/, newest first, dated as a calendar day no later than the record's own
 *    latest date, and linking its record on GitHub.
 * 2. The lines are plain: whole sentences, no em dash, no emoji, no exclamation, nothing a style rule takes out.
 * 3. `changedLately`, which the front page's "Changed lately" reads, gives the newest lines in order, each with its round,
 *    its date and both links, and none for a count below one.
 * 4. What /changes draws is read in the browser (tests/e2e/r87p-pages.spec.ts, 3).
 *
 * On the base (r85m head) the module and the page do not exist: every test here fails.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { ROUNDS, changedLately, recordHref, roundHref, dayText, REPO } from '$lib/changes/rounds';

describe('r87p changes 1: each entry is a recorded round', () => {
  it('rounds 80 to 86 that kept a record are all here, newest first', () => {
    const ns = ROUNDS.map((r) => r.n);
    for (const n of [80, 81, 82, 84, 85, 86]) expect(ns).toContain(n);
    expect(ns).toEqual([...ns].sort((a, b) => b - a));
    expect(new Set(ns).size).toBe(ns.length);
  });
  it('each has its record in docs/, and links it on GitHub', () => {
    for (const r of ROUNDS) {
      expect(existsSync(`docs/REVIEW-ROUND-${r.n}.md`), `round ${r.n}`).toBe(true);
      expect(recordHref(r.n)).toBe(`${REPO}/blob/main/docs/REVIEW-ROUND-${r.n}.md`);
    }
  });
  it('the repository is the one the footer and the about pages link', () => {
    expect(REPO).toBe('https://github.com/zomethingje-eng/cultifolio');
    const layout = readFileSync('src/routes/+layout.svelte', 'utf8');
    expect(layout).toContain(REPO);
  });
  it('each date is a calendar day, the dates never rising down the list', () => {
    for (const r of ROUNDS) expect(r.date, `round ${r.n}`).toMatch(/^2026-\d{2}-\d{2}$/);
    const ds = ROUNDS.map((r) => r.date);
    expect(ds).toEqual([...ds].sort().reverse());
  });
  it('round 86 is dated the day its record says it went live', () => {
    const r86 = ROUNDS.find((r) => r.n === 86)!;
    expect(readFileSync('docs/REVIEW-ROUND-86.md', 'utf8')).toMatch(/Live on 8 November/);
    expect(r86.date).toBe('2026-11-08');
  });
  it('no entry is dated before the earliest day its record names', () => {
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    for (const r of ROUNDS) {
      const text = readFileSync(`docs/REVIEW-ROUND-${r.n}.md`, 'utf8');
      const days = [
        ...[...text.matchAll(/\b(2026-\d{2}-\d{2})\b/g)].map((m) => m[1]),
        ...[...text.matchAll(/\b(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) 2026\b/g)].map((m) => `2026-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`)
      ];
      if (!days.length) continue;
      // A record is written after what it dates: the entry's day is never before the earliest day the record names.
      expect(r.date >= [...days].sort()[0], `round ${r.n}`).toBe(true);
    }
  });
});

describe('r87p changes 2: plain lines', () => {
  it('two to eight lines a round, each a whole sentence, in the site\'s style', () => {
    for (const r of ROUNDS) {
      expect(r.lines.length, `round ${r.n}`).toBeGreaterThanOrEqual(2);
      expect(r.lines.length, `round ${r.n}`).toBeLessThanOrEqual(8);
      for (const l of r.lines) {
        expect(l, `round ${r.n}`).toMatch(/^[A-Z0-9"'“‘]/);
        expect(l, `round ${r.n}`).toMatch(/[.)]$/);
        expect(l, `round ${r.n}`).not.toMatch(/[—!]|\p{Extended_Pictographic}/u);
        expect(l.split(/\s+/).length, `round ${r.n}: ${l}`).toBeLessThanOrEqual(40);
        // No word of the trade: these are what changed, not what is claimed for it.
        expect(l, `round ${r.n}`).not.toMatch(/\b(?:amazing|seamless|powerful|exciting|blazing|delight|revolution|game-changing|best-in-class)/i);
      }
    }
  });
});

describe('r87p changes 3: changedLately', () => {
  it('the newest lines, in order, each with its round, its date and its links', () => {
    const three = changedLately(3);
    expect(three).toHaveLength(3);
    const newest = ROUNDS[0];
    expect(three.map((x) => x.text)).toEqual(newest.lines.slice(0, 3));
    for (const x of three) expect(x).toEqual({ round: newest.n, date: newest.date, text: x.text, href: roundHref(newest.n), record: recordHref(newest.n) });
  });
  it('past the newest round, the next round\'s lines follow', () => {
    const n = ROUNDS[0].lines.length + 2;
    const got = changedLately(n);
    expect(got).toHaveLength(n);
    expect(got.slice(-2).map((x) => x.round)).toEqual([ROUNDS[1].n, ROUNDS[1].n]);
    expect(got.slice(-2).map((x) => x.text)).toEqual(ROUNDS[1].lines.slice(0, 2));
  });
  it('none for a count below one, and every line for a count past the list', () => {
    expect(changedLately(0)).toEqual([]);
    expect(changedLately(-2)).toEqual([]);
    expect(changedLately(10_000)).toHaveLength(ROUNDS.reduce((s, r) => s + r.lines.length, 0));
  });
  it('the default is three, and a given list is read', () => {
    expect(changedLately()).toHaveLength(3);
    expect(changedLately(2, [{ n: 9, date: '2026-01-02', lines: ['A.', 'B.', 'C.'] }]).map((x) => `${x.round} ${x.text} ${x.href}`)).toEqual(['9 A. /changes#round-9', '9 B. /changes#round-9']);
  });
  it('a date as the pages write one', () => {
    expect(dayText('2026-11-08')).toBe('8 November 2026');
    expect(dayText('2026-10-22')).toBe('22 October 2026');
    expect(dayText('not a day')).toBe('not a day');
    expect(dayText('2026-13-01')).toBe('2026-13-01');
  });
});

// What /changes draws (each round under its own anchor, its date and its record) is read in the browser: r87p-pages 3.
