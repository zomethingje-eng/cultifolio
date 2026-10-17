/**
 * Round seventy-four, decision 1 (the owner's): "Places" becomes "My spaces", to pair with "My plants". Every word a
 * grower reads that called one of their greenhouses, benches or windowsills "a place" now says "space": the tab, the
 * menu, the titles, the forms, Today, the frost watch, the import, the backup, the labels and the about pages. What is
 * kept: the addresses (`/places`, `/places/<id>`, the old `/benches` redirect), the stored data's names (`locationId`,
 * the kind `location`, the log's record types), and every "place" that is not a grower's space, each allowed below by
 * name: a geographic place, Kew's "unplaced", a vault's place in the sync ceilings, an order ("a change has no place in
 * it") and the idioms ("in place of").
 *
 * The guard reads the words of every page and module in src (`helpers/visible-text.ts`: markup, attributes and every
 * string, never a comment or an identifier). On r74base four of the five failed: 189 pieces said "place" for a space,
 * the tab's "Places", "New place", "Move to a place" and "Give it a place" among them; the bare words, alone in their
 * strings, were 14 more (the backup's counts, the held-record words, the waiting record's noun among them); the allowed geographic "a place on Earth" was not there; and the layout had no "My spaces". The
 * fifth, the stored names and the fold, is a guard and passes on both.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { piecesOf } from './helpers/visible-text';

const WORD = /\b(places?|place's|unplaced)\b/gi;

/** A piece with no space in it that is an address, a selector, an id or a kebab-case key: not a word a grower reads. */
const codeLike = (t: string) => !/\s/.test(t) && (/^[/#.[]|[=?]/.test(t) || /^[a-z0-9]+(-[a-z0-9]*)+$/.test(t));

/**
 * A bare "place" or "places", alone in its string, is a key in the code (an import field, a draft's form, a sort order,
 * a sync fault's kind, the season card's source): allowed only where it is now, by count, so a new one is looked at.
 */
const BARE: Record<string, number> = {
  'src/lib/import/csv.ts': 2, // the import's field key `place` and its header alias "place" (the label says "Space")
  'src/lib/import/rows.ts': 2, // the field key, read for the import key (hashed into importKey: unchanged)
  'src/lib/ui/grow/keep-draft.ts': 1, // the draft's form name, kept in the tab's storage
  'src/lib/ui/grow/ExampleAddLine.svelte': 1, // the same form name, as a prop's type
  'src/lib/ui/ref/Glance.svelte': 2, // where the reader's hemisphere came from: 'site' | 'places'
  'src/routes/species/[slug]/+page.svelte': 1, // the same value, set
  'src/routes/places/+page.svelte': 2, // takeDraft('place') and ExampleAddLine what="place"
  'src/routes/plants/+page.svelte': 6, // the sort order `place` and the address's `place=` parameter
  'src/routes/plants/[acc]/+page.svelte': 3, // the first steps' row key and the idcard's class
  'src/lib/server/sync.ts': 5 // the sync fault kind `place`, counted per day (FAULTS)
};

/**
 * Every other "place" a page or module says, by the words around it. Each must still be found somewhere (a stale entry
 * fails), and each is not a grower's space.
 */
const ALLOWED: Array<[string, RegExp]> = [
  // geographic: where a species grows, a weather cell, the forecast's point, a map's subject
  ['geographic', /a (year|month) no place has/],
  ['geographic', /in the same place/],
  ['geographic', /the coordinates are not a place on Earth/],
  ['geographic', /No weather alerts are read for this place/],
  ['geographic', /so a place it does not cover/],
  ['geographic', /a figure about a place/],
  ['geographic', /facts about places/],
  ['geographic', /a word of a place|the places it grows/],
  ['geographic', /among a place's maps|Commons files as a place/],
  ['geographic', /cannot place a climate cell/],
  // Kew's word for a name it does not place under an accepted species, and a verb
  ['Kew', /\bunplaced\b/i],
  ['Kew', /Kew's file places under|where neither places it/],
  // the sync ceilings: a vault's place among the day's new vaults and among the vaults in all
  ['vault', /vault('s)? place|its place (was|is) (given back|kept)|takes? (a|its) place|day's (new-vault )?places|places in all|gives (its )?places? back|gives the place back|the place is given back|for the places new vaults|new-vault places|keeps no place|no place recorded|no place is free|keeps its place|that place is checked|count of places|loses no place|a place given back|a place left unused|whose place was given back|its place was not|after its place was|its place could not|a reclaimed vault's place|does not reclaim places/],
  // an order: a change's place in the arrival order, a name's place among names
  ['order', /ha(s|ve) no place in it|has a place, which came first|the plant's place among the plants|the matching name's place among|a marked stamp's place|places its own repair/],
  // the idioms, and the place a photograph is shown in
  ['idiom', /\bin (its )?place\b/],
  ['idiom', /the place (needs|can use)/]
];

function files(dir: string): string[] {
  return (readdirSync(dir, { recursive: true }) as string[]).map((f) => join(dir, f).replaceAll('\\', '/')).filter((f) => /\.(svelte|ts)$/.test(f) && !f.endsWith('.d.ts')).sort();
}

describe('round seventy-four: a grower\'s greenhouse, bench or windowsill is a "space", never a "place"', () => {
  const found: string[] = [];
  const bare: Record<string, number> = {};
  const used = new Set<RegExp>();
  for (const f of files('src')) {
    for (const p of piecesOf(f, readFileSync(f, 'utf8'))) {
      const t = p.text.replace(/\s+/g, ' ');
      if (!WORD.test(t)) continue;
      WORD.lastIndex = 0;
      if (codeLike(t.trim())) continue;
      if (/^(place|places)$/.test(t.trim())) { bare[f] = (bare[f] ?? 0) + 1; continue; }
      const covered: Array<[number, number]> = [];
      for (const [, re] of ALLOWED) for (const m of t.matchAll(new RegExp(re.source, re.flags + 'g'))) { covered.push([m.index!, m.index! + m[0].length]); used.add(re); }
      for (const m of t.matchAll(WORD)) {
        const at = m.index!;
        if (!covered.some(([a, b]) => at >= a && at < b)) found.push(`${f}:${p.line}: …${t.slice(Math.max(0, at - 50), at + 50)}…`);
      }
    }
  }

  it('no page or module says "place" or "Places" for a grower\'s space', () => {
    expect(found).toEqual([]);
  });
  it('a bare "place" key is only where it was, in the code', () => {
    expect(bare).toEqual(BARE);
  });
  it('every allowed use is still there, so the list says what the pages say', () => {
    expect(ALLOWED.filter(([, re]) => !used.has(re)).map(([k, re]) => `${k}: ${re.source}`)).toEqual([]);
  });
  it('the tab, the menu and the page say "My spaces", at the same addresses', () => {
    const layout = readFileSync('src/routes/+layout.svelte', 'utf8');
    expect(layout.match(/\{ href: '\/places', label: 'My spaces'/g)).toHaveLength(3); // the menu, the phone's tabs, the top bar
    expect(layout).not.toMatch(/label: 'Places'/);
    const list = readFileSync('src/routes/places/+page.svelte', 'utf8');
    expect(list).toContain('<title>My spaces · Cultifolio</title>');
    expect(list).toContain('<PageHead compact title="My spaces"');
    // the addresses printed labels and bookmarks point at are kept, the old /benches with them
    expect(readFileSync('src/hooks.server.ts', 'utf8')).toMatch(/benches/);
    expect(readdirSync('src/routes/places')).toContain('[id]');
  });
  it('the stored names and the fold are unchanged: locationId, the kind `location`, FOLD_RULES 8, the database at 4', async () => {
    const types = readFileSync('src/lib/db/types.ts', 'utf8');
    expect(types).toMatch(/locationId\??: string/);
    const { FOLD_RULES } = await import('../../src/lib/core/log');
    expect(FOLD_RULES).toBe(8);
    expect(readFileSync('src/lib/db/vault.ts', 'utf8')).toMatch(/^const DB_V = 4;$/m);
  });
});
