/**
 * Round eighty-six, the sources agent: review D's D6 (and review S's S13, review W's W6). About half of Echinopsis
 * macrogona's in-range records are San Pedro by Kew's synonymy: GBIF files 134 of the 317 in Peru and Bolivia under
 * Trichocereus macrogonus var. pachanoi, its own key 11093098, which Kew holds as a homotypic synonym of Echinopsis
 * pachanoi (k2783547, a page of its own with no GBIF key, "lumped"). D6's rule, built here behind the owner's decision:
 * a variety or subspecies GBIF files under another page's key, which Kew's synonymy places in a page without a GBIF key
 * (by the type rule every extra key is read by), is that page's key, matched by identifier; the page GBIF files it under
 * leaves its records out, record by record (`givenAway`). It is listed only by `scripts/kew-extra-keys.ts
 * --infra-from-holder` (to `extra-keys-infra.txt`), read by the build only with `--infra-keys`, and a build's `--dry-run`
 * says, page by page, how many records and which climate figures would change, writing nothing.
 *
 * The rows: Kew's wcvp_names.csv of 2026-06-04 (2783547 Echinopsis pachanoi, 2999002 Trichocereus macrogonus var.
 * pachanoi, homotypic; 2431180 Trichocereus schoenii, heterotypic; 2783497 Echinopsis macrogona); GBIF's keys as D6 and
 * scripts/extra-keys-kew-none.txt give them (3952140, 11093098; T. schoenii's usage here a made key, 90000001).
 *
 * On r86base (9cf3077) every `it` FAILED: `extraKeysFor` took no option and refused the key ("GBIF files it under key
 * 3952140, another page of this reference"), `from`/`with` were not written or read, `givenAway` did not exist and the
 * build kept every record, and `dry-line.ts` did not exist.
 */
import { describe, it, expect } from 'vitest';
import { KewNamesIndex, type KewRow } from '$dossier/kew-names';
import { extraKeysFor, formatExtraKeys, parseExtraKeys, type Usage, type Backbone } from '$dossier/extra-keys';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher } from '$dossier/fetch';
import { copiapoa } from '../../fixtures/upstream';

const K = (id: string, name: string, authors: string, status: string, accepted: string, rank = 'Species', homotypic = false): KewRow => ({ id, name, authors, status, rank, accepted, parent: '', powo: '', ...(homotypic ? { homotypic } : {}) });
const idx = new KewNamesIndex();
for (const r of [
  K('2783547', 'Echinopsis pachanoi', '(Britton & Rose) H.Friedrich & G.D.Rowley', 'Accepted', '2783547'),
  K('2999002', 'Trichocereus macrogonus var. pachanoi', '(Britton & Rose) Albesiano & R.Kiesling', 'Synonym', '2783547', 'Variety', true),
  K('2431180', 'Trichocereus schoenii', 'Rauh & Backeb.', 'Synonym', '2783547'),
  K('2783497', 'Echinopsis macrogona', '(Salm-Dyck) H.Friedrich & G.D.Rowley', 'Accepted', '2783497'),
  K('2432533', 'Trichocereus macrogonus', '(Salm-Dyck) Riccob.', 'Synonym', '2783497', 'Species', true)
]) idx.add(r);
const U = (key: number, label: string, canonical: string, author: string, status: string, parent?: number, rank = 'SPECIES'): Usage => ({ key, parent, status, rank, canonical, author, label });
const usages = [
  U(3952140, 'Trichocereus macrogonus (Salm-Dyck) Riccob.', 'Trichocereus macrogonus', '(Salm-Dyck) Riccob.', 'ACCEPTED', 1),
  U(11093098, 'Trichocereus macrogonus var. pachanoi (Britton & Rose) Albesiano & R.Kiesling', 'Trichocereus macrogonus pachanoi', '(Britton & Rose) Albesiano & R.Kiesling', 'ACCEPTED', 3952140, 'VARIETY'),
  U(90000001, 'Trichocereus schoenii Rauh & Backeb.', 'Trichocereus schoenii', 'Rauh & Backeb.', 'SYNONYM', 11093098)
];
const byKey = new Map(usages.map((u) => [u.key, u]));
const kewWords = (u: Usage) => (u.rank === 'SPECIES' ? u.canonical : `${u.canonical.split(' ').slice(0, 2).join(' ')} var. ${u.canonical.split(' ')[2]}`).toLowerCase();
const bb: Backbone = {
  usagesOf: (w) => usages.filter((u) => kewWords(u) === w),
  usage: (k) => byKey.get(k),
  lineage: (k) => { const out = [k]; let u = byKey.get(k); while (u?.parent && byKey.has(u.parent)) { out.push(u.parent); u = byKey.get(u.parent); } return out; },
  under: (k) => usages.filter((u) => u.parent === k)
};
const reference = new Set([3952140]);
const holders = new Map<number, number[]>();
const pachanoi = { key: null, entry: '2783547', id: 'k2783547' };

