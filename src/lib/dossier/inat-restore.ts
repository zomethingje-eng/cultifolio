/**
 * `--fill inat-restore <backup>` (round eighty, agent I): the iNaturalist ids round eighty's build dropped. The full plan's
 * build left iNaturalist to the fill (`--skip inat`) and kept only the id each page's Wikidata item gave, so 475 pages
 * whose id the build before had found by name, by an older name, or kept from an earlier build, lost it, with their
 * iNaturalist photographs' state; the fill asks such a page's taxon by its accepted name alone, and does not find one it
 * had found by an older name. (The build now keeps such an id: `keptInatId`.)
 *
 * Offline, from the corpus as it was before the build (the plan's own backup, `backups/v3-<corpus>`): for each page on disk
 * with no iNaturalist id whose page in the backup (by its id, else by its GBIF key) had one, the id is given back, and its
 * taxon row says so and that it is not yet checked, so the fill checks it with iNaturalist before any photograph (a page
 * with a GBIF key by `fillInatIds`'s rule, one without by its own and Kew's names), and asks both sets. Never:
 *   - where the fill has since found the page a taxon (it has an id), or refused this one by its rule;
 *   - where another page on disk holds that id (two pages would show one taxon's photographs);
 * each such page is listed with why. Nothing is asked of anyone, and a rerun restores nothing twice.
 */
import type { DossierStore } from './corpus-run';

type Row = { status: string; at?: string; detail?: string };
type P = { key: string; ids: { gbif?: number; inat?: number }; links: Record<string, string | undefined>; name: { scientific: string }; upstream: Record<string, Row>; built?: string };

export const RESTORED = 'given back from the corpus before the build that skipped iNaturalist';

export interface RestoreCounts { restored: number; found: number; heldElsewhere: number; refused: number; lines: string[] }

export function restoreInatIds(store: DossierStore, backup: DossierStore, label: string, now = () => new Date().toISOString()): RestoreCounts {
  const c: RestoreCounts = { restored: 0, found: 0, heldElsewhere: 0, refused: 0, lines: [] };
  const was = new Map<string, { inat: number; built?: string }>();
  const byGbif = new Map<number, { inat: number; built?: string }>();
  for (const file of backup.files()) {
    let b: P;
    try { b = backup.read<P>(file); } catch { continue; }
    if (!b.ids?.inat) continue;
    const e = { inat: b.ids.inat, built: b.built };
    if (b.key) was.set(b.key, e);
    if (b.ids.gbif != null) byGbif.set(b.ids.gbif, e);
  }
  const files = store.files();
  const holders = new Map<number, string>();
  for (const file of files) { const d = store.read<P>(file); if (d.ids?.inat) holders.set(d.ids.inat, d.key); }
  for (const file of files) {
    const d = store.read<P>(file);
    if (d.ids?.inat) continue;
    const b = was.get(d.key) ?? (d.ids?.gbif != null ? byGbif.get(d.ids.gbif) : undefined);
    if (!b) continue;
    c.found++;
    const row = d.upstream?.['inat.taxon'];
    // The fill's rule refused this very taxon: it stays refused.
    if (row && row.status !== 'skipped' && new RegExp(`\\b${b.inat}\\b`).test(row.detail ?? '')) { c.refused++; c.lines.push(`${d.name.scientific} [${d.key}]: ${b.inat} not given back: ${row.detail}`); continue; }
    const other = holders.get(b.inat);
    if (other && other !== d.key) { c.heldElsewhere++; c.lines.push(`${d.name.scientific} [${d.key}]: ${b.inat} not given back: page ${other} holds it`); continue; }
    const t = now();
    const day = t.slice(0, 10);
    d.ids.inat = b.inat;
    d.links.inat = `https://www.inaturalist.org/taxa/${b.inat}`;
    d.upstream['inat.taxon'] = { status: 'skipped', at: t, detail: `iNaturalist's taxon ${b.inat}, ${RESTORED} (${label}${b.built ? `, built ${b.built.slice(0, 10)}` : ''}) on ${day}; not yet checked: the next --fill inat checks it with iNaturalist before its photographs${row?.detail ? `; before: ${row.detail}` : ''}` };
    for (const k of ['inat.photos.wild', 'inat.photos.cultivated']) d.upstream[k] = { status: 'skipped', at: t, detail: `not asked: the iNaturalist taxon was given back (${day}); the next --fill inat asks it` };
    holders.set(b.inat, d.key);
    store.write(file, d);
    c.restored++;
    c.lines.push(`${d.name.scientific} [${d.key}]: ${b.inat} given back`);
  }
  return c;
}
