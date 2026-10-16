/**
 * Which names below species Kew places under another species (round seventy-two, C1). iNaturalist's `taxon_id` takes in
 * every descendant taxon, and it files under a species taxa that Kew accepts apart: "Eriosyce crispa huascensis" is
 * Kew's Eriosyce eriosyzoides, "Copiapoa megarhiza echinata" Kew's Copiapoa fiedleriana, "Epithelantha greggii
 * polycephala" Kew's Epithelantha polycephala. The audit of the live corpus found about 170 such photographs on at least
 * eleven pages, six of them leading. Read from Kew's own file (`wcvp_names.csv`, `--bulk`), not the index's six older
 * names, which held two of the twelve cases.
 *
 * Pure: the script streams Kew's rows into `add`, and the build and `--fill inat` ask `placedElsewhere` for each
 * observation's own taxon.
 */
import { spellingKey } from './epithet';

/** One row of Kew's names file, as far as this reads it. */
export type KewInfraRow = { id: string; name: string; status: string; acceptedId: string; ipni?: string };
/** The page a taxon is read for: its names, Kew's entry for it when the Kew fill has read one, and its IPNI number. */
export type KewOwn = { scientific: string; synonyms?: readonly string[] | null; kewSynonyms?: readonly string[] | null; acceptedElsewhere?: readonly string[] | null; kewEntry?: string | null; ipni?: string | null };

const RANK = /^(?:subsp|ssp|var|f|fo|forma|subvar|nothosubsp|nothovar)\.?$/i;
/** "genus epithet" as compared: genus lower case, epithet by `spellingKey`; null for anything that is no binomial. */
const binKey = (name: string): string | null => {
  const w = name.replace(/×\s*/g, '').trim().split(/\s+/);
  return w.length >= 2 && /^[A-Za-z-]+$/.test(w[0]) && /^[a-z-]+$/.test(w[1]) ? `${w[0].toLowerCase()} ${spellingKey(w[1])}` : null;
};
/** A name below species as genus, epithet and its last epithet, whatever its rank word ("var.", "subsp.", or none, as iNaturalist writes it). */
const infraKey = (name: string): string | null => {
  const w = name.replace(/×\s*/g, '').trim().split(/\s+/).filter((x) => !RANK.test(x));
  if (w.length < 3 || !/^[a-z-]+$/.test(w[w.length - 1])) return null;
  const b = binKey(`${w[0]} ${w[1]}`);
  const last = w[w.length - 1];
  return b && spellingKey(last) !== spellingKey(w[1]) ? `${b} ${spellingKey(last)}` : null;
};

