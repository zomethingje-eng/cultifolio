/**
 * Round seventy-one, agent C: the mutants of `photo-kind.ts` that survived round seventy's tests (self-review 70, S-C13),
 * each now killed by a case below. A case names the mutant it kills (`C-work/mut/mutants.py`). These pass on `r71base`
 * except where they read round seventy-one's rules (marked "71"); they are guards of round seventy's own rules that its
 * tests left undriven.
 */
import { describe, it, expect } from 'vitest';
import { safeUrls } from '$dossier/schema';
import { heldNamesOf, commonsKind, commonsInatCopy, slip, commonsFirstByEpithet, epithetRank, slipStanding, askSlip, type HeldNames } from '$dossier/photo-kind';

const INDEX = [
  { key: 2746001, name: 'Babiana purpurea', syn: ['Babiana stricta var. purpurea'] },
  { key: 2746002, name: 'Babiana stricta' },
  { key: 2777724, name: 'Aloe vera', syn: ['Aloe barbadensis'] },
  { key: 2777537, name: 'Aloe arborescens' },
  { key: 7329207, name: 'Lithops lesliei' },
  { key: 7329209, name: 'Lithops karasmontana', syn: ['Lithops karasmontana subsp. bella var. lericheana'] },
  { key: 3943001, name: 'Eriosyce villosa', syn: ['Neoporteria villosa'] },
  { key: 3943002, name: 'Neoporteria wagenknechtii' },
  { key: 3954001, name: 'Gymnocalycium mihanovichii' },
  { key: 3128990, name: 'Plectocephalus americanus', syn: ['Centaurea americana'] },
  { key: 7284127, name: 'Mammillaria matudae' },
  { key: 7283175, name: 'Echinocereus scheeri' },
  { key: 3954494, name: 'Echinocereus schereri' },
  { key: 2745782, name: 'Sparaxis pillansii' },
  { key: 9475270, name: 'Ceropegia breviflora', syn: ['Brachystelma pygmaeum'] },
  { key: 7281328, name: 'Weingartia cylindrica', syn: ['Sulcorebutia cylindrica var. crucensis'] },
  { key: 8000001, name: 'Titanopsis hugo-schlechteri' },
  { key: 8000002, name: 'Titanopsis hugo' },
  { key: 8000003, name: 'Sinningia leucotricha' },
  { key: 8000004, name: 'Sinningia leucotricha-caudex' },
  { key: 8000005, name: 'Centaurea americanaflower' },
  { key: 8000006, name: 'Aloe brevq', syn: ['Aloe xyzq var. foo'] },
  { key: 2743932, name: 'Romulea gigantea' }
];
const HELD = heldNamesOf(INDEX);
const KEY = new Map(INDEX.map((e) => [e.name, e.key]));
const C = 'https://upload.wikimedia.org/wikipedia/commons';
const file = (title: string, extra: Record<string, unknown> = {}) => ({ src: 'commons', id: title, url: `${C}/thumb/a/ab/x.jpg/960px-x.jpg`, thumb: `${C}/thumb/a/ab/x.jpg/500px-x.jpg`, width: 3000, height: 2000, licence: 'by-sa', attribution: 'A. Grower, CC BY-SA 4.0, via Wikimedia Commons', ...extra });
const shows = (scientific: string, title: string, extra: Record<string, unknown> = {}, synonyms: string[] = [], held: HeldNames | null = HELD) =>
  safeUrls({ key: KEY.get(scientific) ?? 1, name: { scientific, synonyms, vernacular: [], status: 'accepted' }, climate: { status: 'none' }, literature: [], links: {}, upstream: {}, photos: [file(title, extra)] } as never, held).photos.length === 1;

describe('the reference\'s names (held-infra, held-acc-infra)', () => {
  it('an older name below species is held only whole, so "Babiana stricta" on its own is Babiana stricta\'s', () => {
    expect(HELD.holders('Babiana', 'stricta')).toEqual([2746002]);
    expect(HELD.accepted('Babiana', 'stricta')).toBe(2746002);
    expect(shows('Babiana purpurea', 'File:Babiana stricta 1.jpg', {}, ['Babiana stricta var. purpurea (Jacq.) Ker Gawl.'])).toBe(false);
  });
});

