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
    pages.push({ id: `k${c[0]}`, name: c[1], key: /^[1-9]\d*$/.test(c[5] ?? '') ? c[5] : '' });
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
