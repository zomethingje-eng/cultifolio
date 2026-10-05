// Round 59 corpus reviewer: a synthetic index of realistic size and shape.
let seed = 12345;
export const reseed = (s: number) => { seed = s; };
export const rnd = (n: number) => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n); };
export const pick = <T>(xs: T[]) => xs[rnd(xs.length)];

const GENERA: Array<[string, string, number]> = [
  // genus, family, weight (species count relative)
  ['Mammillaria', 'Cactaceae', 180], ['Opuntia', 'Cactaceae', 120], ['Echinopsis', 'Cactaceae', 80], ['Gymnocalycium', 'Cactaceae', 70],
  ['Copiapoa', 'Cactaceae', 30], ['Eriosyce', 'Cactaceae', 50], ['Parodia', 'Cactaceae', 60], ['Rebutia', 'Cactaceae', 40],
  ['Coryphantha', 'Cactaceae', 50], ['Ferocactus', 'Cactaceae', 30], ['Echinocereus', 'Cactaceae', 70], ['Cereus', 'Cactaceae', 30],
  ['Cleistocactus', 'Cactaceae', 40], ['Turbinicarpus', 'Cactaceae', 25], ['Astrophytum', 'Cactaceae', 6], ['Ariocarpus', 'Cactaceae', 8],
  ['Melocactus', 'Cactaceae', 35], ['Discocactus', 'Cactaceae', 15], ['Frailea', 'Cactaceae', 20], ['Sulcorebutia', 'Cactaceae', 30],
  ['Rhipsalis', 'Cactaceae', 35], ['Epiphyllum', 'Cactaceae', 15], ['Cylindropuntia', 'Cactaceae', 35], ['Echinocactus', 'Cactaceae', 6],
  ['Aloe', 'Asphodelaceae', 500], ['Haworthia', 'Asphodelaceae', 60], ['Haworthiopsis', 'Asphodelaceae', 18], ['Gasteria', 'Asphodelaceae', 25],
  ['Bulbine', 'Asphodelaceae', 70], ['Aloidendron', 'Asphodelaceae', 7], ['Tulista', 'Asphodelaceae', 4],
  ['Euphorbia', 'Euphorbiaceae', 600], ['Jatropha', 'Euphorbiaceae', 40], ['Monadenium', 'Euphorbiaceae', 20],
  ['Lithops', 'Aizoaceae', 40], ['Conophytum', 'Aizoaceae', 110], ['Delosperma', 'Aizoaceae', 100], ['Ruschia', 'Aizoaceae', 200],
  ['Haworthia', 'Asphodelaceae', 0], ['Faucaria', 'Aizoaceae', 10], ['Pleiospilos', 'Aizoaceae', 4], ['Titanopsis', 'Aizoaceae', 3],
  ['Mesembryanthemum', 'Aizoaceae', 100], ['Lampranthus', 'Aizoaceae', 150], ['Glottiphyllum', 'Aizoaceae', 16],
  ['Crassula', 'Crassulaceae', 200], ['Echeveria', 'Crassulaceae', 170], ['Sedum', 'Crassulaceae', 400], ['Kalanchoe', 'Crassulaceae', 140],
  ['Graptopetalum', 'Crassulaceae', 20], ['Dudleya', 'Crassulaceae', 45], ['Aeonium', 'Crassulaceae', 35], ['Cotyledon', 'Crassulaceae', 10],
  ['Tylecodon', 'Crassulaceae', 45], ['Adromischus', 'Crassulaceae', 28], ['Sempervivum', 'Crassulaceae', 40], ['Pachyphytum', 'Crassulaceae', 20],
  ['Agave', 'Asparagaceae', 200], ['Yucca', 'Asparagaceae', 50], ['Sansevieria', 'Asparagaceae', 70], ['Dracaena', 'Asparagaceae', 120],
  ['Ledebouria', 'Asparagaceae', 40], ['Albuca', 'Asparagaceae', 140], ['Ornithogalum', 'Asparagaceae', 200], ['Drimia', 'Asparagaceae', 100],
  ['Haemanthus', 'Amaryllidaceae', 22], ['Brunsvigia', 'Amaryllidaceae', 20], ['Boophone', 'Amaryllidaceae', 2], ['Crinum', 'Amaryllidaceae', 110],
  ['Nerine', 'Amaryllidaceae', 25], ['Hippeastrum', 'Amaryllidaceae', 90], ['Cyrtanthus', 'Amaryllidaceae', 60], ['Gethyllis', 'Amaryllidaceae', 35],
  ['Stapelia', 'Apocynaceae', 40], ['Huernia', 'Apocynaceae', 70], ['Ceropegia', 'Apocynaceae', 200], ['Pachypodium', 'Apocynaceae', 25],
  ['Adenium', 'Apocynaceae', 6], ['Hoodia', 'Apocynaceae', 13], ['Orbea', 'Apocynaceae', 60],
  ['Welwitschia', 'Welwitschiaceae', 1], ['Dioscorea', 'Dioscoreaceae', 60], ['Adenia', 'Passifloraceae', 90], ['Fouquieria', 'Fouquieriaceae', 11],
  ['Portulacaria', 'Didiereaceae', 2], ['Anacampseros', 'Anacampserotaceae', 30], ['Avonia', 'Anacampserotaceae', 13], ['Senecio', 'Asteraceae', 150],
  ['Curio', 'Asteraceae', 20], ['Othonna', 'Asteraceae', 120], ['Oxalis', 'Oxalidaceae', 100], ['Massonia', 'Asparagaceae', 10],
  ['Lachenalia', 'Asparagaceae', 130], ['Gladiolus', 'Iridaceae', 150], ['Moraea', 'Iridaceae', 150], ['Romulea', 'Iridaceae', 80],
  ['Strumaria', 'Amaryllidaceae', 30], ['Bowiea', 'Asparagaceae', 2], ['Eriospermum', 'Asparagaceae', 100], ['Cyphostemma', 'Vitaceae', 80],
  ['Pelargonium', 'Geraniaceae', 200], ['Sarcocaulon', 'Geraniaceae', 14], ['Ibervillea', 'Cucurbitaceae', 8], ['Uncarina', 'Pedaliaceae', 13],
  ['Dorstenia', 'Moraceae', 100], ['Fockea', 'Apocynaceae', 6], ['Brachystelma', 'Apocynaceae', 100], ['Tillandsia', 'Bromeliaceae', 300],
  ['Dyckia', 'Bromeliaceae', 150], ['Hechtia', 'Bromeliaceae', 70], ['Puya', 'Bromeliaceae', 200], ['Beaucarnea', 'Asparagaceae', 10],
  ['Calibanus', 'Asparagaceae', 1], ['Nolina', 'Asparagaceae', 30], ['Dasylirion', 'Asparagaceae', 20], ['Hesperaloe', 'Asparagaceae', 7]
];
const EPI = ['cinerea', 'humilis', 'mirabilis', 'vera', 'polyphylla', 'ferox', 'marlothii', 'dichotoma', 'plicatilis', 'striata', 'aristata', 'variegata', 'nobilis', 'brevifolia',
  'lesliei', 'karasmontana', 'aucampiae', 'optica', 'dorotheae', 'julii', 'bilobum', 'calculus', 'truncatum', 'minimum', 'obcordellum', 'cooperi', 'attenuata', 'fasciata',
  'limifolia', 'truncata', 'retusa', 'obtusa', 'cymbiformis', 'mammillaris', 'elongata', 'bocasana', 'plumosa', 'gracilis', 'spinosissima', 'microdasys', 'ficus-indica',
  'grusonii', 'asterias', 'myriostigma', 'capricorne', 'ornatum', 'fissuratus', 'retusus', 'kotschoubeyanus', 'mihanovichii', 'baldianum', 'saglionis', 'horstii',
  'columna-alba', 'gigantea', 'krainziana', 'dealbata', 'haseltoniana', 'tenuissima', 'hypogaea', 'laui', 'obesa', 'milii', 'horrida', 'meloformis', 'trigona', 'tirucalli',
  'ovata', 'perforata', 'arborescens', 'muscosa', 'elegans', 'agavoides', 'pulvinata', 'setosa', 'lilacina', 'laui', 'purpusorum', 'tomentosa', 'daigremontiana',
  'americana', 'parryi', 'victoriae-reginae', 'potatorum', 'titanota', 'utahensis', 'filifera', 'stricta', 'lophantha', 'gentryi', 'salmiana', 'colorata', 'macroacantha',
  'coccinea', 'albiflora', 'densiflora', 'parviflora', 'grandiflora', 'longiflora', 'rosea', 'lutea', 'alba', 'rubra', 'aurea', 'viridis', 'glauca', 'pallida', 'nigra',
  'bainesii', 'welwitschii', 'marlothianus', 'peersii', 'schoenlandii', 'pillansii', 'dinteri', 'herrei', 'schwantesii', 'wittebergensis', 'namaquensis', 'capensis',
  'africana', 'mexicana', 'chilensis', 'bolivianus', 'peruviana', 'brasiliensis', 'argentina', 'paraguayensis', 'madagascariensis', 'somaliensis', 'arabica', 'socotrana',
  'thouarsii', 'lamerei', 'geayi', 'rosulatum', 'densiflorum', 'brevicaule', 'gracilius', 'bispinosum', 'succulentum', 'namaquanum', 'saundersii', 'decaryi'];
