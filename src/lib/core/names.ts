/**
 * Names, slugs and the small amount of parsing the app does on what people type.
 * Taxonomy itself is never decided here; that is the backbone's job.
 */

export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
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
    .replace(/\bcv\.?\s/gi, "'")
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
}

export function parseName(raw: string): ParsedName {
  let s = tidyName(raw);
  let cultivar: string | undefined;
  let aside: string | undefined;
  s = s.replace(/[‘'"]([^'’"]+)[’'"]/g, (_, c) => {
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
    else rightName = [genus, ...right.map((w) => w.toLowerCase())].join(' '); // "trigonus"
    const parentage = rightName ? `${leftName} × ${rightName}` : undefined;
    return { scientific: genus, cultivar, aside, genus, epithet: undefined, kind: 'hybrid', parentage };
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
  for (const tok of scientific.split(' ')) {
    const roman = /^(subsp\.|var\.|f\.|×|x|cv\.)$/.test(tok) || /^'/.test(tok);
    const last = out[out.length - 1];
    if (last && last.italic === !roman) last.text += ' ' + tok;
    else out.push({ text: (out.length ? ' ' : '') + tok, italic: !roman });
  }
  return out;
}
