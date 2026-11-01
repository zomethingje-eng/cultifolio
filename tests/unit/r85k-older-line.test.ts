/**
 * Round eighty-five (K): the add form's "An older name of" line, by rule (review-s S1, review-p P2), over real entries.
 *
 * The fixture (`fixtures/r85k-held-headings.json`, made by `scripts/dev/r85k-held-fixture.py` from the live index of 31
 * October) holds every heading another entry holds as an older name (`syn`, `older`, `kew`) or as another author's name
 * (`hom`) in a grower's families, and the reviews' named cases in any family, with their holders: 1,093 entries.
 *
 * 1. The negative: each such heading typed, the search's six rows read as the picker reads them (`localRow`): no line.
 *    The same with the holder's row put first, and with the heading's own row missing but the holder holding it as `hom`.
 * 2. The lines that are right stay right: a true older name of one page draws the line, naming that page.
 * 3. A merged row wins over an older-name row.
 * 4. The older-name label is the exact name first (outside review A12).
 *
 * FAILS on r85base: the module `$lib/ui/picker-rows` does not exist there. The rule it replaced (`olderOfTyped` and
 * `olderRow` in SpeciesPicker.svelte) is restated in `base` below, and the test shows it draws the line on the named
 * accepted names, so the negative is a real one: `base` fails 1 and `olderLine` passes it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { prepare, search, type Searchable } from '$core/search';
import { localRow, olderLine, type PickerRow, type Hit } from '$lib/ui/picker-rows';
import { olderNameOf } from '$lib/ui/ref/searched';
import { sameName } from '$lib/ui/picked-name';

type Entry = Searchable & { key: string; slug: string; gbif?: number; homBy?: string[][] };
const index = JSON.parse(readFileSync('tests/unit/fixtures/r85k-held-headings.json', 'utf8')) as Entry[];
const prepared = prepare(index);
const norm = (s: string) => s.replace(/×/g, ' ').toLowerCase().split(/\s+/).filter(Boolean).join(' ');
const byName = new Map<string, Entry[]>();
for (const e of index) byName.set(norm(e.name), [...(byName.get(norm(e.name)) ?? []), e]);

/** Every heading another entry holds, with how and by whom. */
const held: Array<{ heading: string; holder: Entry; how: 'syn' | 'older' | 'kew' | 'hom' }> = [];
for (const e of index) for (const how of ['syn', 'older', 'kew', 'hom'] as const) for (const n of (e[how] as string[] | undefined) ?? []) {
  const heads = byName.get(norm(n)) ?? [];
  if (heads.length && !heads.some((h) => h.key === e.key)) held.push({ heading: heads[0].name, holder: e, how });
}
const rowsFor = (typed: string, hits: Entry[]) => hits.map((h) => localRow(typed, h as Hit, false));

/** Round eighty-four's rule, restated: a local row whose `older` or `hom` name is the name typed, unless that row is it. */
function base(rows: PickerRow[], typed: string): PickerRow | undefined {
  return rows.find((x) => x.local && sameName(x.older ?? x.hom?.name ?? '', typed) && !sameName(x.name, typed));
}

describe('1. no heading of the reference draws "An older name of" (review-s S1, review-p P2)', () => {
  it('the fixture holds the reviews\' cases', () => {
    expect(held.length).toBeGreaterThan(600);
    for (const n of ['Aloe vera', 'Crassula ovata', 'Echeveria elegans', 'Galanthus plicatus', 'Cyclamen hederifolium']) expect(held.some((h) => h.heading === n)).toBe(true);
    expect(new Set(held.map((h) => h.how))).toEqual(new Set(['syn', 'older', 'kew', 'hom']));
  });
  it('each heading typed, with the search\'s own six rows: no line', () => {
    const drawn: string[] = [];
    for (const { heading } of held) {
      const rows = rowsFor(heading, search(prepared, heading, 6));
      if (olderLine(rows, heading)) drawn.push(heading);
    }
    expect(drawn).toEqual([]);
  });
  it('each heading typed, with its holder\'s row first and its own second: no line', () => {
    const drawn: string[] = [];
    for (const { heading, holder } of held) {
      const own = byName.get(norm(heading))!;
      const rows = rowsFor(heading, [holder, ...own]);
      if (olderLine(rows, heading)) drawn.push(`${heading} (${holder.name})`);
    }
    expect(drawn).toEqual([]);
  });
  it('a name held only under another author draws no line, even with no page of its own among the rows', () => {
    const drawn: string[] = [];
    for (const { heading, holder, how } of held) if (how === 'hom') {
      const rows = rowsFor(heading, [holder]);
      if (olderLine(rows, heading)) drawn.push(`${heading} (${holder.name})`);
    }
    expect(drawn).toEqual([]);
  });
  it('round eighty-four\'s rule drew it on the named accepted names: the negative is a real one', () => {
    const fired = ['Aloe vera', 'Crassula ovata', 'Echeveria elegans'].filter((n) => {
      const h = held.find((x) => x.heading === n && x.how === 'hom')!;
      return !!base(rowsFor(n, [h.holder, ...byName.get(norm(n))!]), n);
    });
    expect(fired).toEqual(['Aloe vera', 'Crassula ovata', 'Echeveria elegans']);
  });
});

