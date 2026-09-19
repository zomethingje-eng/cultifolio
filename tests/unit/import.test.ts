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