const ORIGINS = ['Cape Provinces', 'Northern Provinces', 'KwaZulu-Natal', 'Namibia', 'Botswana', 'Madagascar', 'Mexico Northeast', 'Mexico Central', 'Mexico Southwest',
  'Mexico Gulf', 'Chile North', 'Chile Central', 'Peru', 'Bolivia', 'Argentina Northwest', 'Argentina Northeast', 'Brazil Northeast', 'Brazil Southeast', 'Paraguay', 'Arizona',
  'Texas', 'California', 'New Mexico', 'Canary Is.', 'Socotra', 'Somalia', 'Ethiopia', 'Kenya', 'Tanzania', 'Yemen', 'Oman', 'Angola', 'Zimbabwe', 'Mozambique', 'Lesotho',
  'Swaziland', 'Venezuela', 'Colombia', 'Ecuador', 'Cuba', 'Hispaniola', 'Jamaica', 'Leeward Is.', 'Morocco', 'Sinai', 'Saudi Arabia', 'Uruguay', 'Galápagos', 'Ceará',
  'São Paulo', 'Bahía', 'Querétaro', 'Nuevo León', 'Réunion', 'Zaïre'];
const COMMON = ['living stones', 'stone plant', 'split rock', 'tiger jaws', 'zebra plant', 'zebra haworthia', 'old man cactus', 'golden barrel cactus', 'bunny ears',
  'prickly pear', 'star cactus', 'sand dollar cactus', 'bishop\'s cap', 'crown of thorns', 'pencil cactus', 'jade plant', 'string of pearls', 'string of hearts', 'burro\'s tail',
  'hen and chicks', 'mother of thousands', 'panda plant', 'century plant', 'queen victoria agave', 'snake plant', 'mother-in-law\'s tongue', 'elephant foot', 'ponytail palm',
  'desert rose', 'medusa\'s head', 'baseball plant', 'carrion flower', 'starfish flower', 'lifesaver plant', 'blood lily', 'paintbrush lily', 'candelabra lily', 'tree aloe',
  'quiver tree', 'fan aloe', 'tumbo', 'tree tumbo', 'silver cactus', 'peanut cactus', 'moon cactus', 'chin cactus', 'rat tail cactus', 'orchid cactus', 'mistletoe cactus',
  'Christmas cactus', 'turk\'s cap', 'pincushion cactus', 'hedgehog cactus', 'fishhook cactus', 'feather cactus', 'ghost plant', 'pearly moonstones', 'flapjacks',
  'paddle plant', 'pig\'s ear', 'baby toes', 'ice plant', 'pebble plant', 'sea onion', 'climbing onion', 'pregnant onion', 'Natal lily', 'Cape cowslip', 'sorrel',
  'resurrection plant', 'Bushman\'s candle', 'Kaktus-Kugel', 'mala madre', 'biznaga', 'nopal', 'cardón', 'órgano', 'pitahaya', 'piñuela'];
