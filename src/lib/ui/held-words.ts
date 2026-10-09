/**
 * The sentence for changes held because they are dated ahead of this device's clock (decision 2 of round sixty): the
 * plants list, Today and a restore's report say it in the same words.
 */
export function heldWords(n: number): string {
  if (n <= 0) return '';
  return n === 1
    ? '1 change from a device whose clock runs ahead is waiting. It appears when this device\'s date reaches it.'
    : `${n.toLocaleString('en-US')} changes from a device whose clock runs ahead are waiting. They appear when this device's date reaches them.`;
}

/**
 * A field of a record in words, for the lists of parked changes (round sixty-one; the grower review's 9: the sync page
 * listed "photo pmwh0iune… (acc, sowing, d, dFrom, caption, w, h, bytes, sha)"). A field this build does not name is
 * said as it is stored; a notes edit's base is part of the notes, not a field of its own.
 */
const FIELD_WORDS: Record<string, Record<string, string>> = {
  accession: { acc: 'number', taxonName: 'name', taxonKey: 'name', nameAsReceived: 'name as received', cultivar: 'cultivar', nameKind: 'name', parentage: 'parentage', fieldNumber: 'field number', provenance: 'origin', status: 'status', locationId: 'place', acquired: 'date acquired', sourceFrom: 'where it came from', sourceRef: 'source reference', sourceForm: 'what it came as', price: 'price', notes: 'notes', notesBase: 'notes', sowingId: 'batch', cover: 'cover photograph', waterDays: 'watering rhythm' },
  sowing: { no: 'number', taxonName: 'name', taxonKey: 'name', cultivar: 'cultivar', nameKind: 'name', parentage: 'parentage', method: 'method', parentAcc: 'parent plant', sown: 'date sown', sourceFrom: 'where it came from', sourceRef: 'source reference', fieldNumber: 'field number', provenance: 'origin', medium: 'medium', container: 'container', treatment: 'treatment', locationId: 'place', status: 'status', notes: 'notes', notesBase: 'notes', count: 'count', bottomHeatC: 'bottom heat', covered: 'cover' },
  location: { name: 'name', parentId: 'where it sits', type: 'kind of place', notes: 'notes', indoor: 'indoors or out', floorC: 'cold floor', floorHeld: 'cold floor', ppfd: 'light', lightHours: 'hours of light', lat: 'position', lon: 'position', altM: 'altitude', sort: 'order', waterDays: 'watering rhythm', dryMonths: 'dry months' },
  event: { acc: 'plant', d: 'date', t: 'kind of entry', note: 'note', cause: 'cause', used: 'what was used', followUp: 'follow-up', n: 'count', measures: 'measurements', auto: 'entry', plants: 'plants' },
  photo: { acc: 'plant', sowing: 'batch', d: 'date', dFrom: 'date', caption: 'caption', w: 'the picture', h: 'the picture', bytes: 'the picture', sha: 'the picture' },
  taxon: { name: 'name', myNotes: 'your notes', myNotesBase: 'your notes', gbifKey: 'name', followed: 'following' },
  setting: { scheme: 'numbering' }
};
export function fieldWords(kind: string, changes: Array<{ field: string; value: unknown }>): string[] {
  const out: string[] = [];
  for (const c of changes) {
    const w = c.field === '_deleted' ? (c.value ? 'removal' : 'restore') : (FIELD_WORDS[kind]?.[c.field] ?? c.field);
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

/**
 * What a restore that changed the number says, on the plant's page and the batch's alike (round sixty-two; A22): when
 * the order in which the two records reached this device is not known (both from before it kept that order, or both
 * copied in by a replace from a backup), it says so, and that the one that stayed keeps the number.
 */
export function restoredWords(m: { from: string; to: string; unknown?: boolean }, what: 'plant' | 'batch'): string {
  return m.unknown
    ? `Restored as ${m.to}: another ${what} has ${m.from}, and which reached this device first is not known, so the ${what} that stayed keeps it.`
    : `Restored as ${m.to}: ${m.from} is another ${what}'s now.`;
}
