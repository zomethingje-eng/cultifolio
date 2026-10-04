/**
 * Round fifty-nine: the "replaced unseen" reading (src/lib/core/notes.ts), from the three reviews' reproductions. An edit
 * is paired with its base by its own writer, so another device's notes stamped between them cannot make a sighted edit
 * read as blind; held and parked changes have replaced nothing on screen; a species' own notes are read the same way;
 * and a long history is one pass.
 */
import { describe, it, expect } from 'vitest';
import { hlcEncode } from '$core/hlc';
import { replacedNotes } from '$core/notes';
import type { Change } from '$core/log';

const t = (wall: number, count: number, device: string) => hlcEncode({ wall, count, device });
const notes = (stamp: string, value: string, field = 'notes'): Change => ({ t: stamp, kind: 'accession', id: 'p', field, value });
const base = (stamp: string, of: string | null, field = 'notesBase'): Change => ({ t: stamp, kind: 'accession', id: 'p', field, value: of });

describe('notes replaced unseen', () => {
  it('two devices that each edited from the same text: only the first edit is replaced unseen, though their stamps interleave (the independent review, 3)', () => {
    const O = t(1000, 0, 'aaaaaaaaaaaa');
    const log = [notes(O, 'Original'), notes(t(2000, 0, 'bbbbbbbbbbbb'), 'B edit'), notes(t(2000, 0, 'cccccccccccc'), 'C edit'), base(t(2000, 1, 'bbbbbbbbbbbb'), O), base(t(2000, 1, 'cccccccccccc'), O)];
    expect(replacedNotes(log).map((r) => r.text)).toEqual(['B edit']);
  });

  it('an edit stamped past a held peer edit is paired with its own base, not cut off by the peer\'s notes (the round forty-one review, 8)', () => {
    const N0 = t(1000, 0, 'aaaaaaaaaaaa');
    const peerNotes = t(2000, 0, 'bbbbbbbbbbbb'), peerBase = t(2000, 1, 'bbbbbbbbbbbb');
    const mine = t(2000, 1, 'aaaaaaaaaaaa'), mineBase = t(2000, 2, 'aaaaaaaaaaaa');
    const log = [notes(N0, 'N0 mine'), notes(peerNotes, 'peer text'), base(peerBase, N0), notes(mine, 'mine again'), base(mineBase, N0)];
    // the peer edited from N0, knowingly; the grower then edited from N0 too, without seeing the peer's text
    expect(replacedNotes(log).map((r) => r.text)).toEqual(['peer text']);
  });

  it('a held or parked edit has replaced nothing on screen yet, and is left out (the round forty-one review, 8)', () => {
    const N0 = t(1000, 0, 'aaaaaaaaaaaa');
    const far = t(1000 + 400 * 86_400_000, 0, 'bbbbbbbbbbbb');
    const log = [notes(N0, 'the text on screen'), notes(far, 'a year ahead'), base(t(1000 + 400 * 86_400_000, 1, 'bbbbbbbbbbbb'), null)];
    expect(replacedNotes(log).map((r) => r.text)).toEqual(['the text on screen']); // read as if applied
    expect(replacedNotes(log, { skip: new Set([far]) })).toEqual([]); // the fold has not applied it
  });

  it('a species\' own notes are read the same way, by their own fields (round fifty-nine)', () => {
    const M0 = t(1000, 0, 'aaaaaaaaaaaa');
    const log = [notes(M0, 'water in spring', 'myNotes'), notes(t(2000, 0, 'bbbbbbbbbbbb'), 'water in autumn', 'myNotes'), base(t(2000, 1, 'bbbbbbbbbbbb'), null, 'myNotesBase')];
    expect(replacedNotes(log, { field: 'myNotes', baseField: 'myNotesBase' }).map((r) => r.text)).toEqual(['water in spring']);
    expect(replacedNotes(log)).toEqual([]); // the plant's notes fields are not the species'
  });

  it('three thousand edits read in one pass, well under a frame budget per hundred (the client review, 12)', () => {
    const log: Change[] = [];
    let prev: string | null = null;
    for (let i = 0; i < 3000; i++) {
      const n = t(1000 + i * 10, 0, 'aaaaaaaaaaaa');
      log.push(notes(n, `text ${i}`), base(t(1000 + i * 10, 1, 'aaaaaaaaaaaa'), prev));
      prev = n;
    }
    const t0 = performance.now();
    expect(replacedNotes(log)).toEqual([]); // each made from the one before
    expect(performance.now() - t0).toBeLessThan(150);
  });
});
