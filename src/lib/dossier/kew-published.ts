/**
 * Kew's own words for a page's name (round eighty-seven, stage 2; links agent), read offline from Kew's names file
 * (`wcvp_names.csv`, WCVP, CC BY 4.0, RBG Kew) for the page's Kew entry (its own id `k<plant_name_id>`, else the entry
 * `--fill kew-names` stored for it):
 *
 *   - where the name was published (`place_of_publication`, `volume_and_page`, `first_published`), kept as Kew writes
 *     them (`elsewhere.published`), so the page quotes the citation as Kew gives it and `--fill bhl` asks BHL for exactly it;
 *   - a named hybrid's parents (`hybrid_formula`, "A. glutinosa × A. incana"): each parent's words, the genus written out
 *     only where Kew abbreviates the hybrid's own genus by its initial (Kew's way of writing a formula: an intergeneric
 *     hybrid's parents are written in full, "Astroloba corrugata × Tulista pumila"), then the row of Kew's file whose
 *     `taxon_name` is exactly those words, the entry Kew accepts for that row, and the page here that is that entry.
 *     Rule 3: never a near spelling, never a name without its rank word; words that name no row, or rows of more than one
 *     plant, are listed with why and linked nowhere. Where the words name the one row Kew accepts and other authors' names
 *     (homonyms), the accepted one is the parent, as a formula on an entry Kew accepts names its parents as Kew does, and
 *     the page says how many other names the words carry (`others`).
 *
 * The step streams Kew's file (twice, or three times where a parent's row is a synonym), with `lines` giving its lines
 * each time; it holds only the rows it needs. The walk runs it after deriving the pages (`--walk … --bulk bulk`), and
 * `--fill kew-published --bulk bulk` runs it alone. A second run changes nothing.
 */
import type { DossierStore } from './corpus-run';
import type { Elsewhere, Parents } from './schema';
import type { PageId } from '../core/page-id';
import { wcvpRow } from './bulk';

type Lines = () => AsyncIterable<string>;
export type KewRowLite = { id: string; name: string; genus: string; status: string; accepted: string; place: string; volPage: string; year: string; formula: string };

const lite = (r: Record<string, string>): KewRowLite => ({ id: r.plant_name_id ?? '', name: r.taxon_name ?? '', genus: r.genus ?? '', status: r.taxon_status ?? '', accepted: r.accepted_plant_name_id ?? '', place: r.place_of_publication ?? '', volPage: r.volume_and_page ?? '', year: r.first_published ?? '', formula: r.hybrid_formula ?? '' });

/** Kew's file read once, keeping the rows `keep` takes. */
async function scan(lines: Lines, keep: (id: string, name: string) => boolean): Promise<KewRowLite[]> {
  const out: KewRowLite[] = [];
  let h: string[] | null = null;
  let iId = 0, iName = 0;
  for await (const line of lines()) {
    if (!h) { h = line.replace(/^﻿/, '').split('|'); iId = h.indexOf('plant_name_id'); iName = h.indexOf('taxon_name'); continue; }
    if (!line) continue;
    // The two fields read before the row is split whole: a row not wanted costs one split.
    const c = line.split('|');
    if (!keep(c[iId] ?? '', c[iName] ?? '')) continue;
    out.push(lite(wcvpRow(h, line)));
  }
  return out;
}

/**
 * A formula's parts, as Kew writes them: split at the hybrid sign between parents. Kew's words before the first name
 * ("as stabilized hybrids derived from P. cerasifera × P. spinosa", Prunus domestica and Acorus calamus; "perhaps …";
 * round eighty-seven's review of stage 2, M4) are not a parent's name: they are left off the parts, and the page shows
 * the formula whole, words and all. A formula of words alone is one part, not read as a name (`partName`).
 */
export const formulaParts = (formula: string): string[] => {
  const names = formula.trim().replace(/^(?:[a-z]+\s+)+(?=[A-Z×?])/, '');
  return names.split(/\s+×\s+/).map((x) => x.trim()).filter(Boolean);
};

