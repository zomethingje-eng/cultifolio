/**
 * Round eighty-seven, the data agent: item 6 (round eighty-six's final review M2). The border allowance read a record's
 * stated state only by Natural Earth's names, so a state the shapes could not match (an old province such as Natal or
 * Transvaal, a postal or ISO code) was read as naming none, and admitted: 26 records on 11 pages in round eighty-six's dry
 * run. Rule r87 reads it by its ISO 3166-2 code too, and by an old province's name, from a sourced table
 * (`state-aliases.ts`, written by scripts/dev/r87-state-aliases.py); an old province that held land on both sides decides
 * nothing, and the shape does; a state still not matched is admitted (the owner's setting), said apart, and stated in
 * `policyWords`.
 *
 * On r86 (db5a68d): "Natal" at the Sentinel was admitted for the Free State (`by: 'border'`), as was "KZN"; there was no
 * alias, and no `border-unmatched`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { regionTester, aliasOf, SHAPES_FILE, RANGE_RULE, type ShapesFile } from '$dossier/tdwg-shapes';
import { ADMISSION_POLICY, POLICY_R86, POLICY_R87, POLICY_BEFORE, policyWords, recordWords } from '$dossier/admission-policy';
import { STATE_ALIASES } from '$dossier/state-aliases';
import { transitionWords } from '$dossier/range-dry-run';
import type { GbifOccurrence } from '$dossier/sources/gbif';

const file = JSON.parse(readFileSync(SHAPES_FILE, 'utf8')) as ShapesFile;
const t = regionTester(file);
const live = regionTester(file, POLICY_R86);
const R = JSON.parse(readFileSync('tests/unit/fixtures/r86r-records.json', 'utf8')) as { records: Record<string, Array<GbifOccurrence & { stateProvince?: string }>> };
// One of Albuca fastigiata's records at the Sentinel: in KwaZulu-Natal's shape, within 0.02° of the Free State's.
const S = R.records.k294532[0];
const at = (state: string | null, codes = ['CPP', 'OFS']) => t.admit(S.decimalLatitude!, S.decimalLongitude!, codes, 'ZA', state);
beforeAll(() => { t.landOf(0, 0); live.landOf(0, 0); }, 120_000);

describe('rule r87: round eighty-six\'s shapes, the stated state read by its aliases too', () => {
  it('is the rule the builder derives by, on the same shapes file', () => {
    expect(ADMISSION_POLICY).toBe(POLICY_R87);
    expect(RANGE_RULE).toBe('r87');
    expect(POLICY_R87.shapes).toBe(file.meta.rule);
    expect(t.rule).toBe('r87'); // the policy's rule, on the file it reads
    expect(live.rule).toBe('r86');
    expect(POLICY_BEFORE).toBe(POLICY_R86); // the dry run's "before": the rule live
    expect(POLICY_R87.borderState).toEqual({ read: true, unnamed: 'admit', aliases: true, unmatched: 'admit' });
  });
  it('the table: ISO 3166-2 codes with and without the prefix, and the old provinces, by country', () => {
    expect(aliasOf('ZA', 'ZA-KZN')).toEqual(['kwazulunatal']);
    expect(aliasOf('ZA', 'za-kzn')).toEqual(['kwazulunatal']);
    expect(aliasOf('ZA', 'KZN')).toEqual(['kwazulunatal']);
    expect(aliasOf('ZA', 'Natal')).toEqual(['kwazulunatal']);
    expect(aliasOf('ZA', 'Orange Free State')).toEqual(['free']);
    expect(aliasOf('ZA', 'Transvaal')).toEqual(['gauteng', 'limpopo', 'mpumalanga', 'northwest']);
    expect(aliasOf('ZA', 'Cape Province')).toEqual(['easterncape', 'northerncape', 'northwest', 'westerncape']);
    expect(aliasOf('US', 'TX')).toEqual(['texas']);
    expect(aliasOf('US', 'US-TX')).toEqual(['texas']);
    expect(aliasOf('CA', 'PQ')).toEqual(['quebec']);
    expect(aliasOf('AU', 'Qld')).toEqual(['queensland']);
    expect(aliasOf('MX', 'MX-CMX')).toEqual(['distritofederal']);
    expect(aliasOf('BR', 'SP')).toEqual(['saopaulo']);
    // Another country's code names nothing here; nor does a name the table does not hold.
    expect(aliasOf('ZA', 'US-TX')).toBeUndefined();
    expect(aliasOf('ZA', 'Xanadu')).toBeUndefined();
    // Every alias stands for places the shapes file holds in that country's regions (round eighty-seven's review, M1:
    // Crimea and Sevastopol, which Natural Earth files under RU, in Krym, a region of RU and UA, are Ukraine's codes' too).
    const places = new Map<string, Set<string>>();
    const key = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(province|provincia|provinz|state|estado|etat|region|departamento|department|dept|prov)\b\.?/g, ' ').replace(/[^a-z]+/g, '');
    for (const [code, ps] of Object.entries(file.places ?? {})) for (const p of ps) for (const cc of new Set([p.split('|')[1], ...(file.countries?.[code] ?? [])])) (places.get(cc) ?? places.set(cc, new Set()).get(cc)!).add(key(p.split('|')[0]));
    for (const [cc, m] of Object.entries(STATE_ALIASES)) for (const [a, ps] of Object.entries(m)) {
      expect(a, `${cc} ${a}`).toMatch(/^(=[A-Z]{2}-[A-Z0-9]{1,3}|~[a-z]+)$/);
      for (const p of ps) expect(places.get(cc)?.has(p), `${cc} ${a} → ${p}`).toBe(true);
    }
  });
});

describe('the border allowance at the Sentinel (KwaZulu-Natal\'s shape, the Free State\'s border)', () => {
  it('a record naming the Free State by its code or its old name counts for it, by its state', () => {
    for (const s of ['Free State', 'ZA-FS', 'FS', 'OFS', 'Orange Free State']) expect(at(s), s).toEqual({ code: 'OFS', how: 'buffer', by: 'border-state' });
  });
  it('a record naming KwaZulu-Natal by its old name or its code does not count: it names the neighbour (r86: counted)', () => {
    for (const s of ['Natal', 'KZN', 'ZA-KZN', 'ZA-NL', 'KwaZulu']) expect(at(s), s).toBeNull();
    expect(live.admit(S.decimalLatitude!, S.decimalLongitude!, ['CPP', 'OFS'], 'ZA', 'Natal')?.by).toBe('border'); // r86
    expect(at('KwaZulu-Natal')).toBeNull(); // as before
  });
  it('a third region named counts, as before; a state nothing matches counts too, said apart (the owner\'s setting)', () => {
    expect(at('Transvaal')?.by).toBe('border');
    expect(at(null)?.by).toBe('border');
    expect(at('Xanadu')).toEqual({ code: 'OFS', how: 'buffer', by: 'border-unmatched' });
    expect(live.admit(S.decimalLatitude!, S.decimalLongitude!, ['CPP', 'OFS'], 'ZA', 'Xanadu')?.by).toBe('border'); // r86: said as no state
    expect(transitionWords('buffer>buffer:border-unmatched:state')).toBe('by the margin → by the margin (across a border, its stated state matched by nothing; a state stated)');
  });
});

describe('an old province on both sides decides nothing, and the shape does', () => {
  // North West, 0.01° from the Northern Cape: TDWG's Northern Provinces (TVL) by the shapes, the Cape Provinces (CPP) beside it.
  const lat = -28.05, lon = 24.455;
  it('the point is in the Northern Provinces\' shape, beside the Cape Provinces\'', () => {
    expect(t.landOf(lat, lon)).toEqual(['TVL']);
    expect(t.reach(lat, lon, 'CPP', 0.02)).toBeLessThan(0.02);
  });
  it('"Cape Province" held land in both: the record lies in the neighbour\'s shape, and is its', () => {
    expect(t.admit(lat, lon, ['CPP'], 'ZA', 'Cape Province')).toBeNull();
    expect(t.admit(lat, lon, ['CPP'], 'ZA', 'Northern Cape')?.by).toBe('border-state'); // the shapes' own name decides
    expect(t.admit(lat, lon, ['CPP'], 'ZA', 'North West')).toBeNull();
    expect(live.admit(lat, lon, ['CPP'], 'ZA', 'Cape Province')?.by).toBe('border'); // r86: read as no state
  });
});

describe('the policy is stated: the words on /about/how and in each page\'s record', () => {
  it('policyWords says the aliases, the shape deciding, and that a state nothing matches counts', () => {
    const w = policyWords(ADMISSION_POLICY).border;
    expect(w).toContain('A state is read by its name, by its ISO 3166-2 code (KZN, TX, CN-YN) or by an old province\'s name (Natal, Transvaal).');
    expect(w).toContain('An old province that held land on both sides decides nothing, and the drawing does: the record lies in the neighbour\'s shape, so it is the neighbour\'s.');
    expect(w).toContain("A record that names no state or province, or a third region's, counts, since within the drawing's own accuracy the line cannot tell.");
    expect(w).toContain("So does a record whose state neither the shapes' names nor those codes and old names can match: it is read as naming none.");
    expect(w).not.toContain('postal code');
    // Round eighty-six's words stand for its own rule.
    expect(policyWords(POLICY_R86).border).toContain("That includes a name the shapes do not hold, such as an old province's (Natal) or a postal code.");
    expect(policyWords({ ...POLICY_R87, borderState: { ...POLICY_R87.borderState, unmatched: 'refuse' } }).border).toContain('does not count.');
  });
  it("each page's record says how the state is read", () => {
    expect(recordWords(ADMISSION_POLICY)).toContain("where its stated state or province does not name the other region (read by Natural Earth's name, its ISO 3166-2 code or an old province's name)");
    expect(recordWords(POLICY_R86)).not.toContain('ISO 3166-2');
  });
});