describe('D6: a variety GBIF files under another page, which Kew places in a page of its own, is that page\'s key', () => {
  it('without the rule (as decided in round eighty-five), the key is refused; with it, E. pachanoi reads 11093098, from E. macrogona\'s 3952140', () => {
    const off = extraKeysFor(pachanoi, idx, bb, reference, holders);
    expect(off.keys).toEqual([]);
    expect(off.refused.find((x) => x.key === 11093098)?.why).toBe('GBIF files it under key 3952140, another page of this reference');
    const on = extraKeysFor(pachanoi, idx, bb, reference, holders, new Map(), new Map(), { infraFromHolder: true });
    expect(on.keys).toHaveLength(1);
    expect(on.keys[0]).toMatchObject({ pageId: 'k2783547', key: 11093098, from: 3952140, kew: '2999002', except: [90000001] });
    // T. schoenii, Kew's heterotypic synonym of E. pachanoi, is left out (the owner's type rule), so it stays E. macrogona's.
    expect(on.keys[0].with).toBeUndefined();
    // E. macrogona's own species key is never taken, whatever the rule (guard).
    expect(extraKeysFor({ key: null, entry: '2783497', id: 'k2783497' }, idx, bb, reference, holders, new Map(), new Map(), { infraFromHolder: true }).keys).toEqual([]);
  });

  it('the list writes and reads the holder and the keys with it', () => {
    const k = { page: 0, pageId: 'k2783547', key: 11093098, label: 'Trichocereus macrogonus var. pachanoi', status: 'ACCEPTED', kew: '2999002', kewLabel: 'x (synonym under Echinopsis pachanoi)', how: 'filed', from: 3952140, with: [90000002] };
    expect(parseExtraKeys(formatExtraKeys([k]))).toEqual([k]);
    const plain = { ...k, from: undefined, with: undefined };
    delete plain.from; delete plain.with;
    expect(parseExtraKeys(formatExtraKeys([plain]))).toEqual([plain]); // a line of before is read as before (guard)
  });
});

describe('D6: the holder leaves the given records out, and says so', () => {
  it('records GBIF identifies as the given key are left out of the page\'s own, counted in its record', async () => {
    const t = copiapoa() as Record<string, { results?: Array<Record<string, unknown>> }>;
    const occ = Object.keys(t).find((k) => k.includes('/occurrence/search') && !k.includes('mediaType'))!;
    const rows = t[occ].results!;
    expect(rows.length).toBeGreaterThan(2);
    rows.forEach((r, i) => { r.taxonKey = i % 2 ? 11093098 : 3952140; });
    const given = rows.filter((r) => r.taxonKey === 11093098).length;
    const words = "of GBIF's key 11093098, Trichocereus macrogonus var. pachanoi, left out: Kew's file holds it as Echinopsis pachanoi, whose page (k2783547) reads them";
    const build = (givenAway?: { keys: ReadonlySet<number>; words: string }) => buildDossier('Copiapoa cinerea', { fetcher: fixtureFetcher(t as Record<string, unknown>), builtBy: 'node', now: () => new Date('2026-11-06T12:00:00Z'), ...(givenAway ? { givenAway } : {}) });
    const before = await build();
    const after = await build({ keys: new Set([11093098]), words });
    expect(before.ok && after.ok).toBe(true);
    if (!before.ok || !after.ok) return;
    const n = (d: typeof before.dossier) => d.occurrences.nOpenInRange + d.occurrences.nRestrictedInRange + d.occurrences.nOutsideRange;
    expect(n(after.dossier)).toBe(n(before.dossier) - given);
    expect(after.dossier.upstream['gbif.occurrences'].detail).toContain(`${given} records ${words}`);
    expect(before.dossier.upstream['gbif.occurrences'].detail).not.toContain('left out: Kew'); // guard
  });
});

describe('a build\'s --dry-run says what would change, page by page', () => {
  it('records and the climate\'s figures, before and after', async () => {
    const mod = await import('$dossier/dry-line').catch(() => null);
    expect(mod).not.toBeNull();
    const months = (low: number) => Array.from({ length: 12 }, (_, i) => ({ tmin: low + i, tmax: 20 + i, precipMm: 50 }));
    const prev = { key: 'k2783497', name: { scientific: 'Echinopsis macrogona' }, occurrences: { nOpenInRange: 282, nRestrictedInRange: 35 }, climate: { status: 'ok', records: 282, cells: 120, place: 'Cusco, Peru', months: months(4.8), annualRain: 778 } };
    const now = { ...prev, occurrences: { nOpenInRange: 148, nRestrictedInRange: 21 }, climate: { status: 'ok', records: 148, cells: 70, place: 'Cusco, Peru', months: months(3.2), annualRain: 702 } };
    expect(mod!.dryLine(prev, now)).toBe("Echinopsis macrogona [k2783497]: records 282 open + 35 restricted in range → 148 open + 21 restricted in range; climate 282 records in 120 cells, typical spot Cusco, Peru, coldest month's mean low 4.8 °C, warmest month's mean high 31 °C, rain 778 mm a year → 148 records in 70 cells, typical spot Cusco, Peru, coldest month's mean low 3.2 °C, warmest month's mean high 31 °C, rain 702 mm a year");
    expect(mod!.dryLine(prev, prev)).toMatch(/^Echinopsis macrogona \[k2783497\]: unchanged/);
  });
});
