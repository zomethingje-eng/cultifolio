/**
 * The ways into a collection (round 119; MYPLANTS 27 a): the empty My plants page shows the first three as large rows,
 * and the top bar's "+" on a phone opens all four. One list, so the two cannot disagree.
 */
export interface Way {
  href: string;
  title: string;
  /** One line under the title. */
  sub: string;
  /** The sign drawn beside it: plus, camera, list or seed. */
  sign: 'plus' | 'camera' | 'list' | 'seed';
}

export const WAYS: readonly Way[] = [
  { href: '/plants/new', title: 'Add a plant', sub: 'Type its name. Half a minute.', sign: 'plus' },
  { href: '/plants/walk', title: 'Photo walk', sub: 'A shelf at a time: photograph, name, next.', sign: 'camera' },
  { href: '/plants/import', title: 'Import a list', sub: 'Paste names, or a spreadsheet saved as CSV.', sign: 'list' },
  { href: '/propagation/new', title: 'Sow seed', sub: 'A batch of seed, cuttings or a graft, counted as it grows.', sign: 'seed' }
];

/** The empty page's three: the fourth, a batch, is for a grower who has begun. */
export const FIRST_WAYS = WAYS.slice(0, 3);
