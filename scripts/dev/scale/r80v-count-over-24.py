# Round eighty, agent V: how many of the species list's species have more than 24 observations of the builder's wild set
# (research grade, not captive, with a CC0, CC BY or CC BY-SA photograph, the taxon and every taxon below it), so that
# the open data's 24 are not the whole set and the fill asks the API for the 24 most voted.
#
# Input: iNaturalist's species counts with the wild request's own filters, every plant species, by count descending, until
# a page's last count is 24 or less (500 a page, one request every 2.1 s, the project's User-Agent):
#   https://api.inaturalist.org/v1/observations/species_counts?quality_grade=research&captive=false&photos=true
#     &photo_license=cc0,cc-by,cc-by-sa&taxon_id=47126&per_page=500&page=<n>
# saved as <dir>/page-<nnn>.json. A species' count takes in its subspecies and varieties, as `taxon_id` does (checked on
# Achillea millefolium: 33,748 by both). The list is matched by name (an estimate only, never a build rule); the corpus's
# pages are matched by their own iNaturalist ids too, which measures what matching by name misses.
#
#   python3 -I scripts/dev/scale/r80v-count-over-24.py <pages dir> scripts/species-list.txt <version 2 corpus dir>
import json, glob, re, sys
pages_dir, list_path, corpus_dir = sys.argv[1:4]
counts, by_name, total = {}, {}, None
norm = lambda s: re.sub(r'\s+', ' ', s.replace('× ', '×')).strip().lower()
for f in sorted(glob.glob(f'{pages_dir}/page-*.json')):
    d = json.load(open(f)); total = d['total_results']
    for r in d['results']:
        counts[r['taxon']['id']] = r['count']
        by_name.setdefault(norm(r['taxon']['name']), r['count'])
rows = [l.rstrip('\n').split('\t') for l in open(list_path) if not l.startswith('#')]
list_over = sum(1 for r in rows if by_name.get(norm(r[1]), 0) > 24)
c = {'pages': 0, 'withId': 0, 'overById': 0, 'overByName': 0, 'overByBoth': 0}
for p in glob.glob(f'{corpus_dir}/*.json'):
    if not re.search(r'/\d+\.json$', p): continue
    d = json.load(open(p)); c['pages'] += 1
    i = (d.get('ids') or {}).get('inat')
    a = bool(i) and counts.get(i, 0) > 24
    b = by_name.get(norm(d['name']['scientific']), 0) > 24
    c['withId'] += bool(i); c['overById'] += a; c['overByName'] += b; c['overByBoth'] += a and b
recall = c['overByBoth'] / c['overById'] if c['overById'] else 1
out = {
    'asked': 'iNaturalist species_counts, the wild filters, 2026-10-21',
    'plantLeafTaxa': total, 'speciesOver24': sum(1 for v in counts.values() if v > 24),
    'list': {'species': len(rows), 'over24ByName': list_over, 'over24Estimated': round(list_over / recall)},
    'corpus': c, 'byNameFindsOfById': round(recall, 4),
}
print(json.dumps(out, indent=1))
