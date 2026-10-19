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
import { byId, type PageId } from '../core/page-id';
import { readCommonsPhoto } from './photo-credit';
import { heroOf, oneCopyEach, inatPhotoId, isSpecimenMedia } from './dedupe';
import { spellingKey } from './epithet';
import { commonsTileOf } from './photo-size';
import { ownNames as ownNamesRule } from './own-names';
import { authorsAgree, parentheticalAuthor, exAuthor, publishingAuthor } from './authors';
import { splitCommonsCredit } from './photo-credit';
import type { JsonFetcher, FetchResult } from './fetch';

/**
 * The names the reference holds, accepted and older, by genus (round seventy; REVIEW-TRIAGE-69 C1, S-C5, IND-4): what
 * tells an uploader's slip ("Mammillaria mabudae" for matudae) from another species one letter away ("Echinocereus
 * schereri" beside E. scheeri), and which capitalised words of a title are genera. Made from the index (`heldNamesOf`)
 * where the Worker reads a dossier and where the index is written. Without it no slip is read as the species', and only
 * the species' own genera are read.
 */
export interface HeldNames {
  /** The keys of the species holding this genus and epithet (by `spellingKey`) as their name or an older name of species rank; empty when none does. */
  holders(genus: string, epithet: string): readonly PageId[];
  /** Whether a name the reference holds, accepted or older, is of this genus. */
  hasGenus(genus: string): boolean;
  /** The epithets the reference holds in this genus, in lower case, as written. */
  epithets(genus: string): readonly string[];
  /** The key of the species whose accepted name this genus and epithet is (by `spellingKey`), or null (round seventy, second pass; REVIEW-TRIAGE-69 C6). */
  accepted(genus: string, epithet: string): PageId | null;
  /**
   * Whether a species of the reference has this genus in its accepted name (round seventy-two): "Cactus", "Croton",
   * "Bahia" and "Palma" are genera only of older names, and words of an English title or a place ("Pariette Cactus",
   * "Melocactus braunii Bahia Brasil"). Optional, for a hand-made `HeldNames`; absent, every genus counts as before.
   */
  acceptedGenus?(genus: string): boolean;
  /** The keys of the species holding this name below species (genus, epithet, last epithet) as an older name (round seventy-two). */
  infraHolders?(genus: string, epithet: string, infra: string): readonly PageId[];
}

/** The species' names a title is read against: its own and its older names, as the dossier keeps them (authors allowed); its key and the reference's names when known. */
export interface KindNames {
  scientific: string;
  synonyms?: readonly string[] | null;
  /** The page's id (round seventy-eight), which the reference's names (`held`) give their holders by. */
  key?: PageId;
  /** The page's GBIF key, which an uploader's slip is asked of GBIF by (`slipStanding`'s own key). */
  gbif?: number;
  held?: HeldNames | null;
  /** The species' author, which tells GBIF's second spelling of this name from another species (`slipStanding`). */
  authorship?: string | null;
  /**
   * What Kew's file says of the species' names (`name.kew`, A's offline Kew fill; round seventy-two, C4): its synonym
   * binomials, read as the species' own older names, and the stored older names Kew accepts as species of their own, no
   * longer read as the species'. Absent on a dossier the fill has not read: nothing is added or taken away.
   */
  kew?: { synonyms?: readonly string[] | null; acceptedElsewhere?: readonly string[] | null } | null;
}

/** The names a dossier's photographs are read against, as the page, the index and the fills read them (round seventy-two). */
export function kindNamesOf(d: { key?: PageId; ids?: { gbif?: number } | null; name?: { scientific: string; synonyms?: readonly string[] | null; authorship?: string | null; kew?: KindNames['kew'] } | null }, held?: HeldNames | null): KindNames | null {
  if (!d.name) return null;
  return { scientific: d.name.scientific, synonyms: d.name.synonyms ?? [], key: d.key, ...(d.ids?.gbif != null ? { gbif: d.ids.gbif } : {}), held, authorship: d.name.authorship ?? undefined, ...(d.name.kew ? { kew: d.name.kew } : {}) };
}

/**
 * What the read knows of one file's slips (self-review 70, S-C9): the names, in lower case, that the build or the fill
 * asked of Kew and GBIF and found to be this species' slips (`slips`, kept with the photograph). A slip not asked is not
 * the species': the Worker cannot ask Kew or GBIF when it reads a page, so the read is safe and the fill decides.
 */
type ReadCtx = { slips?: readonly string[] | null; asked?: string[] };

/** What `heldNamesOf` reads of an index entry: the accepted name and the older names the index carries (`syn`, `older`). */
export type HeldSource = { key: PageId; name: string; syn?: readonly string[] | null; older?: readonly string[] | null };