const AUTH = ['L.', 'Haw.', 'Phil.', 'Britton & Rose', '(Phil.) Britton & Rose', 'N.E.Br.', 'Schwantes', 'Baker', 'Jacq.', 'Lem.', 'Engelm.', 'Salm-Dyck', '(Haw.) G.D.Rowley',
  'Marloth', 'Dinter', 'Pillans', 'Backeb.', 'F.Ritter', 'Hook.f.', 'Boiss.', 'Willd.', 'Mill.', 'DC.', 'Zucc.', 'Pfeiff.', 'Hort. ex Lem.'];
const CULT = ['Perle von Nürnberg', 'Ruby', 'Lola', 'Black Prince', 'Gollum', 'Hobbit', 'Super Zebra', 'Kikko', 'Fuku-ryu', 'Hakuō', 'Variegata', 'Blue Elf', 'Topsy Turvy', 'Afterglow', 'Fred Ives'];

function epithet(): string {
  if (rnd(4)) return pick(EPI);
  // a latin-ish epithet
  const syl = ['ka', 'ro', 'li', 'ta', 'ma', 'ne', 'si', 'pho', 'ri', 'go', 'den', 'mon', 'tor', 'ber', 'lan', 'ci', 'qu'];
  return Array.from({ length: 2 + rnd(3) }, () => pick(syl)).join('') + pick(['ii', 'ensis', 'iana', 'a', 'um', 'us', 'oides', 'ata', 'ifolia']);
}

