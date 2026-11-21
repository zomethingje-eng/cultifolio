/**
 * Round 103 (docs/PLAN-103.md, b; the launch review's round 2): each word of art a species page explains in a tip has its
 * entry in the glossary on /about/how, under the anchor the tip links to, and the tip is that entry's first words exactly,
 * so the two cannot say different things. A quoted word links its source in the entry; CITES's quotes nothing of the
 * Convention (its site refused an automated reader on 21 November 2026) and says the page does not read a listing's terms.
 *
 * On f7f2867: no terms module, no tips and six of the eleven words had no glossary entry; every test here FAILED.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TERMS, termAnchor, termHref, type TermKey } from '$lib/ui/ref/terms';

const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8');
const plain = (h: string) => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const keys = Object.keys(TERMS) as TermKey[];

describe('r103b: the tips and the glossary say one thing', () => {
  it('the eleven words the hand-off named, each with a tip', () => {
    expect(keys.sort()).toEqual(['cell', 'cites', 'coldFloor', 'dli', 'koppen', 'range', 'researchGrade', 'rhs', 'typicalSpot', 'usda', 'walterLieth'].sort());
    for (const k of keys) {
      expect(TERMS[k].tip.length, k).toBeGreaterThan(40);
      expect(TERMS[k].tip, k).toMatch(/[.!?"]$/);
    }
  });

  for (const k of keys) {
    it(`${k}: its glossary entry is under ${termAnchor(k)}, headed by its label, and begins with the tip word for word`, () => {
      const m = new RegExp(`<div id="${termAnchor(k)}"><dt>([^<]+)</dt><dd>([\\s\\S]*?)</dd></div>`).exec(how);
      expect(m, termAnchor(k)).not.toBeNull();
      expect(m![1]).toBe(TERMS[k].label);
      expect(plain(m![2]).startsWith(TERMS[k].tip), `${k}: "${plain(m![2]).slice(0, 80)}"`).toBe(true);
      const q = TERMS[k].quoted;
      if (q) {
        expect(m![2], k).toContain(`href="${q.url}"`);
        expect(plain(m![2]), k).toContain(`read ${q.read}`);
        expect(TERMS[k].tip, k).toMatch(/words.*: "/);
      }
      expect(termHref(k)).toBe(`/about/how#${termAnchor(k)}`);
    });
  }

  it('CITES: no meaning of a listing is written, and the Convention is linked', () => {
    expect(TERMS.cites.tip).not.toMatch(/permit|threatened|requires? (?:an?|the) /i);
    expect(how).toMatch(/<div id="term-cites-appendices">[\s\S]*?href="https:\/\/cites\.org\/eng\/disc\/text\.php"/);
  });

  it('the glossary\'s head says the tips read it', () => {
    expect(how).toContain('a word dotted on a species page opens its first words here in a tip.');
  });
});
