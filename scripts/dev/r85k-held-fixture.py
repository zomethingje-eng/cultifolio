"""Round 85, K: the fixture of tests/unit/r85k-older-line.test.ts, from a live index (the copy of 31 October).

Every heading another entry holds as an older name (`syn`, `older`, `kew`) or as another author's name (`hom`), in the
families a cactus, succulent and bulb grower keeps, and the reviews' named cases in any family; each with its holders.
Only the fields the search and the picker's rows read are kept.

  python3 scripts/dev/r85k-held-fixture.py <index.json> tests/unit/fixtures/r85k-held-headings.json
"""
import json, re, sys

FAMILIES = {'Cactaceae', 'Crassulaceae', 'Aizoaceae', 'Asphodelaceae', 'Apocynaceae', 'Euphorbiaceae', 'Amaryllidaceae',
            'Iridaceae', 'Asparagaceae', 'Liliaceae', 'Anacampserotaceae', 'Portulacaceae', 'Didiereaceae', 'Talinaceae',
            'Montiaceae', 'Primulaceae', 'Araceae', 'Orchidaceae', 'Bromeliaceae', 'Colchicaceae', 'Hyacinthaceae'}
NAMED = {'Aloe vera', 'Crassula ovata', 'Echeveria elegans', 'Cyclamen hederifolium', 'Phalaenopsis amabilis', 'Sempervivum montanum',
         'Mentha canadensis', 'Platanus occidentalis', 'Agave hookeri', 'Allium senescens', 'Galanthus plicatus', 'Crocus vernus',
         'Cotyledon orbiculata', 'Amaryllis belladonna', 'Sempervivum globiferum', 'Euphorbia lathyris', 'Sarracenia flava',
         'Asclepias curassavica'}
KEEP = ('key', 'gbif', 'slug', 'name', 'family', 'common', 'syn', 'older', 'kew', 'hom', 'homBy', 'merged')

def norm(s):
    return ' '.join(s.replace('×', ' ').lower().split())

def main(src, out):
    index = json.load(open(src, encoding='utf8'))
    by_name = {}
    for e in index:
        by_name.setdefault(norm(e['name']), []).append(e)
    keys = set()
    headings = 0
    for e in index:
        for field in ('syn', 'older', 'kew', 'hom'):
            for n in e.get(field) or []:
                heads = by_name.get(norm(n), [])
                if not heads or any(h['key'] == e['key'] for h in heads):
                    continue
                if not (any(h.get('family') in FAMILIES for h in heads) or e.get('family') in FAMILIES or any(h['name'] in NAMED for h in heads)):
                    continue
                keys.add(e['key'])
                for h in heads:
                    keys.add(h['key'])
                headings += 1
    rows = [{k: e[k] for k in KEEP if k in e} for e in index if e['key'] in keys]
    json.dump(rows, open(out, 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{len(rows)} entries, {headings} holdings', file=sys.stderr)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
