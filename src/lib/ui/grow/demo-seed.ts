/**
 * The sample collection a visitor can walk through (round sixty; the product review's 3, the self-review's experience
 * item 5). It is written only into the sample's own database (`$lib/db/demo`: chosen at page load, deleted whole on
 * leaving), only when that database is empty and has not been seeded before (a meta flag in it), and as ordinary
 * records, so what the visitor sees is what a grower's own records would show. The species are the reference's where it
 * has them (with their keys) and common ones typed as a grower would; there are no field numbers and no named sellers,
 * since none would be true.
 *
 * Set out in one commit (round sixty-one; the accessibility review, 4): it was some thirty, one plant at a time, and the
 * first screen of the sample re-laid itself twelve times in five seconds as the rows arrived and re-sorted. The records
 * are the ones the collection's own add, pot-up and follow functions write, built here with their numbers and ids.
 */
import { collection } from '$lib/db/collection.svelte';
import { getMeta, setMeta } from '$lib/db/vault';
import { inDemo } from '$lib/db/demo';
import { localDate } from '$core/dates';
import { nextAccession, type NumberingScheme } from '$core/accession';
import { speciesOf, speciesSlug } from '$core/names';
import type { Accession, EventType, Location, PlantEvent, Sowing } from '$lib/db/types';

export const SEEDED = 'demoSeeded';

type Spot = 'b1' | 'b2' | 'win';
/** [name, reference key or null, cultivar, place, acquired days ago, price, last watered days ago (null: none recorded), own rhythm in days] */
type P = [string, number | null, string | null, Spot, number, string | null, number | null, number?];
export const SAMPLE: P[] = [
  ['Copiapoa cinerea', 5384013, null, 'b1', 620, '24', 4],
  ['Copiapoa humilis', 5384999, null, 'b1', 300, '9.50', 4],
  ['Ariocarpus retusus', null, null, 'b1', 700, '15', 4],
  ['Astrophytum asterias', null, null, 'b1', 150, '6', 4],
  ['Welwitschia mirabilis', 5411106, null, 'b2', 380, '30', 9, 10],
  ['Lithops lesliei', null, null, 'b2', 330, '3.50', 16],
  ['Conophytum minutum', null, null, 'b2', 210, 'a swap', 16, 28],
  ['Haworthia truncata', null, 'Lime Green', 'b2', 180, '14', 16],
  ['Echeveria agavoides', null, null, 'win', 120, '3', 3],
  ['Crassula ovata', null, 'Gollum', 'win', 800, null, 9]
];
/** Seedlings potted up from the sample's seed batch: with the ten above, twelve plants. */
export const POTTED = 2;

const ago = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return localDate(d); };

type Rec = { kind: 'location' | 'accession' | 'taxon' | 'sowing'; id: string; fields: Record<string, unknown> };

/**
 * Every record of the sample and every line on its timelines, built before anything is written. Ids are shaped as the
 * collection's own (a letter, the wall time and a counter in base 36, then a device tag), so the day a record was made
 * reads as today, as it would for a grower's. Pure but for the date: tested on its own.
 */
