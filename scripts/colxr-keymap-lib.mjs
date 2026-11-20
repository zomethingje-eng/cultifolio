// Round one hundred (docs/PLAN-100.md, 1): the key map from GBIF's Backbone Taxonomy to the Catalogue of Life eXtended
// Release (COL XR), the pure parts: which keys we hold and why, what each GBIF answer says, one row a key. Read-only; the
// script that asks GBIF is scripts/dev/r100-colxr-keymap.ts.

export const BACKBONE = 'd7dddbf4-2cf0-4f39-9b2a-bb099caae36c';
export const COLXR = '7ddf754f-d193-4cc9-b351-99906754a03b';

/** The files whose keys the map reads, and the column of each role (0-based; a cell may hold a comma list or "-"). */
export const KEY_FILES = [
  { file: 'scripts/species-list.txt', cols: [[5, 'page']] },
  { file: 'scripts/extra-keys.txt', cols: [[0, 'extra:holder'], [1, 'extra'], [8, 'extra:except']] },
  { file: 'scripts/extra-keys-kew.txt', cols: [[1, 'extra-kew'], [8, 'extra-kew:except']] },
  { file: 'scripts/extra-keys-infra.txt', cols: [[1, 'extra-infra'], [8, 'extra-infra:except'], [9, 'extra-infra:holder'], [10, 'extra-infra:except']] },
  { file: 'scripts/merged-pages.txt', cols: [[0, 'merge'], [1, 'merge'], [3, 'merge:except'], [4, 'merge:except']] }
];

/**
 * Every GBIF key the files hold, with the roles it has: a whole number in a cell (a page id such as k2781125 is not a
 * key; "except:" is read off). Comment lines and empty cells are passed by.
 * @param {Array<{ file: string, cols: Array<[number, string]> }>} specs
 * @param {(file: string) => string} read
 * @returns {Map<string, Set<string>>}
 */
export function gatherKeys(specs, read) {
  const keys = new Map();
  for (const { file, cols } of specs) {
    for (const line of read(file).split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue;
      const c = line.split('\t');
      for (const [i, role] of cols) {
        for (const v of String(c[i] ?? '').replace(/^except:/, '').split(',')) {
          if (!/^[1-9]\d*$/.test(v)) continue;
          if (!keys.has(v)) keys.set(v, new Set());
          keys.get(v).add(role);
        }
      }
    }
  }
  return keys;
}

/**
 * What one answer of GBIF's version 2 match says, as recorded: COL XR's id, name, status and rank, the accepted taxon's id
 * and name where the match is a synonym, the match type, and GBIF's note when it matched nothing. Never a name filled in.
 * @param {any} j the answer's JSON
 */
export function matchOf(j) {
  const u = j?.usage, a = j?.acceptedUsage, d = j?.diagnostics ?? {};
  return {
    id: u?.key ?? '',
    name: u?.name ?? '',
    status: u?.status ?? '',
    rank: u?.rank ?? '',
    acceptedId: a?.key ?? '',
    acceptedName: a?.name ?? '',
    type: d.matchType ?? (u ? '' : 'NONE'),
    note: u ? '' : (d.note ?? '')
  };
}

/** The match by identifier: the backbone's key as `gbif:<key>`, under COL XR. */
export const byIdUrl = (key) => `https://api.gbif.org/v2/species/match?scientificNameID=gbif:${key}&checklistKey=${COLXR}`;
/** The match by the backbone's own name with its author, a plant, under COL XR (keeps a synonym's own COL XR name). */
export const byNameUrl = (label) => `https://api.gbif.org/v2/species/match?scientificName=${encodeURIComponent(label)}&kingdom=Plantae&checklistKey=${COLXR}`;

export const COLUMNS = ['key', 'roles', 'backbone_name', 'backbone_status', 'backbone_rank',
  'byid_type', 'byid_col', 'byid_name', 'byid_status', 'byid_accepted', 'byid_note',
  'byname_type', 'byname_col', 'byname_name', 'byname_status', 'byname_accepted', 'byname_note', 'asked'];

const cell = (s) => String(s ?? '').replace(/[\t\r\n]+/g, ' ');
const acc = (m) => (m.acceptedId ? `${m.acceptedId} ${m.acceptedName}` : '');

/**
 * One row of the map. `usage` is the backbone's own row for the key (its export of 2023-08-28), or undefined when the
 * export holds no plant usage of it, said as "not in the backbone's export" and the name route not asked (`byName` null).
 */
export function rowOf(key, roles, usage, byId, byName, asked) {
  const n = byName ?? { type: 'not asked', id: '', name: '', status: '', acceptedId: '', acceptedName: '', note: 'no backbone name to ask by' };
  return [key, [...roles].sort().join(','),
    usage ? usage.label : 'not in the backbone export', usage?.status ?? '', usage?.rank ?? '',
    byId.type, byId.id, byId.name, byId.status, acc(byId), byId.note,
    n.type, n.id, n.name, n.status, acc(n), n.note, asked].map(cell).join('\t');
}

/** The keys a map file already holds (a run carries on where it stopped). */
export function keysDone(text) {
  const done = new Set();
  for (const line of text.split(/\r?\n/)) if (line && !line.startsWith('#')) done.add(line.split('\t')[0]);
  return done;
}