export class KewInfra {
  private accepted = new Map<string, string>(); // accepted plant_name_id → its name
  private infra = new Map<string, string[]>(); // infraKey → the accepted ids its rows point at
  private byIpni = new Map<string, string>(); // IPNI id → accepted plant_name_id
  private byBin = new Map<string, Set<string>>(); // binKey → the infraKeys under it
  private acceptedSpecies = new Map<string, Set<string>>(); // binKey of a species Kew accepts → its plant_name_ids
  add(r: KewInfraRow): void {
    if (/^accepted$/i.test(r.status)) {
      this.accepted.set(r.id, r.name);
      const b = binKey(r.name);
      if (b && !infraKey(r.name)) (this.acceptedSpecies.get(b) ?? this.acceptedSpecies.set(b, new Set()).get(b)!).add(r.id);
    }
    if (r.ipni) this.byIpni.set(r.ipni, r.acceptedId || r.id);
    if (/misapplied/i.test(r.status)) return;
    const k = infraKey(r.name);
    if (!k) return;
    const ids = this.infra.get(k) ?? this.infra.set(k, []).get(k)!;
    const to = r.acceptedId || r.id;
    if (!ids.includes(to)) ids.push(to);
    const b = k.split(' ').slice(0, 2).join(' ');
    (this.byBin.get(b) ?? this.byBin.set(b, new Set()).get(b)!).add(k);
  }
  /**
   * Whether Kew places any name below one of the page's own species names under another species: the pages whose
   * iNaturalist taxon may take in another species' observations, and so the only ones `--fill inat` asks iNaturalist about.
   */
  hasElsewhereUnder(own: KewOwn): boolean {
    return this.elsewhereUnder(own).length > 0;
  }
  /**
   * Whether round seventy-three's reading (Kew's accepted species over GBIF's older names of the same words, `mine`)
   * finds a name below species placed elsewhere that the reading before it did not: the pages `--fill inat` read before
   * under the older reading and must ask again (55 of the live corpus's pages, Crassula exilis among them).
   */
  widened(own: KewOwn): boolean {
    const before = new Set(this.elsewhereUnder(own, true));
    return this.elsewhereUnder(own).some((k) => !before.has(k));
  }
  private elsewhereUnder(own: KewOwn, gbifOlderAsOwn = false): string[] {
    const mine = this.mine(own, gbifOlderAsOwn);
    const out: string[] = [];
    for (const b of mine) for (const k of this.byBin.get(b) ?? []) if (this.elsewhere(k, mine)) out.push(k);
    return out;
  }
  get size(): number {
    return this.infra.size;
  }
  /**
   * The species Kew places this taxon under, when that is not the page's own; null when Kew holds no such name below
   * species, when any of its rows is under the page's own species (one name, two readings: not taken against it), or
   * when the taxon is the species itself or its autonym. The page's own species are its accepted name, its older names,
   * Kew's synonyms of its entry, and the entry itself (by the Kew fill's entry, else by the page's IPNI number).
   */
  placedElsewhere(taxonName: string | null | undefined, own: KewOwn): string | null {
    const k = infraKey(taxonName ?? '');
    return k ? this.elsewhere(k, this.mine(own)) : null;
  }
  /**
   * The page's own species, as `binKey`s: its accepted name, its older names and Kew's synonyms of its entry, of species
   * rank only (an older name below species, "Eriosyce eriosyzoides var. totoralensis" among Eriosyce crispa's, does not
   * make its first two words the page's), less the older names Kew accepts as species of their own (GBIF lists "Crassula
   * cooperi Schönl." among Crassula exilis's names; Kew accepts Crassula cooperi), and Kew's entry itself (by the Kew
   * fill's entry, else by the page's IPNI number).
   *
   * Round seventy-three: where Kew's entry for the page is known, an older name from GBIF whose two words Kew accepts as
   * another species, by whatever author, is not the page's either. GBIF lists "Crassula cooperi Schönl." among Crassula
   * exilis's names, a later name of the same words as Kew's Crassula cooperi Regel, so the Kew fill does not list it apart
   * (its authors differ); read as Crassula exilis's own, it kept iNaturalist's "Crassula exilis cooperi" (Kew's Crassula
   * cooperi) on Crassula exilis, and all seven photographs of Crassula cooperi's page were shown on neither page (C5).
   */
  private mine(own: KewOwn, gbifOlderAsOwn = false): Set<string> {
    const apart = new Set((own.acceptedElsewhere ?? []).map(binKey).filter((x): x is string => !!x));
    const entry = own.kewEntry || (own.ipni ? this.byIpni.get(own.ipni) : undefined);
    const entryName = entry ? this.accepted.get(entry) : undefined;
    const entryBin = entryName ? binKey(entryName) : null;
    const kewSyn = new Set((own.kewSynonyms ?? []).map(binKey).filter((x): x is string => !!x));
    const anotherSpecies = (b: string) => !gbifOlderAsOwn && !!entryBin && b !== entryBin && !kewSyn.has(b) && [...(this.acceptedSpecies.get(b) ?? [])].some((id) => id !== entry);
    const older = (own.synonyms ?? []).filter((n) => !n.split(/\s+/).slice(2).some((w) => RANK.test(w))).map(binKey).filter((x): x is string => !!x && !anotherSpecies(x));
    const mine = new Set([binKey(own.scientific), ...older, ...kewSyn].filter((x): x is string => !!x && !apart.has(x)));
    if (entryBin) mine.add(entryBin);
    return mine;
  }
  private elsewhere(k: string, mine: ReadonlySet<string>): string | null {
    const ids = this.infra.get(k);
    if (!ids?.length) return null;
    const targets = ids.map((id) => this.accepted.get(id)).filter((x): x is string => !!x);
    if (!targets.length || targets.some((t) => { const b = binKey(t); return !b || mine.has(b); })) return null;
    return [...new Set(targets.map((t) => t.split(/\s+/).filter((w) => w !== '×').slice(0, 2).join(' ')))].join(', ');
  }

}
