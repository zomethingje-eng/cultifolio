/**
 * Round eighty, agent X: the build's indexes keep their own copies of the text they keep, not the file's.
 *
 * The owner's full build (the DWCA route, round seventy-nine's code with round eighty's first fixes) stopped with
 * "JavaScript heap out of memory" at 8 GB while reading multimedia.txt, before building a species. A field split from a
 * line readline cut from a 64 KB chunk of the stream is a slice of that chunk, and keeps it alive while it is kept: the
 * photographs' index (30 a species) kept the whole of multimedia.txt's text, the records' dataset names one chunk each,
 * and each of Kew's indexes its own copy of Kew's names file. `ownText` copies what is kept. Measured on the loading
 * phase with Kew's real files (/home/claude/r73data/bulk): Kew's names 1,737 to 1,410 MB, Kew's rows 295 to 221 MB, Kew's
 * species 339 to 11 MB, and the photographs' index at a twentieth of the list's size 1,198 to 35 MB.
 * FAILED on r80base: the photographs' index kept 157 MB of 77 MB of text, the records' 213 MB, and no `ownText`.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as bulk from '$lib/dossier/bulk';
import { idHash, MediaIndex, type MediaRow } from '$lib/dossier/bulk';

describe('round eighty, X: kept text is copied out of the stream', () => {
  it('the photographs\' and the records\' indexes keep a few MB of 77 and 106 MB of text (before: 157 and 213)', () => {
    const { NODE_OPTIONS: _, ...env } = process.env;
    const r = spawnSync(process.execPath, ['--expose-gc', '--import', 'tsx', 'scripts/dev/r80x-text-heap.ts', '300000'], { encoding: 'utf8', env });
    expect(r.status, r.stderr).toBe(0);
    const m = JSON.parse(r.stdout.trim().split('\n').pop()!) as { media: { kept: number; heapMB: number; textMB: number }; occ: { kept: number; heapMB: number; textMB: number } };
    expect(m.media.kept).toBe(200);
    expect(m.media.heapMB).toBeLessThan(m.media.textMB / 10);
    expect(m.occ.kept).toBe(200000);
    expect(m.occ.heapMB).toBeLessThan(m.occ.textMB / 10);
  }, 120_000);

  it('ownText gives the same string', () => {
    const own = (bulk as { ownText?: (s: string) => string }).ownText;
    expect(own).toBeTypeOf('function');
    for (const s of ['', 'ZA', 'Łukasz Wróblewski', 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/original.jpg', '日本語の名前 and more']) expect(own!(s)).toBe(s);
  });

  it('the photographs\' index chooses the same thirty, in the same order, as round seventy-nine\'s', () => {
    // Round seventy-nine's rule, as it was: open images of marked records, by the record's rank, then id, then file order.
    let s = 7;
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    const owner = new Map<number, number>(), rank = new Map<number, number>();
    for (let i = 0; i < 400; i++) { owner.set(5_000_000_000 + i, 1 + (i % 3)); if (rnd() < 0.7) rank.set(5_000_000_000 + i, rnd() < 0.2 ? 1 + rnd() : rnd()); }
    const rows: MediaRow[] = Array.from({ length: 3000 }, (_, i) => ({ gbifID: 5_000_000_000 + Math.floor(rnd() * 450), identifier: `https://example.org/p/${i}.jpg`, license: rnd() < 0.2 ? 'http://creativecommons.org/licenses/by-nc/4.0/' : rnd() < 0.5 ? 'http://creativecommons.org/licenses/by/4.0/' : undefined, creator: rnd() < 0.5 ? `Łukasz ${i}` : undefined, type: rnd() < 0.05 ? 'Sound' : 'StillImage', format: rnd() < 0.05 ? 'audio/mpeg' : 'image/jpeg' }));
    const now = new MediaIndex(owner, rank);
    for (const m of rows) now.add(m);
    const old = new Map<number, Array<{ gbifID: number; m: MediaRow; rank: number; seq: number }>>();
    let seq = 0;
    for (const m of rows) {
      const k = owner.get(m.gbifID);
      if (!k || (m.type && !/still/i.test(m.type)) || (m.format && !/^image\//i.test(m.format)) || !/\/by\//.test(m.license ?? '') || /by-nc/.test(m.license ?? '')) continue;
      const arr = old.get(k) ?? [];
      const row = { gbifID: m.gbifID, m, rank: rank.get(m.gbifID) ?? idHash(m.gbifID), seq: seq++ };
      const before = (a: typeof row, b: typeof row) => a.rank < b.rank || (a.rank === b.rank && (a.gbifID < b.gbifID || (a.gbifID === b.gbifID && a.seq < b.seq)));
      if (arr.length >= MediaIndex.CAP && !before(row, arr[arr.length - 1])) continue;
      let i = arr.length;
      while (i > 0 && before(row, arr[i - 1])) i--;
      arr.splice(i, 0, row);
      if (arr.length > MediaIndex.CAP) arr.pop();
      old.set(k, arr);
    }
    for (const k of [1, 2, 3]) expect(now.page(k)!.results.flatMap((o) => o.media!.map((x) => [o.key, x.identifier, x.creator]))).toEqual([...new Map((old.get(k) ?? []).map((r) => [r.gbifID, 0])).keys()].flatMap((id) => old.get(k)!.filter((r) => r.gbifID === id).map((r) => [id, r.m.identifier, r.m.creator])));
  });

  it('every Kew loader copies its lines', () => {
    for (const f of ['scripts/bulk-load.ts', 'scripts/kew-rows-load.ts', 'scripts/kew-infra-load.ts', 'scripts/kew-species-load.ts', 'scripts/kew-names-load.ts']) expect(readFileSync(f, 'utf8'), f).toMatch(/ownText\((raw|line)\)/);
  });
});
