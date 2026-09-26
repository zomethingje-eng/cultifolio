import { describe, it, expect } from 'vitest';
import { importV2 } from '$lib/import/v2';
import { materialise, live } from '$core/log';

const backup = {
  collection: {
    rev: 12,
    accessions: {
      '2025-0003': {
        acc: '2025-0003',
        taxonId: 'copiapoa-cinerea',
        nameAsReceived: 'Copiapoa cinerea v. albispina',
        fieldNumber: 'KK 1462',
        provenance: 'f1',
        bench: 'Basement shelf 2',
        status: 'growing',
        notes: 'Slow.',
        source: { from: 'Mesa Garden', date: '2025-03-02', form: 'seed' },
        events: [
          { id: 'e1', d: '2025-03-02', t: 'acquire' },
          { id: 'e2', d: '2025-06-10', t: 'measure', diam: 22, h: 15, note: 'first measure' },
          { id: 'e3', d: '2025-08-01', t: 'treat', used: 'Safari 20SG' }
        ],
        m: 1700000000000
      },
      '2024-0001': { acc: '2024-0001', taxonId: 'welwitschia-mirabilis', status: 'dead', events: [{ id: 'e9', d: '2025-01-01', t: 'death', cause: 'rot' }] }
    },
    tombs: { 'a:2024-0002': 1710000000000 }
  },
  overlay: {
    'copiapoa-cinerea': { id: 'copiapoa-cinerea', name: 'Copiapoa cinerea', myNotes: 'Keep bone dry in winter.' },
    'welwitschia-mirabilis': { id: 'welwitschia-mirabilis', name: 'Welwitschia mirabilis' }
  }
};

describe('v2 importer', () => {
  it('converts accessions, events, taxa and tombstones into changes', () => {
    const { changes, report } = importV2(backup, { now: 1_800_000_000_000, summaries: { 'copiapoa-cinerea': { gk: 5384013 } } });
    expect(report).toMatchObject({ accessions: 2, events: 4, taxa: 2 });
    const { state } = materialise(changes);
    const accs = live(state, 'accession') as unknown as Array<{ id: string; taxonName: string; taxonKey: number | null; status: string; location: string; acquired: string }>;
    expect(accs.map((a) => a.id).sort()).toEqual(['2024-0001', '2025-0003']);
    const c = accs.find((a) => a.id === '2025-0003')!;
    expect(c.taxonName).toBe('Copiapoa cinerea');
    expect(c.taxonKey).toBe(5384013);
    expect(c.location).toBe('Basement shelf 2');
    expect(c.acquired).toBe('2025-03-02');
    // The number is a field as well as the id, so the vault's ledger of issued numbers sees every imported one (round twelve, 6).
    expect(changes.filter((ch) => ch.kind === 'accession' && ch.field === 'acc').map((ch) => ch.value).sort()).toEqual(['2024-0001', '2024-0002', '2025-0003']);
    // and it is the record's last field, so the fields before it keep their counters: taxonName is the record's first change, count 0
    expect(changes.find((ch) => ch.id === '2025-0003' && ch.field === 'taxonName')!.t).toMatch(/-0000-v2imp$/);
    const evs = live(state, 'event') as unknown as Array<{ acc: string; t: string; measures?: Record<string, number> }>;
    expect(evs.filter((e) => e.acc === '2025-0003')).toHaveLength(3);
    expect(evs.find((e) => e.t === 'measure')?.measures).toEqual({ diam: 22, h: 15 });
    expect(state.get('accession:2024-0002')?._deleted).toBe(true);
    const taxa = live(state, 'taxon') as unknown as Array<{ id: string; myNotes?: string }>;
    expect(taxa.find((t) => t.id === 'copiapoa-cinerea')?.myNotes).toBe('Keep bone dry in winter.');
  });
  it('import timestamps sort before a later local edit', () => {
    const { changes } = importV2(backup, { now: 1_800_000_000_000 });
    const later = `${String(1_800_000_000_000).padStart(13, '0')}-0000-dev`;
    expect(changes.every((c) => c.t < later)).toBe(true);
  });
  it('a record is stamped from its own modification time (m); one without is stamped an hour before now; the same file gives the same stamps twice', () => {
    const { changes } = importV2(backup, { now: 1_800_000_000_000 });
    const wallOf = (c: { t: string }) => Number(c.t.slice(0, 13));
    const withM = changes.filter((c) => c.id === '2025-0003' || c.id.startsWith('v2-2025-0003-'));
    expect(withM.length).toBeGreaterThan(0);
    expect(withM.every((c) => wallOf(c) === 1_700_000_000_000)).toBe(true); // the plant and its embedded events
    const without = changes.filter((c) => c.id === '2024-0001');
    expect(without.every((c) => wallOf(c) === 1_800_000_000_000 - 3_600_000)).toBe(true);
    const tomb = changes.find((c) => c.id === '2024-0002' && c.field === '_deleted');
    expect(wallOf(tomb!)).toBe(1_710_000_000_000); // the v2 deletion time
    expect(tomb!.t).toBe('1710000000000-0000-v2imp'); // the stamp earlier builds gave the removal (round thirteen, 5)
    const tombNo = changes.find((c) => c.id === '2024-0002' && c.field === 'acc')!;
    expect(tombNo.t < tomb!.t).toBe(true); // the number is stamped before the removal, so the removal stands
    // An edit here after the v2 modification time wins on every device; a second import cannot beat it.
    const again = importV2(backup, { now: 1_800_000_000_000 + 86_400_000 });
    expect(again.changes.filter((c) => c.id === '2025-0003').map((c) => c.t)).toEqual(withM.filter((c) => c.id === '2025-0003').map((c) => c.t));
    expect(new Set(changes.map((c) => c.t)).size).toBe(changes.length); // unique even though two records can share a millisecond
  });
  it('a modification time that is not one (0, a future clock) falls back to the file base', () => {
    const odd = { collection: { accessions: { A: { acc: 'A', taxonId: 'x', m: 0 }, B: { acc: 'B', taxonId: 'x', m: 1_900_000_000_000 } } } };
    const { changes } = importV2(odd, { now: 1_800_000_000_000 });
    expect(new Set(changes.map((c) => Number(c.t.slice(0, 13))))).toEqual(new Set([1_800_000_000_000 - 3_600_000]));
  });
  it('records already in the log are skipped and counted, so importing the same file twice changes nothing', () => {
    const first = importV2(backup, { now: 1_800_000_000_000 });
    const ids = new Set(first.changes.map((c) => `${c.kind}:${c.id}`));
    const second = importV2(backup, { now: 1_800_000_000_000, exists: (kind, id) => ids.has(`${kind}:${id}`) });
    expect(second.changes).toHaveLength(0);
    expect(second.report).toMatchObject({ accessions: 0, events: 0, taxa: 0, alreadyHere: 5 }); // 2 plants, 2 species, 1 tombstone
    // A partial overlap: only what is new comes in.
    const third = importV2(backup, { now: 1_800_000_000_000, exists: (kind, id) => kind === 'accession' && id === '2025-0003' });
    expect(third.report).toMatchObject({ accessions: 1, events: 1, taxa: 2, alreadyHere: 1 });
    expect(third.changes.some((c) => c.id === '2025-0003' || c.id.startsWith('v2-2025-0003-'))).toBe(false);
  });
  it('accepts a raw collection object too', () => {
    const { report } = importV2(backup.collection);
    expect(report.accessions).toBe(2);
  });
});