/**
 * One part's words with the genus written out: "A. glutinosa" (or "A.glutinosa") under the hybrid's genus Alnus is "Alnus glutinosa"; an
 * initial that is not the hybrid's own genus's is not expanded (`why`), since the file does not say which genus it means.
 */
export function partName(part: string, genus: string): { name: string; why?: string } {
  // Kew's words, not a name ("sphegodes subsp. passionis", "perhaps a hybrid of unknown parentage").
  if (/^[a-z]/.test(part)) return { name: part, why: "Kew's words, not a name" };
  // The initial with or without its space: Kew writes "Q.muehlenbergii" beside "Q. bicolor" (M4).
  const m = /^([A-Z])\.\s*([a-z].*)$/.exec(part);
  if (!m) return /\s/.test(part) ? { name: part } : /^×?\s*[A-Z][a-z-]+$/.test(part) ? { name: part, why: 'a genus, not one species' } : { name: part, why: part === '?' ? 'not known to Kew (its file writes “?”)' : 'not a name Kew writes for a plant' };
  const g = genus.replace(/^×\s*/, '').trim();
  return g && g[0] === m[1] ? { name: `${g} ${m[2]}` } : { name: part, why: "written with a genus's initial that is not the hybrid's own genus, so not read as a name" };
}

/** The entry a row of Kew's file is held under: its own id when Kew accepts it, else the entry it names; '' when none (unplaced). */
const entryOfRow = (r: KewRowLite) => (r.status === 'Accepted' ? r.id : r.accepted);

/**
 * A parent's words read against the rows of Kew's file that carry exactly them: one plant (every row held under one
 * entry) is taken, with the row Kew accepts (else the one row); rows under more than one entry, or none, are not.
 */
export function parentOf(name: string, rows: readonly KewRowLite[], pageOfEntry: (entry: string) => PageId | undefined): Parents['of'][number] {
  const same = rows.filter((r) => r.name === name);
  if (!same.length) return { name, why: "Kew's file holds no name of exactly these words" };
  // Names of these words by other authors (homonyms) beside the one Kew accepts: a formula on an entry Kew accepts names
  // its parents as Kew does, so the one row of these words Kew accepts is the parent, and the page says how many others
  // the words name (`others`). Two accepted rows, or none and rows under more than one entry, are not read as one.
  const accepted = same.filter((r) => r.status === 'Accepted');
  if (accepted.length === 1 && same.length > 1) {
    const page = pageOfEntry(accepted[0].id);
    return { name, row: accepted[0].id, entry: accepted[0].id, ...(page ? { page } : {}), others: same.length - 1 };
  }
  const entries = new Set(same.map(entryOfRow).filter(Boolean));
  if (entries.size > 1) return { name, why: `Kew's file holds ${same.length} names of these words, for ${entries.size} plants, ${accepted.length ? 'more than one of them accepted' : 'none of them accepted'}: none taken` };
  const row = accepted[0] ?? (same.length === 1 ? same[0] : undefined);
  if (!entries.size) return { name, ...(row ? { row: row.id } : {}), why: `Kew's file holds it as ${(same[0].status || 'not placed').toLowerCase()}, under no accepted entry` };
  const entry = [...entries][0];
  const page = pageOfEntry(entry);
  return { name, ...(row ? { row: row.id } : {}), entry, ...(page ? { page } : {}) };
}

export type KewPublishedPage = { key: string; name: { scientific: string; kew?: { entry?: string } }; elsewhere?: Elsewhere; parents?: Parents };
export interface KewPublishedCounts { read: number; entries: number; changed: number; published: number; hybrids: number; parents: number; linked: number; unlinked: number; unmatched: number; lines: string[] }

/** The Kew entry a page is read by: its own id, else the entry stored for it (as `entryOfPage` in cultigen-fill.ts). */
export const entryOf = (d: Pick<KewPublishedPage, 'key' | 'name'>): string | undefined => (/^k\d+$/.test(d.key) ? d.key.slice(1) : d.name.kew?.entry || undefined);