export interface Entry { key: number; slug: string; name: string; family?: string; common?: string; origin?: string[]; syn?: string[]; open: number; photos: number; climate: string; thumb?: string; near?: number[] }
export interface Shape { infra: string[]; hybrid: string[]; cultivar: string[] }

/** `n` species with a real-world spread of genera, ranks, hybrids, cultivars, synonyms with authors stripped as the index keeps them, common names, origins with accents. */
export function synthIndex(n: number): { idx: Entry[]; shape: Shape } {
  const total = GENERA.reduce((s, g) => s + g[2], 0);
  const out: Entry[] = [];
  const shape: Shape = { infra: [], hybrid: [], cultivar: [] };
  const used = new Set<string>();
  let key = 1000;
  let guard = 0;
  while (out.length < n) {
    if (++guard > n * 50) throw new Error(`synth stuck at ${out.length}`);
    let r = rnd(total), gi = 0;
    while (r >= GENERA[gi][2]) { r -= GENERA[gi][2]; gi++; }
    const [g, fam] = GENERA[gi];
    let name: string;
    const kind = rnd(100);
    if (kind < 8) { name = `${g} ${epithet()} ${pick(['var.', 'subsp.', 'f.'])} ${epithet()}`; }
    else if (kind < 11) { name = rnd(2) ? `${g} × ${epithet()}` : `× ${pick(['Gasteraloe', 'Gasterhaworthia', 'Pachyveria', 'Graptoveria', 'Sedeveria'])} ${epithet()}`; }
    else if (kind < 12) { name = `${g} ${epithet()} '${pick(CULT)}'`; }
    else name = `${g} ${epithet()}`;
    if (used.has(name)) continue;
    used.add(name);
    if (kind < 8) shape.infra.push(name); else if (kind < 11) shape.hybrid.push(name); else if (kind < 12) shape.cultivar.push(name);
    const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/×/g, 'x').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const syn = rnd(3) ? undefined : Array.from({ length: 1 + rnd(3) }, () => `${pick(GENERA)[0]} ${epithet()}${rnd(5) ? '' : ` var. ${epithet()}`}`);
    out.push({
      key: key++, slug, name, family: fam,
      common: rnd(4) ? undefined : Array.from({ length: 1 + rnd(2) }, () => pick(COMMON)).join(', '),
      origin: Array.from({ length: 1 + rnd(3) }, () => pick(ORIGINS)),
      syn, open: rnd(500), photos: rnd(30), climate: pick(['ok', 'ok', 'ok', 'refused', 'pending', 'none'])
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return { idx: out, shape };
}
export const AUTHORS = AUTH;
export const GENUS_NAMES = GENERA.map((g) => g[0]);
