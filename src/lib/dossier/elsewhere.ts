/**
 * Elsewhere (round eighty-seven, stage 2; links agent): the other registers and floras that record the plant, from the
 * identifiers the page's own Wikidata item holds (`ids.wikidata`, the item the build proved for the page; CC0), each a
 * link by its Wikidata property's own formatter URL. Rule 3: an identifier is the item's, never a search by name; a page
 * with no item has none, said "not asked".
 *
 *   - `--fill elsewhere` reads the statements of fifty items a request (`itemsClaims`, sources/wikimedia.ts), paced as
 *     every Wikimedia request is (`fetch.ts`: one every 0.35 s, inside Wikimedia's 200 a minute), and keeps, for each page,
 *     the values of `ELSEWHERE_PROPERTIES` and the day read (`elsewhere.wikidata`). A page read for its item is passed by,
 *     so a run that stops resumes; one whose item changed since is read again (`--again` reads every one).
 *   - The page links an identifier of a register it does not already link itself (GBIF, POWO, IPNI, WFO and iNaturalist
 *     are linked under Names and registers from the build's own identifiers, Kew's numbers among them): never a second
 *     link to one register.
 *
 * The registers read and their formatter URLs: `elsewhere-links.ts`.
 */
import type { JsonFetcher } from './fetch';
import type { DossierStore } from './corpus-run';
import type { Elsewhere } from './schema';
import { itemsClaims, CLAIMS_PER_ASK } from './sources/wikimedia';
import { elsewhereIds, ELSEWHERE_PROPERTIES } from './elsewhere-links';
export { ELSEWHERE_PROPERTIES, elsewhereIds, elsewhereLinks, type ElsewhereLink, type ElsewhereProperty } from './elsewhere-links';

export type ElsewherePage = { key: string; name: { scientific: string }; ids: { wikidata?: string }; elsewhere?: Elsewhere };

/** Whether the fill reads a page: it has an item, not read yet for that item, or asked and not answered (or `again`). */
export function elsewhereWanted(d: Pick<ElsewherePage, 'ids' | 'elsewhere'>, again = false): boolean {
  const q = d.ids?.wikidata;
  if (!q || !/^Q\d+$/.test(q)) return false;
  const w = d.elsewhere?.wikidata;
  return again || !w || w.item !== q || !!w.unanswered;
}

export interface ElsewhereCounts { pages: number; read: number; withIds: number; ids: number; missing: number; unanswered: number; noItem: number; before: number; byProperty: Record<string, number>; lines: string[] }

/** Every page the fill wants, read fifty items a request, each page written as its batch is answered. */
export async function fillElsewhere(store: DossierStore, f: JsonFetcher, day: string, opts: { again?: boolean; progress?: (c: ElsewhereCounts) => void } = {}): Promise<ElsewhereCounts> {
  const c: ElsewhereCounts = { pages: 0, read: 0, withIds: 0, ids: 0, missing: 0, unanswered: 0, noItem: 0, before: 0, byProperty: {}, lines: [] };
  const todo: Array<{ file: string; item: string }> = [];
  for (const file of store.files()) {
    let d: ElsewherePage;
    try { d = store.read<ElsewherePage>(file); } catch { continue; }
    c.pages++;
    if (!d.ids?.wikidata || !/^Q\d+$/.test(d.ids.wikidata)) { c.noItem++; continue; }
    if (!elsewhereWanted(d, opts.again)) { c.before++; continue; }
    todo.push({ file, item: d.ids.wikidata });
  }
  for (let i = 0; i < todo.length; i += CLAIMS_PER_ASK) {
    const batch = todo.slice(i, i + CLAIMS_PER_ASK);
    const r = await itemsClaims(f, [...new Set(batch.map((b) => b.item))]);
    for (const { file, item } of batch) {
      const d = store.read<ElsewherePage>(file);
      if (r.status !== 'ok') {
        c.unanswered++;
        // A read of the same item kept: a refusal does not take away what was answered before.
        if (d.elsewhere?.wikidata?.item === item && !d.elsewhere.wikidata.unanswered) continue;
        d.elsewhere = { ...(d.elsewhere ?? {}), wikidata: { item, read: day, ids: [], unanswered: 'detail' in r ? r.detail : r.status } };
      } else if (!r.data.claims.has(item)) {
        // Wikidata no longer serves the item under this id (deleted or merged): asked and not this page's answer; the
        // page's item is read again when a build proves it again (`--fill wikidata`).
        c.missing++;
        c.lines.push(`${d.name.scientific} [${d.key}]: Wikidata no longer serves ${item} under that id (deleted, or merged into another item): no identifiers read; --fill wikidata proves the page's item again`);
        d.elsewhere = { ...(d.elsewhere ?? {}), wikidata: { item, read: day, ids: [], unanswered: `Wikidata no longer serves ${item} under that id` } };
      } else {
        const ids = elsewhereIds(r.data.claims.get(item)!);
        c.read++;
        if (ids.length) c.withIds++;
        c.ids += ids.length;
        for (const x of ids) c.byProperty[x.p] = (c.byProperty[x.p] ?? 0) + 1;
        d.elsewhere = { ...(d.elsewhere ?? {}), wikidata: { item, read: day, ids } };
      }
      store.write(file, d);
    }
    opts.progress?.(c);
  }
  return c;
}

/** The fill's last line (rule 6). */
export function elsewhereLine(c: ElsewhereCounts, day: string): string {
  const by = ELSEWHERE_PROPERTIES.filter((x) => c.byProperty[x.p]).map((x) => `${x.label} ${c.byProperty[x.p]}`).join(', ');
  return `  ${c.read} Wikidata items read on ${day}: ${c.withIds} hold an identifier of another register, ${c.ids} in all${by ? ` (${by})` : ''}; ${c.missing} no longer served under the page's id; ${c.unanswered} not answered${c.unanswered ? ' (run --fill elsewhere again; it reads only what is left)' : ''}; ${c.before} read before and passed by; ${c.noItem} pages with no item, not asked.`;
}
