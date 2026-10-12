/**
 * Whether a Wikimedia Commons file is a photograph of the species (round sixty-nine; triage-68 K1). Commons' category
 * for a species holds distribution maps, herbarium sheets, plates from Curtis's Botanical Magazine, stamps, seeds,
 * unidentified plants, hybrids and files named as another species, and the build took every one as a photograph of it:
 * 40 of the 619 Commons-led species led with one (R46-1, S-B1, IND-1). One test, read from what a dossier already keeps
 * (the file's title and type) and, for a new answer, Commons' categories, which the same request returns. Applied where
 * Commons answers, where a dossier is read (`safeUrls`) and where the index is made, so no rebuild is needed.
 *
 * Depicts statements (P180) are not used as a gate: they catch 16 of the 40 bad leads and are missing from 55% of good files.
 */
import { readCommonsPhoto } from './photo-credit';
import { heroOf } from './dedupe';

/** The species' names a title is read against: its own and its older names, as the dossier keeps them (authors allowed). */
export interface KindNames {
  scientific: string;
  synonyms?: readonly string[] | null;
}

/** JPEG and WebP only: a PNG on Commons is nearly always a map or a drawing, and its 500-pixel tile weighed 600 to 750 kB (R46-9). */
const TYPE = /\.(?:jpe?g|webp)$/i;

/** Each kind of file that is not a photograph of the plant, by the words its title uses. Word-bounded, so "brewbooks" is not a book. */
const TITLE_KINDS: Array<[string, RegExp]> = [
  ['a map', /\bdistribution\b|distribuzione|distribuci[oó]n|verbreitung|\brange (?:of|map)\b|\bmaps?\b|\bkarte\b|\bareal\b/i],
  ['a herbarium sheet', /specimen|herbari|holotyp|isotyp|lectotyp|syntyp|paratyp|neotyp|exsiccat|\(GBIF \d+\)|^COI\d/i],
  ['a plate or drawing', /curtis|botanical (?:magazine|register)|\btab\.\s*\d|\bplate\b|\bpl\.\s*\d|illustrat|drawing|engraving|lithograph|zeichnung|watercolou?r|\bpainting\b|biodiversity heritage library/i],
  ['not the plant', /\bseeds?\b|\bsemillas?\b|\bsamen\b|\bresin\b|\bstamps?\b|\bpostage\b|\bbooks?\b|\blabel\b/i],
  ['an unidentified plant', /\bunknown\b|\bunidentified\b|\bunbekannt|\bindet(?:ermined)?\b|\bsp\.(?:\s|$)|\bspp\.?(?:\s|$)/i],
  ['not determined', /\b(?:aff|cf)\.(?:\s|$)|\b(?:aff|cf)\s+[a-z]/i]
];

/**
 * Categories that say the same, for a new answer (`Categories` in `iiextmetadatafilter`). Named narrowly: Commons files
 * every geotagged photograph under "Pages with maps", so "maps" alone would drop good photographs.
 */
const CATEGORY_KINDS = /media from gbif|herbari|specimens?\b|holotyp|isotyp|distribution maps|range maps|locator maps|maps of the (?:range|distribution)|botanical illustrations|illustrations of|drawings|engravings|lithographs|botanical magazine|curtis|biodiversity heritage library|\bplates\b|postage stamps|stamps of|\bseeds\b|\bresins?\b|\bbooks\b|unidentified|hybrids\b/i;

/** The words after a genus that are not an epithet: "Crassula in flower" names no other species. */
const NOT_EPITHET = new Set(['sp', 'spp', 'ssp', 'subsp', 'var', 'species', 'hybrid', 'hybrids', 'cultivar', 'cv', 'flower', 'flowers', 'flowering', 'plant', 'plants', 'in', 'at', 'on', 'and', 'with', 'from', 'the', 'of', 'near', 'leaf', 'leaves', 'fruit', 'fruits', 'seedling', 'seedlings', 'habit', 'habitat', 'detail', 'close', 'closeup', 'group', 'collection', 'garden', 'bloom', 'blossom', 'inflorescence', 'stem', 'stems', 'trunk', 'bark', 'root', 'roots', 'spines', 'bud', 'buds', 'pot', 'img', 'dsc', 'photo', 'form', 'forma', 'type', 'aff', 'cf', 'x', 'et', 'nov', 'indet', 'spec']);

