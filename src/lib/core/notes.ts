/**
 * Notes replaced unseen, read from the log (round fifty-eight). Last-writer-wins keeps one text of a plant's or a batch's
 * notes when two devices edited them apart; the other is not lost, since every text stays in the log, and this reading
 * finds the texts an edit replaced without having seen them. Before this round the device that held the losing text
 * wrote a "Notes replaced" line on the plant's log when a pull or an import replaced it, which was a reading of the log
 * writing to the log (rule 5), skipped any text that came due from a held change, and was written by one device only.
 * Now every device reads the same answer from the same log, and nothing is written.
 *
 * The rule: in stamp order, a notes text is replaced unseen when the next notes change that differs from it was made
 * from another text. What an edit was made from is its `notesBase`: the stamp of the text the editor opened on, written
 * by the same writer just after the notes, in the same commit. An edit with no base (an import of an old file) is taken
 * as unseen, as before.
 */
import { hlcCompare, hlcDecode } from './hlc';
import type { Change } from './log';

export interface ReplacedNotes {
  /** The text that was replaced. */
  text: string;
  /** The stamp it was written under. */
  was: string;
  /** The stamp of the edit that replaced it. */
  by: string;
}

/** The texts of one record's notes that a later edit replaced unseen, oldest first, from that record's changes. */
export function replacedNotes(changes: Change[]): ReplacedNotes[] {
  const ordered = [...changes].sort((a, b) => hlcCompare(a.t, b.t));
  const notes = ordered.filter((c) => c.field === 'notes');
  const out: ReplacedNotes[] = [];
  for (let i = 1; i < notes.length; i++) {
    const prev = notes[i - 1], cur = notes[i];
    if (typeof prev.value !== 'string' || !prev.value.trim() || prev.value === cur.value) continue;
    // The base that belongs to this edit: the same writer's first `notesBase` after it, with no notes change between.
    const writer = hlcDecode(cur.t).device;
    const next = i + 1 < notes.length ? notes[i + 1].t : null;
    const base = ordered.find((b) => b.field === 'notesBase' && hlcCompare(b.t, cur.t) > 0 && (next === null || hlcCompare(b.t, next) < 0) && hlcDecode(b.t).device === writer);
    if (base && base.value === prev.t) continue; // made from this text: replaced knowingly
    out.push({ text: prev.value, was: prev.t, by: cur.t });
  }
  return out;
}
