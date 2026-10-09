/**
 * Round sixty-three, M (the backlog audit's 20): the merge preview counted every live, complete record by kind, but a
 * removal tombstones the plant alone, so a backup holding a removed plant with two lines on its timeline was told
 * "2 timeline entries will be added" for entries no page shows. An entry (a timeline line, a batch line, a photograph)
 * is counted as added only when the plant or batch it belongs to is live in the merged result; the rest are counted
 * apart, in `addedOnRemoved`, for the disclosure to name.
 */
import { describe, it, expect } from 'vitest';
import { previewMerge } from '$lib/backup/backup';
import { materialise, type Change } from '$core/log';

const t = (n: number, dev = 'dev1') => `${String(1700000000000 + n).padStart(13, '0')}-0000-${dev}`;
const c = (n: number, kind: Change['kind'], id: string, field: string, value: unknown, dev?: string): Change => ({ t: t(n, dev), kind, id, field, value });

const plant = (n: number, id: string): Change[] => [c(n, 'accession', id, 'taxonName', 'Copiapoa cinerea'), c(n + 1, 'accession', id, 'status', 'growing')];
const event = (n: number, id: string, acc: string, dev?: string): Change[] => [c(n, 'event', id, 'acc', acc, dev), c(n + 1, 'event', id, 'd', '2026-09-01', dev), c(n + 2, 'event', id, 't', 'water', dev)];
const batch = (n: number, id: string): Change[] => [c(n, 'sowing', id, 'taxonName', 'Aloe'), c(n + 1, 'sowing', id, 'method', 'seed'), c(n + 2, 'sowing', id, 'sown', '2026-03-01'), c(n + 3, 'sowing', id, 'count', 20), c(n + 4, 'sowing', id, 'status', 'growing')];
const photo = (n: number, id: string, owner: 'acc' | 'sowing', of: string): Change[] => [c(n, 'photo', id, owner, of), c(n + 1, 'photo', id, 'd', '2026-09-02'), c(n + 2, 'photo', id, 'w', 1), c(n + 3, 'photo', id, 'h', 1), c(n + 4, 'photo', id, 'bytes', 3)];

describe('the merge preview and the entries of a removed plant (round sixty-three; the backlog audit, 20)', () => {
  it('a backup with one removed plant and two events adds no timeline entries a page would show', () => {
    const file = [...plant(1, 'r1'), ...event(10, 'e1', 'r1'), ...event(20, 'e2', 'r1'), c(30, 'accession', 'r1', '_deleted', true)];
    const m = previewMerge([], file);
    expect(m.addedByKind.event ?? 0).toBe(0);
    expect(m.addedDeleted).toBe(1);
    expect(m.addedOnRemoved).toBe(2);
    expect(m.addedOnRemovedByKind).toEqual({ event: 2 });
    expect(m.added).toBe(3); // every new record is still in the total
  });

  it('entries arriving from the file for a plant removed here are not counted as added', () => {
    const here = [...plant(1, 'r1'), c(5, 'accession', 'r1', '_deleted', true, 'dev2')];
    const file = [...plant(1, 'r1'), ...event(10, 'e1', 'r1'), ...event(20, 'e2', 'r1')];
    const m = previewMerge(here, file);
    expect(materialise([...here, ...m.fresh]).state.get('accession:r1')?._deleted).toBe(true); // the removal here stands
    expect(m.addedByKind).toEqual({});
    expect(m.addedDeleted).toBe(0);
    expect(m.addedOnRemoved).toBe(2);
  });

  it('a batch line and a photograph go by their own batch or plant; on a live one they are counted as added', () => {
    const here = [...plant(1, 'live'), ...batch(100, 'sLive')];
    const file = [
      ...here,
      ...plant(200, 'gone'), c(210, 'accession', 'gone', '_deleted', true),
      ...batch(300, 'sGone'), c(310, 'sowing', 'sGone', '_deleted', true),
      ...event(400, 'eLive', 'live'), ...event(410, 'bLive', 'sLive'), ...photo(420, 'pLive', 'acc', 'live'), ...photo(430, 'psLive', 'sowing', 'sLive'),
      ...event(500, 'eGone', 'gone'), ...event(510, 'bGone', 'sGone'), ...photo(520, 'pGone', 'acc', 'gone'), ...photo(530, 'psGone', 'sowing', 'sGone')
    ];
    const m = previewMerge(here, file);
    expect(m.addedByKind).toEqual({ event: 2, photo: 2 });
    expect(m.addedDeleted).toBe(2);
    expect(m.addedOnRemoved).toBe(4);
    expect(m.addedOnRemovedByKind).toEqual({ event: 2, photo: 2 });
  });

  it('a plant the file brings back takes its entries with it: they are counted as added', () => {
    const here = [...plant(1, 'r1'), c(5, 'accession', 'r1', '_deleted', true)];
    const file = [...here, c(40, 'accession', 'r1', '_deleted', false), ...event(50, 'e1', 'r1')];
    const m = previewMerge(here, file);
    expect(m.addedByKind).toEqual({ event: 1 });
    expect(m.addedOnRemoved).toBe(0);
  });
});
