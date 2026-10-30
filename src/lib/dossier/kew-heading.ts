/**
 * Kew's accepted name heads every `k` page (round eighty-four, the owner's decision 1; review-d D3, A6c).
 *
 * A page whose id is `k<plant_name_id>` is Kew's entry of that number: its heading is Kew's accepted name for the entry,
 * with Kew's authors, and its address the slug of that name. GBIF's name for the page's key, where it is other words,
 * becomes an older name of the page (`name.synonyms`), so its old address moves to the page as every older name's does,
 * and the search finds it. Before, the heading was GBIF's name for the key, and on 501 of the 48,343 `k` pages of the
 * live index (29 October 2026) that was not Kew's: 467 under another genus (the stapeliads under Ceropegia, Manfreda
 * under Agave, Avonia under Anacampseros), the rest a spelling Kew corrects ("Cyphostemma congoensis", "Weingartia
 * fidaiana"), a rank word left out ("Conophytum calculus vanzylii"), or a name Kew files under another plant (k3313620,
 * Kew's Ceropegia dodomaensis, headed "Ceropegia tanzaniensis (Peckover)").
 *
 * The derivation still reads GBIF's name for the key (`gbifView`): the records, the range's source and the photographs'
 * names are GBIF's, read by the key, and their words stay as they were. The heading is applied where a page's id is
 * known: at the end of a build (`buildDossier`), by `--fill kew-names`, which reads Kew's entry, and by the rekey, which
 * gives each page its id (`rekey.ts`). A page that loses its `k` id (a merge, an entry two pages hold) is given GBIF's
 * name back. Pure; the same answer every time, so a second run changes nothing.
 *
 * A heading is never malformed (the decision's last sentence): an author whose bracketed basionym author has no
 * combining author after it ("(Peckover)") is not shown (`wholeAuthor`), and a name below species carries its rank word
 * ("Conophytum calculus subsp. vanzylii", `withRankWord`), on every page, `g` pages too.
 */
import { slugify, canonicalSynonym } from '../core/names';

/**
 * Kew's accepted row for a page's entry, as `--fill kew-names` stores it in `name.kew.accepted`: Kew's name with its sign,
 * its authors and its rank as Kew writes them; and `other`, the plant Kew's file holds GBIF's name for the key under,
 * where that is another plant.
 */
export interface KewAccepted { name: string; authors: string; rank: string; other?: string }
/** GBIF's name for the page's key, kept while Kew's heads the page (`name.gbif`), so the derivation and an un-heading read it back. `added`: its older name was put in `synonyms` by the heading. */
export interface GbifName { scientific: string; authorship?: string; rank?: string; genus?: string; slug?: string; added?: string }

/** The part of a dossier the heading reads and writes. */
export interface Headed {
  key?: unknown;
  slug?: string;
  name: {
    scientific: string;
    authorship?: string | null;
    rank?: string | null;
    genus?: string | null;
    synonyms?: string[];
    kew?: { entry?: string; accepted?: KewAccepted } | null;
    gbif?: GbifName | null;
  };
}

/** The rank words a name below species is written with, by GBIF's rank and by Kew's. */
const RANK_WORD: Record<string, string> = { SUBSPECIES: 'subsp.', VARIETY: 'var.', FORM: 'f.', SUBVARIETY: 'subvar.', SUBFORM: 'subf.', Subspecies: 'subsp.', Variety: 'var.', Form: 'f.', Subvariety: 'subvar.', Subform: 'subf.' };
const RANK_TOKEN = /^(?:subsp|ssp|var|subvar|f|fo|forma|subf|nothosubsp|nothovar|sect|subsect|ser|subg)\.?$/;

/**
 * A name below species with its rank word: GBIF's canonical name leaves it out ("Conophytum calculus vanzylii" for the
 * subspecies), which reads as a species of three words. The word goes before the last epithet where the name has three
 * words and none of them is a rank word already; any other name as it is.
 */
export function withRankWord(name: string, rank: string | null | undefined): string {
  const word = rank ? RANK_WORD[rank] ?? RANK_WORD[rank.toUpperCase()] : undefined;
  const w = name.trim().split(/\s+/);
  if (!word || w.length !== 3 || w.some((x) => RANK_TOKEN.test(x.toLowerCase()))) return name;
  return `${w[0]} ${w[1]} ${word} ${w[2]}`;
}

/**
 * Whether an author citation is whole: its brackets close, it is not a bracketed basionym author alone (a combination's
 * author is the one after the bracket: "(Peckover)" says who named the basionym and not who made the combination), and it
 * does not end on a joining word or mark ("&", ",", "ex", "in"). An empty citation is whole: an autonym ("Huernia barbata
 * subsp. barbata") has none, and a name with no author in its record shows none.
 */
export function wholeAuthor(a: string | null | undefined): boolean {
  const s = (a ?? '').trim();
  if (!s) return true;
  let depth = 0;
  for (const c of s) {
    if (c === '(') depth++;
    else if (c === ')' && --depth < 0) return false;
  }
  if (depth !== 0) return false;
  if (/^\([^()]*\)$/.test(s)) return false;
  return !/(?:[,&]|\bex|\bin)$/.test(s);
}

/** An author as a heading shows it: trimmed, or none where it is not whole. */
export const shownAuthor = (a: string | null | undefined): string | undefined => (wholeAuthor(a) && (a ?? '').trim() ? (a as string).trim() : undefined);

