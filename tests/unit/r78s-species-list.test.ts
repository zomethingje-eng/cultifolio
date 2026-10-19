/**
 * Round seventy-eight, agent S: the species list's form (scripts/species-list.txt, written by scripts/select-species.ts),
 * read back as the build will read it in round seventy-nine. On the base there is no list, no parser and no route
 * through the build, and every test fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { formatSpeciesList, parseSpeciesList, isSpeciesList, jobsFromList, reasonOf, LIST_MAGIC, LIST_COLUMNS, MIN_RECORDS, DATASET_RULE, REASON_REFERENCE, type Selected } from '../../scripts/select-species-lib';

const s = (o: Partial<Selected>): Selected => ({ id: '1', name: 'Aloe vera', author: '(L.) Burm.f.', family: 'Asphodelaceae', inat: 0, gbif: 0, byCounts: false, byGenus: false, byReference: false, gbifKey: null, ...o });

describe('the list, written and read back', () => {
  const text = formatSpeciesList(['the day', 'the rule'], [
    s({ id: '298116', inat: 40042, gbif: 61, byCounts: true, gbifKey: '2777724' }),
    s({ id: '2342691', name: 'Lithops aucampiae', author: 'L.Bolus', family: 'Aizoaceae', inat: 70, gbif: 3, byCounts: true, byGenus: true }),
    s({ id: '490875', name: 'Haworthiopsis koelmaniorum', author: '(Oberm. & D.S.Hardy) Boatwr. & J.C.Manning', byGenus: true, gbifKey: '9512212' }),
    s({ id: '2905012', name: 'Peperomia jalcaensis', author: 'Pino', family: 'Piperaceae', byReference: true, gbifKey: '7705625' }),
    s({ id: null, name: 'Tylecodon cacaliodes', author: '(L.fil.) Toelken', family: 'Crassulaceae', byReference: true, gbifKey: '7876017' })
  ]);
  it('opens with its own first line, then the header, the columns and one tab-separated line a species', () => {
    const lines = text.trimEnd().split('\n');
    expect(lines[0]).toBe(LIST_MAGIC);
    expect(lines.slice(1, 3)).toEqual(['# the day', '# the rule']);
    expect(lines[3]).toBe(`# ${LIST_COLUMNS.join('\t')}`);
    expect(lines[4]).toBe('298116\tAloe vera\t(L.) Burm.f.\tAsphodelaceae\tinat 40042 + gbif 61\t2777724');
    expect(lines[5]).toBe('2342691\tLithops aucampiae\tL.Bolus\tAizoaceae\tinat 70 + gbif 3; collector genus\t-');
    expect(lines[6]).toBe('490875\tHaworthiopsis koelmaniorum\t(Oberm. & D.S.Hardy) Boatwr. & J.C.Manning\tAsphodelaceae\tcollector genus\t9512212');
    expect(lines[7]).toBe('2905012\tPeperomia jalcaensis\tPino\tPiperaceae\talready in the reference\t7705625');
    // A page of the reference that Kew cannot place: "-" for the Kew id, and its own GBIF key.
    expect(lines[8]).toBe('-\tTylecodon cacaliodes\t(L.fil.) Toelken\tCrassulaceae\talready in the reference\t7876017');
  });
  it('reads back to the same species, by Kew id, with the GBIF key or none', () => {
    expect(isSpeciesList(text)).toBe(true);
    expect(parseSpeciesList(text)).toEqual([
      { kewId: '298116', pageId: 'k298116', name: 'Aloe vera', author: '(L.) Burm.f.', family: 'Asphodelaceae', reason: 'inat 40042 + gbif 61', gbifKey: 2777724 },
      { kewId: '2342691', pageId: 'k2342691', name: 'Lithops aucampiae', author: 'L.Bolus', family: 'Aizoaceae', reason: 'inat 70 + gbif 3; collector genus', gbifKey: null },
      { kewId: '490875', pageId: 'k490875', name: 'Haworthiopsis koelmaniorum', author: '(Oberm. & D.S.Hardy) Boatwr. & J.C.Manning', family: 'Asphodelaceae', reason: 'collector genus', gbifKey: 9512212 },
      { kewId: '2905012', pageId: 'k2905012', name: 'Peperomia jalcaensis', author: 'Pino', family: 'Piperaceae', reason: 'already in the reference', gbifKey: 7705625 },
      { kewId: null, pageId: 'g7876017', name: 'Tylecodon cacaliodes', author: '(L.fil.) Toelken', family: 'Crassulaceae', reason: 'already in the reference', gbifKey: 7876017 }
    ]);
  });
  it('refuses a file that is not a list, a line cut off, and an id twice, never reading half', () => {
    expect(isSpeciesList('Aloe vera\n')).toBe(false);
    expect(() => parseSpeciesList('298116 Aloe vera\n')).toThrow(/not a species list/);
    expect(() => parseSpeciesList(`${text}298117\tAloe vera\t(L.) Burm.f.\n`)).toThrow(/line 10/);
    expect(() => parseSpeciesList(`${text}298116\tAloe vera\tx\tAsphodelaceae\tcollector genus\t-\n`)).toThrow(/298116 twice/);
    // An entry with no Kew id must be a page of the reference, with its GBIF key, once.
    expect(() => parseSpeciesList(`${text}-\tAloe x\tx\tAsphodelaceae\talready in the reference\t-\n`)).toThrow(/no Kew id/);
    expect(() => parseSpeciesList(`${text}-\tAloe x\tx\tAsphodelaceae\tcollector genus\t123\n`)).toThrow(/no Kew id/);
    expect(() => parseSpeciesList(`${text}-\tTylecodon x\tx\tCrassulaceae\talready in the reference\t7876017\n`)).toThrow(/GBIF key 7876017 twice/);
  });
  it('gives the build its jobs: each by its GBIF key, none by its name, and its page id in the form --index gives', () => {
    const list = parseSpeciesList(text);
    expect(jobsFromList(list).map((j) => [j.name, j.key, j.pageId])).toEqual([
      ['Aloe vera', 2777724, 'k298116'], ['Lithops aucampiae', undefined, 'k2342691'], ['Haworthiopsis koelmaniorum', 9512212, 'k490875'],
      ['Peperomia jalcaensis', 7705625, 'k2905012'], ['Tylecodon cacaliodes', 7876017, 'g7876017']
    ]);
    expect(jobsFromList(list)[4]).toMatchObject({ kewId: null, gbifKey: 7876017 });
    expect(jobsFromList(list)[0]).toMatchObject({ kewId: '298116', gbifKey: 2777724 });
  });
  it('says why each species is there', () => {
    expect(reasonOf({ inat: 2, gbif: 1, byCounts: true, byGenus: false, byReference: false })).toBe('inat 2 + gbif 1');
    expect(reasonOf({ inat: 0, gbif: 0, byCounts: false, byGenus: true, byReference: false })).toBe('collector genus');
    expect(reasonOf({ inat: 0, gbif: 0, byCounts: false, byGenus: true, byReference: true })).toBe(`collector genus; ${REASON_REFERENCE}`);
  });
});

describe('scripts/species-list.txt as written', () => {
  const text = readFileSync('scripts/species-list.txt', 'utf8');
  const list = parseSpeciesList(text);
  const header = text.split('\n').filter((l) => l.startsWith('# '));
  const genera = new Set(readFileSync('scripts/specialist-genera.txt', 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
  it('every line reads, and every species is there by its counts or its collector genus', () => {
    expect(list.length).toBeGreaterThan(40000);
    for (const e of list) {
      const counts = /^inat (\d+) \+ gbif (\d+)/.exec(e.reason);
      if (counts) expect(Number(counts[1]) + Number(counts[2])).toBeGreaterThanOrEqual(MIN_RECORDS);
      if (/collector genus/.test(e.reason)) expect(genera.has(e.name.split(' ')[0])).toBe(true);
      expect(counts || /^(collector genus|already in the reference)(; already in the reference)?$/.test(e.reason)).toBeTruthy();
      if (e.kewId === null) expect(e.reason).toBe(REASON_REFERENCE);
    }
  });
  it("keeps every page of today's reference: the eleven under three records, and the fifteen Kew cannot place by their GBIF key", () => {
    const byName = new Map(list.map((e) => [e.name, e]));
    for (const n of ['Peperomia jalcaensis', 'Ornithogalum thunbergii', 'Zanha golungensis', 'Boucerosia penduliflora']) expect(byName.get(n)?.reason).toBe(REASON_REFERENCE);
    const noKew = list.filter((e) => e.kewId === null);
    expect(noKew.map((e) => e.name)).toContain('Tylecodon cacaliodes');
    expect(noKew.every((e) => e.gbifKey !== null && e.pageId === `g${e.gbifKey}`)).toBe(true);
    expect(/(\d+) pages match no species Kew accepts/.exec(header.join('\n'))?.[1]).toBe(String(noKew.length));
  });
  it('a species of a collector genus is in whatever its counts, as today', () => {
    expect(list.find((e) => e.name === 'Lithops aucampiae')?.reason).toMatch(/collector genus/);
  });
  it("the header gives the day, the rule, the dataset rule, every source with its terms, and counts that add up", () => {
    const h = header.join('\n');
    expect(h).toMatch(/on \d{4}-\d{2}-\d{2}/);
    expect(h).toMatch(new RegExp(`at least ${MIN_RECORDS} cultivated records`));
    expect(h).toContain(DATASET_RULE);
    for (const src of ['World Checklist of Vascular Plants', 'CC BY 4.0', 'api.inaturalist.org', 'www.inaturalist.org/pages/terms', 'api.gbif.org', 'www.gbif.org/terms/data-user', 'GBIF Backbone Taxonomy']) expect(h).toContain(src);
    const sel = /Selected: ([\d,]+) species: ([\d,]+) by their records, ([\d,]+) by their collector genus, ([\d,]+) already in the reference; ([\d,]+) by their records alone, ([\d,]+) by their collector genus alone, ([\d,]+) only because they are already in the reference \((\d+) of them with no Kew id\); ([\d,]+) with a GBIF key/.exec(h)!;
    const num = (x: string) => Number(x.replace(/,/g, ''));
    const has = (w: RegExp) => list.filter((e) => w.test(e.reason)).length;
    expect(num(sel[1])).toBe(list.length);
    expect(num(sel[2])).toBe(has(/^inat/));
    expect(num(sel[3])).toBe(has(/collector genus/));
    expect(num(sel[4])).toBe(has(/already in the reference/));
    expect(num(sel[5])).toBe(list.filter((e) => /^inat/.test(e.reason) && !/;/.test(e.reason)).length);
    expect(num(sel[6])).toBe(list.filter((e) => e.reason === 'collector genus').length);
    expect(num(sel[7])).toBe(list.filter((e) => e.reason === REASON_REFERENCE).length);
    expect(num(sel[8])).toBe(list.filter((e) => e.kewId === null).length);
    expect(num(sel[9])).toBe(list.filter((e) => e.gbifKey !== null).length);
  });
  it('the dataset files list every dataset once, on one side', () => {
    const keys = ['excluded', 'counted', 'undecided'].flatMap((f) => readFileSync(`scripts/${f}-datasets.txt`, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')[0]));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(Number(/: ([\d,]+) datasets, [\d,]+ records\./.exec(readFileSync('scripts/counted-datasets.txt', 'utf8'))![1].replace(/,/g, '')));
  });
});

describe('the build reads the list by its own parser (round seventy-nine builds from it)', () => {
  const src = readFileSync('scripts/build-dossiers.ts', 'utf8');
  it('a species list is never read as "<key> <name>" lines, whose key would be taken for a GBIF key', () => {
    const at = src.indexOf('isSpeciesList(text)');
    expect(at).toBeGreaterThan(0);
    expect(src.indexOf('const m = /^([kg]?\\d+)\\s+([^\\t]+)/.exec(line);')).toBeGreaterThan(at);
    expect(src).toMatch(/const parsed = \(fromList \?\? lines\.map/);
    // A species with no GBIF key is built by the page on disk under its id, or not at all: never by its name (rule 3).
    expect(src).toMatch(/j\.gbifKey \?\? gbifOfLine\(j\.pageId\)/);
    expect(src).toMatch(/jobsFromList\(parseSpeciesList\(text\)\)/);
  });
});
