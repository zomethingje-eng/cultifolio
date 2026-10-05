/**
 * The sample collection a visitor can walk through (round sixty; the product review's 3, the self-review's experience
 * item 5). It is written only into the sample's own database (`$lib/db/demo`: chosen at page load, deleted whole on
 * leaving), only when that database is empty and has not been seeded before (a meta flag in it), and only through the
 * collection's ordinary functions, so what the visitor sees is what a grower's own records would show. The species are
 * the reference's where it has them (with their keys) and common ones typed as a grower would; there are no field
 * numbers and no named sellers, since none would be true.
 */
import { collection } from '$lib/db/collection.svelte';
import { getMeta, setMeta } from '$lib/db/vault';
import { inDemo } from '$lib/db/demo';
import { localDate } from '$core/dates';
import { speciesOf, speciesSlug } from '$core/names';
import type { Accession, EventType, PlantEvent } from '$lib/db/types';

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

/**
 * Fill the sample's database once. Refuses outside the sample (this must never write to a grower's own collection), and
 * on a sample that already holds plants or was seeded before (a visitor who removed every plant keeps an empty sample).
 */
export async function seedDemo(): Promise<boolean> {
  if (!inDemo()) return false;
  await collection.load();
  if (!inDemo() || (await getMeta<boolean>(SEEDED)) || collection.accessions.length) return false;
  await setMeta(SEEDED, true); // first, so a second tab opening the sample does not seed it twice
  const gh = await collection.addLocation({ name: 'Greenhouse', type: 'greenhouse', indoor: false, floorC: 5, floorHeld: true, waterDays: 10, dryMonths: [12, 1, 2] });
  const b1 = await collection.addLocation({ name: 'Bench 1', type: 'bench', parentId: gh.id, sort: 1, notes: 'The cacti, in full sun.' });
  const b2 = await collection.addLocation({ name: 'Bench 2', type: 'bench', parentId: gh.id, waterDays: 14, sort: 2, notes: 'The winter-growers and the mesembs.' });
  const win = await collection.addLocation({ name: 'Kitchen windowsill', type: 'windowsill', indoor: true, waterDays: 7, dryMonths: [] });
  const where: Record<Spot, string> = { b1: b1.id, b2: b2.id, win: win.id };
  const made: Accession[] = [];
  for (const [name, key, cultivar, spot, days, price, , own] of SAMPLE) {
    const slug = speciesSlug(name);
    if (!collection.taxon(slug)) await collection.put('taxon', slug, { name: speciesOf(name), gbifKey: key });
    const [a] = await collection.addAccessions(1, { taxonName: name, taxonKey: key, cultivar, nameKind: cultivar ? 'cultivar' : 'species', provenance: 'unknown', acquired: ago(days), sourceFrom: days > 600 ? 'a club plant sale' : days < 200 ? 'a nursery' : null, sourceForm: 'plant', price, locationId: where[spot], waterDays: own ?? null });
    made.push(a);
  }
  const ev: Array<Omit<PlantEvent, 'id'>> = [];
  const line = (i: number, t: EventType, d: number, extra: Partial<PlantEvent> = {}) => ev.push({ acc: made[i].id, d: ago(d), t, ...extra });
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
  await collection.addEvents(ev);
  await collection.put('accession', made[3].id, { notes: 'Bought as a seedling; the eight ribs are clear now.' });
  // A seed batch with its counts, two of its seedlings potted up.
  const batch = await collection.addSowing({ taxonName: 'Astrophytum asterias', method: 'seed', sown: ago(60), count: 40, locationId: win.id, medium: 'fine grit over sieved loam', covered: true, sourceFrom: 'own pollination' });
  await collection.addEvents([{ acc: batch.id, d: ago(46), t: 'germinate', n: 17 }, { acc: batch.id, d: ago(35), t: 'germinate', n: 23 }]);
  await collection.potUp(batch.id, POTTED, { date: ago(7), locationId: b1.id, note: 'the two largest' });
  // One species followed and not grown yet, so the Wanted list has a line.
  await collection.follow('aloe-polyphylla', 'Aloe polyphylla', null, true);
  await collection.put('taxon', 'aloe-polyphylla', { name: 'Aloe polyphylla', myNotes: 'Wanted: a seed-grown plant · price seen 18 at the spring sale' });
  return true;
}