const heldMemo = new WeakMap<readonly HeldSource[], HeldNames>();
/** The reference's names from its index, made once an index (the Worker keeps one parsed index a minute). */
export function heldNamesOf(entries: readonly HeldSource[]): HeldNames {
  const known = heldMemo.get(entries);
  if (known) return known;
  const by = new Map<string, PageId[]>();
  const words = new Map<string, Set<string>>();
  const acc = new Map<string, PageId>();
  const accGenera = new Set<string>();
  const infra = new Map<string, PageId[]>();
  for (const e of entries) {
    const a = nameOf(e.name);
    if (a) accGenera.add(a.genus.toLowerCase());
    if (a && !a.infra) acc.set(`${a.genus.toLowerCase()} ${spellingKey(a.epithet)}`, e.key);
    for (const n of [e.name, ...(e.syn ?? []), ...(e.older ?? [])]) {
      const b = nameOf(n);
      if (!b) continue;
      const g = b.genus.toLowerCase();
      (words.get(g) ?? words.set(g, new Set()).get(g)!).add(b.epithet.toLowerCase());
      // An older name below species ("Babiana stricta var. purpurea") is held only whole: its first two words are another species' name (S-C6).
      if (b.infra) {
        const ik = `${g} ${spellingKey(b.epithet)} ${spellingKey(b.infra)}`;
        const is = infra.get(ik) ?? infra.set(ik, []).get(ik)!;
        if (!is.includes(e.key)) is.push(e.key);
        continue;
      }
      const k = `${g} ${spellingKey(b.epithet)}`;
      const ks = by.get(k) ?? by.set(k, []).get(k)!;
      if (!ks.includes(e.key)) ks.push(e.key);
    }
  }
  const out: HeldNames = {
    holders: (genus, epithet) => by.get(`${genus.toLowerCase()} ${spellingKey(epithet)}`) ?? [],
    hasGenus: (genus) => words.has(genus.toLowerCase()),
    epithets: (genus) => [...(words.get(genus.toLowerCase()) ?? [])],
    accepted: (genus, epithet) => acc.get(`${genus.toLowerCase()} ${spellingKey(epithet)}`) ?? null,
    acceptedGenus: (genus) => accGenera.has(genus.toLowerCase()),
    infraHolders: (genus, epithet, inf) => infra.get(`${genus.toLowerCase()} ${spellingKey(epithet)} ${spellingKey(inf)}`) ?? []
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

/** Words for a map or a range, in the languages Commons' uploaders use (self-review 70, S-C1). */
const MAP_WORDS = /\bdistribution\b|distribuzione|distribuci[oó]n|distribui[çc][ãa]o|verbreitung|\brange (?:of|map)\b|\bmaps?\b|\bmapa\b|\bcarte\b|\bkarte\b|\bkaart\b|\bkarta\b|\bareale?\b|\bareali\b|\bareaal\b|ареал|карта|verspreiding|rozšíření|rozmieszczenie|utbredning|levinneisyys/i;

/** Each kind of file that is not a photograph of the plant, by the words its title uses. Word-bounded, so "brewbooks" is not a book. */
const TITLE_KINDS: Array<[string, (t: string) => boolean]> = [
  // A map in any of the languages Commons' uploaders name ranges in: "Areale Boswellia papyrifera" (Italian) led its page
  // (self-review 70, S-C1); "mapa", "carte", "kaart", "karta", "ареал", "verspreiding", "rozšíření".
  ['a map', (t) => MAP_WORDS.test(t)],
  // The Smithsonian's sheets are named "<name>-NMNH-<barcode>" (Cyphostemma camerounense, Zanha golungensis; S-C3).
  ['a herbarium sheet', (t) => /herbari|holotyp|isotyp|lectotyp|syntyp|paratyp|neotyp|exsiccat|\(GBIF \d+\)|^COI\d|\bNMNH\b/i.test(t)],
  ['a herbarium sheet', (t) => /specimen/i.test(t) && (PRESSED.test(t) || !LIVING.test(t))],
  // A printed illustration: Popular Science Monthly's are named "PSM V<volume> D<page>" (Agave polyacantha; IND-1), and a
  // paper's figure is one too ("Phylogeny-of-the-plant-genus-Pachypodium-…-peerj-01-70-g001", which would lead Pachypodium windsorii).
  ['a plate or drawing', (t) => /phylogen|cladogram|\bdiagrams?\b|\bpeerj\b|curtis|botanical (?:magazine|register)|\btab\.\s*\d|\bplate\b|\bpl\.\s*\d|illustrat|drawing|engraving|lithograph|zeichnung|watercolou?r|\bpainting\b|biodiversity heritage library|\bPSM V\d|popular science monthly/i.test(t)],
  // A pod or a fruit on the plant is the plant; loose seed is not ("Tecomanthe Speciosa Seed Pod"; REVIEW-TRIAGE-69 C1).
  // An information board is no photograph of the plant ("Information board of Ernest Henry Wilson…" on Rhododendron kanehirae; round seventy-three).
  ['not the plant', (t) => /\bseeds?\b(?![\s-]*pods?\b)|\bsemillas?\b|\bsamen\b|\bresin\b|\bstamps?\b|\bpostage\b|\bbooks?\b|\blabel\b|\binformation boards?\b/i.test(t)],
  // An animal on the plant is a photograph of the animal ("Leaf-footed Bug nymphs … on Centaurea americana"; S-C3).
  // Singular words that also name plants ("bee balm", "butterfly bush", "moth orchid", "spider plant") are not read.
  ['an animal', (t) => /\bnymphs?\b|\blarvae?\b|\bcaterpillars?\b|\binsects?\b|\bbugs?\b|\bbeetles?\b|\bbutterflies\b|\bmoths\b|\bbees\b|\bwasps?\b|\baphids?\b|\bants\b|\bhoverfl(?:y|ies)\b|\bsnails?\b|\bspiders\b/i.test(t)],
  ['an unidentified plant', (t) => /\bunknown\b|\bunidentified\b|\bunbekannt|\bindet(?:ermined)?\b|\bsp\.(?:\s|$)|\bspp\.?(?:\s|$)/i.test(t)],
  ['not determined', (t) => /\b(?:aff|cf)\.(?:\s|$)|\b(?:aff|cf)\s+[a-z]/i.test(t)],
  // "hybrid" in a title marks a hybrid, as /about/how says (Nepenthes rhombicaulis; S-C4).
  ['a hybrid', (t) => /\bhybrids?\b/i.test(t)]
];

/**
 * A year from 1500 to 1899 in a title ("Dasylirion graminifolium Zuccarini 1843"; R47-3, C7), unless it is a camera's or a
 * catalogue's number ("IMG 1834", "DSC_1765", "No. 1612"), part of a longer number, or a citation's year after its page
 * ("… Ecklon- 19 (1827)", Motohiro Sunouchi's photographs of living bulbs). Since the self-review of round seventy (S-C8)
 * a year alone hides nothing: it marks a printed work only with other print evidence (`PRINT_HINT`), since a name's
 * protologue is cited by year in the titles of photographs of living plants.
 */
const OLD_YEAR = /(?<![\dA-Za-z.,:#-])(1[5-8]\d\d)(?![\d-])/;
/** What a number in a title follows when it is not a year: a camera's prefix, "No.", another number, or a collector's code of up to four letters ("VG 1815", "STO 1612"). */
const NUMBERED = /(?:\b(?:img|dsc[nf]?|pict?|cimg|sam|dcp|p|pb|pc|imag|photo|foto|no|nr|num|n°)|#|\d|\b[A-Z][A-Za-z]{0,3})[\s_.-]*$|\d[\s_:-]*\($/i;
/**
 * What else says a file is a printed work, beside a year (S-C8): words of a book or a plate in its title, a category of
 * scans or old works, or a licence Commons gives old works ("PD-old", "PD-Art", "PD-1923"). Any of these with a year
 * from 1500 to 1899 hides the file; a year alone does not.
 */
const PRINT_TITLE = /\b(?:fig|figs|figure|tab|tafel|taf|pl|plate|planche|icon|icones|flora|florae|hortus|scan|scanned|print|engraved|book|journal|magazine|vol|volume|page|seite|p\.\s*\d|bot\.\s*mag|bot\.\s*reg)\b/i;
const PRINT_CATEGORY = /\bscans?\b|scanned|historical images|old (?:books|prints|photographs)|\b1[5-8]\d\ds?\b|PD[- ]old|PD[- ]Art|PD[- ]1923|PD[- ]US[- ]expired|\bjournals?\b|\bbooks? (?:of|by|about)\b|herbals?\b/i;
const PRINT_LICENCE = /^PD-(?:old|Art|1923|US-expired|US-no-notice|scan)/i;
function printEvidence(title: string, cats: readonly string[], short: string): boolean {
  return PRINT_TITLE.test(title.replace(/\b1[5-8]\d\d\b/g, ' ')) || cats.some((c) => PRINT_CATEGORY.test(c)) || PRINT_LICENCE.test(short);
}
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
 * Commons' classes of places (round seventy-three): Boswellia papyrifera's only photograph and lead, "Giba near Gabat
 * outlet", is a river valley filed under "Rivers of Ethiopia"; Commiphora myrrha's, "Mirra nos Olivais de Quelemem", is
 * filed under "Plantations in Brazil" and shows a flowering shrub of another genus. Read only of a title that names no
 * plant (no binomial, none of the species' epithets): "HK Plants Shatin Shing Mun River White Flowers" is a photograph
 * of the flowers, and "Melocactus braunii Esteves type habitat" of the plant.
 */
const PLACE_CATEGORIES = /^(?:rivers|streams|valleys|canyons|gorges|mountains|lakes|waterfalls|landscapes|plantations)\s+(?:of|in)\b/i;
/**
 * Categories that say the same, for a new answer (`Categories` in `iiextmetadatafilter`) and for a stored file whose
 * categories were kept. Named narrowly: Commons files every geotagged photograph under "Pages with maps", so "maps" alone
 * would drop good photographs, and it files gardens' living plants as "Specimens in the Lyman Plant House" (S-C10), so
 * "specimens" is read only as a museum's or a herbarium's. A map of a place is a map ("Maps of Shiding District, New
 * Taipei", the category of "烏來杜鵑分布圖", a distribution map shown on Rhododendron kanehirae; round seventy-three).
 */
const CATEGORY_KINDS = /herbari|holotyp|isotyp|\b(?:preserved|pressed|dried|type|museum) specimens?\b|museum of natural history|natural history museum|distribution maps|range maps|locator maps|maps of the (?:range|distribution)|^maps of\b|illustrations\b|drawings|engravings|lithographs|botanical magazine|curtis|biodiversity heritage library|popular science monthly|\bplates\b|postage stamps|stamps of|plants on stamps|\bseeds\b|\bresins?\b|\bbooks\b|hybrids\b/i;

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
/** Capitalised words that begin a title and are no genus. */
const NOT_GENUS = new Set(['Comparison', 'Flowers', 'Flower', 'Plant', 'Plants', 'The', 'A', 'An', 'Detail', 'Close', 'View']);

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
  // An older name Kew accepts as a species of its own is that species', not this one's (round seventy-two, C4; A2).
  const apart = new Set((n.kew?.acceptedElsewhere ?? []).map((x) => { const b = nameOf(x); return b ? `${lower(b.genus)} ${spellingKey(b.epithet)}${b.infra ? ` ${spellingKey(b.infra)}` : ''}` : ''; }));
  const keyOf = (b: Name) => `${lower(b.genus)} ${spellingKey(b.epithet)}${b.infra ? ` ${spellingKey(b.infra)}` : ''}`;
  const older = [...(n.synonyms ?? []), ...(n.kew?.synonyms ?? [])].map(nameOf).filter((b): b is Name => !!b && !apart.has(keyOf(b)) && olderNameIsOwn(n, b));
  const seen = new Set<string>();
  return (first ? [first, ...older] : older).filter((b) => { const k = keyOf(b); if (seen.has(k)) return false; seen.add(k); return true; });
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
function readBinomial(genus: string, words: readonly string[], n: KindNames, own: readonly Name[], ctx: ReadCtx = {}): Verdict {
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
    // An uploader's slip is this species' only where the reference holds no such name and Kew and GBIF were asked and
    // accept no species of it (self-review 70, S-C9; `slipStanding`), as the build or the fill recorded. Until then, another plant.
    if (n.held && slip(e, b.epithet) && !heldElsewhere(n, genus, e)) {
      const name = `${lower(genus)} ${e}`;
      if (ctx.slips?.includes(name)) return 'own';
      if (ctx.asked && !ctx.asked.includes(name)) ctx.asked.push(name);
    }
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
function readings(raw: string, n: KindNames, ctx: ReadCtx = {}): Verdict[] {
  const own = ownNames(n);
  // A genus written in brackets after another, "Neoporteria(eriosyce) villosa" (R47-3, C7), is read as both names.
  const title = raw.replace(/\b([A-Z][a-z]+)\s?\(([a-z]{3,})\)\s*([a-z][a-z-]+)/g, (_, G: string, g: string, e: string) => `${G} ${e}, ${g[0].toUpperCase()}${g.slice(1)} ${e}`);
  const genera = new Map(own.map((b) => [lower(b.genus), b.genus]));
  const ownKeys = new Set(own.map((b) => spellingKey(b.epithet)));
  const heldIn = (genus: string, e: string) => /^[A-Z][a-z]+$/.test(genus) && !!n.held?.epithets(genus).includes(e);
  const tokens = [...title.matchAll(/[A-Za-z]+(?:-[a-z]+)*|×/g)].map((m) => ({ w: m[0], at: m.index!, end: m.index! + m[0].length }));
  const gap = (j: number) => title.slice(tokens[j - 1].end, tokens[j].at);
  /** The lower-case words that follow token i, through spaces, underscores and full stops: an epithet and what may follow it. */
  /** Tokens read as the epithet of a genus before them: never read again as a genus run on into a word (round seventy-two). */
  const used = new Set<number>();
  const after = (i: number) => {
    const out: string[] = [];
    let first = -1;
    const keep = (j: number, w: string) => { if (first < 0) first = j; out.push(w); };
    for (let j = i + 1; j < tokens.length && out.length < 3; j++) {
      if (!/^[\s_.]*$/.test(gap(j)) || (j === i + 1 && !gap(j))) break;
      if (out.length === 0 && (tokens[j].w === '×' || tokens[j].w === 'x')) continue;
      // An epithet written with a capital, the species' own ("Aizoaceae Gibbaeum Dispar", "Haworthia Semiviva"; S-C6) or
      // one the reference holds in this genus ("Lithops Karasmontana"), is read as written small.
      if (out.length === 0 && /^[A-Z][a-z-]+$/.test(tokens[j].w) && (ownKeys.has(spellingKey(lower(tokens[j].w))) || heldIn(tokens[i].w, lower(tokens[j].w)))) { keep(j, lower(tokens[j].w)); continue; }
      if (!/^[a-z][a-z-]*$/.test(tokens[j].w)) break;
      keep(j, tokens[j].w);
    }
    return Object.assign(out, { first });
  };
  /**
   * Whether a genus named alone is another plant in the picture (round seventy-two): only a genus of an accepted name of
   * the reference ("Cactus", "Croton", "Bahia" are genera of older names only, and "Pariette Cactus", "Chinese Croton",
   * "Melocactus braunii Bahia Brasil" are English or a place), and not the last word of an English name before it
   * ("Autumn Crocus (Meadow Saffron)" on Colchicum neapolitanum, "Golden Lotus Banana (Ensete lasiocarpum)").
   */
  const bareCounts = (i: number) => {
    const w = tokens[i].w;
    if (n.held?.acceptedGenus && !n.held.acceptedGenus(w)) return false;
    const prev = i > 0 && /^[ \t]+$/.test(gap(i)) ? tokens[i - 1].w : '';
    return !(/^[A-Z][a-z]+$/.test(prev) && !n.held?.hasGenus(prev) && !genera.has(lower(prev)));
  };
  const out: Verdict[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (used.has(i)) continue;
    const w = tokens[i].w;
    const g = lower(w);
    const isOwn = genera.has(g) && (w === g || w === genera.get(g));
    const isRef = !isOwn && /^[A-Z][a-z]+$/.test(w) && !!n.held?.hasGenus(w);
    if (isOwn || isRef) {
      const next = after(i);
      const v = readBinomial(genera.get(g) ?? w, next, n, own, ctx);
      if (v) { out.push(v); if (next.first >= 0) used.add(next.first); }
      // Another genus of the reference named alone is another plant in the picture ("… and Yucca"; R47-3, C7).
      // A word that is also the species' own epithet is the species named by its epithet ("Pachyphytum 120221" on Dudleya pachyphytum).
      else if (isRef && !next.length && BARE_GENUS && !own.some((b) => spellingKey(b.epithet) === spellingKey(w)) && bareCounts(i)) out.push('another');
      continue;
    }
    // A name with a rank in a genus neither the species' nor the reference's ("… and Osteomeles anthyllidifolia var.
    // subrotunda", Zanthoxylum beecheyanum's lead; self-review 70, S-C3) is another plant: a rank word makes it a name.
    if (/^[A-Z][a-z]{2,}$/.test(w) && !NOT_GENUS.has(w)) {
      const next = after(i);
      if (next.length >= 3 && LATIN_END.test(next[0]) && !NOT_EPITHET.has(next[0]) && RANK.test(next[1]) && LATIN_END.test(next[2])) { out.push('another'); continue; }
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
      const v = [...genera.values()].filter((x) => x[0] === w).map((x) => readBinomial(x, after(i), n, own, ctx));
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
function categorySpecies(raw: string, n: KindNames, own: readonly Name[]): { id: string; epithet: string } | null {
  // Commons' diffused forms name the species too (self-review 70, S-C7): "Lithops karasmontana in cultivation", "… in
  // Spain", "… (flowers)", "Flowers of Lithops karasmontana", "Lithops karasmontana - fruits".
  const c = raw.trim().replace(/^(?:flowers|fruits?|leaves|seeds|seedlings|inflorescences?|habit|plants|specimens|cones|bark|stems?|roots?) of /i, '').replace(/\s+\([^)]*\)$/, '').replace(/\s+-\s+[a-z][a-z ]*$/, '').replace(/ (?:in|at|from|on) [A-Z0-9].*$| in (?:cultivation|habitat|the wild|gardens?|pots?)$/, '');
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
export type CommonsMeta = {
  categories?: readonly string[] | null;
  struck?: boolean | null;
  /** The stored credit line ("X, CC BY-SA 3.0, via Wikimedia Commons") or a new answer's Artist field. */
  credit?: string | null;
  /** Commons' short licence name, for a new answer (a stored file's is in its credit line). */
  licence?: string | null;
  /** The slips of this species' epithet the build or the fill found to be this species' (`Photo.slips`; S-C9). */
  slips?: readonly string[] | null;
  /** What the file's source or description says it is (`sourceKind`, kept as `Photo.kind`; S-C2). */
  kind?: string | null;
  /** Whether its description names the species under one of its own names (`describesSpecies`, kept as `Photo.described`; round seventy-three). */
  described?: boolean | null;
};

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
  if (m.kind) return m.kind;
  const n: KindNames = names ?? { scientific: '' };
  const own = ownNames(n);
  if (isHybrid(title, own)) return 'a hybrid';
  const read = readings(title, n, { slips: m.slips });
  if (read.includes('another')) return 'named as another species';
  // Unless its description names the species itself, which outweighs a bare epithet ("Heterodoxa pt12", described as
  // "Heliamphora heterodoxa 'Ptari Tepui' (now known as Heliamphora purpurascens)"). Until the description is read, left out.
  if (!read.length && m.described !== true && sisterEpithetOnly(title, n, own)) return 'named as another species';
  const cats = m.categories ?? [];
  const cat = cats.find((c) => CATEGORY_KINDS.test(c) || unidentifiedPlant(c, n, own));
  if (cat) return `filed under "${cat}"`;
  // A title that names no plant, filed by Commons as a place, is a photograph of the place (round seventy-three).
  const place = !read.length && titleRank(title, own) === 2 ? cats.find((c) => PLACE_CATEGORIES.test(c)) : undefined;
  if (place) return `filed under "${place}"`;
  // A year from 1500 to 1899 marks a printed work only with other print evidence (S-C8).
  if (oldYear(title) && printEvidence(title, cats, m.licence ?? splitCommonsCredit(m.credit ?? '')?.short ?? '')) return 'a plate or drawing';
  const names_ = read.includes('own') || epithetRank(id, n) < 2;
  const animal = cats.find((c) => ANIMAL_CATEGORIES.test(c) || ZOO_FAMILY.test(c));
  if (animal && !names_) return `filed under "${animal}"`;
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
    // The title must name the species as a name (a binomial read as its own), not hold its epithet's first letters at the
    // start of any word ("Vertical garden" on Aloe vera; self-review 70, S-C6).
    if (!read.includes('own') || others.length) return `filed under ${species.size} species: a group`;
  }
  // "Centaurea sp. ~~C. nuttallii~~": the describer struck the name out (S-C3).
  if (m.struck) return 'its description strikes out a name';
  return null;
}


/**
 * Whether a title that names no binomial holds, as a word of its own, the epithet of another species the reference
 * accepts in one of the species' own genera, and none of the species' own epithets (round seventy-three): "Heterodoxa
 * pt12", filed under Heliamphora purpurascens, names Heliamphora heterodoxa, another page of the reference, and was
 * purpurascens' only photograph and its lead. Such a title is read as that species, as a binomial naming it would be.
 * "Benstonei domei" on Nepenthes domei holds the species' own epithet, and is not read; a word that is a genus, an
 * English word, or one of the words that follow a genus without naming a species never counts.
 */
function sisterEpithetOnly(title: string, n: KindNames, own: readonly Name[]): boolean {
  const held = n.held;
  if (!held || n.key == null || titleRank(title, own) < 2) return false;
  const genera = [...new Set(own.map((b) => b.genus))];
  const mine = new Set(own.map((b) => spellingKey(lower(b.epithet))));
  for (const m of title.matchAll(/[A-Za-z]+/g)) {
    const w = m[0];
    if (w.length < 4 || !/^[A-Za-z][a-z]+$/.test(w)) continue;
    const e = lower(w);
    if (NOT_EPITHET.has(e) || ENGLISH.test(e) || mine.has(spellingKey(e)) || held.hasGenus(`${e[0].toUpperCase()}${e.slice(1)}`)) continue;
    if (genera.some((G) => { const k = held.accepted(G, e); return k != null && k !== n.key; })) return true;
  }
  return false;
}

/**
 * Whether a file's title is left out only for naming a sister species' bare epithet (`sisterEpithetOnly`), so its
 * description is worth reading (round seventy-three): the build and `--fill commons-kind` read it for these files alone.
 */
export function sisterEpithetTitle(id: string, names?: KindNames | null): boolean {
  if (!names) return false;
  const title = commonsTitle(id);
  return !readings(title, names).length && sisterEpithetOnly(title, names, ownNames(names));
}
/** Whether a Commons description names the species under one of its own names, read by the title rules (`readings`). */
export function describesSpecies(description: string | null | undefined, names?: KindNames | null): boolean {
  if (!names || !description) return false;
  const text = description.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ');
  return readings(text, names).includes('own');
}

/** 0 when the title holds the species' own epithet, 1 an older name's, 2 neither (a camera's name, "DSC_1234"). */
export function epithetRank(id: string, names?: KindNames | null): number {
  return titleRank(commonsTitle(id), ownNames(names));
}
function titleRank(title: string, b: readonly Name[]): number {
  const t = title.toLowerCase();
  // An older name below species is held by its last epithet (S-C6).
  // A name run together ("Nepenthesdubia1", "Nepspectabilis") holds its epithet too: after the genus or a start of it (R47-2, C6).
  // A word holds the epithet when it is the epithet in another spelling, begins with it whole, or, for an epithet of five
  // letters' stem or more, begins with its stem and adds at most three letters: "Vertical" does not hold Aloe vera's
  // "ver", nor "Milk" Euphorbia milii's "mil" (self-review 70, S-C6).
  const words = t.split(/[^a-z-]+/).map((w) => w.replace(/^-+|-+$/g, '')).filter(Boolean);
  const holds = (x: Name) => {
    const g = x.genus.toLowerCase();
    const e = lower(x.infra ?? x.epithet);
    const k = spellingKey(e);
    const st = stem(e);
    const is = (w: string) => !!w && (spellingKey(w) === k || w.startsWith(e) || (st.length >= 5 && w.startsWith(st) && w.length <= e.length + 3));
    return words.some((w) => is(w) || Array.from({ length: g.length - 2 }, (_, j) => g.slice(0, j + 3)).some((pre) => w.startsWith(pre) && is(w.slice(pre.length))));
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
export function commonsFirstByEpithet<P extends { src?: string; id: string; width?: number | null; judged?: Judged | null }>(photos: P[], names?: KindNames | null): P[] {
  const at = photos.map((p, i) => (p.src === 'commons' ? i : -1)).filter((i) => i >= 0);
  const sorted = at.map((i) => photos[i]).map((p, k) => ({ p, k, r: stored(p, names) ? p.judged!.rank : epithetRank(p.id, names), w: narrow(p) ? 1 : 0 })).sort((a, b) => a.r - b.r || a.w - b.w || a.k - b.k).map((x) => x.p);
  const out = photos.slice();
  at.forEach((i, k) => (out[i] = sorted[k]));
  return out;
}

type PhotoLike = { src?: string; id: string; url: string; thumb?: string; captive?: boolean; licence?: string; attribution: string; width?: number | null; categories?: readonly string[] | null; struck?: boolean | null; slips?: readonly string[] | null; inat?: string | null; specimen?: boolean; kind?: string | null; shared?: readonly PageId[] | null; described?: boolean | null; judged?: Judged | null };

/* ---------- The judgement stored by the build (round seventy-six) ---------- */

/** What the rules made of a Commons file with the reference's names, as `--index` stores it (`Photo.judged`). */
export type Judged = { not?: string; rank: number };
/**
 * Whether a file is read by its stored judgement: where no names of the reference are given (the Worker, since round
 * seventy-six, reads a page without them) and the build stored one. Where names are given, the rules run again.
 */
const stored = (p: { judged?: Judged | null }, names?: KindNames | null) => !names?.held && !!p.judged && typeof p.judged.rank === 'number';
/** A Commons file as `commonsKind` reads it: its stored categories, struck, credit, slips, kind and description. */
const metaOf = (p: PhotoLike): CommonsMeta => ({ categories: p.categories, struck: p.struck, credit: p.attribution, slips: p.slips, kind: p.kind, described: p.described });
/** The judgement of a Commons file with the names given (the reference's among them), as `--index` writes it. */
export function judgeOf(p: PhotoLike, names: KindNames): Judged {
  const not = commonsKind(p.id, names, metaOf(p));
  return not ? { not, rank: epithetRank(p.id, names) } : { rank: epithetRank(p.id, names) };
}
/**
 * Every Commons file of a dossier judged with the names given and the judgement written on it (`--index`; round
 * seventy-six); a file of another source carries none. Whether anything changed.
 */
export function judgePhotos(photos: Array<PhotoLike & { judged?: Judged }>, names: KindNames): boolean {
  let changed = false;
  for (const p of photos) {
    if (p.src !== 'commons') { if (p.judged) { delete p.judged; changed = true; } continue; }
    const j = judgeOf(p, names);
    if (p.judged?.not !== j.not || p.judged?.rank !== j.rank || (p.judged && Object.keys(p.judged).length !== Object.keys(j).length)) { p.judged = j; changed = true; }
  }
  return changed;
}
const web = (u: string | undefined) => !!u && /^https?:\/\//i.test(u);
/**
 * iNaturalist's stand-in for a photograph it has not processed (`/attachment_defaults/local_photos/large.png`): a grey
 * placeholder, not a photograph of anything, on a host the page's policy does not allow (www.inaturalist.org), so it
 * showed as "did not load" in Pseudophoenix sargentii's gallery and counted among its photographs (round seventy-two, F8).
 */
export const placeholderPhoto = (u: string | undefined) => !!u && /\/attachment_defaults\//.test(u);

/**
 * An iNaturalist or GBIF credit with any e-mail address taken out (round seventy-two, C10): three credits (two pages)
 * published an address as the author. Null when no author is left under CC BY or CC BY-SA, which is then not published (rule 4); the line unchanged when it holds
 * no address. Commons' credits are read by `readCommonsPhoto`, which already drops an address.
 */
export function creditWithoutMail(p: { src?: string; licence?: string; attribution: string }): string | null {
  if (!MAIL_IN.test(p.attribution)) return p.attribution;
  const needsAuthor = p.licence === 'by' || p.licence === 'by-sa';
  const inat = /^\(c\)\s*(.*?)(,\s*(?:some|all|no) rights reserved.*)$/i.exec(p.attribution);
  const gbif = /^(.*?)(,\s*(?:CC0|CC BY-SA|CC BY|Public domain)\b.*)$/i.exec(p.attribution);
  const m = p.src === 'inat' ? inat : p.src === 'gbif' ? gbif : (inat ?? gbif);
  if (!m) return needsAuthor ? null : p.attribution.replace(MAIL_ALL, ' ').replace(/\s+/g, ' ').trim();
  const who = withoutMail(m[1]);
  if (!who) return needsAuthor ? null : `${m === inat ? '(c) author not stated' : 'author not stated'}${m[2]}`;
  return `${m === inat ? '(c) ' : ''}${who}${m[2]}`;
}
const MAIL_IN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const MAIL_ALL = /\s*[<(]?\s*(?:mailto:)?[\w.+-]+@[\w-]+(?:\.[\w-]+)+\s*[>)]?/g;
const withoutMail = (s: string) => s.replace(MAIL_ALL, ' ').replace(/\s+/g, ' ').replace(/^[\s,;]+|[\s,;]+$/g, '').trim();

/** One photograph however a dossier holds it: iNaturalist's photo id (from iNaturalist or through GBIF), a Commons title, else its address. */
export const photoIdentity = (p: { src?: string; id: string; url: string }): string => { const i = inatPhotoId(p.url); return i ? `inat:${i}` : p.src === 'commons' ? `commons:${p.id}` : `url:${p.url}`; };

/**
 * Photographs two or more species' pages would show (round seventy-two, C5): the same iNaturalist photograph attached to
 * two observations of different plants (cut twigs of several species led Sassafras albidum), and survey-plot photographs
 * a council filed under the occurrences of three species. Written by `--index` as `shared` (the other pages' keys) on
 * each such photograph, which no page then shows. `shown` is each dossier's photographs as the page reads them without
 * the mark. Returns, by key, the identities to mark with the other keys.
 *
 * Round seventy-three: one iNaturalist observation that one page holds from iNaturalist and another only through GBIF,
 * where GBIF's backbone filed it under the second page by one of its older names that Kew accepts as the first page's
 * species (`name.kew.acceptedElsewhere`), is the first page's: it is marked, and hidden, on the second page only. Seven
 * photographs of Adenia gummifera (iNaturalist's "Adenia gummifera gummifera", Kew's A. gummifera var. gummifera) reached
 * Adenia cissampeloides through GBIF, which holds "Adenia gummifera (Harv.) Harms" as its synonym; Kew accepts it apart.
 */
type SharedPage = { key: PageId; name?: { scientific: string; kew?: { acceptedElsewhere?: readonly string[] | null } | null } | null; photos: ReadonlyArray<{ src?: string; id: string; url: string }> };
export function sharedPhotos(shown: ReadonlyArray<SharedPage>): Map<PageId, Map<string, PageId[]>> {
  const holders = new Map<string, Set<PageId>>();
  const via = new Map<string, string>(); // `${key} ${identity}` → the sources the page holds it from
  for (const d of shown) for (const p of d.photos) {
    const k = photoIdentity(p);
    (holders.get(k) ?? holders.set(k, new Set()).get(k)!).add(d.key);
    via.set(`${d.key} ${k}`, `${via.get(`${d.key} ${k}`) ?? ''} ${p.src ?? ''}`);
  }
  const page = new Map(shown.map((d) => [d.key, d]));
  const binOf = (n: string) => { const b = nameOf(n); return b && !b.infra ? `${lower(b.genus)} ${spellingKey(b.epithet)}` : null; };
  /** Whether page `b`, holding the photograph only through GBIF, holds it by an older name Kew accepts as page `a`'s species, which holds it from iNaturalist. */
  const filedUnder = (id: string, a: PageId, b: PageId) => {
    const pa = page.get(a), pb = page.get(b);
    if (!pa?.name || !pb?.name || !id.startsWith('inat:')) return false;
    const fromA = (via.get(`${a} ${id}`) ?? '').split(' '), fromB = (via.get(`${b} ${id}`) ?? '').split(' ').filter(Boolean);
    const mine = binOf(pa.name.scientific);
    return fromA.includes('inat') && fromB.every((s) => s === 'gbif') && !!mine && (pb.name.kew?.acceptedElsewhere ?? []).some((x) => binOf(x) === mine);
  };
  const out = new Map<PageId, Map<string, PageId[]>>();
  for (const [id, keys] of holders) {
    if (keys.size < 2) continue;
    const ks = [...keys];
    const owner = ks.length === 2 ? ks.find((a) => filedUnder(id, a, ks.find((b) => b !== a)!)) : undefined;
    for (const k of keys) {
      if (k === owner) continue;
      (out.get(k) ?? out.set(k, new Map()).get(k)!).set(id, ks.filter((x) => x !== k).sort(byId));
    }
  }
  return out;
}
/** A dossier's photographs with `shared` written from `sharedPhotos` (set, changed or removed); whether anything changed. */
export function markShared(photos: Array<{ src?: string; id: string; url: string; shared?: PageId[] }>, marks: Map<string, PageId[]> | undefined): boolean {
  let changed = false;
  for (const p of photos) {
    const want = marks?.get(photoIdentity(p));
    const had = p.shared;
    if (want?.length) { if (!had || had.join(',') !== want.join(',')) { p.shared = want; changed = true; } }
    else if (had) { delete p.shared; changed = true; }
  }
  return changed;
}

/**
 * The photographs a page shows and the index counts: a photograph whose address or thumbnail is not a web address left
 * out, and an iNaturalist photograph stored again from GBIF's media counted once, here and not only where the page reads
 * a dossier (round seventy; REVIEW-TRIAGE-69 C4: the index counted Albuca paradoxa's 8 photographs as 16); a Commons file
 * that is not a photograph of the species, or whose licence or author the rules do not read, left out; the rest with
 * Commons' credit cleaned and its licence re-read; Commons files holding the species' epithet first. Every other
 * source's photograph is left exactly as it is.
 */
export function shownPhotos<P extends PhotoLike>(photos: readonly P[], names?: KindNames | null, o: { shared?: boolean } = {}): P[] {
  const out: P[] = [];
  // GBIF media of a herbarium sheet, a museum's drawing or a micrograph (a record that is not an observation of the living
  // plant, `specimen`, or an image on a herbarium's own host) is not shown (self-review 70, S-C4; REVIEW-TRIAGE-70).
  // iNaturalist's placeholder is no photograph (F8); one that two species' pages hold is shown on neither (C5; `o.shared`
  // false reads the photographs as if unmarked, for `--index` to mark them).
  const kept = oneCopyEach(photos.filter((p) => web(p.url) && web(p.thumb) && !placeholderPhoto(p.url) && !placeholderPhoto(p.thumb) && !isSpecimenMedia(p) && (o.shared === false || !p.shared?.length)));
  const inat = new Set(kept.map((p) => inatPhotoId(p.url)).filter((x): x is string => !!x));
  for (const p of kept) {
    if (p.src !== 'commons') {
      // An e-mail address is never published as an author (C10).
      const credit = creditWithoutMail(p);
      if (credit === p.attribution) out.push(p);
      else if (credit) out.push({ ...p, attribution: credit });
    }
    // A Commons copy of an iNaturalist photograph the page holds: by the number its name ends with, or by the photograph
    // its source names (`inat`, kept by the build and the fill; self-review 70, S-C5).
    else if (inat.has(commonsInatCopy(p.id) ?? '') || (p.inat && inat.has(p.inat))) continue;
    else if (!(stored(p, names) ? (p.judged!.not ?? null) : commonsKind(p.id, names, metaOf(p)))) {
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
 * Flickr number is in brackets and is not read. A crop keeps its number ("Othonna cakilifolia 23242119 (cropped)"), and a
 * camera's time is no number ("…20220416_120706"; self-review 70, S-C5).
 */
export const commonsInatCopy = (id: string): string | null => /(?<![\d_])[\s_](\d{6,9})(?:[\s_]*\((?:cropped|crop|edited|rotated)\))?\.(?:jpe?g|webp)$/i.exec(id)?.[1] ?? null;

/** The lead photograph of what is shown: the page's hero and the index's tile, by one rule (`heroOf`'s order of sources). */
export const leadOf = <P extends PhotoLike>(photos: readonly P[], names?: KindNames | null): P | undefined => heroOf(shownPhotos(photos, names));

/**
 * What a Commons file's source (`Credit`) and description say it is, when that is not a photograph of the living plant
 * (self-review 70, S-C2): a file whose source is a herbarium's or a museum's specimen record ("Commiphora myrrha.jpg",
 * whose source is the Smithsonian's botany collection and whose description reads "Commiphora myrrha specimen from the
 * Smithsonian National Museum of Natural History"), or whose description calls it a herbarium or pressed specimen. Read
 * where Commons answers (the build, `--fill commons-kind`) and kept with the photograph as `kind`, which the read obeys.
 */
const SPECIMEN_SOURCE = /collections\.nmnh\.si\.edu\/search\/botany|sweetgum\.nybg\.org|specimens\.kew\.org|plants\.jstor\.org|oxalis\.br\.fgov\.be|mediaphoto\.mnhn\.fr|herbarium|herbier|herbar|data\.rbge\.org\.uk\/herb|\/specimens?\//i;
const SPECIMEN_WORDS = /\b(?:herbarium|pressed|mounted|dried|type|voucher)\s+(?:specimens?|sheets?)\b|\bspecimens?\s+(?:from|in|of)\s+(?:the\s+)?[^.]{0,80}?\b(?:herbarium|herbier)\b|\bherbarium sheet\b/i;
/**
 * A specimen "in the … Museum" is a sheet only where the description also says pressed, mounted, dried, preserved or
 * herbarium, or the museum is one of natural history (round seventy-two, C8): Agave titanota's "specimen in the Food and
 * Agriculture Museum" is a living plant on show, hidden as a herbarium sheet; Commiphora myrrha's "specimen from the
 * Smithsonian National Museum of Natural History" stays a sheet.
 */
const MUSEUM_SPECIMEN = /\bspecimens?\s+(?:from|in|of)\s+(?:the\s+)?[^.]{0,80}?\bmuseum\b/i;
const MUSEUM_SHEET = /\b(?:pressed|mounted|dried|preserved|herbari\w*|natural history)\b/i;
export function sourceKind(credit?: string | null, description?: string | null): string | null {
  if (SPECIMEN_SOURCE.test(credit ?? '')) return 'a herbarium sheet (by its source)';
  const text = (description ?? '').replace(/<[^>]+>/g, ' ');
  if (SPECIMEN_WORDS.test(text) || (MUSEUM_SPECIMEN.test(text) && MUSEUM_SHEET.test(text))) return 'a herbarium sheet (by its description)';
  return null;
}
/**
 * The version of `sourceKind`'s reading of a description, kept with a photograph `--fill commons-kind` has read
 * (`Photo.kindRule`; round seventy-seven). Raise it with any change to the description rules above: a file left out by
 * its description under an older version is then asked again, once.
 */
export const SOURCE_KIND_RULE = 72;

/* ---------- The slip guard, shared with iNaturalist (self-review 70, S-B7, S-C9, S-F13) ---------- */

/**
 * The names of a title that are this species' only as an uploader's slip of its epithet, and so wait for Kew's and
 * GBIF's word (`slipStanding`) before the file is shown: "mammillaria mabudae" for Mammillaria matudae. The build and
 * `--fill commons-kind` ask for each and keep the ones that stand as `Photo.slips`.
 */
export function slipsToAsk(id: string, names: KindNames, slips?: readonly string[] | null): string[] {
  const asked: string[] = [];
  readings(commonsTitle(id), names, { slips, asked });
  return asked.filter((x) => !(slips ?? []).includes(x));
}

/** A row of Kew's WCVP as GBIF serves its copy (dataset f382f0ce-…), as far as the guard reads it. */
export type KewNameRow = { canonicalName?: string; scientificName?: string; authorship?: string; taxonomicStatus?: string; rank?: string; accepted?: string };
/** GBIF's backbone match of a name (`/species/match`), as far as the guard reads it. */
export type GbifNameMatch = { matchType?: string; status?: string; rank?: string; usageKey?: number; speciesKey?: number; acceptedUsageKey?: number; canonicalName?: string; scientificName?: string; authorship?: string };
/** The species a slip is read against: its accepted name and author, its GBIF key, and its own names. */
export type SlipOwn = { scientific: string; authorship?: string | null; key?: number; synonyms?: readonly string[] | null };

const bin = (x?: string) => (x ?? '').trim().split(/\s+/).slice(0, 2).join(' ').toLowerCase();
const authorOf = (m: { scientificName?: string; canonicalName?: string; authorship?: string }) => m.authorship ?? (m.scientificName && m.canonicalName && m.scientificName.startsWith(m.canonicalName) ? m.scientificName.slice(m.canonicalName.length).trim() : '');

/**
 * Whether a name one slip from this species' epithet is this species', by what Kew and GBIF say of it (self-review 70;
 * REVIEW-TRIAGE-70, "Slips and sisters"). A name Kew or GBIF accepts as a species is another plant, never a slip:
 *   - Kew accepts it as a species, or holds it as a synonym of a name not this species': another plant (Ceropegia
 *     mariae, Kew's synonym of Echidnopsis scutellata, is not Ceropegia maritae; Salvia aurea is not Salvia azurea);
 *   - Kew holds it as a synonym of this species: this species';
 *   - GBIF matches it exactly: this species' when GBIF files it under this species' key, or when GBIF's record is the same
 *     name by the same author written another way (GBIF keeps "Othonna cakilifolia DC." and "Echinocereus chisosensis
 *     W.T.Marshall" as accepted beside the right spellings, the same names by the same authors: one name, ICN Art. 61);
 *     another species otherwise, accepted or not (Conophytum auctum Rawé);
 *   - neither holds it: a slip, this species'.
 * Pure: the caller asks the sources (`askSlip` does). `own.authorship` must be stated for GBIF's second spelling to count.
 */
export function slipStanding(name: string, own: SlipOwn, kew: readonly KewNameRow[], gbif: GbifNameMatch | null, gbifAccepted?: GbifNameMatch | null): { own: boolean; why: string } {
  const n = bin(name);
  const ownNames = new Set([own.scientific, ...(own.synonyms ?? [])].map(bin));
  const rows = kew.filter((r) => bin(r.canonicalName ?? r.scientificName) === n && !/misapplied/i.test(r.taxonomicStatus ?? ''));
  const acc = rows.find((r) => /^accepted$/i.test(r.taxonomicStatus ?? '') && (!r.rank || /^species$/i.test(r.rank)));
  if (acc) return { own: false, why: `Kew accepts ${acc.scientificName ?? name} as a species` };
  const elsewhere = rows.find((r) => r.accepted && !ownNames.has(bin(r.accepted)));
  if (elsewhere) return { own: false, why: `Kew holds ${elsewhere.scientificName ?? name} as a synonym of ${elsewhere.accepted}` };
  if (rows.some((r) => r.accepted && ownNames.has(bin(r.accepted)))) return { own: true, why: `Kew holds ${name} as a synonym of this species` };
  if (gbif && gbif.matchType === 'EXACT' && bin(gbif.canonicalName) === n) {
    if (own.key != null && (gbif.speciesKey === own.key || gbif.acceptedUsageKey === own.key || gbif.usageKey === own.key)) return { own: true, why: `GBIF holds ${name} as this species` };
    // Round seventy-two: GBIF's record is one of this species' names (its accepted name or an older one) by the same
    // author, spelt otherwise (ICN Art. 61), whatever GBIF's status for it: GBIF keeps "Parodia leninghausii (F.Haage)
    // F.H.Brandt" as a species beside "Parodia lenninghausii (F.Haage) F.H.Brandt ex Eggli & Hofacker", and "Brachystelma
    // barberiae Harv." as a synonym of a doubtful record, beside this species' older name "Brachystelma barberae Harv.".
    const spelt = speltOtherwise(gbif, own);
    if (spelt) return { own: true, why: `GBIF's ${gbif.scientificName ?? name} is ${spelt}, by its own author, spelt otherwise` };
    // And a GBIF synonym of such a record (Notocactus leninghausii, GBIF's synonym of Parodia leninghausii).
    const via = gbifAccepted && gbifAccepted.usageKey === gbif.acceptedUsageKey ? speltOtherwise(gbifAccepted, own) : null;
    if (via) return { own: true, why: `GBIF holds ${gbif.scientificName ?? name} as a synonym of ${gbifAccepted!.scientificName}, which is ${via}, spelt otherwise` };
    const theirs = authorOf(gbif);
    if (/^accepted$/i.test(gbif.status ?? '') && /^species$/i.test(gbif.rank ?? '') && authorsAgree(theirs, own.authorship ?? undefined)) return { own: true, why: `GBIF's ${gbif.scientificName ?? name} is this species' name by its own author, spelt otherwise` };
    return { own: false, why: `GBIF holds ${gbif.scientificName ?? name} as ${/^accepted$/i.test(gbif.status ?? '') ? 'a species' : `${(gbif.status ?? 'a name').toLowerCase()} of another species`}` };
  }
  return { own: true, why: `neither Kew nor GBIF holds ${name}: a slip of this species' epithet` };
}

/**
 * Two citations of one author (round seventy-two): `authorsAgree`, or the same basionym author and an "A ex B" cited by
 * its first author alone, "(F.Haage) F.H.Brandt" for "(F.Haage) F.H.Brandt ex Eggli & Hofacker" (ICN Art. 46.4).
 */
function sameAuthor(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  if (authorsAgree(a, b)) return true;
  if (parentheticalAuthor(a) !== parentheticalAuthor(b)) return false;
  const ea = exAuthor(a), eb = exAuthor(b);
  return (!!ea && ea === publishingAuthor(b)) || (!!eb && eb === publishingAuthor(a));
}

/** Which of the species' names a GBIF record is, in the same genus, its epithet the same or one slip apart, by the same author; null when none. */
function speltOtherwise(m: GbifNameMatch, own: SlipOwn): string | null {
  const name = nameOf((m.canonicalName ?? '').trim());
  if (!name || name.infra) return null;
  const author = authorOf(m);
  const names: Array<{ full: string; n: Name; author?: string | null }> = [];
  const self = nameOf(own.scientific);
  if (self && !self.infra) names.push({ full: 'this species\' name', n: self, author: own.authorship });
  for (const s of own.synonyms ?? []) {
    const b = nameOf(s);
    if (!b || b.infra) continue;
    names.push({ full: `its older name ${b.genus} ${b.epithet}`, n: b, author: s.trim().split(/\s+/).slice(2).join(' ') || null });
  }
  const hit = names.find((x) => lower(x.n.genus) === lower(name.genus) && (lower(x.n.epithet) === lower(name.epithet) || slip(x.n.epithet, name.epithet)) && sameAuthor(author, x.author));
  return hit ? hit.full : null;
}

const WCVP_DATASET = 'f382f0ce-323a-4091-bb9f-add557f3a9a2';
/**
 * `slipStanding`, asked of the sources: GBIF's backbone (strict, so a slip is not matched to the name it slips from) and
 * GBIF's copy of Kew's WCVP, two requests. For the build and `--fill commons-kind`, and for `sources/inat.ts`'s follow
 * step, which calls it with the name iNaturalist gives (B's need). A refusal or an error is returned as it is: nothing
 * is taken on a source that did not answer.
 */
export async function askSlip(f: JsonFetcher, name: string, own: SlipOwn): Promise<FetchResult<{ own: boolean; why: string }>> {
  const k = await f<{ results?: KewNameRow[] }>(`https://api.gbif.org/v1/species?datasetKey=${WCVP_DATASET}&name=${encodeURIComponent(name)}&limit=50`);
  if (k.status !== 'ok' && k.status !== 'none') return k;
  const g = await f<GbifNameMatch>(`https://api.gbif.org/v1/species/match?strict=true&kingdom=Plantae&name=${encodeURIComponent(name)}`);
  if (g.status !== 'ok' && g.status !== 'none') return g;
  // A synonym's accepted record, one request more, read only where the match is a synonym of a key not this species' (round seventy-two).
  const m = g.status === 'ok' ? g.data : null;
  let accepted: GbifNameMatch | null = null;
  if (m && m.matchType === 'EXACT' && m.acceptedUsageKey && m.acceptedUsageKey !== own.key && m.speciesKey !== own.key) {
    const a = await f<{ key?: number; scientificName?: string; canonicalName?: string; authorship?: string; taxonomicStatus?: string; rank?: string }>(`https://api.gbif.org/v1/species/${m.acceptedUsageKey}`);
    if (a.status !== 'ok' && a.status !== 'none') return a;
    if (a.status === 'ok') accepted = { usageKey: a.data.key, scientificName: a.data.scientificName, canonicalName: a.data.canonicalName, authorship: a.data.authorship, status: a.data.taxonomicStatus, rank: a.data.rank };
  }
  return { status: 'ok', data: slipStanding(name, own, k.status === 'ok' ? (k.data.results ?? []) : [], m, accepted) };
}

/**
 * What Kew and GBIF say of a name as a species of its own (round seventy-one, B; triage-70 S-B7, S-C9, S-F13; moved here
 * from `sources/inat.ts` by the round's merge, which re-exports them). `transferTaken` reads it for iNaturalist's genus
 * transfers. The slip rule itself is `slipStanding`, above, for iNaturalist and Commons alike.
 */
export type NameWord = { kew?: 'accepted' | 'held' | 'none'; gbif?: 'accepted' | 'other' | 'none'; kewOurs?: 'accepted' | 'held' | 'none' };
/**
 * B's word-level reading of the slip rule, from `NameWord` alone: never when Kew accepts the name as a species (Salvia
 * aurea L., one letter from Salvia azurea), nor when GBIF does, unless Kew holds no row of it and accepts the species' own
 * name (Othonna cakilifolia DC., which Kew spells cakilefolia). Since the round-71 merge the build and the fills decide a
 * slip by `slipStanding`, which reads the rows and the author themselves (GBIF's accepted name is the species' only when
 * GBIF files it under the species or it is the same name by the same author); this summary is no longer called by them
 * and stays only as B's pinned statement (`r71b-inat-sister`); on the sources' real answers for its cases (Salvia aurea,
 * Othonna cakilifolia DC., Echinocereus chisosensis) `slipStanding` gives the same verdicts.
 */
export function slipTaken(candidate: string, ours: string, w: NameWord): boolean {
  const e = candidate.split(/\s+/)[1] ?? '', o = ours.split(/\s+/)[1] ?? '';
  if (!slip(e, o)) return false;
  if (w.kew === 'accepted') return false;
  if (w.gbif === 'accepted' && !(w.kew === 'none' && w.kewOurs === 'accepted')) return false;
  return true;
}
/** Whether a name with the species' epithet in another genus may be its genus transfer: never when Kew accepts both. */
export const transferTaken = (w: NameWord) => !(w.kew === 'accepted' && w.kewOurs === 'accepted');
