/**
 * Round sixty-three, M (the backlog audit's 19): the merge preview folded the device's log twice, once alone and once
 * with the file's new changes after it. It now folds it once and folds the new changes on top (`apply` with the same
 * `seen`), keeping each record's stamp from before. This pins that the two come out the same, on logs made to be awkward:
 * repeated stamps, a file older than the device, removals and returns, records the file only touches.
 *
 * Passes before and after the change by design (it is a refactor); it fails if the preview's "before" is taken after the
 * file's changes are folded in, or if the fold on top differs from folding the two together.
 */
import { describe, it, expect } from 'vitest';
import { previewMerge } from '$lib/backup/backup';
import { materialise, apply, type Change } from '$core/log';

/** A small seeded generator, so a failure names a log that can be made again. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
function randomLog(r: () => number, n: number, devs: string[]): Change[] {
  const out: Change[] = [];
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  for (let i = 0; i < n; i++) {
    const t = `${String(1700000000000 + Math.floor(r() * 40)).padStart(13, '0')}-000${Math.floor(r() * 3)}-${pick(devs)}`; // few stamps, so ties happen
    const kind = pick(['accession', 'event', 'sowing', 'photo'] as const);
    const id = `${kind[0]}${Math.floor(r() * 5)}`;
    const roll = r();
    if (roll < 0.15) out.push({ t, kind, id, field: '_deleted', value: r() < 0.7 });
    else if (kind === 'accession') out.push({ t, kind, id, field: pick(['taxonName', 'status', 'acc', 'notes']), value: pick(['Aloe', 'growing', '2026-0001', '2026-0002', 'x']) });
    else if (kind === 'event') out.push({ t, kind, id, field: pick(['acc', 'd', 't']), value: pick(['a0', 'a1', 's0', '2026-09-01', 'water']) });
    else if (kind === 'photo') out.push({ t, kind, id, field: pick(['acc', 'd', 'w', 'h', 'bytes']), value: pick(['a0', 'a2', '2026-09-02', 1, 3]) });
    else out.push({ t, kind, id, field: pick(['taxonName', 'method', 'sown', 'count', 'status']), value: pick(['Aloe', 'seed', '2026-03-01', 20, 'growing']) });
  }
  return out;
}
/** The preview's record counts as they were taken with two folds (round sixty-two). */
function twoFolds(current: Change[], incoming: Change[]) {
  const have = new Set(current.map((c) => c.t));
  const fresh = incoming.filter((c) => !have.has(c.t));
  const before = materialise(current).state;
  const after = materialise([...current, ...fresh]).state;
  let added = 0, changed = 0;
  for (const [k, r] of after) {
    const b = before.get(k);
    if (!b) added++;
    else if (b._t !== r._t) changed++;
  }
  return { fresh: fresh.length, added, changed, unchanged: after.size - added - changed };
}

describe('the merge preview folds the device log once (round sixty-three; the backlog audit, 19)', () => {
  it('folding the new changes on top of the device fold is the fold of the two together', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      const current = randomLog(r, 30, ['dev1', 'dev2']);
      const incoming = [...current.filter(() => r() < 0.5), ...randomLog(r, 30, ['dev1', 'dev3'])];
      const together = materialise([...current, ...incoming]);
      const { state, seen } = materialise(current);
      apply(state, incoming, seen);
      expect(state, `seed ${seed}`).toEqual(together.state);
      expect(seen, `seed ${seed}`).toEqual(together.seen);
    }
  });
  it('the preview counts the same records added, changed and unchanged as the two folds did', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed * 7919);
      const current = randomLog(r, 40, ['dev1', 'dev2']);
      const incoming = [...current.filter(() => r() < 0.6), ...randomLog(r, 25, ['dev1', 'dev3'])];
      const m = previewMerge(current, incoming);
      expect({ fresh: m.fresh.length, added: m.added, changed: m.changed, unchanged: m.unchanged }, `seed ${seed}`).toEqual(twoFolds(current, incoming));
    }
  });
  it('a record the file only edits is counted as changed, and the device log is left as it was', () => {
    const current: Change[] = [
      { t: '1700000000001-0000-dev1', kind: 'accession', id: 'a', field: 'taxonName', value: 'Aloe' },
      { t: '1700000000002-0000-dev1', kind: 'accession', id: 'a', field: 'status', value: 'growing' }
    ];
    const copy = structuredClone(current);
    const m = previewMerge(current, [...current, { t: '1700000000003-0000-dev2', kind: 'accession', id: 'a', field: 'notes', value: 'flowered' }]);
    expect([m.added, m.changed, m.unchanged]).toEqual([0, 1, 0]);
    expect(current).toEqual(copy);
  });
});

describe('the photographs a file holds no pixels for, from a fold already made (round sixty-three; the backlog audit, 19)', () => {
  it('passing the fold of the file gives what folding it again gives', async () => {
    const { photosWithoutPixels, summarise } = await import('$lib/backup/backup');
    const r = rng(42);
    const changes = randomLog(r, 200, ['dev1', 'dev2']);
    const file = { changes, photoIds: ['p0', 'p3'] };
    expect(photosWithoutPixels(file, summarise(changes).state)).toEqual(photosWithoutPixels(file));
    expect(photosWithoutPixels(file).length).toBeGreaterThan(0);
  });
});