describe('titles', () => {
  it('a bracketed genus is read as both names (rd-bracket): "Neoporteria(eriosyce) villosa" is Eriosyce villosa\'s', () => {
    expect(shows('Eriosyce villosa', 'File:Neoporteria(eriosyce) villosa 2.JPG', {}, ['Neoporteria villosa (Monv.) A.Berger'])).toBe(true);
  });
  it('a run-on own genus with a spelling of the epithet is the species (rd-run-key)', () => {
    expect(shows('Gymnocalycium mihanovichii', 'File:Gymnocalyciummihanovichi.jpg')).toBe(true);
  });
  it('a run-on epithet with a tail that is no word is another name (rb-run-ne)', () => {
    expect(shows('Plectocephalus americanus', 'File:Centaurea americanaxyzia.jpg', {}, ['Centaurea americana Nutt.'])).toBe(false);
  });
  it('a slip two letters longer is no slip (slip-gap2)', () => {
    expect(slip('matudae', 'matudaeus')).toBe(false);
  });
  it('a copy\'s number has six to nine digits (copy-5, copy-7, copy-10)', () => {
    expect(commonsInatCopy('File:Aloe vera 12345.jpg')).toBeNull();
    expect(commonsInatCopy('File:Aloe vera 123456.jpg')).toBe('123456');
    expect(commonsInatCopy('File:Aloe vera 123456789.jpg')).toBe('123456789');
    expect(commonsInatCopy('File:Aloe vera 1234567890.jpg')).toBeNull();
  });
});

describe('kinds by single words', () => {
  it('a type specimen in a garden is a sheet (pressed-type); a paper\'s figure (peerj); bugs (bugs)', () => {
    expect(commonsKind('File:Aloe vera type specimen garden.jpg', { scientific: 'Aloe vera' })).toBe('a herbarium sheet');
    expect(commonsKind('File:Phylogeny-of-aloe-peerj-01-70-g001.jpg', { scientific: 'Aloe vera' })).not.toBeNull();
    expect(commonsKind('File:Aloe-peerj-01-70-g002.jpg', { scientific: 'Aloe vera' })).toBe('a plate or drawing');
    expect(commonsKind('File:Bugs on Aloe vera.jpg', { scientific: 'Aloe vera' })).toBe('an animal');
  });
  it('a lithographer in the credit, read through its tags (credit-lith, ck-credit-tags)', () => {
    expect(commonsKind('File:Aloe vera 2.jpg', { scientific: 'Aloe vera' }, { credit: 'J.N.Fitch lith.' })).toBe('a plate or drawing');
    expect(commonsKind('File:Aloe vera 2.jpg', { scientific: 'Aloe vera' }, { credit: 'M.S. <i>del.</i>' })).toBe('a plate or drawing');
  });
  it('seeds, succulents unidentified, and "unidentified" in lower case (cat-seeds, plantgroups-succ, unid-anycase)', () => {
    expect(commonsKind('File:Aloe vera 3.jpg', { scientific: 'Aloe vera' }, ['Aloe vera', 'Seeds'])).not.toBeNull();
    expect(commonsKind('File:Aloe vera 3.jpg', { scientific: 'Aloe vera' }, ['Aloe vera', 'Unidentified succulents'])).not.toBeNull();
    expect(commonsKind('File:Aloe vera 3.jpg', { scientific: 'Aloe vera' }, ['Aloe vera', 'unidentified plants'])).not.toBeNull();
  });
  it('a year is no year at 1900 and one is at 1899 with a plate\'s words, 71 (year-1900s); a number or a short code before it is no year (numbered-digit, numbered-code3)', () => {
    expect(commonsKind('File:Aloe vera volume 1900.jpg', { scientific: 'Aloe vera' })).toBeNull();
    expect(commonsKind('File:Aloe vera volume 1899.jpg', { scientific: 'Aloe vera' })).toBe('a plate or drawing');
    expect(commonsKind('File:Aloe vera volume 3 1850.jpg', { scientific: 'Aloe vera' })).toBeNull();
    expect(commonsKind('File:Aloe vera volume ABCD 1850.jpg', { scientific: 'Aloe vera' })).toBeNull();
    expect(commonsKind('File:Aloe vera volume 3 ABCDE 1850.jpg', { scientific: 'Aloe vera' })).toBe('a plate or drawing');
  });
  it('a reason given in order: the name before the category (order-cat-before-read)', () => {
    expect(commonsKind('File:Aloe arborescens 1.jpg', { scientific: 'Aloe vera', key: 2777724, held: HELD }, ['Seeds'])).toBe('named as another species');
  });
});

