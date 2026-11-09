/**
 * Round eighty-seven (the record): round eighty-seven's entry on /changes, `$lib/changes/rounds`.
 *
 * The round goes live in three stages (docs/REVIEW-ROUND-87.md, section 5): stage 1's code and index, stage 2's code
 * and then its walk, stage 3's code. /changes and the front page's "Changed lately" read `ROUNDS` and know nothing of
 * stages, so a line of a stage not yet live must not be in `ROUNDS` at all.
 *
 * 1. Round eighty-seven is the newest entry, dated the day its record was finished, and lists exactly its live stages'
 *    lines, in order; no line of a later stage reaches /changes or "Changed lately".
 * 2. Every stage's line keeps the list's rules now, so raising `R87_LIVE_STAGE` cannot break them: at most eight, each a
 *    whole plain sentence of forty words or fewer.
 * 3. A line says only its own stage's changes: a stage-1 line names nothing stages 2 and 3 bring, a stage-2 line nothing
 *    of the tracker, and no line says CITES, which every page says "not asked" until the owner has checked the table.
 * 4. The record says how the stage is raised.
 *
 * On the base (r87final, dd20377) round eighty-seven has no entry and the module exports no staged lines: every test
 * here fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ROUNDS, R87_LINES, R87_LIVE_STAGE, liveLines, changedLately, recordHref } from '$lib/changes/rounds';

const r87 = () => ROUNDS.find((r) => r.n === 87);

describe('r87rec changes 1: round eighty-seven lists its live stages alone', () => {
  it('is the newest entry, dated 9 November 2026, the day its record was finished', () => {
    expect(ROUNDS[0].n).toBe(87);
    expect(ROUNDS[0].date).toBe('2026-11-09');
    expect(readFileSync('docs/REVIEW-ROUND-87.md', 'utf8')).toMatch(/9 November/);
    expect(recordHref(87)).toMatch(/docs\/REVIEW-ROUND-87\.md$/);
  });
  it('lists exactly the lines of the stages live, in order', () => {
    const want = R87_LINES.filter((l) => l.stage <= R87_LIVE_STAGE).map((l) => l.text);
    expect(r87()!.lines).toEqual(want);
    expect(want.length).toBeGreaterThanOrEqual(2);
  });
  it('no line of a later stage reaches /changes or "Changed lately"', () => {
    const later = R87_LINES.filter((l) => l.stage > R87_LIVE_STAGE).map((l) => l.text);
    const shown = ROUNDS.flatMap((r) => r.lines);
    const lately = changedLately(10_000).map((c) => c.text);
    for (const t of later) {
      expect(shown, t).not.toContain(t);
      expect(lately, t).not.toContain(t);
    }
  });
  it('stage 1 is live and the later stages are not, until their deploys raise it', () => {
    expect(R87_LIVE_STAGE).toBe(1);
  });
  it('liveLines keeps the stages up to the one given, in order', () => {
    const ls = [{ stage: 1, text: 'A.' }, { stage: 3, text: 'C.' }, { stage: 2, text: 'B.' }] as const;
    expect(liveLines(ls, 0)).toEqual([]);
    expect(liveLines(ls, 1)).toEqual(['A.']);
    expect(liveLines(ls, 2)).toEqual(['A.', 'B.']);
    expect(liveLines(ls, 3)).toEqual(['A.', 'C.', 'B.']);
  });
  it('the stages run in order down the list, every stage has a line, and stage 1 is listed first on the front page', () => {
    const st = R87_LINES.map((l) => l.stage);
    expect(st).toEqual([...st].sort());
    expect(new Set(st)).toEqual(new Set([1, 2, 3]));
    expect(changedLately(1)[0].text).toBe(R87_LINES[0].text);
  });
});

describe('r87rec changes 2: every stage\'s line keeps the list\'s rules', () => {
  it('at most eight lines with every stage live, each a whole plain sentence of forty words or fewer', () => {
    expect(R87_LINES.length).toBeLessThanOrEqual(8);
    expect(liveLines(R87_LINES, 3)).toHaveLength(R87_LINES.length);
    for (const { text: l } of R87_LINES) {
      expect(l).toMatch(/^[A-Z0-9"'“‘]/);
      expect(l).toMatch(/[.)]$/);
      expect(l).not.toMatch(/[—!]|\p{Extended_Pictographic}/u);
      expect(l.split(/\s+/).length, l).toBeLessThanOrEqual(40);
      expect(l).not.toMatch(/\b(?:amazing|seamless|powerful|exciting|blazing|delight|revolution|game-changing|best-in-class)/i);
      // No line says "now" of itself or what is to come: each says what is there once its stage is live.
      expect(l).not.toMatch(/\b(?:soon|coming|will|upcoming|new!)\b/i);
    }
  });
});

describe('r87rec changes 3: a line says only its own stage\'s changes', () => {
  const STAGE2 = /Köppen|USDA|RHS|hardiness|At home|aim for|flowering|extinction|chromosome|ChromoDB|WFO|register|published|parents|pinned|pin\b/i;
  const STAGE3 = /My plants|accession|no longer held|ITF2|field number|BCSS|cross|graft|offset|batch|growing season|rest months|Today|papers|label|tape|lock|spreadsheet|report/i;
  it('a stage-1 line names nothing of stages 2 and 3, and a stage-2 line nothing of the tracker', () => {
    for (const l of R87_LINES.filter((x) => x.stage === 1)) {
      expect(l.text, l.text).not.toMatch(STAGE2);
      expect(l.text, l.text).not.toMatch(STAGE3);
    }
    for (const l of R87_LINES.filter((x) => x.stage === 2)) expect(l.text, l.text).not.toMatch(STAGE3);
  });
  it('no line says CITES, which every page says "not asked" until the owner has checked the table', () => {
    for (const l of R87_LINES) expect(l.text).not.toMatch(/CITES|Species\+/);
  });
});

describe('r87rec changes 4: the record says how the stage is raised', () => {
  it('names R87_LIVE_STAGE, its value now, and stage 3\'s deploy setting it to 3', () => {
    const rec = readFileSync('docs/REVIEW-ROUND-87.md', 'utf8');
    expect(rec).toMatch(/`R87_LIVE_STAGE` in\s+`src\/lib\/changes\/rounds\.ts`, now 1/);
    expect(rec).toMatch(/sets `R87_LIVE_STAGE` in `src\\lib\\changes\\rounds\.ts` to 3/);
  });
});
