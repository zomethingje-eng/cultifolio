/**
 * A plant's lineage, read from the log (round eighty-seven, F4): its parents and its children, one step each way. Nothing
 * here writes; every field is read as the log may hold it, from this version, an older one or a newer one, and a value
 * that is not what the field holds is read as none, never thrown on (STAGE3-87's rule: validation on read).
 *
 * Where each link is kept, on kinds and fields every version reads (a new kind is refused whole by round eighty-six):
 * - a cross: a `pollinate` line on the seed parent with `pollen`, the pollen parent's record id; dated by the line;
 * - the seed lot a batch is sown from: the batch's `cross`, that line's id;
 * - a graft: a `graft` line on the grafted plant with `scion` and `stock`, record ids, either of which may be absent (a
 *   bought stock is no plant of the grower's); a graft batch keeps its scion's plant in `parentAcc` and its stock's in
 *   `stockAcc`;
 * - an offset, a cutting, a division, a leaf or a bulbil: the plant's `motherAcc` and `motherHow` when it was added from
 *   one of the grower's plants without a batch; through the batch's `parentAcc` and method when it was potted up.
 *
 * A link names a record id. The record may be a plant the grower still has, one dead, archived or removed (the page says
 * which, and links it all the same), or none this device holds (said as that). Only one step is read each way, so a
 * damaged log that makes a plant its own grandparent costs nothing.
 */
import type { Accession, PlantEvent, Sowing } from './types';
import { MOTHER_HOW, MOTHER_HOW_LABEL } from './types';

/** The longest record id a link field is read as; an id this app mints is 25 characters or so. */
export const LINK_MAX = 64;
/** A record id as a link field holds it, or null: not a string, empty, past `LINK_MAX`, or the record's own id. */
export function linkId(v: unknown, self?: string): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t && t.length <= LINK_MAX && t === v && t !== self ? t : null;
}
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A whole day as the log writes one, YYYY-MM-DD; anything else is read as no date. */
export const isDay = (v: unknown): v is string => typeof v === 'string' && DAY.test(v);

/** A cross, as the pollinate line that records it. `seed` is the line's plant, `pollen` the pollen parent. */
export interface Cross { id: string; seed: string; pollen: string; d: string | null; note: string | null }
/** The cross a line records, or null: not a pollinate line, or one with no readable pollen parent other than its own plant. */
export function crossOf(e: Pick<PlantEvent, 'id' | 'acc' | 't' | 'd'> & { pollen?: unknown; note?: unknown } | null | undefined): Cross | null {
  if (!e || e.t !== 'pollinate' || typeof e.acc !== 'string' || !e.acc) return null;
  const pollen = linkId(e.pollen, e.acc);
  if (!pollen) return null;
  return { id: e.id, seed: e.acc, pollen, d: isDay(e.d) ? e.d : null, note: typeof e.note === 'string' && e.note ? e.note : null };
}

/** A graft, as the graft line that records it on the grafted plant. */
export interface Graft { id: string; plant: string; scion: string | null; stock: string | null; d: string | null }
/** The graft a line records, or null: not a graft line, or one that names neither a scion's plant nor a stock's. */
export function graftOf(e: Pick<PlantEvent, 'id' | 'acc' | 't' | 'd'> & { scion?: unknown; stock?: unknown } | null | undefined): Graft | null {
  if (!e || e.t !== 'graft' || typeof e.acc !== 'string' || !e.acc) return null;
  const scion = linkId(e.scion, e.acc), stock = linkId(e.stock, e.acc);
  if (!scion && !stock) return null;
  return { id: e.id, plant: e.acc, scion, stock, d: isDay(e.d) ? e.d : null };
}

/** How a plant was taken from its mother, as the record says it: one of `MOTHER_HOW`, a newer version's word as it is (at most 40 characters), or null. */
export function howOf(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  return (MOTHER_HOW as readonly string[]).includes(v) ? v : v.trim().slice(0, 40);
}

export type Role = 'seed' | 'pollen' | 'mother' | 'scion' | 'stock';
/** One parent of a plant: which part it played, its record id, and how and when, where the log says. */
export interface Parent {
  role: Role;
  id: string;
  /** For a mother: offset, cutting… (the batch's method, or `motherHow`). */
  how?: string | null;
  d?: string | null;
  /** Where the link is kept: the plant's own record, a graft line on it, its batch, or the cross its batch was sown from. */
  via: { kind: 'plant' } | { kind: 'graft'; id: string } | { kind: 'batch'; id: string } | { kind: 'cross'; id: string; batch: string };
}

/** What the readers need of the collection; `$lib/db/collection.svelte` is one. */
export interface LineageSource {
  /** A batch by its record id. */
  sowing(id: string): Sowing | undefined;
  /** A line by its record id, live. */
  event(id: string): PlantEvent | undefined;
  /** A record's lines, any order. */
  events(id: string): PlantEvent[];
}

const VEG = new Set(['cutting', 'offset', 'leaf', 'division', 'bulbil']);

