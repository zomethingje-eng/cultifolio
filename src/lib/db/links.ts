/**
 * The address of a plant's or a batch's page. By its number, the address people read and type, while that number is
 * the record's alone; by the record's identity while another live record shares the number, since a number two devices
 * gave out offline names both until the grower renumbers one, and a link by number opened whichever the device loaded
 * first, on each device a different one, and a write there went to the wrong plant (round sixty; the self-review's 2,
 * the outside reviews' A13 and B1). By the identity too while a renumbering moved another plant off the number: the
 * page of a number with such a past shows both plants to choose from, as a label printed before the renumbering is
 * scanned to it, and a link inside the app knows which it means (round eighty-seven, the stage 3 fixes; review B1).
 */
import { collection } from './collection.svelte';
import { accNo, sowNo, type Accession, type Sowing } from './types';

// An item's number holds a "/" (2026-0012/A; round eighty-seven, t1), which an address must carry as %2F to stay one segment.
export const plantHref = (a: Accession): string => `/plants/${collection.sharesNumber('accession', a.id).length || collection.renumberedAway(accNo(a)).some((o) => o.id !== a.id) ? a.id : encodeURIComponent(accNo(a))}`;
export const batchHref = (s: Sowing): string => `/propagation/${collection.sharesNumber('sowing', s.id).length ? s.id : sowNo(s)}`;
