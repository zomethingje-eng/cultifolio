// Round one hundred (docs/PLAN-100.md, 2): the dry-run count's pure parts. From the key map (scripts/dev/r100-colxr-keymap.ts)
// and the files that hold our keys, what a move to the Catalogue of Life eXtended Release (COL XR) would do to each page and
// each other key, counted by rule; nothing is written but the count. The COL XR taxon a key's records would be filed under is
// the match by identifier (byid: GBIF's own map from the backbone's key, always COL XR's accepted taxon), never the name route.

/** The key map's rows by key: { roles, backbone, byid: COL XR id or '' (none), byidName, byidType, note }. */
export function readMap(text) {
  const rows = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const c = line.split('\t');
    rows.set(c[0], { roles: c[1], backbone: c[2], byidType: c[5], byid: c[6], byidName: c[7], note: c[10] });
  }
  return rows;
}

/** A name as words to compare: no author, no hybrid sign, lower case, the first `n` words (genus and epithet). */
export function nameWords(name, n = 2) {
  return String(name).replace(/×/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().split(' ').filter((w) => /^[\p{L}-]+$/u.test(w) && w !== 'x').slice(0, n).join(' ');
}

/** The species list's pages: { id: 'k<plant_name_id>', name: Kew's name, key: GBIF's key or '' }. */
export function readPages(text) {
  const pages = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const c = line.split('\t');
    const key = /^[1-9]\d*$/.test(c[5] ?? '') ? c[5] : '';
    // A page of GBIF's alone (no Kew row, "-") is g<key>, as the site names it; every other is k<plant_name_id>.
    pages.push({ id: /^\d+$/.test(c[0]) ? `k${c[0]}` : `g${key}`, name: c[1], key });
  }
  return pages;
}

/**
 * The other keys and the page each belongs to: extra-keys.txt names its page by the page's GBIF key, the Kew and infra files
 * by its id (k<plant_name_id>). `except` is a key the page leaves out of what it reads.
 * @returns {Array<{ key: string, page: string, kind: 'extra'|'except', file: string }>}
 */
export function readOtherKeys(files, pages) {
  const byKey = new Map(pages.filter((p) => p.key).map((p) => [p.key, p.id]));
  const out = [];
  const keysIn = (cell) => String(cell ?? '').replace(/^except:/, '').split(',').filter((v) => /^[1-9]\d*$/.test(v));
  for (const { file, text } of files) {
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue;
      const c = line.split('\t');
      const page = file === 'extra-keys.txt' ? byKey.get(c[0]) : c[0];
      if (!page) continue;
      for (const k of keysIn(c[1])) out.push({ key: k, page, kind: 'extra', file });
      for (const k of keysIn(c[8])) out.push({ key: k, page, kind: 'except', file });
      if (file === 'extra-keys-infra.txt') for (const k of keysIn(c[10])) out.push({ key: k, page, kind: 'except', file });
    }
  }
  return out;
}

/**
 * The count. Each page with a GBIF key: its COL XR taxon by identifier, or none; whether that taxon's name is the page's
 * (Kew's) name; whether another page reaches the same taxon. Each other key: onto nothing, onto its own page's taxon
 * (redundant), onto another page's (a conflict), or onto a taxon no page reaches (kept as a key of its own). An except key
 * onto its own page's taxon is a key now left out whose records the taxon would bring in.
 */
export function count(map, pages, others) {
  const page = new Map(pages.map((p) => [p.id, p]));
  const colOf = (k) => map.get(k)?.byid ?? '';
  const pagesAt = new Map(); // COL XR id -> page ids
  const res = { pages: pages.length, noKey: 0, notInMap: [], none: [], same: 0, otherName: [], oneToOne: 0, shared: [], others: {} };
  for (const p of pages) {
    if (!p.key) { res.noKey++; continue; }
    if (!map.has(p.key)) { res.notInMap.push(p.id); continue; }
    const col = colOf(p.key);
    if (!col) { res.none.push({ page: p.id, name: p.name, key: p.key, note: map.get(p.key).note }); continue; }
    (pagesAt.get(col) ?? pagesAt.set(col, []).get(col)).push(p.id);
    if (nameWords(map.get(p.key).byidName) === nameWords(p.name)) res.same++;
    else res.otherName.push({ page: p.id, name: p.name, key: p.key, col, colName: map.get(p.key).byidName });
  }
  for (const [col, ids] of pagesAt) {
    if (ids.length === 1) res.oneToOne++;
    else res.shared.push({ col, name: map.get(page.get(ids[0]).key).byidName, pages: ids.map((id) => `${id} ${page.get(id).name} (${page.get(id).key})`) });
  }
  const colOfPage = (id) => { const p = page.get(id); return p?.key ? colOf(p.key) : ''; };
  for (const o of others) {
    const t = (res.others[`${o.file} ${o.kind}`] ??= { n: 0, notInMap: 0, none: 0, ownPage: 0, otherPage: 0, ownTaxon: 0, conflicts: [] });
    t.n++;
    if (!map.has(o.key)) { t.notInMap++; continue; }
    const col = colOf(o.key);
    if (!col) { t.none++; continue; }
    const own = colOfPage(o.page);
    if (own && col === own) { t.ownPage++; continue; }
    const at = (pagesAt.get(col) ?? []).filter((id) => id !== o.page);
    if (at.length) { t.otherPage++; t.conflicts.push(`${o.key} of ${o.page} ${page.get(o.page)?.name ?? ''} -> ${col} ${map.get(o.key).byidName}, the taxon of ${at.map((id) => `${id} ${page.get(id).name}`).join(', ')}`); continue; }
    t.ownTaxon++;
  }
  return res;
}

