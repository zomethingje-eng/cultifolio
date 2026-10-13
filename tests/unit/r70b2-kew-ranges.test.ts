/**
 * Round seventy, the owner's run (2026-10-13): the rebuild of 118 species lost Kew's native range on thirteen pages
 * (drops.txt) to round seventy's reading of Kew's rows by author. Two of the losses were meant: Ceropegia macrocarpa
 * (Sprenger) Bruyns is not Kew's "J.N.Haage & E.Schmidt", and Albuca longifolia Fisch. ex Steud. is neither Kew's "Fisch.
 * ex F.Dietr." nor Baker's. The other thirteen had four causes:
 *   - Kew holds the words twice by the one author, one row accepted and one a synonym of another species (Datura metel
 *     L., accepted, and "Datura metel L." under Datura innoxia): both were the species' own, two entries, "ambiguous".
 *     The accepted row is now the one. Romulea corsica, Scilla laxiflora, Albuca polyphylla, A. juncifolia, A.
 *     schlechteri, Dorstenia dinklagei and Argyroderma framesii are the same case;
 *   - the publishing author agreed with two rows whose basionyms differ (Drimia nana (Snijman) and (Oyewole) J.C.Manning
 *     & Goldblatt; Ceropegia urceolata (L.C.Leach) and (P.R.O.Bally) Bruyns): the whole citation decides first;
 *   - the author written two ways: "Heering" and "W.Heering" (Drimia obstii), "Yildirim" and Kew's "Yıldırım"
 *     (Chionodoxa salbacus); and one basionym combined by two authors in one genus, "(Engelm.) Lem." and Kew's "(Engelm.)
 *     Britton & Rose" (Coryphantha macromeris).
 * Kew's rows are those of GBIF's copy of WCVP on 2026-10-13 (Chionodoxa's as Kew's own files write it), with their WCVP
 * ids; the backbone's authorship is GBIF's. Measured over all 118: 69 ranges read on m70, 84 now; the 15 gained are the
 * 13 above and Cochemiea inexpectata and Agave nanchititlensis, whose backbone authors stop after the parentheses.
 * Each case FAILED on m70 unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { WcvpIndex, parseWcvpName, parseWcvpDist } from '$dossier/bulk';

const NAMES_H = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed'.split('|');
const DIST_H = 'plant_name_id|continent_code_l1|continent|region_code_l2|region|area_code_l3|area|introduced|extinct|location_doubtful'.split('|');
const line = (id: string, status: string, name: string, authors: string, acc: string) => [id, '', 'Species', status, '', '', name.split(' ')[0], '', name.split(' ')[1], '', '', '', '', '', '', '', '', '', '', '', '', name, authors, acc, '', '', '', '', '', '', 'Y'].join('|');

/** [backbone key, name, the backbone's authorship, Kew's rows of the words: [WCVP id, status, authors, the entry it is a synonym of]]. */
const CASES: Array<[number, string, string, Array<[string, string, string, string]>]> = [
  [2743647, 'Romulea corsica', 'Jord. & Fourr.', [['207184513', 'Synonym', 'Jord. & Fourr.', 'Romulea ramiflora subsp. ramiflora'], ['207184901', 'Accepted', 'Jord. & Fourr.', '']]],
  [2767373, 'Scilla laxiflora', 'Baker', [['206605677', 'Accepted', 'Baker', ''], ['206611290', 'Synonym', 'Baker', 'Ledebouria socialis (Baker) Jessop']]],
  [2772303, 'Albuca polyphylla', 'Baker', [['206600380', 'Accepted', 'Baker', ''], ['206600453', 'Synonym', 'Baker', 'Albuca macowanii Baker']]],
  [2772443, 'Albuca juncifolia', 'Baker', [['206600443', 'Synonym', 'Welw. ex Baker', 'Albuca monophylla Baker'], ['206600488', 'Accepted', 'Baker', '']]],
  [2772579, 'Albuca schlechteri', 'Baker', [['206600236', 'Synonym', 'Baker', 'Albuca viscosa L.f.'], ['206600357', 'Accepted', 'Baker', '']]],
  [2776659, 'Drimia nana', '(Snijman) J.C.Manning & Goldblatt', [['206593373', 'Synonym', '(Oyewole) J.C.Manning & Goldblatt', 'Drimia minuta Goldblatt & J.C.Manning'], ['206593528', 'Accepted', '(Snijman) J.C.Manning & Goldblatt', '']]],
  [2928747, 'Datura metel', 'L.', [['207838146', 'Accepted', 'L.', ''], ['207838202', 'Synonym', 'L.', 'Datura innoxia Mill.']]],
  [3084426, 'Coryphantha macromeris', '(Engelm.) Lem.', [['206834961', 'Synonym', '(Engelm.) Britton & Rose', 'Pelecyphora macromeris (Engelm.) D.Aquino & Dan.Sánchez']]],
  [3647486, 'Drimia obstii', 'Heering', [['206593512', 'Synonym', 'W.Heering', 'Ledebouria obstii (W.Heering) Mart.-Azorín, M.B.Crespo & M.Á.Alonso']]],
  [7262628, 'Dorstenia dinklagei', 'Engl.', [['207308886', 'Synonym', 'Engl.', 'Hijmania turbinata (Engl.) M.D.M.Vianna'], ['207314570', 'Accepted', 'Engl.', '']]],
  [7329368, 'Argyroderma framesii', 'L.Bolus', [['206469911', 'Synonym', 'L.Bolus', 'Argyroderma pearsonii (N.E.Br.) Schwantes'], ['206469933', 'Accepted', 'L.Bolus', '']]],
  [9506936, 'Ceropegia urceolata', '(L.C.Leach) Bruyns', [['206529781', 'Synonym', '(L.C.Leach) Bruyns', 'Huernia urceolata L.C.Leach'], ['206547312', 'Synonym', '(P.R.O.Bally) Bruyns', 'Echidnopsis urceolata P.R.O.Bally']]],
  [12193134, 'Chionodoxa salbacus', 'Yildirim', [['206605159', 'Synonym', 'Yıldırım', 'Scilla salbaca (Yıldırım) S.S.Ying']]],
  [9263110, 'Ceropegia macrocarpa', '(Sprenger) Bruyns', [['206550604', 'Unplaced', 'J.N.Haage & E.Schmidt', '']]],
  [7570556, 'Albuca longifolia', 'Fisch. ex Steud., 1840', [['206599626', 'Unplaced', 'Fisch. ex F.Dietr.', ''], ['206600461', 'Synonym', 'Baker', 'Albuca albanyii S.S.Ying']]],
  [11309917, 'Ceropegia tanzaniensis', '(Peckover)', [['206548472', 'Synonym', 'Peckover', 'Ceropegia cordiloba Werderm.']]],
  [7329498, 'Mesembryanthemum pallens', '(Sol.)', [['206477924', 'Accepted', 'Aiton', ''], ['206478662', 'Synonym', 'Sol.', 'Mesembryanthemum longistylum DC.']]]
];