/**
 * The citation and the parents for every page `files` names (all, by default), written where they changed. `pageOfEntry`
 * gives the page of a Kew entry across the whole reference, `file` the day of Kew's file.
 */
export async function fillKewPublished(store: DossierStore, lines: Lines, pageOfEntry: (entry: string) => PageId | undefined, file: string | undefined, files: readonly string[] = store.files()): Promise<KewPublishedCounts> {
  const c: KewPublishedCounts = { read: 0, entries: 0, changed: 0, published: 0, hybrids: 0, parents: 0, linked: 0, unlinked: 0, unmatched: 0, lines: [] };
  const want = new Map<string, string[]>();
  for (const f of files) {
    let d: KewPublishedPage;
    try { d = store.read<KewPublishedPage>(f); } catch { continue; }
    c.read++;
    const e = entryOf(d);
    if (e) want.set(e, [...(want.get(e) ?? []), f]);
  }
  c.entries = want.size;
  const rows = new Map((await scan(lines, (id) => want.has(id))).map((r) => [r.id, r]));
  // The parents' words, for the second reading of the file.
  const names = new Set<string>();
  for (const r of rows.values()) if (r.formula) for (const p of formulaParts(r.formula)) { const n = partName(p, r.genus); if (!n.why) names.add(n.name); }
  const named = names.size ? await scan(lines, (_id, name) => names.has(name)) : [];
  for (const [entry, fs] of want) {
    const r = rows.get(entry);
    for (const f of fs) {
      const d = store.read<KewPublishedPage>(f);
      const before = JSON.stringify([d.elsewhere?.published ?? null, d.parents ?? null]);
      // The citation: kept with the BHL answer asked for exactly it, which goes when the citation changes.
      if (r?.place.trim()) {
        const was = d.elsewhere?.published;
        const same = was && was.place === r.place && (was.volPage ?? '') === r.volPage && (was.year ?? '') === r.year;
        d.elsewhere = { ...(d.elsewhere ?? {}), published: { place: r.place, ...(r.volPage ? { volPage: r.volPage } : {}), ...(r.year ? { year: r.year } : {}), row: r.id, ...(file ? { file } : {}), ...(same && was?.bhl ? { bhl: was.bhl } : {}) } };
        c.published++;
      } else if (r && d.elsewhere?.published) {
        const { published: _, ...rest } = d.elsewhere;
        d.elsewhere = rest;
      }
      if (r?.formula.trim()) {
        const of = formulaParts(r.formula).map((p) => { const n = partName(p, r.genus); return n.why ? { name: n.name, why: n.why } : parentOf(n.name, named, pageOfEntry); });
        d.parents = { formula: r.formula, row: r.id, ...(file ? { file } : {}), of };
        c.hybrids++;
        for (const p of of) { c.parents++; if (p.page) c.linked++; else if (p.entry) c.unlinked++; else { c.unmatched++; c.lines.push(`${d.name.scientific} [${d.key}]: parent “${p.name}” of “${r.formula}”: ${p.why}`); } }
      } else if (r && d.parents) delete d.parents;
      if (JSON.stringify([d.elsewhere?.published ?? null, d.parents ?? null]) !== before) { c.changed++; store.write(f, d); }
    }
  }
  return c;
}

/** The step's last line (rule 6). */
export function kewPublishedLine(c: KewPublishedCounts, file: string | undefined): string {
  return `  Kew's file of ${file ?? 'a day not known'}: ${c.read} pages read, ${c.entries} Kew entries; ${c.published} pages say where their name was published; ${c.hybrids} hybrids list ${c.parents} parents as Kew states them: ${c.linked} linked to their pages here, ${c.unlinked} Kew entries with no page here, ${c.unmatched} not matched (said why); ${c.changed} pages written${c.lines.length ? `:\n${c.lines.slice(0, 100).map((l) => `    ${l}`).join('\n')}${c.lines.length > 100 ? `\n    … ${c.lines.length - 100} more` : ''}` : '.'}`;
}
