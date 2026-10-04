import { describe, it, expect } from 'vitest';
import { prepare, search } from '$core/search';
import { _clean } from '../../src/routes/api/search/+server';
import { writeFileSync } from 'node:fs';

const E = (key: number, name: string, extra: Record<string, unknown> = {}) => ({ key, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, open: 0, photos: 0, climate: 'ok', ...extra });
const idx = [
  E(1, 'Copiapoa cinerea', { family: 'Cactaceae', origin: ['Chile North'], syn: ['Echinocactus cinereus'] }),
  E(2, 'Copiapoa humilis', { family: 'Cactaceae', origin: ['Chile North'] }),
  E(3, 'Lithops lesliei', { family: 'Aizoaceae', common: 'living stones', origin: ['Northern Provinces'] }),
  E(4, 'Lithops karasmontana', { family: 'Aizoaceae', common: 'living stones, stone plant', origin: ['Namibia'] }),
  E(5, 'Welwitschia mirabilis', { family: 'Welwitschiaceae', common: 'Welwitschia', origin: ['Namibia', 'Angola'] }),
  E(6, 'Aloe × nobilis', { family: 'Asphodelaceae' }),
  E(7, '× Gasteraloe beguinii', { family: 'Asphodelaceae' }),
  E(8, 'Aloe vera', { family: 'Asphodelaceae', common: 'true aloe' }),
  E(9, 'Haworthiopsis attenuata', { family: 'Asphodelaceae', common: 'zebra haworthia', syn: ['Haworthia attenuata'] }),
  E(10, 'Ariocarpus retusus subsp. trigonus', { family: 'Cactaceae' }),
  E(11, 'Ariocarpus retusus', { family: 'Cactaceae' }),
  E(12, 'Astrophytum asterias', { family: 'Cactaceae', common: 'sand dollar cactus, star cactus' }),
  E(13, 'Euphorbia obesa', { family: 'Euphorbiaceae', common: 'baseball plant' }),
  E(14, 'Echeveria elegans', { family: 'Crassulaceae', common: 'Mexican snowball' }),
  E(15, 'Mammillaria elongata', { family: 'Cactaceae', common: 'ladyfinger cactus', origin: ['Mexico Central'] }),
  E(16, 'Gymnocalycium mihanovichii', { family: 'Cactaceae', common: 'chin cactus' }),
  E(17, 'Conophytum bilobum', { family: 'Aizoaceae' }),
  E(18, 'Haworthia cooperi', { family: 'Asphodelaceae' }),
  E(19, 'Tylecodon paniculatus', { family: 'Crassulaceae', syn: ['Cotyledon paniculata'] }),
  E(20, 'Trichocereus pachanoi', { family: 'Cactaceae' }),
  E(21, 'Echinopsis pachanoi', { family: 'Cactaceae' }),
  E(22, 'Pachypodium lamerei', { family: 'Apocynaceae', common: 'Madagascar palm' }),
  E(23, 'Sansevieria trifasciata', { family: 'Asparagaceae', common: "snake plant, mother-in-law's tongue" }),
  E(24, 'Dracaena trifasciata', { family: 'Asparagaceae', common: 'snake plant', syn: ['Sansevieria trifasciata'] })
];
const P = prepare(idx);
const Q = [
  'living stones', 'living stone', 'livingstones', 'lithops', 'Lithop', 'litops', 'lihtops', 'welwitschia', 'welwitchia', 'tumbo',
  'Copiapoa cinerea (Phil.) Britton & Rose', 'Copiapoa cinerea Britton & Rose', 'Copiapoa cinerea var. columna-alba', 'Copiapoa cinerea subsp. haseltoniana',
  'copiapoa', 'Echinocactus cinereus', 'Echinocactus cinereus Phil.', 'Haworthia attenuata', 'Haworthia attenuata f. clariperla', 'Aloe x nobilis', 'Aloe nobilis', 'x Gasteraloe beguinii',
  'Gasteraloe', '×Gasteraloe', 'Ariocarpus retusus ssp. trigonus', 'Ariocarpus retusus trigonus', 'Ariocarpus retusus subsp trigonus', 'A. retusus',
  'Echeveria elegans ‘Rainbow’', "Echeveria 'Perle von Nurnberg'", 'Echeveria cv. Perle', 'sand dollar', 'star cactus', 'cactus', 'snake plant', 'Sansevieria',
  'mamillaria', 'mammilaria', 'gymno', 'gymnocalicium', 'Conophytum bilobum ssp. bilobum', 'obesa', 'euphorbia obesa var. obesa', 'peyote', 'san pedro', 'Trichocereus',
  'Copiapoa cinerea ssp.', 'copiapoa cinerea v.', 'copiapoa cinerea var', 'Copiapoa cinerea L.', 'C. cinerea', 'Copiapoa_cinerea', 'copiapoa-cinerea', 'Ariocarpus retusus subspecies trigonus', 'Ariocarpus retusus fo. trigonus', 'Ariocarpus retusus v. trigonus', 'Aloe × nobilis', 'Aloe ×nobilis', 'Aloe nobilis hort.', 'Gasteraloe x beguinii', 'Haworthiopsis attenuata f. clariperla', 'Lithops lesliei (N.E.Br.) N.E.Br.', 'Lithops lesliei N.E.Br.'
];
describe('grower queries', () => {
  it('report', () => {
    const lines = Q.map((q) => `${JSON.stringify(q).padEnd(46)} -> ${JSON.stringify(search(P, _clean(q), 5).map((e) => e.name))}`);
    writeFileSync('/tmp/review59/corpus/ux.txt', lines.join('\n') + '\n');
    expect(lines.length).toBe(Q.length);
  });
});