/** The plant's parents, one step up, in the order seed, pollen, mother, scion, stock. */
export function parentsOf(a: Pick<Accession, 'id'> & { motherAcc?: unknown; motherHow?: unknown; sowingId?: unknown }, src: LineageSource): Parent[] {
  const out: Parent[] = [];
  const mother = linkId(a.motherAcc, a.id);
  if (mother) out.push({ role: 'mother', id: mother, how: howOf(a.motherHow), d: null, via: { kind: 'plant' } });
  // The latest graft line that names a part: a plant regrafted keeps its first line in the log, and the newest is what it is.
  let graft: Graft | null = null;
  for (const e of src.events(a.id)) { const g = graftOf(e); if (g && (!graft || (g.d ?? '') > (graft.d ?? '') || ((g.d ?? '') === (graft.d ?? '') && g.id > graft.id))) graft = g; }
  if (graft) {
    if (graft.scion) out.push({ role: 'scion', id: graft.scion, d: graft.d, via: { kind: 'graft', id: graft.id } });
    if (graft.stock) out.push({ role: 'stock', id: graft.stock, d: graft.d, via: { kind: 'graft', id: graft.id } });
  }
  const sid = linkId(a.sowingId);
  const s = sid ? src.sowing(sid) : undefined;
  if (s) {
    const cid = linkId(s.cross);
    const c = cid ? crossOf(src.event(cid)) : null;
    if (c) {
      if (c.seed !== a.id) out.push({ role: 'seed', id: c.seed, d: c.d, via: { kind: 'cross', id: c.id, batch: s.id } });
      if (c.pollen !== a.id) out.push({ role: 'pollen', id: c.pollen, d: c.d, via: { kind: 'cross', id: c.id, batch: s.id } });
    }
    const p = linkId(s.parentAcc, a.id), stock = linkId(s.stockAcc, a.id);
    const d = isDay(s.sown) ? s.sown : null;
    if (s.method === 'graft' && !graft) {
      if (p) out.push({ role: 'scion', id: p, d, via: { kind: 'batch', id: s.id } });
      if (stock) out.push({ role: 'stock', id: stock, d, via: { kind: 'batch', id: s.id } });
    } else if (p && VEG.has(String(s.method)) && !mother) out.push({ role: 'mother', id: p, how: String(s.method), d, via: { kind: 'batch', id: s.id } });
  }
  const order: Role[] = ['seed', 'pollen', 'mother', 'scion', 'stock'];
  return out.sort((x, y) => order.indexOf(x.role) - order.indexOf(y.role));
}

/** One child of a plant: the child's record id, and the part this plant played in it. */
export interface Child { id: string; role: Role; how?: string | null; d?: string | null; via: Parent['via'] }

/**
 * The plant's children, one step down: every plant that names it as a parent, by `parentsOf`, so the two directions
 * never disagree. `plants` is every plant record to look among (removed ones may be left out by the caller).
 */
export function childrenOf(id: string, plants: Iterable<Pick<Accession, 'id'> & { motherAcc?: unknown; motherHow?: unknown; sowingId?: unknown }>, src: LineageSource): Child[] {
  const out: Child[] = [];
  for (const a of plants) {
    if (a.id === id) continue;
    for (const p of parentsOf(a, src)) if (p.id === id) out.push({ id: a.id, role: p.role, how: p.how ?? null, d: p.d ?? null, via: p.via });
  }
  return out;
}

/** The crosses a plant took part in, as seed parent or pollen parent, newest first. `lines` is every live line to look among (a pollinate line is on its seed parent; the pollen parent's lines do not hold it). */
export function crossesOf(id: string, lines: Iterable<PlantEvent>): Array<Cross & { as: 'seed' | 'pollen' }> {
  const out: Array<Cross & { as: 'seed' | 'pollen' }> = [];
  for (const e of lines) {
    const c = crossOf(e);
    if (!c) continue;
    if (c.seed === id) out.push({ ...c, as: 'seed' });
    else if (c.pollen === id) out.push({ ...c, as: 'pollen' });
  }
  return out.sort((a, b) => (b.d ?? '').localeCompare(a.d ?? '') || b.id.localeCompare(a.id));
}

/** The words for a part, as the plant's page heads a parent: "Seed parent", "Pollen parent", "Mother", "Scion from", "Stock". */
export const ROLE_WORDS: Record<Role, string> = { seed: 'Seed parent', pollen: 'Pollen parent', mother: 'Taken from', scion: 'Scion from', stock: 'Stock' };
/** A child's part, said from the parent's side: "seedling of a cross, as seed parent". */
export function childWords(c: Child): string {
  if (c.role === 'seed') return 'from a cross, as seed parent';
  if (c.role === 'pollen') return 'from a cross, as pollen parent';
  if (c.role === 'scion') return 'grafted, its scion from this plant';
  if (c.role === 'stock') return 'grafted onto this plant as stock';
  return c.how ? `${HOW_WORDS[c.how] ?? c.how} of this plant` : 'taken from this plant';
}
/** How a plant was taken, as a noun phrase ("an offset"); a word this version does not know is shown as it is. */
export const HOW_WORDS: Record<string, string> = MOTHER_HOW_LABEL;
