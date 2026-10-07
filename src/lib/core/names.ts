/**
 * Names, slugs and the small amount of parsing the app does on what people type.
 * Taxonomy itself is never decided here; that is the backbone's job.
 */

/** A nothospecies keeps its cross in the slug ("echeveria-x-imbricata"), so it never shares one with the plain species. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/×/g, ' x ')
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "Copiapoa  cinerea ssp alboviridis f. longispina" → tidy spacing and rank abbreviations. */
export function tidyName(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b(ssp|subsp)\.?\s/gi, 'subsp. ')
    .replace(/\b(var|v)\.?\s/gi, 'var. ')
    .replace(/\b(f|fa|forma)\.?\s/gi, 'f. ')
    // "cv. Blue Curls" → 'Blue Curls': the rest of the line is the cultivar name, closed as well as opened.
    .replace(/\bcv\.?\s+(.+)$/i, (_, c: string) => (/^['‘"]/.test(c) ? c : `'${c.trim()}'`))
    // "xGraptoveria" / "XGraptoveria": a nothogenus written without its space.
    .replace(/^[xX](?=[A-Z][a-z])/, '× ')
    .replace(/^([a-z])/, (m) => m.toUpperCase());
}

export type NameKind = 'species' | 'cultivar' | 'hybrid';

export interface ParsedName {
  /** The part a backbone can match: Genus species [rank epithet], or a bare Genus for a hybrid or a cultivar of unstated parentage. */
  scientific: string;
  /** Anything in quotes: a cultivar or nursery name that must not be sent to a backbone. */
  cultivar?: string;
  /** Text in parentheses: usually a synonym the user knows. */
  aside?: string;
  genus: string;
  epithet?: string;
  /**
   * species: a wild taxon, with or without rank below species.
   * cultivar: a selected form of a known species (Haworthia truncata 'Lime Green').
   * hybrid: a cross, named or not; `scientific` is the genus (or nothogenus) and `parentage` holds what is known of the parents.
   */
  kind: NameKind;
  /** For a hybrid: the cross as written, with abbreviated genera expanded ("Ariocarpus retusus × Ariocarpus trigonus"). */
  parentage?: string;
  /** "cf.", "aff.", "sp." or "spp." when the name carries one (it stays in `scientific`); the reference is asked about the species part only. */
  qualifier?: string;
}

/** The qualifiers of an open name, as the word after the genus: "cf.", "aff.", "sp.", "spp.", with or without the full stop. */
const QUALIFIER = /^(cf|aff|sp|spp)\.?$/i;

export function parseName(raw: string): ParsedName {
  let s = tidyName(raw);
  let cultivar: string | undefined;
  let aside: string | undefined;
  // The cultivar is everything between the first quote and the last: "Haworthia 'Bev's Wonder'" keeps its apostrophe.
  s = s.replace(/[‘'"](.+)[’'"]/, (_, c) => {
    cultivar = c.trim();
    return '';
  });
  s = s.replace(/\(([^)]+)\)/g, (_, a) => {
    aside = a.trim();
    return '';
  });
  // A cross: "×" or a lone "x" between names. A leading × marks a nothogenus (× Graptoveria).
  s = s.replace(/\s+x\s+/gi, ' × ').replace(/^(?:×\s*|[xX]\s+)(?=[A-Z])/, '× ').replace(/\s+/g, ' ').trim();
  const nothogenus = s.startsWith('× ');
  if (nothogenus) s = s.slice(2);
  const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '');
  const parts = s.split(' ').filter(Boolean);
  const genus = cap(parts[0] ?? '');
  const epithetOk = (w: string | undefined) => !!w && /^[a-z-]+$/i.test(w) && w !== '×';
  if (parts.includes('×')) {
    // "Genus a × b", "Genus a × G. b", "Genus a × Genus b", "Genus × epithet" (a named nothospecies).
    const i = parts.indexOf('×');
    const left = parts.slice(0, i);
    const right = parts.slice(i + 1);
    if (left.length === 1 && epithetOk(right[0]) && right.length === 1) {
      // Genus × epithet: a nothospecies with a name of its own; the backbone may know it.
      const epithet = right[0].toLowerCase();
      return { scientific: `${genus} × ${epithet}`, cultivar, aside, genus, epithet, kind: 'hybrid', parentage: undefined };
    }
    const leftName = [genus, ...left.slice(1).map((w) => w.toLowerCase())].join(' ');
    let rightName: string;
    if (right.length === 0) rightName = '';
    else if (/^[A-Z]\.?$/.test(right[0]) && right[1]) rightName = [genus, ...right.slice(1).map((w) => w.toLowerCase())].join(' '); // "A. trigonus"
    else if (/^[A-Z]/.test(right[0]) && right[1]) rightName = [cap(right[0]), ...right.slice(1).map((w) => w.toLowerCase())].join(' '); // "Ariocarpus trigonus"
    else if (/^[A-Z]/.test(right[0])) rightName = cap(right[0]); // "Aloe vera × Gasteria": a bare genus on the right stays a genus
    else rightName = [genus, ...right.map((w) => w.toLowerCase())].join(' '); // "trigonus"
    const parentage = rightName ? `${leftName} × ${rightName}` : undefined;
    return { scientific: genus, cultivar, aside, genus, epithet: undefined, kind: 'hybrid', parentage };
  }
  // A qualifier the grower wrote is a statement of doubt, and stays in the name (round sixty-one; the grower review, 5):
  // "Mammillaria cf. bombycina" is not a Mammillaria bombycina, and "Lithops sp. C 036" is no species at all. "cf." and
  // "aff." keep the epithet they compare with (so the reference is asked about that species, and the plant's species
  // page is its); "sp." and "spp." have none. Written the one way, with its full stop, so a second parse changes nothing.
  const q = QUALIFIER.exec(parts[1] ?? '')?.[1]?.toLowerCase();
  if (q) {
    const word = `${q === 'spp' ? 'spp' : q}.`;
    const compared = q === 'cf' || q === 'aff' ? (epithetOk(parts[2]) ? parts[2].toLowerCase() : undefined) : undefined;
    const tail = parts.slice(compared ? 3 : 2).map((w) => (/^nov\.?$/i.test(w) ? 'nov.' : w)).join(' ');
    const sci = [genus, word, compared, tail].filter(Boolean).join(' ');
    return { scientific: sci, cultivar, aside, genus, epithet: compared, kind: nothogenus ? 'hybrid' : cultivar ? (compared ? 'cultivar' : 'hybrid') : 'species', qualifier: word };
  }
  const epithet = epithetOk(parts[1]) ? parts[1].toLowerCase() : undefined;
  const rest = parts.slice(2).join(' ');
  const scientific = [genus, epithet, rest].filter(Boolean).join(' ');
  const kind: NameKind = nothogenus ? 'hybrid' : epithet ? (cultivar ? 'cultivar' : 'species') : cultivar ? 'hybrid' : 'species';
  return { scientific, cultivar, aside, genus, epithet, kind };
}