export function sampleRecords(scheme: NumberingScheme, wall: number = Date.now()): { recs: Rec[]; events: Array<Omit<PlantEvent, 'id'>> } {
  let k = 0;
  const id = (p: string) => `${p}${wall.toString(36)}${(k++).toString(36).padStart(2, '0')}sampleseeds0`;
  const recs: Rec[] = [];
  const events: Array<Omit<PlantEvent, 'id'>> = [];
  const place = (l: Omit<Location, 'id'>) => { const r = { ...l, id: id('l') }; recs.push({ kind: 'location', id: r.id, fields: r as unknown as Record<string, unknown> }); return r.id; };
  const gh = place({ name: 'Greenhouse', type: 'greenhouse', indoor: false, floorC: 5, floorHeld: true, waterDays: 10, dryMonths: [12, 1, 2] });
  const b1 = place({ name: 'Bench 1', type: 'bench', parentId: gh, sort: 1, notes: 'The cacti, in full sun.' });
  const b2 = place({ name: 'Bench 2', type: 'bench', parentId: gh, waterDays: 14, sort: 2, notes: 'The winter-growers and the mesembs.' });
  const win = place({ name: 'Kitchen windowsill', type: 'windowsill', indoor: true, waterDays: 7, dryMonths: [] });
  const where: Record<Spot, string> = { b1, b2, win };
  const taxa = new Map<string, Record<string, unknown>>();
  const taken = new Set<string>();
  const number = (d: string) => { const n = nextAccession(taken, scheme, Number(d.slice(0, 4))); taken.add(n); return n; };
  const made: Accession[] = [];
  for (const [name, key, cultivar, spot, days, price, , own] of SAMPLE) {
    const slug = speciesSlug(name);
    if (!taxa.has(slug)) taxa.set(slug, { name: speciesOf(name), gbifKey: key });
    const acquired = ago(days);
    const sourceFrom = days > 600 ? 'a club plant sale' : days < 200 ? 'a nursery' : null;
    const a: Accession = { id: id('r'), acc: number(acquired), taxonName: name, taxonKey: key, cultivar, nameKind: cultivar ? 'cultivar' : 'species', provenance: 'unknown', status: 'growing', acquired, sourceFrom, sourceForm: 'plant', price, locationId: where[spot], waterDays: own ?? null };
    made.push(a);
    events.push({ acc: a.id, d: acquired, t: 'acquire', note: sourceFrom ? `from ${sourceFrom}` : null });
  }
  made[3].notes = 'Bought as a seedling; the eight ribs are clear now.';
  const line = (i: number, t: EventType, d: number, extra: Partial<PlantEvent> = {}) => events.push({ acc: made[i].id, d: ago(d), t, ...extra });
  // Waterings over the last weeks: each plant's last one, and the rhythm's worth before it.
  SAMPLE.forEach(([, , , spot, days, , watered, own], i) => {
    if (watered == null) return;
    const every = own ?? (spot === 'b1' ? 10 : spot === 'b2' ? 14 : 7);
    for (let d = watered; d <= Math.min(days - 1, watered + every * 3); d += every) line(i, 'water', d);
  });
  line(0, 'repot', 40, { note: 'into a 12 cm clay pot', measures: { pot: 120 } });
  line(2, 'flower', 1, { note: 'Pink, three open.' });
  line(7, 'flower', 70);
  line(4, 'measure', 20, { measures: { h: 38, spread: 210 } });
  line(5, 'note', 5, { note: 'Splitting into new leaves: no water until the old pair is papery.' });
  line(9, 'treat', 25, { used: 'systemic drench', note: 'mealybug at the stem' });
  // A seed batch with its counts, two of its seedlings potted up (as `potUp` writes them: seed of unstated provenance).
  const sown = ago(60);
  const batch: Sowing = { id: id('s'), no: nextAccession([], { mode: 'prefix', prefix: `S${sown.slice(0, 4)}`, width: 3 }), status: 'active', taxonName: 'Astrophytum asterias', method: 'seed', sown, count: 40, locationId: win, medium: 'fine grit over sieved loam', covered: true, sourceFrom: 'own pollination' } as Sowing;
  events.push({ acc: batch.id, d: ago(46), t: 'germinate', n: 17 }, { acc: batch.id, d: ago(35), t: 'germinate', n: 23 });
  const potted = ago(7);
  const seedlings: Accession[] = Array.from({ length: POTTED }, () => ({ id: id('r'), acc: number(potted), taxonName: batch.taxonName, taxonKey: null, cultivar: null, nameKind: null, parentage: null, fieldNumber: null, provenance: 'unknown', status: 'growing', acquired: potted, sourceFrom: batch.sourceFrom ?? null, sourceRef: null, sourceForm: 'seedling', locationId: b1, sowingId: batch.id, notes: null }) as Accession);
  for (const a of seedlings) events.push({ acc: a.id, d: potted, t: 'acquire', note: `potted up from ${batch.no}` });
  events.push({ acc: batch.id, d: potted, t: 'potup', n: POTTED, plants: seedlings.map((a) => a.id), note: 'the two largest' });
  // One species followed and not grown yet, so the Wanted list has a line.
  taxa.set('aloe-polyphylla', { name: 'Aloe polyphylla', gbifKey: null, followed: true, myNotes: 'Wanted: a seed-grown plant · price seen 18 at the spring sale' });
  for (const a of [...made, ...seedlings]) recs.push({ kind: 'accession', id: a.id, fields: a as unknown as Record<string, unknown> });
  recs.push({ kind: 'sowing', id: batch.id, fields: batch as unknown as Record<string, unknown> });
  for (const [slug, fields] of taxa) recs.push({ kind: 'taxon', id: slug, fields });
  return { recs, events };
}

/**
 * Fill the sample's database once. Refuses outside the sample (this must never write to a grower's own collection), and
 * on a sample that already holds plants or was seeded before (a visitor who removed every plant keeps an empty sample).
 */
export async function seedDemo(): Promise<boolean> {
  if (!inDemo()) return false;
  await collection.load();
  if (!inDemo() || (await getMeta<boolean>(SEEDED)) || collection.accessions.length) return false;
  await setMeta(SEEDED, true); // first, so a second tab opening the sample does not seed it twice
  const { recs, events } = sampleRecords(collection.scheme);
  const [first, ...rest] = recs;
  await collection.putWith(first.kind, first.id, first.fields, events, rest);
  return true;
}
