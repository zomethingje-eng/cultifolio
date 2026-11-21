/**
 * Round 102 (docs/PLAN-102.md): the front page's words are /about's, and "Changed lately" is one reader's sentence a
 * round. Rule 5: the pitch and the three principles claim only what /about claims, read from both pages' source; each
 * round has a `reader` line in the changelog's style, and `latestReaders` gives the newest three, newest first.
 *
 * On 2e85918: the front page had no pitch or principles, and `Round` had no `reader`, nor `latestReaders`: every case
 * FAILED.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ROUNDS, latestReaders, roundHref } from '$lib/changes/rounds';

const front = readFileSync('src/routes/+page.svelte', 'utf8');
const about = readFileSync('src/routes/about/+page.svelte', 'utf8');
const flat = (s: string) => s.replace(/\s+/g, ' ');

describe('r102b 1: the front page claims only what /about claims', () => {
  // Each phrase the front page says of the site, and the same words on /about.
  const PHRASES = [
    "named as the World Checklist|Named as Kew's World Checklist names them",
    'Every figure comes from a named source, and the day it was read',
    'no account, no tracking, no analytics and no advertising',
    'unless you turn on sync, which encrypts them',
    'No text about a species is generated. Every sentence on a species page is a quotation, a figure with its source, or a template filled in by a fixed rule',
    'kept only where they lie inside',
    "the habitat's climate month by month",
    "space set beside its species' habitat figures",
    'GNU AGPL 3.0'
  ];
  it('every phrase is on the front page and on /about', () => {
    for (const p of PHRASES) {
      const [onAbout, onFront = onAbout] = p.split('|');
      expect(flat(front), `front: ${onFront}`).toContain(onFront.replace(/^n/, (c) => c));
      expect(flat(about).toLowerCase(), `about: ${onAbout}`).toContain(onAbout.toLowerCase());
    }
  });
  it('the H1 and the paragraph read their counts from the index, never typed', () => {
    const pitch = front.slice(front.indexOf('<section class="frontpitch"'), front.indexOf('</section>', front.indexOf('<section class="frontpitch"')));
    expect(pitch).toContain('{fmtN(data.total)} species, and every figure says where it came from.');
    expect(pitch).toContain('{fmtN(data.withClimate)} of them');
    expect(pitch.replace(/\{[^}]*\}/g, '').replace(/<[^>]*>/g, '')).not.toMatch(/\d/); // no number typed in the words
  });
  it('the mock\'s words that /about does not hold are not used', () => {
    for (const not of ['cited to the file and the day', 'No care sheet is written', 'by a published rule']) expect(front).not.toContain(not);
  });
});

describe('r102b 2: each round says itself in one sentence for a reader', () => {
  it('every round has a reader line in the changelog\'s style', () => {
    for (const r of ROUNDS) {
      expect(r.reader, `round ${r.n}`).toMatch(/^[A-Z0-9"'“‘]/);
      expect(r.reader, `round ${r.n}`).toMatch(/\.$/);
      expect(r.reader, `round ${r.n}`).not.toMatch(/[—!]|\p{Extended_Pictographic}/u);
      expect(r.reader.split(/\s+/).length, `round ${r.n}`).toBeLessThanOrEqual(24);
      expect(r.reader.replace(/\b(?:e\.g|i\.e)\./g, '').split(/\.\s/).length, `round ${r.n}: one sentence`).toBe(1);
    }
  });
  it('latestReaders gives the newest three, newest first, each linking its round', () => {
    const got = latestReaders(3);
    expect(got.map((x) => x.round)).toEqual(ROUNDS.slice(0, 3).map((r) => r.n));
    expect(got.map((x) => x.text)).toEqual(ROUNDS.slice(0, 3).map((r) => r.reader));
    expect(got[0].href).toBe(roundHref(ROUNDS[0].n));
    expect(latestReaders(0)).toEqual([]);
  });
});