describe('v2 import at scale', () => {
  it('a collection of more than 65,536 field values stamps every change with a readable HLC', () => {
    const accessions: Record<string, unknown> = {};
    for (let i = 0; i < 700; i++) accessions[`2020-${i}`] = { acc: `2020-${i}`, taxonId: 'x', status: 'growing', events: Array.from({ length: 20 }, (_, j) => ({ id: 'e' + j, d: '2020-01-01', t: 'water' })) };
    const { changes } = importV2({ collection: { accessions } });
    expect(changes.length).toBeGreaterThan(0xffff);
    expect(changes.every((c) => /^\d{13}-[0-9a-f]{4,6}-[a-z0-9]{1,16}$/.test(c.t))).toBe(true);
    expect(new Set(changes.map((c) => c.t)).size).toBe(changes.length);
  });
});

describe('v2 benches', () => {
  it('become location nodes and plants land on them by id or by name', () => {
    const b = {
      collection: {
        benches: { b1: { id: 'b1', name: 'Laundry shelf', where: 'indoor', floor: 12, ppfd: 350, hours: 14 }, b2: { id: 'b2', name: 'Garage', where: 'outbuilding', floor: 5 } },
        accessions: { '2026-0001': { acc: '2026-0001', taxonId: 'x', bench: 'b1', status: 'growing' }, '2026-0002': { acc: '2026-0002', taxonId: 'x', bench: 'garage', status: 'growing' }, '2026-0003': { acc: '2026-0003', taxonId: 'x', bench: 'Windowsill', status: 'growing' } }
      }
    };
    const { changes, report } = importV2(b, { now: 1_800_000_000_000 });
    expect(report.locations).toBe(2);
    const { state } = materialise(changes);
    const locs = live(state, 'location') as unknown as Array<{ id: string; name: string; floorC: number | null; ppfd: number | null }>;
    expect(locs.map((l) => l.name).sort()).toEqual(['Garage', 'Laundry shelf']);
    expect(locs.find((l) => l.name === 'Laundry shelf')?.ppfd).toBe(350);
    const accs = live(state, 'accession') as unknown as Array<{ id: string; locationId: string | null; location: string | null }>;
    expect(accs.find((a) => a.id === '2026-0001')?.locationId).toBe(locs.find((l) => l.name === 'Laundry shelf')?.id);
    expect(accs.find((a) => a.id === '2026-0002')?.locationId).toBe(locs.find((l) => l.name === 'Garage')?.id);
    // an unknown bench name stays as free text for one-click conversion later
    expect(accs.find((a) => a.id === '2026-0003')?.locationId).toBeNull();
    expect(accs.find((a) => a.id === '2026-0003')?.location).toBe('Windowsill');
  });
});

describe('imported numbers reach the ledger (round twelve, 6; round fourteen, 2)', () => {
  it('a sowing carries its number as a `no` field, last, like a plant carries `acc`', () => {
    const file = { collection: { sowings: { 'S2025-001': { id: 'S2025-001', sown: '2025-03-01', taxonId: 'lithops', count: 12, m: 1_700_000_000_000 } } } };
    const { changes, report } = importV2(file, { now: 1_800_000_000_000 });
    expect(report.sowings).toBe(1);
    const fields = changes.filter((c) => c.kind === 'sowing' && c.id === 'S2025-001').map((c) => c.field);
    expect(fields[fields.length - 1]).toBe('no');
    expect(changes.find((c) => c.kind === 'sowing' && c.field === 'no')?.value).toBe('S2025-001');
  });
});