/** The file's title as words: "File:Nepenthes_tenuis1.jpg" is "Nepenthes tenuis1". */
export const commonsTitle = (id: string): string => id.replace(/^File:/i, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');

/** An epithet's stem, so a gender or spelling ending ("mihanovichii", "mihanovichi") reads as one name. */
const stem = (e: string) => e.toLowerCase().replace(/(?:ii|ae|us|um|is|es|a|e|i|on|os)$/, '');

type Binomial = { genus: string; epithet: string };
/** "Nepenthes dubia Danser" or "Lantana ×strigocamara" as its genus and epithet; null for anything that is not a binomial. */
function binomial(name: string): Binomial | null {
  const m = /^([A-Z][a-z-]+)\s+(?:×\s*|x\s+)?([a-z][a-z-]+)/.exec(name.replace(/×\s*/g, '× ').trim());
  return m ? { genus: m[1], epithet: m[2] } : null;
}

const own = (n: KindNames | null | undefined): Binomial[] => (n ? [n.scientific, ...(n.synonyms ?? [])].map(binomial).filter((b): b is Binomial => !!b) : []);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const genusRe = (g: string) => `[${g[0]}${g[0].toLowerCase()}]${esc(g.slice(1))}`;

/**
 * Whether a title names a species of the genus, or of an older name's genus, that is neither the species nor one of its
 * older names: "Nepenthes tenuis1" under Nepenthes dubia, "Uebelmannia pectinifera Donald" under U. buiningii (S-B1,
 * IND-1, R46-1). A file named under an older name (Brachystelma attenuatum under Ceropegia attenuatula) is the species.
 */
function namesAnother(title: string, names: Binomial[]): boolean {
  const mine = new Set(names.map((b) => `${b.genus.toLowerCase()} ${stem(b.epithet)}`));
  for (const g of new Set(names.map((b) => b.genus))) {
    for (const m of title.matchAll(new RegExp(`(?:^|[^A-Za-z])${genusRe(g)}\\s+(?:×\\s*|x\\s+)?([a-z][a-z-]{2,})`, 'g'))) {
      const e = m[1].replace(/-+$/, '');
      if (NOT_EPITHET.has(e) || mine.has(`${g.toLowerCase()} ${stem(e)}`)) continue;
      if (names.some((b) => b.genus === g && misspelt(e, b.epithet))) continue;
      return true;
    }
  }
  return false;
}

/**
 * An epithet as its uploader misspelt it, read as the species' own (round sixty-nine, the owner's index: 22 files of
 * ten species were left out as "another species", and 12 of them were the species, the other ten rightly left out: Othonna cakilifolia for cakilefolia,
 * Lachenalia arbuthonotiae, purpureo-caerulea, Eriosyce andreana, Schwantesia nuedebuschii). Hyphens are not read and
 * "ae" is read as "e"; then the two may be one letter apart, for an epithet of seven letters or more. Two letters apart
 * is another species often enough (Conophytum minimum and minutum), so it stays another.
 */
function misspelt(a: string, b: string): boolean {
  const norm = (e: string) => e.toLowerCase().replace(/-/g, '').replace(/ae/g, 'e');
  const [x, y] = [norm(a), norm(b)];
  if (x === y) return true;
  if (Math.min(x.length, y.length) < 7 || Math.abs(x.length - y.length) > 1) return false;
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  // One letter changed, added or left out: what follows it is the same.
  return x.slice(i + 1) === y.slice(i + 1) || x.slice(i) === y.slice(i + 1) || x.slice(i + 1) === y.slice(i);
}

/** A hybrid's sign, or " x " between two names, left once the species' own name is set aside (so Lantana ×strigocamara's files stay). */
function isHybrid(title: string, names: Binomial[]): boolean {
  let t = title;
  for (const b of names) t = t.replace(new RegExp(`${genusRe(b.genus)}\\s*(?:×\\s*|x\\s+)?${esc(b.epithet)}`, 'g'), 'own');
  return /×/.test(t) || /[a-z]{3,}\.?\s+x\s+[a-z]{3,}/i.test(t);
}

/**
 * Why a Commons file is not a photograph of the species, or null when it is. `id` is the stored title ("File:…");
 * `categories` are Commons' own, for a new answer. Every reason is a fixed rule over the file's own words.
 */
export function commonsKind(id: string, names?: KindNames | null, categories?: readonly string[] | null): string | null {
  if (!TYPE.test(id)) return 'not a JPEG or WebP file';
  const title = commonsTitle(id);
  for (const [why, re] of TITLE_KINDS) if (re.test(title)) return why;
  const b = own(names);
  if (isHybrid(title, b)) return 'a hybrid';
  if (namesAnother(title, b)) return 'named as another species';
  const cat = (categories ?? []).find((c) => CATEGORY_KINDS.test(c));
  return cat ? `filed under "${cat}"` : null;
}

/** 0 when the title holds the species' own epithet, 1 an older name's, 2 neither (a camera's name, "DSC_1234"). */
export function epithetRank(id: string, names?: KindNames | null): number {
  const t = commonsTitle(id).toLowerCase();
  const b = own(names);
  const holds = (x: Binomial) => new RegExp(`(?:^|[^a-z])${esc(stem(x.epithet))}`).test(t);
  if (b[0] && holds(b[0])) return 0;
  return b.slice(1).some(holds) ? 1 : 2;
}

/** Commons files in their places among the others, those whose title holds the species' epithet first (stable). */
export function commonsFirstByEpithet<P extends { src?: string; id: string }>(photos: P[], names?: KindNames | null): P[] {
  const at = photos.map((p, i) => (p.src === 'commons' ? i : -1)).filter((i) => i >= 0);
  const sorted = at.map((i) => photos[i]).map((p, k) => ({ p, k, r: epithetRank(p.id, names) })).sort((a, b) => a.r - b.r || a.k - b.k).map((x) => x.p);
  const out = photos.slice();
  at.forEach((i, k) => (out[i] = sorted[k]));
  return out;
}

type PhotoLike = { src?: string; id: string; url: string; captive?: boolean; licence?: string; attribution: string };

/**
 * The photographs a page shows and the index counts: a Commons file that is not a photograph of the species, or whose
 * licence or author the rules do not read, left out; the rest with Commons' credit cleaned and its licence re-read;
 * Commons files holding the species' epithet first. Every other source's photograph is left exactly as it is.
 */
export function shownPhotos<P extends PhotoLike>(photos: readonly P[], names?: KindNames | null): P[] {
  const out: P[] = [];
  for (const p of photos) {
    if (p.src !== 'commons') out.push(p);
    else if (!commonsKind(p.id, names)) {
      const r = readCommonsPhoto(p);
      if (r) out.push(r);
    }
  }
  return commonsFirstByEpithet(out, names);
}

/** The lead photograph of what is shown: the page's hero and the index's tile, by one rule (`heroOf`'s order of sources). */
export const leadOf = <P extends PhotoLike>(photos: readonly P[], names?: KindNames | null): P | undefined => heroOf(shownPhotos(photos, names));
