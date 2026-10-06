/**
 * Corpus review of round sixty: the common name shown for a species.
 *
 * - "englishNames shows ..." FAILS on current code (21257b7): it is the reproduction. `englishNames` shows GBIF's first
 *   English name, so Curio rowleyanus is "String-Of-Beads Senecio" on its tile, its row and (through the dossier) in its
 *   page title, while "String-of-Pearls" is in `commons`.
 * - "the proposed rule ..." PASSES: it tests `displayCommon` below, a rule with no hand-picked names, written to be
 *   moved into src/lib/dossier/index-entry.ts and called by scripts/build-dossiers.ts with the corpus's genera.
 * - "audit" runs only with INDEX=<path to a built index.json>: it prints how many species the rule would change and
 *   why, which is the measure of how widespread the problem is on the real corpus (the live site was not reachable from
 *   the review's sandbox). Run: INDEX=static/s/v2/index.json npx vitest run tests/unit/corpus--common-name-rule.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { englishNames } from '$dossier/index-entry';

type V = { name: string; lang?: string; source?: string; preferred?: boolean };

/** Words of a name, for grouping spellings: case, hyphens, spaces and apostrophes do not make a different name. */
const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[’`]/g, "'").replace(/[-\s]+/g, ' ').trim();
/** Capitals after the first letter: "String-Of-Beads Senecio" has three, "String of pearls" none. */
const extraCaps = (s: string) => (s.slice(1).match(/\p{Lu}/gu) ?? []).length;
/** A capitalised little word inside a hyphenated name is a mark of mechanical title case ("String-Of-Beads"); any other capital may be a proper noun and is kept. */
const unTitle = (s: string) => s.replace(/(?<=-)(Of|The|And|In|On|A)(?=-)/g, (w) => w.toLowerCase());

/**
 * The common name to show, by rule:
 *   1. English names only (`lang` "eng"), grouped by their words (case, hyphens and spaces aside);
 *   2. a name that names another genus of the corpus ("... Senecio" for a Curio, "... aloe" for a Gonialoe is the
 *      species' own former genus too) goes after every name that does not;
 *   3. then the name GBIF marks preferred, when the build keeps that flag;
 *   4. then the name more sources give (the build counts sources before it removes duplicates; until then, the number
 *      of spellings in the group stands in);
 *   5. then GBIF's order (today's rule, kept as the last tie-break);
 *   and the spelling shown is the group's with the fewest capitals after the first letter, with a capitalised little
 *   word between hyphens lowered ("String-Of-Beads" is "String-of-Beads").
 */
export function displayCommon(vernacular: V[], ownGenus: string, genera: ReadonlySet<string>): string | undefined {
  const groups = new Map<string, { at: number; spellings: string[]; sources: Set<string>; preferred: boolean }>();
  vernacular.forEach((v, i) => {
    if (v.lang !== 'eng' || typeof v.name !== 'string' || !v.name.trim()) return;
    const name = v.name.trim().replace(/\s+/g, ' ');
    const k = norm(name);
    const g = groups.get(k) ?? { at: i, spellings: [], sources: new Set<string>(), preferred: false };
    g.spellings.push(name);
    g.sources.add(v.source ?? `#${i}`);
    g.preferred ||= !!v.preferred;
    groups.set(k, g);
  });
  if (!groups.size) return undefined;
  const own = ownGenus.toLowerCase();
  const namesOther = (k: string) => k.split(/[^a-z]+/).some((w) => w !== own && genera.has(w));
  const best = [...groups.entries()].sort(([ka, a], [kb, b]) =>
    Number(namesOther(ka)) - Number(namesOther(kb)) || Number(b.preferred) - Number(a.preferred) || b.sources.size - a.sources.size || a.at - b.at)[0][1];
  const spelling = [...best.spellings].sort((a, b) => extraCaps(a) - extraCaps(b))[0];
  return unTitle(spelling);
}

const GENERA = new Set(['curio', 'senecio', 'ceropegia', 'aloe', 'gonialoe', 'kalanchoe', 'bryophyllum', 'echeveria', 'agave', 'sansevieria', 'dracaena', 'crassula']);
// Curio rowleyanus as the review brief describes the live dossier: GBIF's first English name is "String-Of-Beads Senecio",
// and "String-of-Pearls" is among the others (the rest of the list is illustrative, of the kind GBIF returns).
const CURIO: V[] = [
  { name: 'String-Of-Beads Senecio', lang: 'eng', source: 'ITIS' },
  { name: 'String-of-Pearls', lang: 'eng', source: 'USDA PLANTS' },
  { name: 'String of pearls', lang: 'eng', source: 'Wikipedia' },
  { name: 'string of beads', lang: 'eng', source: 'Catalogue of Life' },
  { name: 'Erwtjies', lang: 'afr', source: 'x' }
];

