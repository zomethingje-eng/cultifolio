/**
 * The Wanted list's note and price seen, kept in the species' own notes (round sixty; the grower review's §2 table): the
 * data model has no field for them, so they are one line of `myNotes`, "Wanted: <note> · price seen <price>", which the
 * species' notes show as written and which an edit here replaces without touching the rest of the notes.
 */
export const WANTED = 'Wanted:';
const PRICE = ' · price seen ';

export function readWanted(myNotes: string | null | undefined): { note: string; price: string } {
  const line = (myNotes ?? '').split('\n').find((l) => l.startsWith(WANTED));
  if (!line) return { note: '', price: '' };
  const body = line.slice(WANTED.length).trim();
  const i = body.lastIndexOf(PRICE.trim());
  if (body.startsWith('price seen ')) return { note: '', price: body.slice('price seen '.length).trim() };
  if (i < 0) return { note: body, price: '' };
  return { note: body.slice(0, i).replace(/\s*·\s*$/, '').trim(), price: body.slice(i + PRICE.trim().length).trim() };
}

/** The notes with the Wanted line set (or taken out when both are empty); every other line kept as it was. */
export function writeWanted(myNotes: string | null | undefined, note: string, price: string): string | null {
  const n = note.replace(/\s+/g, ' ').trim(), p = price.replace(/\s+/g, ' ').trim();
  const line = n || p ? `${WANTED} ${[n, p ? `price seen ${p}` : ''].filter(Boolean).join(' · ')}` : null;
  const rest = (myNotes ?? '').split('\n');
  const at = rest.findIndex((l) => l.startsWith(WANTED));
  if (at >= 0) { if (line) rest[at] = line; else rest.splice(at, 1); }
  else if (line) rest.unshift(line);
  const out = rest.join('\n').trim();
  return out || null;
}