describe('the group rule\'s mapping (cs-*, grp-stem-boundary)', () => {
  it('a category with two ranks is a species (cs-infra2)', () => {
    expect(shows('Lithops lesliei', 'File:Garden 1.jpg', { categories: ['Lithops lesliei', 'Lithops karasmontana subsp. bella var. lericheana'] })).toBe(false);
  });
  it('a two-word category in a genus neither the species\' nor the reference\'s is no species (cs-genus)', () => {
    expect(shows('Aloe vera', 'File:Garden 1.jpg', { categories: ['Aloe vera', 'Psittacula krameri'] })).toBe(true);
  });
  it('an older name below species counts as the species only whole (cs-infra-any)', () => {
    expect(shows('Babiana purpurea', 'File:Garden 1.jpg', { categories: ['Babiana purpurea', 'Babiana stricta'] }, ['Babiana stricta var. purpurea (Jacq.) Ker Gawl.'])).toBe(false);
  });
  it('an older name the reference files under this species is this species (cs-held-self), and two names of one other species are one (cs-onekey)', () => {
    expect(shows('Aloe vera', 'File:Garden 3.jpg', { categories: ['Aloe vera', 'Aloe barbadensis'] })).toBe(true);
    expect(shows('Aloe arborescens', 'File:Garden 2.jpg', { categories: ['Aloe vera', 'Aloe barbadensis'] })).toBe(true);
  });
  it('another species\' epithet counts only at a word\'s start (grp-stem-boundary)', () => {
    expect(shows('Aloe vera', 'File:Aloe vera subarborescens.jpg', { categories: ['Aloe vera', 'Aloe arborescens'] })).toBe(true);
  });
});

describe('the order (narrow-le)', () => {
  it('a file exactly 500 pixels wide is not narrow', () => {
    const a = { src: 'commons', id: 'File:Aloe vera a.jpg', width: 499 };
    const b = { src: 'commons', id: 'File:Aloe vera b.jpg', width: 500 };
    expect(commonsFirstByEpithet([a, b], { scientific: 'Aloe vera' }).map((p) => p.id)).toEqual(['File:Aloe vera b.jpg', 'File:Aloe vera a.jpg']);
  });
});