describe('the common name shown (finding 9)', () => {
  it('englishNames shows a name that names another genus, in mechanical title case, over the species\' commoner name', () => {
    // Today: "String-Of-Beads Senecio".
    expect(englishNames(CURIO).common).not.toMatch(/Senecio/);
  });

  it('the proposed rule shows "String of pearls" for Curio rowleyanus', () => {
    expect(displayCommon(CURIO, 'Curio', GENERA)).toBe('String of pearls');
  });
  it('a name naming the species\' own genus is not set back ("Tiger aloe" for an Aloe), and a proper noun keeps its capital', () => {
    expect(displayCommon([{ name: 'Tiger Aloe', lang: 'eng' }], 'Aloe', GENERA)).toBe('Tiger Aloe');
    expect(displayCommon([{ name: 'Queen-Victoria Agave', lang: 'eng' }, { name: 'Royal agave', lang: 'eng' }], 'Agave', GENERA)).toBe('Queen-Victoria Agave');
  });
  it('the old genus in a name sets it back only when another English name exists', () => {
    expect(displayCommon([{ name: 'Tiger Aloe', lang: 'eng' }], 'Gonialoe', GENERA)).toBe('Tiger Aloe');
    expect(displayCommon([{ name: 'Tiger Aloe', lang: 'eng' }, { name: 'Partridge-breast', lang: 'eng' }], 'Gonialoe', GENERA)).toBe('Partridge-breast');
  });
  it('a name GBIF marks preferred goes first; then the one more sources give; then GBIF\'s order', () => {
    expect(displayCommon([{ name: 'Snake plant', lang: 'eng', source: 'a' }, { name: "Mother-in-law's tongue", lang: 'eng', source: 'b', preferred: true }], 'Dracaena', GENERA)).toBe("Mother-in-law's tongue");
    expect(displayCommon([{ name: 'Jade', lang: 'eng', source: 'a' }, { name: 'Money plant', lang: 'eng', source: 'b' }, { name: 'money-plant', lang: 'eng', source: 'c' }], 'Crassula', GENERA)).toBe('Money plant');
    expect(displayCommon([{ name: 'Jade', lang: 'eng' }, { name: 'Money plant', lang: 'eng' }], 'Crassula', GENERA)).toBe('Jade');
  });
  it('mechanical title case is undone only on the little words between hyphens', () => {
    expect(displayCommon([{ name: 'String-Of-Beads', lang: 'eng' }], 'Curio', GENERA)).toBe('String-of-Beads');
  });
  it('no English name: none', () => {
    expect(displayCommon([{ name: 'tweeblaarkanniedood', lang: 'afr' }], 'Welwitschia', GENERA)).toBeUndefined();
  });

  it.skipIf(!process.env.INDEX)('audit: how many species of a built index the rule would show differently, and why', () => {
    const idx = JSON.parse(readFileSync(process.env.INDEX!, 'utf8')) as Array<{ name: string; common?: string; commons?: string[] }>;
    const genera = new Set(idx.map((e) => e.name.replace(/^× /, '').split(' ')[0].toLowerCase()));
    let withCommon = 0, otherGenus = 0, hyphenCaps = 0, changed = 0;
    const examples: string[] = [];
    for (const e of idx) {
      if (!e.common) continue;
      withCommon++;
      const own = e.name.replace(/^× /, '').split(' ')[0];
      const v = [e.common, ...(e.commons ?? [])].map((name) => ({ name, lang: 'eng' }));
      if (norm(e.common).split(/[^a-z]+/).some((w) => w !== own.toLowerCase() && genera.has(w))) otherGenus++;
      if (/-\p{Lu}/u.test(e.common)) hyphenCaps++;
      const pick = displayCommon(v, own, genera);
      if (pick !== e.common) { changed++; if (examples.length < 40) examples.push(`${e.name}: "${e.common}" -> "${pick}"`); }
    }
    process.stdout.write(JSON.stringify({ species: idx.length, withCommon, commonNamesAnotherGenus: otherGenus, commonHasCapitalAfterHyphen: hyphenCaps, ruleWouldChange: changed, examples }, null, 1) + "\n");
  });
});