/** Kew's files for one species: its rows, the entries they lead to, and a range for every entry. */
function kew(rows: Array<[string, string, string, string]>): WcvpIndex {
  const w = new WcvpIndex();
  const name = (n: string) => n.split(' ').slice(0, /subsp\.|var\./.test(n) ? 4 : 2).join(' ');
  const entries = new Map<string, string>();
  for (const [id, status, authors, acc] of rows) {
    const to = status === 'Synonym' ? `e${id}` : id;
    if (status === 'Synonym') entries.set(to, acc);
    w.addName(parseWcvpName(NAMES_H, line(id, status, CASES.find((c) => c[3].some((r) => r[0] === id))![1], authors, status === 'Unplaced' ? '' : to)), () => true);
    w.addDist(parseWcvpDist(DIST_H, `${to}|2|AFRICA|27|Southern Africa|CPP|Cape Provinces|0|0|0`));
  }
  for (const [id, acc] of entries) w.addName(parseWcvpName(NAMES_H, line(id, 'Accepted', name(acc), acc.slice(name(acc).length).trim(), id)), () => true);
  return w;
}
const read = (key: number) => {
  const [, n, a, rows] = CASES.find((c) => c[0] === key)!;
  const got = kew(rows).distributions(n, a);
  return got === 'ambiguous' || !got ? got : `${got.entry.name} ${got.entry.authors ?? ''}`.trim();
};

describe('the thirteen ranges lost, read again', () => {
  it.each([
    [2928747, 'Datura metel L.'],
    [2743647, 'Romulea corsica Jord. & Fourr.'],
    [2767373, 'Scilla laxiflora Baker'],
    [2772303, 'Albuca polyphylla Baker'],
    [2772443, 'Albuca juncifolia Baker'],
    [2772579, 'Albuca schlechteri Baker'],
    [7262628, 'Dorstenia dinklagei Engl.'],
    [7329368, 'Argyroderma framesii L.Bolus']
  ])('%s: Kew\'s accepted row of the two by one author, %s', (key, entry) => {
    expect(read(key)).toBe(entry); // m70: ambiguous
  });
  it('Drimia nana (Snijman): not Kew\'s (Oyewole), though both are Manning and Goldblatt\'s', () => {
    expect(read(2776659)).toBe('Drimia nana (Snijman) J.C.Manning & Goldblatt'); // m70: ambiguous
  });
  it('Ceropegia urceolata (L.C.Leach) Bruyns: Huernia urceolata, not Echidnopsis urceolata', () => {
    expect(read(9506936)).toBe('Huernia urceolata L.C.Leach'); // m70: ambiguous
  });
  it('Drimia obstii Heering: Kew\'s W.Heering', () => {
    expect(read(3647486)).toBe('Ledebouria obstii (W.Heering) Mart.-Azorín, M.B.Crespo & M.Á.Alonso'); // m70: none, "only under another author"
  });
  it('Chionodoxa salbacus Yildirim: Kew\'s Yıldırım', () => {
    expect(read(12193134)).toBe('Scilla salbaca (Yıldırım) S.S.Ying'); // m70: none, "only under another author"
  });
  it('Coryphantha macromeris (Engelm.) Lem.: Kew\'s (Engelm.) Britton & Rose, the one basionym in the one genus', () => {
    expect(read(3084426)).toBe('Pelecyphora macromeris (Engelm.) D.Aquino & Dan.Sánchez'); // m70: none
  });
});

describe('the losses meant, and their neighbours (guards)', () => {
  it('Ceropegia macrocarpa (Sprenger) Bruyns is not Kew\'s J.N.Haage & E.Schmidt', () => {
    expect(read(9263110)).toBeNull();
  });
  it('Albuca longifolia Fisch. ex Steud. is neither Kew\'s Fisch. ex F.Dietr. nor Baker\'s: an ex-author alone is no author', () => {
    expect(read(7570556)).toBeNull();
  });
  it('Ceropegia tanzaniensis "(Peckover)", a backbone author cut off after the parentheses, is not Kew\'s "Peckover", a name Peckover published directly', () => {
    expect(read(11309917)).toBeNull();
  });
  it('Mesembryanthemum pallens "(Sol.)" is not Kew\'s "Sol.": the one entry Kew accepts stands, as on m70', () => {
    expect(read(7329498)).toBe('Mesembryanthemum pallens Aiton');
  });
});