describe('2. a true older name still draws the line, naming its page', () => {
  it('every name of the fixture held as `syn`, `older` or `kew` by one page and heading none', () => {
    const headed = new Set(index.map((e) => norm(e.name)));
    const holders = new Map<string, Entry[]>();
    // A species name on its own variety or autonym (Stapelia hirsuta on Stapelia hirsuta var. hirsuta) is not an older
    // name of it (outside review A9b), and draws no line: left out here.
    for (const e of index) for (const n of [...(e.syn ?? []), ...(e.older ?? []), ...(e.kew ?? [])]) if (!headed.has(norm(n)) && n.trim().split(/\s+/).length === 2 && !norm(e.name).startsWith(`${norm(n)} `)) holders.set(norm(n), [...(holders.get(norm(n)) ?? []), e]);
    let tried = 0;
    const missed: string[] = [];
    for (const [n, hs] of holders) {
      if (hs.length !== 1) continue;
      const typed = (hs[0].syn ?? []).concat(hs[0].older ?? [], hs[0].kew ?? []).find((x) => norm(x) === n)!;
      tried++;
      const got = olderLine(rowsFor(typed, [hs[0]]), typed);
      // A page merged into this one is said as merged (Copiapoa boliviana, merged into Copiapoa calderana).
      if (got?.row.name !== hs[0].name || got.why !== ((hs[0].merged ?? []).some((m) => norm(m) === n) ? 'merged' : 'older')) missed.push(typed);
    }
    expect(tried).toBeGreaterThan(500);
    expect(missed).toEqual([]);
  });
  it('a species is not an older name of its own variety (outside review A9b)', () => {
    const e: Hit = { name: 'Stapelia hirsuta var. hirsuta', family: 'Apocynaceae', gbif: 9462513, syn: ['Stapelia hirsuta'] };
    expect(olderLine([localRow('Stapelia hirsuta', e, false)], 'Stapelia hirsuta')).toBeUndefined();
  });
  it('Aloe aristata, of Aristaloe aristata (review-w W6, kept)', () => {
    const aris: Hit = { name: 'Aristaloe aristata', family: 'Asphodelaceae', gbif: 2777720, syn: ['Aloe aristata'] };
    expect(olderLine([localRow('Aloe aristata', aris, false)], 'Aloe aristata')?.row.name).toBe('Aristaloe aristata');
  });
});

describe('3. a merged row wins (review-s S1)', () => {
  it('Echeveria peacockii: Echeveria desmetiana, not Dudleya pulverulenta', () => {
    const dudleya: Hit = { name: 'Dudleya pulverulenta', family: 'Crassulaceae', gbif: 3084916, older: ['Echeveria peacockii'] };
    const desmet: Hit = { name: 'Echeveria desmetiana', family: 'Crassulaceae', merged: ['Echeveria peacockii'], syn: ['Echeveria peacockii'] };
    const rows = [localRow('Echeveria peacockii', dudleya, false), localRow('Echeveria peacockii', desmet, false)];
    expect(olderLine(rows, 'Echeveria peacockii')).toMatchObject({ row: { name: 'Echeveria desmetiana' }, why: 'merged' });
    expect(base(rows, 'Echeveria peacockii')?.name).toBe('Dudleya pulverulenta'); // round eighty-four's line
  });
});

describe('4. the older-name label: the exact words first (outside review A12)', () => {
  it('"Trichocereus macrogonus" is labelled by itself, not by its subspecies', () => {
    const e: Searchable = { name: 'Echinopsis macrogona', family: 'Cactaceae', syn: ['Cereus macrogonus', 'Trichocereus macrogonus subsp. sanpedro'], older: ['Trichocereus puquiensis', 'Trichocereus macrogonus'] };
    expect(olderNameOf('Trichocereus macrogonus', e)).toBe('Trichocereus macrogonus'); // base: "Trichocereus macrogonus subsp. sanpedro"
    expect(olderNameOf('Trichocereus macrogonus subsp. sanpedro', e)).toBe('Trichocereus macrogonus subsp. sanpedro');
    expect(olderNameOf('Trichocereus macro', e)).toBe('Trichocereus macrogonus subsp. sanpedro'); // a start of words: the first that begins so
    const c: Searchable = { name: 'Clematis armandii', family: 'Ranunculaceae' };
    expect(olderNameOf('Clematis armandii', c)).toBeNull();
    // An exact older name before the hit's own words: Crassulaceae begins with "crassula" (base: null).
    expect(olderNameOf('Crassula rubens', { name: 'Sedum rubens', family: 'Crassulaceae', syn: ['Crassula rubens'] })).toBe('Crassula rubens');
  });
  it('and the line follows: an exact older name behind a variety in the list is found', () => {
    const e: Hit = { name: 'Echinopsis macrogona', family: 'Cactaceae', gbif: 3952140, syn: ['Trichocereus macrogonus subsp. sanpedro'], older: ['Trichocereus macrogonus'] };
    expect(olderLine([localRow('Trichocereus macrogonus', e, false)], 'Trichocereus macrogonus')?.row.name).toBe('Echinopsis macrogona');
  });
});