/** Kew's name as a page's name is stored: without the hybrid sign (`$core/hybrids` shows it), spaces closed up. */
const unsignedName = (n: string) => n.replace(/×\s*/g, '').replace(/\s+/g, ' ').trim();
const wordsOf = (n: string) => unsignedName(n).toLowerCase();

/** GBIF's name as an older name of the page: its canonical words with the rank word, and its author where whole. */
export function gbifOlderName(g: GbifName): string {
  const a = shownAuthor(g.authorship);
  return `${withRankWord(g.scientific, g.rank)}${a ? ` ${a}` : ''}`;
}

/** Sets a field in place, keeping its place among the others (a new one goes last), or takes it out for `undefined`: a round trip of the heading leaves the bytes as they were. */
function put(o: Record<string, unknown>, k: string, v: unknown): void {
  if (v === undefined) delete o[k];
  else o[k] = v;
}

/**
 * The name block as GBIF gives it for the page's key, the heading taken off: what the derivation reads (`buildDossier`'s
 * carried taxon), and what `--fill kew-names` reads Kew's entry by. A page not headed by Kew is returned as it is.
 */
export function gbifView<N extends Headed['name']>(name: N): N {
  if (!name.gbif) return name;
  const out = { ...name } as Record<string, unknown>;
  unheadName(out as Headed['name']);
  return out as N;
}

function unheadName(n: Headed['name']): GbifName | null {
  const g = n.gbif;
  if (!g) return null;
  const o = n as unknown as Record<string, unknown>;
  put(o, 'scientific', g.scientific);
  put(o, 'authorship', g.authorship);
  put(o, 'rank', g.rank);
  put(o, 'genus', g.genus);
  if (g.added && Array.isArray(n.synonyms)) n.synonyms = n.synonyms.filter((s) => s !== g.added);
  delete o.gbif;
  return g;
}

/** Takes Kew's heading off a dossier, in place: GBIF's name, author, rank, genus and slug back, and the older name the heading added out. True when it changed. */
export function unhead(d: Headed): boolean {
  const g = unheadName(d.name);
  if (!g) return false;
  if (g.slug !== undefined) d.slug = g.slug;
  return true;
}

/**
 * Heads a dossier by the rule, in place, given the page's id: Kew's accepted name and authors when the id is `k<entry>`
 * of its `name.kew` and Kew's row is stored (`name.kew.accepted`), GBIF's otherwise. True when it changed. Every page's
 * name, `g` pages too, carries its rank word and no broken author.
 */
export function headWithKew(d: Headed, id: string): boolean {
  const before = JSON.stringify([d.slug, d.name]);
  unhead(d);
  const k = d.name.kew;
  const acc = k?.accepted;
  const kewHeads = !!acc && !!k?.entry && id === `k${k.entry}` && !!unsignedName(acc.name);
  const gbif: GbifName = { scientific: d.name.scientific, ...(d.name.authorship != null ? { authorship: d.name.authorship } : {}), ...(d.name.rank != null ? { rank: d.name.rank } : {}), ...(d.name.genus != null ? { genus: d.name.genus } : {}), ...(d.slug !== undefined ? { slug: d.slug } : {}) };
  let scientific = withRankWord(gbif.scientific, gbif.rank);
  let authorship = shownAuthor(gbif.authorship);
  let rank = gbif.rank ?? undefined;
  let added: string | undefined;
  if (kewHeads) {
    scientific = unsignedName(acc!.name);
    authorship = shownAuthor(acc!.authors);
    rank = acc!.rank ? acc!.rank.toUpperCase() : rank;
    // GBIF's name for the key, where it is other words, an older name of the page, unless the record holds it already, or
    // Kew's file holds it under another plant (`other`), whose name it is.
    if (wordsOf(withRankWord(gbif.scientific, gbif.rank)) !== wordsOf(scientific) && !acc!.other) {
      const older = gbifOlderName(gbif);
      const plain = canonicalSynonym(older) ?? withRankWord(gbif.scientific, gbif.rank);
      if (!(d.name.synonyms ?? []).some((s) => s === older || canonicalSynonym(s) === plain)) added = older;
    }
  }
  const changed = scientific !== gbif.scientific || (authorship ?? '') !== (gbif.authorship ?? '') || (rank ?? '') !== (gbif.rank ?? '') || !!added;
  if (changed) {
    const o = d.name as unknown as Record<string, unknown>;
    put(o, 'scientific', scientific);
    put(o, 'authorship', authorship);
    put(o, 'rank', rank);
    if (scientific.split(' ')[0] !== gbif.scientific.split(' ')[0] || gbif.genus !== undefined) put(o, 'genus', scientific.split(' ')[0]);
    if (added) d.name.synonyms = [...(d.name.synonyms ?? []), added];
    d.name.gbif = { ...gbif, ...(added ? { added } : {}) };
    d.slug = slugify(scientific);
  }
  return JSON.stringify([d.slug, d.name]) !== before;
}

/** Kew's accepted row as `name.kew.accepted` stores it. */
export const kewAcceptedOf = (r: { name: string; authors: string; rank: string }): KewAccepted => ({ name: r.name, authors: (r.authors ?? '').trim(), rank: r.rank });
