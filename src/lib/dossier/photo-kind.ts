/**
 * Whether a Wikimedia Commons file is a photograph of the species (round sixty-nine; triage-68 K1). Commons' category
 * for a species holds distribution maps, herbarium sheets, plates from Curtis's Botanical Magazine, stamps, seeds,
 * unidentified plants, hybrids and files named as another species, and the build took every one as a photograph of it:
 * 40 of the 619 Commons-led species led with one (R46-1, S-B1, IND-1). One test, read from what a dossier keeps (the
 * file's title and type, and since round seventy the categories the build or `--fill commons-kind` stored with it) and,
 * for a new answer, Commons' categories, which the same request returns. Applied where Commons answers, where a dossier
 * is read (`safeUrls`) and where the index is made, so no rebuild is needed.
 *
 * Round seventy (REVIEW-TRIAGE-69 C1) reads names as structured identity: every binomial a title holds, of the species'
 * own genera or any genus the reference holds, is compared with the species' own names as genus and epithet together,
 * spelling through `spellingKey`, and an uploader's slip is the species' only where the reference's names say the slip is
 * no other name.
 *
 * Depicts statements (P180) are not used as a gate: they catch 16 of the 40 bad leads and are missing from 55% of good files.
 */
import { readCommonsPhoto } from './photo-credit';
import { heroOf, oneCopyEach, inatPhotoId } from './dedupe';
import { spellingKey } from './epithet';
import { commonsTileOf } from './photo-size';
import { ownNames as ownNamesRule } from './own-names';

/**
 * The names the reference holds, accepted and older, by genus (round seventy; REVIEW-TRIAGE-69 C1, S-C5, IND-4): what
 * tells an uploader's slip ("Mammillaria mabudae" for matudae) from another species one letter away ("Echinocereus
 * schereri" beside E. scheeri), and which capitalised words of a title are genera. Made from the index (`heldNamesOf`)
 * where the Worker reads a dossier and where the index is written. Without it no slip is read as the species', and only
 * the species' own genera are read.
 */
export interface HeldNames {
  /** The keys of the species holding this genus and epithet (by `spellingKey`) as their name or an older name of species rank; empty when none does. */
  holders(genus: string, epithet: string): readonly number[];
  /** Whether a name the reference holds, accepted or older, is of this genus. */
  hasGenus(genus: string): boolean;
  /** The epithets the reference holds in this genus, in lower case, as written. */
  epithets(genus: string): readonly string[];
  /** The key of the species whose accepted name this genus and epithet is (by `spellingKey`), or null (round seventy, second pass; REVIEW-TRIAGE-69 C6). */
  accepted(genus: string, epithet: string): number | null;
}

/** The species' names a title is read against: its own and its older names, as the dossier keeps them (authors allowed); its key and the reference's names when known. */
export interface KindNames {
  scientific: string;
  synonyms?: readonly string[] | null;
  key?: number;
  held?: HeldNames | null;
}

/** What `heldNamesOf` reads of an index entry: the accepted name and the older names the index carries (`syn`, `older`). */
export type HeldSource = { key: number; name: string; syn?: readonly string[] | null; older?: readonly string[] | null };

const heldMemo = new WeakMap<readonly HeldSource[], HeldNames>();
/** The reference's names from its index, made once an index (the Worker keeps one parsed index a minute). */
export function heldNamesOf(entries: readonly HeldSource[]): HeldNames {
  const known = heldMemo.get(entries);
  if (known) return known;
  const by = new Map<string, number[]>();
  const words = new Map<string, Set<string>>();
  const acc = new Map<string, number>();
  for (const e of entries) {
    const a = nameOf(e.name);
    if (a && !a.infra) acc.set(`${a.genus.toLowerCase()} ${spellingKey(a.epithet)}`, e.key);
    for (const n of [e.name, ...(e.syn ?? []), ...(e.older ?? [])]) {
      const b = nameOf(n);
      if (!b) continue;
      const g = b.genus.toLowerCase();
      (words.get(g) ?? words.set(g, new Set()).get(g)!).add(b.epithet.toLowerCase());
      // An older name below species ("Babiana stricta var. purpurea") is held only whole: its first two words are another species' name (S-C6).
      if (b.infra) continue;
      const k = `${g} ${spellingKey(b.epithet)}`;
      const ks = by.get(k) ?? by.set(k, []).get(k)!;
      if (!ks.includes(e.key)) ks.push(e.key);
    }
  }
  const out: HeldNames = {
    holders: (genus, epithet) => by.get(`${genus.toLowerCase()} ${spellingKey(epithet)}`) ?? [],
    hasGenus: (genus) => words.has(genus.toLowerCase()),
    epithets: (genus) => [...(words.get(genus.toLowerCase()) ?? [])],
    accepted: (genus, epithet) => acc.get(`${genus.toLowerCase()} ${spellingKey(epithet)}`) ?? null
  };
  heldMemo.set(entries, out);
  return out;
}

/** JPEG and WebP only: a PNG on Commons is nearly always a map or a drawing, and its 500-pixel tile weighed 600 to 750 kB (R46-9). */
const TYPE = /\.(?:jpe?g|webp)$/i;

