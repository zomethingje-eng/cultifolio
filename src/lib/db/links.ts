/**
 * The address of a plant's or a batch's page. By its number, the address people read and type, while that number is
 * the record's alone; by the record's identity while another live record shares the number, since a number two devices
 * gave out offline names both until the grower renumbers one, and a link by number opened whichever the device loaded
 * first, on each device a different one, and a write there went to the wrong plant (round sixty; the self-review's 2,
 * the outside reviews' A13 and B1). A QR code always carries the identity.
 */
import { collection } from './collection.svelte';
import { accNo, sowNo, type Accession, type Sowing } from './types';

export const plantHref = (a: Accession): string => `/plants/${collection.sharesNumber('accession', a.id).length ? a.id : accNo(a)}`;
export const batchHref = (s: Sowing): string => `/propagation/${collection.sharesNumber('sowing', s.id).length ? s.id : sowNo(s)}`;