/**
 * The records file (scripts/dev/r100-colxr-records.ts) read against a fifth: each page whose records under COL XR fall or rise
 * by more than a fifth of its backbone count, with both counts; a page with no COL XR taxon is counted apart, not as a fall.
 * A page with no records under the backbone and some under COL XR is a rise.
 */
export function recordsMoved(text, share = 0.2) {
  const res = { pages: 0, noTaxon: 0, same: 0, within: 0, fell: [], rose: [], before: 0, after: 0 };
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const [page, name, key, b, col, c] = line.split('\t');
    res.pages++;
    if (col === '-') { res.noTaxon++; continue; }
    const nb = Number(b), nc = Number(c);
    res.before += nb; res.after += nc;
    if (nb === nc) { res.same++; continue; }
    const row = { page, name, key, col, backbone: nb, col_records: nc };
    if (nc < nb * (1 - share)) res.fell.push(row);
    else if (nc > nb * (1 + share)) res.rose.push(row);
    else res.within++;
  }
  return res;
}

/** The key map's rows with every column, by key (for the reading: both routes). */
export function readMapFull(text) {
  const rows = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const c = line.split('\t');
    rows.set(c[0], { byidType: c[5], byid: c[6], byidName: c[7], bynameType: c[11], byname: c[12], bynameName: c[13], bynameStatus: c[14], bynameAccepted: c[15] });
  }
  return rows;
}

/**
 * The COL XR taxon the name route reaches: the matched taxon where COL XR accepts it, its accepted taxon where it is a
 * synonym, and nothing where the match is of a higher rank (a genus says nothing of the species) or there is none.
 */
export function nameTaxon(r) {
  if (!r || !['EXACT', 'VARIANT'].includes(r.bynameType)) return '';
  if (/ACCEPTED$/.test(r.bynameStatus)) return r.byname; // ACCEPTED, PROVISIONALLY_ACCEPTED
  if (/SYNONYM$/.test(r.bynameStatus)) return r.bynameAccepted.split(' ')[0] ?? '';
  return '';
}

/** Whether the two routes agree for a key: 'agree', 'differ', or 'name says nothing'. */
export function routes(r) {
  const n = nameTaxon(r);
  if (!n) return 'name says nothing';
  return n === r.byid ? 'agree' : 'differ';
}

/**
 * Where Kew's file places a name (its genus and epithet, compared by `key`): 'this plant' where every row of species rank
 * of those words is the page's plant or a synonym of it, 'another plant' where none is, 'both', or 'not in Kew'.
 * @param {Map<string, string[]>} kew genus|key -> the accepted plant ids of the rows (a row's own id where it is accepted)
 */
export function kewPlaces(kew, words, plant, key) {
  const [g, e] = words.split(' ');
  if (!g || !e) return 'not in Kew';
  const ids = kew.get(`${g}|${key(e)}`);
  if (!ids?.length) return 'not in Kew';
  const mine = ids.filter((i) => i === plant).length;
  return mine === ids.length ? 'this plant' : mine === 0 ? 'another plant' : 'both';
}

/** A name's author: the words after the genus and epithet (and an infraspecific rank and name), as written; compared by
 * `sameAuthors`, which reads the author's names out of it. */
export function authorOf(name) {
  const w = String(name).replace(/×/g, ' ').trim().split(/\s+/).filter((x) => x && x !== 'x');
  let i = 2;
  if (/^(subsp|var|f|subvar|nothosubsp|nothovar)\.$/.test(w[i] ?? '')) i += 2;
  return w.slice(i).join(' ');
}

/**
 * The reading's verdict for a page whose COL XR taxon has another name, or that shares one: Kew's file places COL XR's
 * name (this plant, another, both, not held), and whether GBIF's match was of the backbone name's own author.
 */
export function verdict(kewSays, sameAuthor, otherFamily = false) {
  if (kewSays === 'another plant' && otherFamily) return 'COL XR\'s taxon is of another family than the page\'s plant (Kew\'s families): an error, of COL XR or of GBIF\'s match';
  if (kewSays === 'this plant') return "the same plant under another name (Kew holds the name as this plant's)";
  if (kewSays === 'another plant' && !sameAuthor) return 'GBIF matched a homonym (the name by another author): the map is wrong';
  if (kewSays === 'another plant') return 'COL XR files this name under a plant Kew keeps apart: a lump, or an error in COL XR; read by hand';
  if (kewSays === 'both') return 'Kew holds the name for this plant and another: read by hand';
  return "COL XR's name is not in Kew's file: read by hand";
}

/** An author string's names: words of letters, initials left out unless nothing else is left ("L."), lower case. */
export function authorNames(author) {
  const all = String(author).normalize('NFC').toLowerCase().split(/[^\p{L}]+/u).filter((w) => w && !['ex', 'et', 'in', 'emend', 'nom', 'illeg', 'nud', 'auct', 'non'].includes(w));
  const long = all.filter((w) => w.length >= 2);
  return long.length ? long : all;
}
/**
 * Two names of one author: they share an author's name, one an abbreviation of the other ("Fisch." and "Fischer", "Rchb."
 * and "Rchb. ex Spreng.", "W.Bull" and "Bull."). "L." and "Bourg. ex Lange" do not: a homonym.
 */
export function sameAuthors(a, b) {
  const x = authorNames(a), y = authorNames(b);
  if (!x.length || !y.length) return true; // no author to tell by: not said to differ
  // An abbreviation is three letters or more ("Fisch."); a shorter name ("L.", "DC.") must be the same name.
  const one = (p, q) => p === q || (Math.min(p.length, q.length) >= 3 && (p.startsWith(q) || q.startsWith(p)));
  return x.some((p) => y.some((q) => one(p, q)));
}