/**
 * Words that say a plant is alive where a title says "specimen": a garden's or a grower's plant is a specimen too
 * ("Nepenthes argentii cultivated specimen", "Lithops specimens - University of California Botanical Garden"; the
 * misreadings queued from round sixty-nine). What a file shows decides (REVIEW-TRIAGE-69 C1): a pressed, mounted or
 * type specimen is a herbarium sheet whatever else the title says.
 */
const LIVING = /\bcultivat|\bliving\b|\bgardens?\b|\bgarten\b|\bjard[ií]n|\bgreenhouse|\bglasshouse|\bconservatory|\bnursery|\bplant house\b|\bin habitat\b|\bin situ\b/i;
const PRESSED = /\b(?:pressed|mounted|dried|preserved|type)\b/i;

/** Each kind of file that is not a photograph of the plant, by the words its title uses. Word-bounded, so "brewbooks" is not a book. */
const TITLE_KINDS: Array<[string, (t: string) => boolean]> = [
  ['a map', (t) => /\bdistribution\b|distribuzione|distribuci[oó]n|verbreitung|\brange (?:of|map)\b|\bmaps?\b|\bkarte\b|\bareal\b/i.test(t)],
  // The Smithsonian's sheets are named "<name>-NMNH-<barcode>" (Cyphostemma camerounense, Zanha golungensis; S-C3).
  ['a herbarium sheet', (t) => /herbari|holotyp|isotyp|lectotyp|syntyp|paratyp|neotyp|exsiccat|\(GBIF \d+\)|^COI\d|\bNMNH\b/i.test(t)],
  ['a herbarium sheet', (t) => /specimen/i.test(t) && (PRESSED.test(t) || !LIVING.test(t))],
  // A printed illustration: Popular Science Monthly's are named "PSM V<volume> D<page>" (Agave polyacantha; IND-1), and a
  // paper's figure is one too ("Phylogeny-of-the-plant-genus-Pachypodium-…-peerj-01-70-g001", which would lead Pachypodium windsorii).
  ['a plate or drawing', oldYear],
  ['a plate or drawing', (t) => /phylogen|cladogram|\bdiagrams?\b|\bpeerj\b|curtis|botanical (?:magazine|register)|\btab\.\s*\d|\bplate\b|\bpl\.\s*\d|illustrat|drawing|engraving|lithograph|zeichnung|watercolou?r|\bpainting\b|biodiversity heritage library|\bPSM V\d|popular science monthly/i.test(t)],
  // A pod or a fruit on the plant is the plant; loose seed is not ("Tecomanthe Speciosa Seed Pod"; REVIEW-TRIAGE-69 C1).
  ['not the plant', (t) => /\bseeds?\b(?![\s-]*pods?\b)|\bsemillas?\b|\bsamen\b|\bresin\b|\bstamps?\b|\bpostage\b|\bbooks?\b|\blabel\b/i.test(t)],
  // An animal on the plant is a photograph of the animal ("Leaf-footed Bug nymphs … on Centaurea americana"; S-C3).
  // Singular words that also name plants ("bee balm", "butterfly bush", "moth orchid", "spider plant") are not read.
  ['an animal', (t) => /\bnymphs?\b|\blarvae?\b|\bcaterpillars?\b|\binsects?\b|\bbugs?\b|\bbeetles?\b|\bbutterflies\b|\bmoths\b|\bbees\b|\bwasps?\b|\baphids?\b|\bants\b|\bhoverfl(?:y|ies)\b|\bsnails?\b|\bspiders\b/i.test(t)],
  ['an unidentified plant', (t) => /\bunknown\b|\bunidentified\b|\bunbekannt|\bindet(?:ermined)?\b|\bsp\.(?:\s|$)|\bspp\.?(?:\s|$)/i.test(t)],
  ['not determined', (t) => /\b(?:aff|cf)\.(?:\s|$)|\b(?:aff|cf)\s+[a-z]/i.test(t)],
  // "hybrid" in a title marks a hybrid, as /about/how says (Nepenthes rhombicaulis; S-C4).
  ['a hybrid', (t) => /\bhybrids?\b/i.test(t)]
];

/**
 * A year from 1500 to 1899 in a title is a printed work's ("Dasylirion graminifolium Zuccarini 1843"; R47-3, C7), unless
 * it is a camera's or a catalogue's number ("IMG 1834", "DSC_1765", "No. 1612") or part of a longer number.
 */