describe('round 71: survivors of the second mutation run', () => {
  it('a bracketed genus is read as both names: another epithet under it is another plant (rd-bracket)', () => {
    expect(shows('Eriosyce villosa', 'File:Neoporteria(eriosyce) wagenknechtii 2.JPG', {}, ['Neoporteria villosa (Monv.) A.Berger'])).toBe(false);
  });
  it('the struck description decides where nothing else does (struck-off)', () => {
    expect(shows('Plectocephalus americanus', 'File:Centaurea americana 7.jpg', { struck: true }, ['Centaurea americana Nutt.'])).toBe(false);
    expect(shows('Plectocephalus americanus', 'File:Centaurea americana 7.jpg', {}, ['Centaurea americana Nutt.'])).toBe(true); // guard
  });
  it('an animal\'s category does not hide a file whose title holds the epithet or an older name\'s (names-rank, nts-rank0)', () => {
    expect(shows('Sparaxis pillansii', 'File:pillansii flower with fly.jpg', { categories: ['Sparaxis pillansii', 'Mythicomyiidae'] })).toBe(true);
    expect(shows('Ceropegia breviflora', 'File:pygmaeum flower with fly.jpg', { categories: ['Ceropegia breviflora', 'Mythicomyiidae'] }, ['Brachystelma pygmaeum Schltr.'])).toBe(true);
    expect(shows('Sparaxis pillansii', 'File:A fly.jpg', { categories: ['Sparaxis pillansii', 'Mythicomyiidae'] })).toBe(false); // guard
  });
  it('a two-word epithet, a hyphen\'s note and a run-on are the species\' only where the reference holds no such name (rb-twoword-held, rb-hyphen-held, rb-run-held)', () => {
    expect(shows('Titanopsis hugo-schlechteri', 'File:Titanopsis hugo schlechterii 6.jpg')).toBe(false);
    expect(shows('Sinningia leucotricha', 'File:Sinningia leucotricha-caudex.jpg')).toBe(false);
    expect(shows('Plectocephalus americanus', 'File:Centaurea americanaflower.jpg', {}, ['Centaurea americana Nutt.'])).toBe(false);
  });
  it('a word with no Latin ending that the reference holds in the genus is an epithet (rb-isheld-epithets)', () => {
    expect(shows('Aloe vera', 'File:Aloe xyzq 1.jpg')).toBe(false);
  });
  it('an own genus is read as written or capitalised, not in capitals (rd-owncase); a run-on tail that is a word or too short is nothing (rd-run-ne, rd-run-len)', () => {
    expect(shows('Aloe vera', 'File:ALOE arborescens.jpg')).toBe(true);
    expect(shows('Aloe vera', 'File:Aloeflowers 1.jpg')).toBe(true);
    expect(shows('Aloe vera', 'File:Aloexy.jpg')).toBe(true);
  });
  it('a capitalised epithet the reference holds in the genus is another species (cap-any; round 71)', () => {
    expect(shows('Lithops lesliei', 'File:Lithops Karasmontana.jpg')).toBe(false);
    expect(shows('Lithops lesliei', 'File:Lithops Lesliei.jpg')).toBe(true); // guard
    expect(shows('Lithops lesliei', 'File:Lithops Before Repotting.jpg')).toBe(true); // guard
    expect(shows('Lithops lesliei', 'File:Lithops Lovely 2.jpg')).toBe(true); // a capitalised word the genus holds no epithet of is no name
  });
  it('a citation\'s year after its page is no year even beside a Flora (cite-year)', () => {
    expect(shows('Romulea gigantea', 'File:Romulea gigantea Flora Capensis 6- 25 (1896). 20220416 120706.jpg')).toBe(true);
  });
  it('a slip needs the reference\'s names and no other holder, whatever is stored (slip-noheld, slip-held)', () => {
    expect(shows('Mammillaria matudae', 'File:Mammillaria mabudae.jpg', { slips: ['mammillaria mabudae'] }, [], null)).toBe(false);
    expect(shows('Echinocereus scheeri', 'File:Echinocereus schereri.jpg', { slips: ['echinocereus schereri'] })).toBe(false);
  });
  it('a group whose title names this species and another\'s epithet (grp-others-off); an epithet alone is no name for the exemption (grp-exempt-rank)', () => {
    expect(shows('Aloe vera', 'File:Aloe vera and arborescens.jpg', { categories: ['Aloe vera', 'Aloe arborescens'] })).toBe(false);
    expect(shows('Aloe vera', 'File:vera garden.jpg', { categories: ['Aloe vera', 'Aloe arborescens'] })).toBe(false);
  });
  it('an older name below species ranks by its last epithet (er-infra)', () => {
    expect(epithetRank('File:Sulcorebutia crucensis.jpg', { scientific: 'Weingartia cylindrica', synonyms: ['Sulcorebutia cylindrica var. crucensis Donald'] })).toBe(1);
  });
  it('slipStanding: Kew\'s synonym of this species, GBIF\'s key, a fuzzy match and a misapplied row (ss-*)', () => {
    const own = { scientific: 'Mammillaria matudae', authorship: 'Bravo', key: 7284127 };
    expect(slipStanding('Mammillaria matudai', own, [{ canonicalName: 'Mammillaria matudai', taxonomicStatus: 'SYNONYM', accepted: 'Mammillaria matudae Bravo' }], null).own).toBe(true);
    expect(slipStanding('Mammillaria matudai', own, [{ canonicalName: 'Mammillaria matudai', taxonomicStatus: 'SYNONYM', accepted: 'Mammillaria bombycina Quehl' }], null).own).toBe(false);
    expect(slipStanding('Mammillaria matudai', own, [], { matchType: 'EXACT', status: 'SYNONYM', rank: 'SPECIES', canonicalName: 'Mammillaria matudai', speciesKey: 7284127 }).own).toBe(true);
    expect(slipStanding('Mammillaria matudai', own, [], { matchType: 'FUZZY', status: 'ACCEPTED', rank: 'SPECIES', canonicalName: 'Mammillaria matudai', scientificName: 'Mammillaria matudai Foo', speciesKey: 1 }).own).toBe(true);
    expect(slipStanding('Mammillaria matudai', own, [{ canonicalName: 'Mammillaria matudai', taxonomicStatus: 'MISAPPLIED', accepted: 'Mammillaria bombycina Quehl' }], null).own).toBe(true);
    // Kew's synonym of this species decides before GBIF's acceptance of the same words by another author.
    expect(slipStanding('Mammillaria matudai', own, [{ canonicalName: 'Mammillaria matudai', taxonomicStatus: 'SYNONYM', accepted: 'Mammillaria matudae Bravo' }], { matchType: 'EXACT', status: 'ACCEPTED', rank: 'SPECIES', canonicalName: 'Mammillaria matudai', scientificName: 'Mammillaria matudai Foo', speciesKey: 1 }).own).toBe(true);
  });
  it('askSlip: Kew\'s copy refused is a refusal, whatever GBIF says (ask-refuse)', async () => {
    const f = (async (url: string) => (url.includes('datasetKey=') ? { status: 'refused', detail: 'HTTP 503' } : { status: 'ok', data: { matchType: 'NONE' } })) as never;
    expect((await askSlip(f, 'Mammillaria mabudae', { scientific: 'Mammillaria matudae' })).status).toBe('refused');
  });
});