/** "Ariocarpus retusus × Ariocarpus trigonus" → the two parent names, for linking. */
export function parents(parentage: string | null | undefined): string[] {
  if (!parentage) return [];
  return parentage.split('×').map((x) => x.trim()).filter(Boolean);
}

/** Italicise the Latin and leave rank abbreviations and cultivar names roman. */
export function nameParts(scientific: string): Array<{ text: string; italic: boolean }> {
  const out: Array<{ text: string; italic: boolean }> = [];
  let open = false; // after "sp." the rest is a grower's or a collector's designation, not Latin ("Lithops sp. C 036")
  for (const tok of scientific.split(' ')) {
    const roman = open || /^(subsp\.|var\.|f\.|×|x|cv\.|cf\.|aff\.|sp\.|spp\.|nov\.)$/.test(tok) || /^'/.test(tok);
    if (/^spp?\.$/.test(tok)) open = true;
    const last = out[out.length - 1];
    if (last && last.italic === !roman) last.text += ' ' + tok;
    else out.push({ text: (out.length ? ' ' : '') + tok, italic: !roman });
  }
  return out;
}

/** The genus of a scientific name: its first word, past a hybrid sign. A leading ASCII "x" counts as the sign only when it stands alone: Xanthosoma keeps its X. */
export function genusOf(name: string): string {
  return name.trim().replace(/^(?:×\s*|x\s+)/i, '').split(/\s+/)[0] ?? name;
}

/** The species a name belongs to: genus and epithet, with anything below species (subsp., var., a third word) and any cultivar left off. "Ariocarpus retusus subsp. furfuraceus" → "Ariocarpus retusus". */
export function speciesOf(name: string): string {
  const p = parseName(name);
  return p.epithet ? `${p.genus} ${p.epithet}` : p.genus;
}

/** The slug of the species a plant's name belongs to: what its species page, its taxon record, its thumbnail and its care line are joined on. A subspecies or a variety is one of its species' plants. */
export const speciesSlug = (name: string): string => slugify(speciesOf(name));

const RANK_WORDS = new Set(['sect', 'subsect', 'subg', 'subgen', 'ser', 'subser', 'sp', 'spp', 'aff', 'cf', 'nothosubsp', 'nothovar', 'var', 'subsp', 'ssp', 'f', 'fo', 'hybrid', 'auct']);

/**
 * A synonym as the backbone lists it, cut to its binomial (or trinomial) without authorship: "Haworthia attenuata (Haw.)
 * Haw." is "Haworthia attenuata". Null for anything that is not a name (the backbone lists a few malformed entries such
 * as "? glabra Salm-Dyck") (round thirty-one, 3).
 */
export function canonicalSynonym(s: string): string | null {
  const t = s.trim();
  const m = /^([A-Z][a-z]+(?:-[a-z]+)?) ([a-z][a-z-]+)(?: (?:var\.|subsp\.|ssp\.|f\.) ([a-z][a-z-]+))?/.exec(t);
  if (!m) return null;
  // Not a name of a species: a section or subgenus ("Opuntia sect. Tuna"), an undetermined one ("Echinopsis sp."), a rank
  // word where the epithet would be, or a misapplied name (auct.), which is a use of the name and not a name (round thirty-three, 13).
  if (t[m[0].length] === '.' || RANK_WORDS.has(m[2]) || /\bauct\b/.test(t)) return null;
  return m[3] ? `${m[1]} ${m[2]} ${/subsp\.|ssp\./.test(s) ? 'subsp.' : /var\./.test(s) ? 'var.' : 'f.'} ${m[3]}` : `${m[1]} ${m[2]}`;
}
