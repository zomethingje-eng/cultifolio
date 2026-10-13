/**
 * Round seventy, triage-69 N4 (S-F8): a tie between spellings of one name. On a tie of sources, a spelling only a source
 * outside botany gives (the World Register of Marine Species) does not win it; then the spelling the species' botanical
 * sources write more often across all its names; then round sixty-nine's open form, then GBIF's order. Measured over
 * the 4,082 headlines of the corpus behind the live index (its dossiers of 9 October 2026, whose names give the live
 * index's names exactly): 11 headlines change, each listed in docs/review-70/N.md. The English rows are those
 * dossiers', in GBIF's order. Each case FAILED on the base unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { englishNames, OUTSIDE_BOTANY, type VernacularName } from '$dossier/index-entry';

const r = (name: string, source: string, alsoFrom: string[] = [], preferred = false): VernacularName => ({ name, lang: 'eng', source, ...(alsoFrom.length ? { sources: alsoFrom.length + 1, alsoFrom } : {}), ...(preferred ? { preferred } : {}) });
const BEL = "Belgian Species List", BRASIL = "Flora e Funga do Brasil - Lista Oficial", COL = "Catalogue of Life", DAISIE = "DAISIE - Inventory of alien invasive species in Europe", DCSR = "Checklist Dutch Caribbean Species Register", GRIIS_HI = "Global Register of Introduced and Invasive Species - Hawaii, United States (ver.2.0, 2022)", GRIIS_US = "Global Register of Introduced and Invasive Species - United States (Contiguous) (ver.2.0, 2022)", GRIN = "GRIN Taxonomy", HARMONIA = "Invasive Alien Species in Belgium - HARMONIA database", ITIS = "Integrated Taxonomic Information System (ITIS)", IUCN = "The IUCN Red List of Threatened Species", KOREA = "Checklist of Vascular Plants in Korea", MV = "Martha's Vineyard species checklist", TAXREF = "TAXREF", UKSI = "United Kingdom Species Inventory (UKSI)", VASCAN = "Database of Vascular Plants of Canada (VASCAN)", VT = "Checklist of Vermont Species", WORMS = "World Register of Marine Species";
const rows: Record<string, VernacularName[]> = {
  "Duranta erecta": [r("Angel's whisper, Golden dewdrop, Pigeon berry, Skyflower", TAXREF), r("Forget-Me-Not-Tree", COL), r("Golden dewdrops", GRIIS_HI), r("golden dewdrop", GRIN, [COL]), r("golden dewdrops", ITIS, [COL, GRIN]), r("pigeonberry", COL, [GRIN]), r("skyflower", GRIN), r("Adonis", DCSR, [], true), r("pigeon berry", WORMS)],
  "Eriocapitella hupehensis": [r("Hubei Anemone", COL, [VT]), r("Japanese Thimbleweed", COL, [VT])],
  "Eucalyptus robusta": [r("Swamp Mahogany Gum", COL), r("Swamp Messmate", COL, [IUCN]), r("Swampmahogany", TAXREF, [GRIIS_US, GRIIS_HI]), r("swamp messmate", GRIN), r("swamp stringybark", GRIN, [COL]), r("swamp-mahogany", GRIN, [COL, BRASIL]), r("swamp-messmate", BRASIL, [COL]), r("swampmahogany", ITIS), r("Swamp Mahogany", IUCN, [], true)],
  "Madia elegans": [r("Elegant Tarweed", COL), r("autumn showy tarweed", COL), r("showy tarweed", COL), r("Showy tar weed", WORMS)],
  "Monstera deliciosa": [r("Ceriman", COL, [VT]), r("Delicious Monster", COL, [VT]), r("Fruit salad plant", COL, [VT]), r("Mexican Breadfruit", COL, [VT]), r("Mexican-breadfruit", COL, [GRIN, VT]), r("Swiss Cheese Plant", COL), r("Swiss-Cheese Plant", COL, [VT]), r("Swiss-cheese-plant", GRIN, [COL, VT]), r("Tarovine", GRIIS_US, [TAXREF]), r("Windowleaf Philodendron", COL, [VT]), r("cut-leaf-philodendron", GRIN, [COL, VT]), r("fruit-salad-plant", COL, [GRIN, VT]), r("monstera", GRIN, [VT]), r("tarovine", ITIS, [VT]), r("locust and wild honey", VT, [WORMS]), r("swiss cheese plant", VT, [WORMS])],
  "Prunella vulgaris": [r("Alpine Self-heal", MV), r("Alpine self-heal", KOREA, [VT]), r("Common Self Heal", COL, [VT]), r("Common Selfheal", MV), r("Common selfheal", GRIIS_HI), r("Heal-all", MV, [IUCN, VT]), r("Self-heal", MV, [IUCN, VT], true), r("Selfheal", COL, [MV, TAXREF, UKSI, VT], true), r("blue curls", COL, [VT]), r("brownwort", COL, [VT]), r("carpenter weed", COL, [VASCAN, VT]), r("carpenter's herb", COL, [VT]), r("common selfheal", ITIS, [VT]), r("heal-all", COL, [GRIN, VASCAN]), r("heart-of-the-earth", COL, [VT]), r("lawn prunella", COL, [VT]), r("self-heal", COL, [GRIN, VASCAN], true), r("selfheal", BEL), r("woundwort", COL, [VT]), r("Common Self-heal", MV, [], true), r("Carpenter Weed", MV), r("Common Heal-all", MV), r("common heal-all", VT), r("common self-heal", VT)],
  "Robinia pseudoacacia": [r("Black Locust", MV, [IUCN], true), r("Black locust", DAISIE, [HARMONIA, VT]), r("False Acacia", MV, [IUCN, UKSI]), r("False acacia", DAISIE, [VT]), r("False-acacia", COL, [DAISIE, TAXREF, UKSI, VT], true), r("Locust", COL, [MV, VT, UKSI]), r("Locust Tree", MV, [VT]), r("Mossy Locust, Black Locust, False Acacia, Bristly Locust", MV), r("Mossy locust, Black locust, False acacia, Bristly locust", KOREA, [VT]), r("Yellow Locust", MV), r("black locust", COL, [GRIN, ITIS, VASCAN], true), r("false acacia", ITIS, [COL, GRIN, VASCAN]), r("green locust", COL, [VT]), r("locust tree", BEL, [COL]), r("purple robe locust", COL, [VT]), r("white locust", COL, [VT]), r("yellow locust", COL, [ITIS, VASCAN, VT])],
};
const head = (sp: string) => englishNames(rows[sp], { genus: sp }).common;

describe('N4: a tie between spellings of one name', () => {
  it('Madia elegans is "Showy tarweed": the marine register\'s "Showy tar weed" does not win the tie', () => {
    expect(OUTSIDE_BOTANY.has('World Register of Marine Species')).toBe(true);
    expect(head('Madia elegans')).toBe('Showy tarweed'); // base: "Showy tar weed"
  });
  it('Duranta erecta is "Pigeonberry": two botanical sources write it closed, one open beside the marine register', () => {
    expect(head('Duranta erecta')).toBe('Pigeonberry'); // base: "Pigeon berry"
  });
  it('Prunella vulgaris is "Selfheal": the sources write "selfheal" in more of its names ("Common selfheal") than "self-heal"', () => {
    expect(head('Prunella vulgaris')).toBe('Selfheal'); // base: "Self-heal", by the open-on-tie rule
  });
  it('guard: Eucalyptus robusta stays "Swamp-mahogany" (as many sources write "swamp mahogany" across its names as "swampmahogany")', () => {
    expect(head('Eucalyptus robusta')).toBe('Swamp-mahogany');
  });
  it('guard: between names the marine register is a source as any other: Monstera deliciosa stays "Swiss cheese plant"', () => {
    expect(head('Monstera deliciosa')).toBe('Swiss cheese plant');
  });
  it('guard: no single case is fixed: Robinia pseudoacacia stays "False acacia", Eriocapitella hupehensis "Hubei Anemone"', () => {
    expect(head('Robinia pseudoacacia')).toBe('False acacia');
    expect(head('Eriocapitella hupehensis')).toBe('Hubei Anemone');
  });
});
