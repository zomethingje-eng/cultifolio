/**
 * Notes replaced unseen, read from the log (round fifty-eight). Last-writer-wins keeps one text of a plant's, a batch's
 * or a species' notes when two devices edited them apart; the other is not lost, since every text stays in the log, and
 * this reading finds the texts an edit replaced without having seen them. Every device reads the same answer from the
 * same log, and nothing is written (rule 5).
 *
 * The rule: in stamp order, a notes text is replaced unseen when the next notes change that differs from it was made
 * from another text. What an edit was made from is its base (`notesBase`, `myNotesBase`): the stamp of the text the
 * editor opened on, written by the same writer in the same commit, after the notes. An edit with no base (an import of
 * an old file) is taken as unseen.
 *
 * Round fifty-nine (all three reviews): an edit is paired with its base by writer alone, so another device's notes
 * stamped between the two (a held change the grower's edit was stamped past) no longer cut the pair apart and make a
 * sighted edit read as blind; changes the fold holds or has parked are left out, since the text on screen has not been
 * replaced by them; and the reading is one pass, not one search per edit.
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

/**
 * The texts of one record's notes that a later edit replaced unseen, oldest first, from that record's changes. `field`
 * and `baseField` name the notes and their base (`myNotes`/`myNotesBase` on a species); `skip` holds the stamps the fold
 * has not applied (held or parked).
 */
export function replacedNotes(changes: Change[], opts: { field?: string; baseField?: string; skip?: ReadonlySet<string> } = {}): ReplacedNotes[] {
  const field = opts.field ?? 'notes', baseField = opts.baseField ?? 'notesBase';
  const ordered = changes.filter((c) => (c.field === field || c.field === baseField) && !opts.skip?.has(c.t)).sort((a, b) => hlcCompare(a.t, b.t));
  // Each edit's base: the first base its own writer wrote after it.
  const baseOf = new Map<string, unknown>();
  const awaiting = new Map<string, string>(); // writer -> its latest notes stamp without a base yet
  const notes: Change[] = [];
  for (const c of ordered) {
    const writer = hlcDecode(c.t).device;
    if (c.field === field) {
      notes.push(c);
      awaiting.set(writer, c.t);
    } else {
      const edit = awaiting.get(writer);
      if (edit !== undefined) { baseOf.set(edit, c.value); awaiting.delete(writer); }
    }
  }
  const out: ReplacedNotes[] = [];
  for (let i = 1; i < notes.length; i++) {
    const prev = notes[i - 1], cur = notes[i];
    if (typeof prev.value !== 'string' || !prev.value.trim() || prev.value === cur.value) continue;
    if (baseOf.get(cur.t) === prev.t) continue; // made from this text: replaced knowingly
    out.push({ text: prev.value, was: prev.t, by: cur.t });
  }
  return out;
}