const OLD_YEAR = /(?<![\dA-Za-z.,:#-])(1[5-8]\d\d)(?![\d-])/;
/** What a number in a title follows when it is not a year: a camera's prefix, "No.", another number, or a collector's code of up to four letters ("VG 1815", "STO 1612"). */
const NUMBERED = /(?:\b(?:img|dsc[nf]?|pict?|cimg|sam|dcp|p|pb|pc|imag|photo|foto|no|nr|num|n°)|#|\d|\b[A-Z][A-Za-z]{0,3})[\s_.-]*$/i;
function oldYear(t: string): boolean {
  for (const m of t.matchAll(new RegExp(OLD_YEAR.source, 'g'))) if (!NUMBERED.test(t.slice(0, m.index))) return true;
  return false;
}

/**
 * What a credit says of the file (R47-3, C7): a lithograph's or a drawing's makers ("M.S. del., J.N.Fitch lith.", a
 * Curtis plate on Cyphostemma adenopodum), and a post office ("Македонская почта", the stamp that is Colchicum
 * macedonicum's only file).
 */
const CREDIT_KINDS: Array<[string, RegExp]> = [
  ['a plate or drawing', /\b(?:del|delin|lith|pinx|sculp)\.(?=[\s,;)]|$)/i],
  ['not the plant', /почта|пошта|pošta|poczta|\bpostal\b/i]
];

/**
 * Categories that say the same, for a new answer (`Categories` in `iiextmetadatafilter`) and for a stored file whose
 * categories were kept. Named narrowly: Commons files every geotagged photograph under "Pages with maps", so "maps" alone
 * would drop good photographs, and it files gardens' living plants as "Specimens in the Lyman Plant House" (S-C10), so
 * "specimens" is read only as a museum's or a herbarium's.
 */
const CATEGORY_KINDS = /herbari|holotyp|isotyp|\b(?:preserved|pressed|dried|type|museum) specimens?\b|museum of natural history|natural history museum|distribution maps|range maps|locator maps|maps of the (?:range|distribution)|illustrations\b|drawings|engravings|lithographs|botanical magazine|curtis|biodiversity heritage library|popular science monthly|\bplates\b|postage stamps|stamps of|plants on stamps|\bseeds\b|\bresins?\b|\bbooks\b|hybrids\b/i;

/**
 * Round 70b (the owner's `--fill commons-kind`, 140 files left out): "Media from GBIF" says where a file came from, not
 * what it shows, and hid living plants Commons imported from GBIF's observations ("Melocactus paucispinus 1",
 * "Granite bloodlily (Haemanthus graniticus) 3"), often a page's only photographs; it is no longer a kind, and a
 * herbarium's import is caught by its specimen categories and its title. "Unidentified" is read only of a plant: a
 * plant group, plants, or a genus the species or the reference holds ("Unidentified Euphorbia", "Unidentified Liliales
 * in Armenia", "Unidentified plants in the Brooklyn Botanic Garden"), never of an animal ("Unidentified Formicidae", an
 * ant on Franklinia's flower) or of anything else ("Unidentified year in Donetsk").
 */
const PLANT_GROUPS = /^(?:plants?|flowers?|succulents?|cact(?:i|us)|trees?|shrubs?|bulbs?|angiosperms|monocots|eudicots|dicots|spermatophyta|magnoliophyta|magnoliopsida|liliopsida|tracheophyta|[a-z]+(?:ales|aceae|oideae|opsida|phyta))$/i;
function unidentifiedPlant(c: string, n: KindNames, own: readonly Name[]): boolean {
  const w = /^unidentified\s+([A-Za-z]+)/i.exec(c.trim())?.[1];
  if (!w) return false;
  return PLANT_GROUPS.test(w) || (/^[A-Z][a-z]+$/.test(w) && (own.some((b) => b.genus === w) || !!n.held?.hasGenus(w)));
}

/**
 * An animal's category: a file under one is a photograph of the animal (the nymphs on Centaurea americana; S-C3), an
 * animal family read by its zoological ending ("Formicidae", "Tabanidae", "Papilionidae"). Round 70b: a flower with an
 * insect on it is still the plant where the title names the species ("Nepenthes inermis6", "Butterfly on Ixora casei
 * 01", "Franklin Tree Franklinia alatamaha Flower"), so an animal's category hides a file only when its title does not.
 */
const ZOO_FAMILY = /\b[A-Z][a-z]+idae\b/;
const ANIMAL_CATEGORIES = /\binsects?\b|\bnymphs?\b|\blarvae\b|\bcaterpillars\b|\bbeetles\b|\bbutterflies\b|\bmoths\b|\bbees\b|\bwasps\b|\baphids\b|\bants\b|\bspiders\b|\bbirds\b|\bhemiptera\b|\bheteroptera\b|\bcoreidae\b|\bcoleoptera\b|\blepidoptera\b|\bhymenoptera\b|\bdiptera\b|\borthoptera\b|\baraneae\b|\bfauna of\b|\banimals\b/i;

/**
 * The words after a genus that are not an epithet: "Crassula in flower" names no other species, nor do "Wollemia
 * cones", "Lithops before Repotting" and "Ceropegia trap2" (the misreadings queued from round sixty-nine).
 */
const NOT_EPITHET = new Set(['sp', 'spp', 'ssp', 'subsp', 'var', 'species', 'hybrid', 'hybrids', 'cultivar', 'cv', 'flower', 'flowers', 'flowering', 'plant', 'plants', 'in', 'at', 'on', 'and', 'or', 'with', 'from', 'the', 'of', 'by', 'near', 'under', 'over', 'before', 'after', 'during', 'leaf', 'leaves', 'fruit', 'fruits', 'berry', 'berries', 'pod', 'pods', 'seedpod', 'cone', 'cones', 'seedling', 'seedlings', 'habit', 'habitat', 'detail', 'close', 'closeup', 'macro', 'view', 'group', 'clump', 'colony', 'collection', 'garden', 'gardens', 'park', 'house', 'greenhouse', 'nursery', 'show', 'bloom', 'blooms', 'blossom', 'inflorescence', 'stem', 'stems', 'trunk', 'bark', 'root', 'roots', 'caudex', 'tuber', 'tubers', 'bulb', 'bulbs', 'corm', 'corms', 'spine', 'spines', 'bud', 'buds', 'trap', 'traps', 'pitcher', 'pitchers', 'upper', 'lower', 'rosette', 'rosettes', 'offset', 'offsets', 'tree', 'trees', 'shrub', 'pot', 'potted', 'cultivated', 'wild', 'young', 'old', 'new', 'white', 'red', 'yellow', 'pink', 'blue', 'green', 'purple', 'orange', 'img', 'dsc', 'photo', 'image', 'bonsai', 'specimen', 'specimens', 'cactus', 'cacti', 'succulent', 'succulents', 'form', 'forma', 'type', 'aff', 'cf', 'x', 'et', 'nov', 'indet', 'spec']);

/** The ends of English words, never of an epithet the reference holds with a Latin ending ("budding", "growing"). */
const ENGLISH = /(?:ing|ings|ness|ment|ments|tion|tions)$/;
/** The letters 99% of the reference's epithets end in (a, s, i, m, e, r, n, x, o, u, y). A word ending otherwise ("trap") is an epithet only where the reference holds it in that genus. */
const LATIN_END = /[aeiouymnrsx]$/;

/** The file's title as words: "File:Nepenthes_tenuis1.jpg" is "Nepenthes tenuis1". */
export const commonsTitle = (id: string): string => id.replace(/^File:/i, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');

/** An epithet's stem, so a gender or spelling ending ("mihanovichii", "mihanovichi") reads as one name. Used for the order only. */
const stem = (e: string) => e.toLowerCase().replace(/(?:ii|ae|us|um|is|es|a|e|i|on|os)$/, '');

/** A name as genus and epithet, and an older name below species with its last epithet (`infra`): "Babiana stricta var. purpurea". */
type Name = { genus: string; epithet: string; infra?: string };
const RANK = /^(?:var|v|subsp|ssp|f|fo|forma|subvar|nothosubsp|nothovar)$/;
/** "Nepenthes dubia Danser", "Lantana ×strigocamara" or "Colchicum caucasicum var. raddeanum (Regel) Stef." as its parts; null for anything that is not a name. */
function nameOf(name: string): Name | null {
  const m = /^([A-Z][a-z]+(?:-[a-z]+)?)\s+(?:×\s*|x\s+)?([a-z][a-z-]+)(.*)$/.exec(name.replace(/×\s*/g, '× ').trim());
  if (!m) return null;
  const r = /(?:^|\s)(?:var|subsp|ssp|f|fo|forma|subvar|nothosubsp|nothovar)\.?\s+([a-z][a-z-]+)/.exec(m[3]);
  return r ? { genus: m[1], epithet: m[2], infra: r[1] } : { genus: m[1], epithet: m[2] };
}

/**
 * The species' own names, as the title rules read them: its accepted name and its older names, except an older name of
 * species rank that another species of the reference holds as its accepted name (round seventy, second pass;
 * REVIEW-TRIAGE-69 C6, R47-2: Asclepias curassavica's "Asclepias syriaca", Aloe vera's "Aloe maculata"). An older name
 * below species stays, read only whole (`readBinomial`). Without the reference's names, every older name is read, as before.
 *
 * B7 hook: agent B's replacement-name rule (REVIEW-TRIAGE-69 B7, "a synonym GBIF holds under this species, which no
 * species of the reference holds, is this species' own") is read here, through `olderNameIsOwn`: the older name is asked
 * of B's `ownNames` (`own-names.ts`), the one rule iNaturalist reads too, with "held elsewhere" read from the reference's
 * accepted names by `spellingKey` (applied at the round-seventy merge).
 */
export function olderNameIsOwn(n: KindNames, b: { genus: string; epithet: string; infra?: string }): boolean {
  if (b.infra || !n.held) return true;
  const held = n.held;
  const name = `${b.genus} ${b.epithet}`;
  const heldElsewhere = (x: string) => {
    const p = nameOf(x);
    const k = p && !p.infra ? held.accepted(p.genus, p.epithet) : null;
    return k != null && k !== n.key;
  };
  return ownNamesRule({ scientific: n.scientific, synonyms: [name], heldElsewhere }).own.has(name.toLowerCase());
}
const ownNames = (n: KindNames | null | undefined): Name[] => {
  if (!n) return [];
  const first = nameOf(n.scientific);
  const older = (n.synonyms ?? []).map(nameOf).filter((b): b is Name => !!b && olderNameIsOwn(n, b));
  return first ? [first, ...older] : older;
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const genusRe = (g: string) => `[${g[0]}${g[0].toLowerCase()}]${esc(g.slice(1))}`;
const lower = (s: string) => s.toLowerCase();
/** An epithet as letters only, for the slip test: hyphens and spaces out, "ae" as "e". */
const letters = (e: string) => lower(e).replace(/[\s-]+/g, '').replace(/ae/g, 'e');

/**
 * Whether two spellings are one uploader's slip apart (round seventy; REVIEW-TRIAGE-69 C1, S-C11): one letter added,
 * dropped or changed, or one letter moved up to three places, which takes in two letters swapped ("Aeonium dodantrale"
 * for dodrantale moves the r). Both at least five letters as written ("jutae" for juttae); round sixty-nine's floor of
 * seven goes. Whether a slip is the species' is `readBinomial`'s question: only where the reference holds no such name.
 */
export function slip(a: string, b: string): boolean {
  if (Math.min(lower(a).replace(/[\s-]+/g, '').length, lower(b).replace(/[\s-]+/g, '').length) < 5) return false;
  const [x, y] = [letters(a), letters(b)];
  if (x === y) return false;
  const [s, t] = x.length <= y.length ? [x, y] : [y, x];
  if (t.length - s.length > 1) return false;
  let i = 0;
  while (i < s.length && s[i] === t[i]) i++;
  if (s.length < t.length) return s.slice(i) === t.slice(i + 1);
  if (s.slice(i + 1) === t.slice(i + 1)) return true;
  let j = s.length - 1;
  while (j > i && s[j] === t[j]) j--;
  if (j - i > 3) return false;
  const [p, q] = [s.slice(i, j + 1), t.slice(i, j + 1)];
  return (p.slice(1) === q.slice(0, -1) && p[0] === q[q.length - 1]) || (p.slice(0, -1) === q.slice(1) && p[p.length - 1] === q[0]);
}

/** Whether the reference holds this genus and epithet as the name or an older name of a species other than this one. */
const heldElsewhere = (n: KindNames, genus: string, epithet: string) => !!n.held?.holders(genus, epithet).some((k) => k !== n.key);

type Verdict = 'own' | 'another' | null;
/** Whether a reference genus named alone counts as another plant (round seventy, second pass; C7). */
const BARE_GENUS = true;

/**
 * One binomial of a title, `genus` and `words` (the lower-case words that follow it), read against the species' own
 * names as pairs (round seventy; REVIEW-TRIAGE-69 C1):
 * - the epithet is the species' or one of its older names', with that name's genus, in any spelling `spellingKey`
 *   reads as one ("Gymnocalycium mihanovichi"), written as two words ("Titanopsis hugo schlechterii"), or with a note
 *   after a hyphen or run on ("Sinningia leucotricha-caudex", "Centaurea americanaflower");
 * - an older name below species is the species' only whole ("Babiana stricta var. purpurea"), never its first two words;
 * - an uploader's slip is the species' only where the reference holds no such name in that genus, and never where the
 *   reference's names are not known ("Mammillaria mabudae", "Aeonium dodantrale"; not "Echinocereus schereri");
 * - any other epithet names another plant ("Euryops abrotanifolius" on Othonna daucifolia, whose older names share only
 *   the epithet). A word that is no epithet (an English word, or one with no Latin ending that the reference does not
 *   hold in that genus) is no name: null.
 */
function readBinomial(genus: string, words: readonly string[], n: KindNames, own: readonly Name[]): Verdict {
  const e = lower(words[0] ?? '').replace(/-+$/, '');
  const mine = own.filter((b) => lower(b.genus) === lower(genus));
  if (!e || (e.length < 3 && !mine.some((b) => lower(b.epithet) === e))) return null;
  const holders = n.held?.holders(genus, e) ?? [];
  if (n.key != null && holders.includes(n.key) && olderNameIsOwn(n, { genus, epithet: e })) return 'own';
  const isHeld = holders.length > 0 || !!n.held?.epithets(genus).includes(e);
  if (!mine.some((b) => lower(b.epithet) === e) && !isHeld && (NOT_EPITHET.has(e) || ENGLISH.test(e) || !LATIN_END.test(e.split('-')[0]))) return null;
  const k = spellingKey(e);
  const next = words[1] ? lower(words[1]) : '';
  for (const b of mine) {
    const kb = spellingKey(b.epithet);
    if (b.infra) {
      // Whole only: "Babiana stricta var. purpurea", or "stricta purpurea" with no rank written.
      const at = RANK.test(next) ? 2 : 1;
      if (k === kb && words[at] && spellingKey(words[at]) === spellingKey(b.infra)) return 'own';
      continue;
    }
    if (k === kb) return 'own';
    if (next && spellingKey(e + next) === kb && !heldElsewhere(n, genus, e)) return 'own';
    if (e.includes('-') && spellingKey(e.split('-')[0]) === kb && !heldElsewhere(n, genus, e)) return 'own';
    const run = lower(b.epithet);
    if (e.length > run.length && e.startsWith(run) && NOT_EPITHET.has(e.slice(run.length)) && !heldElsewhere(n, genus, e)) return 'own';
    if (n.held && slip(e, b.epithet) && !heldElsewhere(n, genus, e)) return 'own';
  }
  return 'another';
}

/**
 * Every binomial a title names, each read by `readBinomial`: after one of the species' own genera (its first letter in
 * either case, "aragats, colchicum bifolium") or a genus the reference holds, capitalised ("Euryops abrotanifolius" on
 * Othonna daucifolia; S-C1); an own genus run on into the rest of the word ("Nepentheslamiiplant" on Nepenthes
 * monticola; S-C7; "Agavecocui" is Agave cocui's); an own genus's initial with a full stop ("C.americana"), or run on
 * into an epithet the reference holds in that genus as another species' ("Nlamii2rosette").
 */
function readings(raw: string, n: KindNames): Verdict[] {
  const own = ownNames(n);
  // A genus written in brackets after another, "Neoporteria(eriosyce) villosa" (R47-3, C7), is read as both names.
  const title = raw.replace(/\b([A-Z][a-z]+)\s?\(([a-z]{3,})\)\s*([a-z][a-z-]+)/g, (_, G: string, g: string, e: string) => `${G} ${e}, ${g[0].toUpperCase()}${g.slice(1)} ${e}`);
  const genera = new Map(own.map((b) => [lower(b.genus), b.genus]));
  const tokens = [...title.matchAll(/[A-Za-z]+(?:-[a-z]+)*|×/g)].map((m) => ({ w: m[0], at: m.index!, end: m.index! + m[0].length }));
  const gap = (j: number) => title.slice(tokens[j - 1].end, tokens[j].at);
  /** The lower-case words that follow token i, through spaces, underscores and full stops: an epithet and what may follow it. */
  const after = (i: number) => {
    const out: string[] = [];
    for (let j = i + 1; j < tokens.length && out.length < 3; j++) {
      if (!/^[\s_.]*$/.test(gap(j)) || (j === i + 1 && !gap(j))) break;
      if (out.length === 0 && (tokens[j].w === '×' || tokens[j].w === 'x')) continue;
      if (!/^[a-z][a-z-]*$/.test(tokens[j].w)) break;
      out.push(tokens[j].w);
    }
    return out;
  };
  const out: Verdict[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i].w;
    const g = lower(w);
    const isOwn = genera.has(g) && (w === g || w === genera.get(g));
    const isRef = !isOwn && /^[A-Z][a-z]+$/.test(w) && !!n.held?.hasGenus(w);
    if (isOwn || isRef) {
      const next = after(i);
      const v = readBinomial(genera.get(g) ?? w, next, n, own);
      if (v) out.push(v);
      // Another genus of the reference named alone is another plant in the picture ("… and Yucca"; R47-3, C7).
      // A word that is also the species' own epithet is the species named by its epithet ("Pachyphytum 120221" on Dudleya pachyphytum).
      else if (isRef && !next.length && BARE_GENUS && !own.some((b) => spellingKey(b.epithet) === spellingKey(w))) out.push('another');
      continue;
    }
    // An own genus run on into the rest of the word: the species' own epithet, or another plant. A family ("Crassulaceae") is neither.
    const runG = /^[A-Za-z][a-z]+$/.test(w) ? [...genera.values()].find((G) => w.length >= G.length + 3 && g.startsWith(lower(G))) : undefined;
    if (runG) {
      const tail = g.slice(runG.length);
      if (/^a?ceae$/.test(tail) || [...NOT_EPITHET].some((x) => x.length >= 3 && tail.startsWith(x))) continue;
      const mine = own.filter((b) => lower(b.genus) === lower(runG) && !b.infra);
      out.push(mine.some((b) => tail.startsWith(lower(b.epithet)) || tail.startsWith(spellingKey(b.epithet))) ? 'own' : 'another');
      continue;
    }
    // An own genus's initial: "N. lamii", "C.americana", or "N rajah" with no full stop when the reference holds the
    // epithet in that genus (R47-3, C7), so "A pair of…" is not read.
    const bare = n.held && /^[A-Z]$/.test(w) && i + 1 < tokens.length && /^\s+$/.test(gap(i + 1)) && [...genera.values()].some((x) => x[0] === w && (n.held!.epithets(x).includes(lower(tokens[i + 1].w)) || own.some((b) => b.genus === x && lower(b.epithet) === lower(tokens[i + 1].w))));
    if (/^[A-Z]$/.test(w) && i + 1 < tokens.length && (/^\.\s*$/.test(gap(i + 1)) || bare)) {
      const v = [...genera.values()].filter((x) => x[0] === w).map((x) => readBinomial(x, after(i), n, own));
      if (v.includes('own')) out.push('own');
      else if (v.includes('another')) out.push('another');
      continue;
    }
    // An own genus's initial run on into an epithet the reference holds as another species' ("Nlamii2rosette"): read only with the reference's names.
    const m = n.held ? /^([A-Z])([a-z]{4,})$/.exec(w) : null;
    if (m) {
      for (const G of [...genera.values()].filter((x) => x[0] === m[1])) {
        if (own.some((b) => lower(b.genus) === lower(G) && m[2].startsWith(lower(b.epithet)))) { out.push('own'); break; }
        if (n.held!.epithets(G).some((e) => e.length >= 4 && m[2].startsWith(e) && heldElsewhere(n, G, e))) { out.push('another'); break; }
      }
    }
  }
  return out;
}

/** A hybrid's sign, or " x " between two names, left once the species' own name is set aside (so Lantana ×strigocamara's files stay). */
function isHybrid(title: string, names: readonly Name[]): boolean {
  let t = title;
  for (const b of names) t = t.replace(new RegExp(`${genusRe(b.genus)}\\s*(?:×\\s*|x\\s+)?${esc(b.epithet)}`, 'g'), 'own');
  return /×/.test(t) || /[a-z]{3,}\.?\s+x\s+[a-z]{3,}/i.test(t);
}

/**
 * A species category ("Parodia comarapana", "Lithops schwantesii subsp. schwantesii var. marthae") as one identity a
 * species, with the epithet it is named by: "self" for the species under any of its own names (`ownNames`, B's rule,
 * compared by `spellingKey`), and for a variety or subspecies of it; another species of the reference by the one key
 * the reference files the name under; else, a name the reference does not hold and that is not the species' own, by
 * the name. A variety of another species counts as that species. Its genus must be the species' own or one the
 * reference holds, so "Flowering plants" is no species, and "Cyphostemma bonsai" names no species (round 70b).
 */
function categorySpecies(c: string, n: KindNames, own: readonly Name[]): { id: string; epithet: string } | null {
  const m = /^([A-Z][a-z]+(?:-[a-z]+)?) (?:× ?)?([a-z][a-z-]+)((?: (?:var|subsp|ssp|f|fo|forma)\.? [a-z][a-z-]+){0,2})$/.exec(c.trim());
  if (!m) return null;
  const [genus, epithet] = [m[1], m[2]];
  const infras = [...m[3].matchAll(/ (?:var|subsp|ssp|f|fo|forma)\.? ([a-z][a-z-]+)/g)].map((x) => spellingKey(x[1]));
  if (NOT_EPITHET.has(lower(epithet)) || ENGLISH.test(lower(epithet))) return null;
  const g = lower(genus);
  if (!own.some((x) => lower(x.genus) === g) && !n.held?.hasGenus(genus)) return null;
  const k = spellingKey(epithet);
  const self = own.some((x) => lower(x.genus) === g && spellingKey(x.epithet) === k && (!x.infra || infras.includes(spellingKey(x.infra))));
  if (self) return { id: 'self', epithet };
  const ks = n.held?.holders(genus, epithet) ?? [];
  if (n.key != null && ks.includes(n.key) && olderNameIsOwn(n, { genus, epithet })) return { id: 'self', epithet };
  return { id: ks.length === 1 ? `key ${ks[0]}` : `${g} ${k}`, epithet };
}

/** What Commons says of a file beyond its title: its categories, and whether its description strikes out a name (`struck`). */
export type CommonsMeta = { categories?: readonly string[] | null; struck?: boolean | null; credit?: string | null };

/**
 * Why a Commons file is not a photograph of the species, or null when it is. `id` is the stored title ("File:…");
 * `meta` is what Commons says of it (a new answer's categories, or those stored with it, as a list or with `struck`).
 * Every reason is a fixed rule over the file's own words.
 */
export function commonsKind(id: string, names?: KindNames | null, meta?: readonly string[] | CommonsMeta | null): string | null {
  if (!TYPE.test(id)) return 'not a JPEG or WebP file';
  const title = commonsTitle(id);
  for (const [why, test] of TITLE_KINDS) if (test(title)) return why;
  const m: CommonsMeta = Array.isArray(meta) ? { categories: meta as readonly string[] } : ((meta ?? {}) as CommonsMeta);
  const credit = (m.credit ?? '').replace(/<[^>]+>/g, ' ');
  for (const [why, re] of CREDIT_KINDS) if (re.test(credit)) return why;
  const n: KindNames = names ?? { scientific: '' };
  const own = ownNames(n);
  if (isHybrid(title, own)) return 'a hybrid';
  if (readings(title, n).includes('another')) return 'named as another species';
  const cats = m.categories ?? [];
  const cat = cats.find((c) => CATEGORY_KINDS.test(c) || unidentifiedPlant(c, n, own));
  if (cat) return `filed under "${cat}"`;
  const animal = cats.find((c) => ANIMAL_CATEGORIES.test(c) || ZOO_FAMILY.test(c));
  if (animal && !namesThisSpecies(id, title, n)) return `filed under "${animal}"`;
  // A file Commons files under two or more species is a group photograph, and is shown on neither ("Parodia Liberec 1"; S-C3).
  // Round 70b: unless its title names this species and none of the others, when the others are plants beside it
  // ("Aztekium hintonii 5", filed under Selaginella gypsophila too); "Haworthias blackburniae y wittebergensis" names two.
  const found = cats.map((c) => categorySpecies(c, n, own)).filter((x): x is { id: string; epithet: string } => !!x);
  const species = new Set(found.map((x) => x.id));
  if (species.size >= 2) {
    const t = lower(title);
    // An epithet the species' own names hold is not another's ("Epithelantha micromeris unguispina" is E. spinosior's own name).
    const mine = new Set(own.map((x) => spellingKey(x.epithet)));
    const others = found.filter((x) => x.id !== 'self' && !mine.has(spellingKey(x.epithet)) && new RegExp(`(?:^|[^a-z])${esc(stem(x.epithet))}`).test(t));
    if (!namesThisSpecies(id, title, n) || others.length) return `filed under ${species.size} species: a group`;
  }
  // "Centaurea sp. ~~C. nuttallii~~": the describer struck the name out (S-C3).
  if (m.struck) return 'its description strikes out a name';
  return null;
}

/** Whether a title names the species under one of its own names: a binomial read as its own, or its epithet after its genus or a start of it. */
const namesThisSpecies = (id: string, title: string, n: KindNames): boolean => readings(title, n).includes('own') || epithetRank(id, n) < 2;

/** 0 when the title holds the species' own epithet, 1 an older name's, 2 neither (a camera's name, "DSC_1234"). */
export function epithetRank(id: string, names?: KindNames | null): number {
  const t = commonsTitle(id).toLowerCase();
  const b = ownNames(names);
  // An older name below species is held by its last epithet (S-C6).
  // A name run together ("Nepenthesdubia1", "Nepspectabilis") holds its epithet too: after the genus or a start of it (R47-2, C6).
  const holds = (x: Name) => {
    const g = x.genus.toLowerCase();
    const starts = Array.from({ length: g.length }, (_, k) => esc(g.slice(0, k + 1))).join('|');
    return new RegExp(`(?:^|[^a-z]|(?:^|[^a-z])(?:${starts}))${esc(stem(x.infra ?? x.epithet))}`).test(t);
  };
  if (b[0] && holds(b[0])) return 0;
  return b.slice(1).some(holds) ? 1 : 2;
}

/**
 * A Commons file narrower than 500 pixels leads at less than its 480-pixel box (Nepenthes spectabilis' 256-pixel file,
 * Mammillaria laui's 480 beside four of 4,000; S-C12): among files of one rank, those at least 500 wide go first. A file
 * whose width was not kept is not known to be narrow.
 */
export const LEAD_WIDTH = 500;
const narrow = (p: { width?: number | null }) => typeof p.width === 'number' && p.width < LEAD_WIDTH;

/** Commons files in their places among the others: those whose title holds the species' epithet first, and of one rank those at least 500 pixels wide first (stable). */
export function commonsFirstByEpithet<P extends { src?: string; id: string; width?: number | null }>(photos: P[], names?: KindNames | null): P[] {
  const at = photos.map((p, i) => (p.src === 'commons' ? i : -1)).filter((i) => i >= 0);
  const sorted = at.map((i) => photos[i]).map((p, k) => ({ p, k, r: epithetRank(p.id, names), w: narrow(p) ? 1 : 0 })).sort((a, b) => a.r - b.r || a.w - b.w || a.k - b.k).map((x) => x.p);
  const out = photos.slice();
  at.forEach((i, k) => (out[i] = sorted[k]));
  return out;
}

type PhotoLike = { src?: string; id: string; url: string; thumb?: string; captive?: boolean; licence?: string; attribution: string; width?: number | null; categories?: readonly string[] | null; struck?: boolean | null };
const web = (u: string | undefined) => !!u && /^https?:\/\//i.test(u);

/**
 * The photographs a page shows and the index counts: a photograph whose address or thumbnail is not a web address left
 * out, and an iNaturalist photograph stored again from GBIF's media counted once, here and not only where the page reads
 * a dossier (round seventy; REVIEW-TRIAGE-69 C4: the index counted Albuca paradoxa's 8 photographs as 16); a Commons file
 * that is not a photograph of the species, or whose licence or author the rules do not read, left out; the rest with
 * Commons' credit cleaned and its licence re-read; Commons files holding the species' epithet first. Every other
 * source's photograph is left exactly as it is.
 */
export function shownPhotos<P extends PhotoLike>(photos: readonly P[], names?: KindNames | null): P[] {
  const out: P[] = [];
  const kept = oneCopyEach(photos.filter((p) => web(p.url) && web(p.thumb)));
  const inat = new Set(kept.map((p) => inatPhotoId(p.url)).filter((x): x is string => !!x));
  for (const p of kept) {
    if (p.src !== 'commons') out.push(p);
    else if (inat.has(commonsInatCopy(p.id) ?? '')) continue;
    else if (!commonsKind(p.id, names, { categories: p.categories, struck: p.struck, credit: p.attribution })) {
      const r = readCommonsPhoto(p);
      // An original upload's tile at Commons' largest width below its own, so no smaller slot loads the whole file (C7, R47-9).
      if (r) out.push(r.thumb ? { ...r, thumb: commonsTileOf(r.thumb, r.width) } : r);
    }
  }
  return commonsFirstByEpithet(out, names);
}

/**
 * The iNaturalist photograph a Commons file is a copy of, by the number iNaturalist2Commons and GBIF's imports end its
 * name with ("Agave multifilifera 328057104.jpg", "Euryops abrotanifolius 160732946.jpg"): where the dossier holds that
 * photograph from iNaturalist or GBIF, the Commons copy is the same photograph, shown and counted once (round 70b). A
 * Flickr number is in brackets and is not read.
 */
export const commonsInatCopy = (id: string): string | null => /[\s_](\d{6,9})\.(?:jpe?g|webp)$/i.exec(id)?.[1] ?? null;

/** The lead photograph of what is shown: the page's hero and the index's tile, by one rule (`heroOf`'s order of sources). */
export const leadOf = <P extends PhotoLike>(photos: readonly P[], names?: KindNames | null): P | undefined => heroOf(shownPhotos(photos, names));
