"""
Round seventy-eight, agent S: the species list against today's reference, and what the genebank filter removed.
Offline; a measure for the report, not a product.

  python3 -I scripts/dev/scale/r78_compare.py --list scripts/species-list.txt --scores bulk/select/scores.tsv \
      --wcvp bulk/wcvp_names.csv --dossiers static/s/v2 --merged scripts/merged-pages.txt --out <dir>

Today's pages are matched to Kew's species as select_species.py did (round seventy-five): the dossier's Kew entry
(name.kew.entry) followed to its accepted species, else the name by the strict rule. The two pages merged in round
seventy-three are left out, so the reference is 8,945.
"""
import argparse, collections, json, os, re

ap = argparse.ArgumentParser()
for a in ('--list', '--scores', '--wcvp', '--dossiers', '--merged', '--out'):
    ap.add_argument(a, required=True)
A = ap.parse_args()
os.makedirs(A.out, exist_ok=True)

def words(n):
    return re.sub(r'\s+', ' ', re.sub(r'×\s*', '', n)).strip().lower()

rows, by_words = {}, collections.defaultdict(list)
with open(A.wcvp, encoding='utf8') as f:
    h = f.readline().rstrip('\n').split('|')
    I = {k: h.index(k) for k in ('plant_name_id', 'taxon_rank', 'taxon_status', 'family', 'taxon_name', 'accepted_plant_name_id', 'parent_plant_name_id', 'genus')}
    for line in f:
        x = line.rstrip('\n').split('|')
        r = {k: x[i] for k, i in I.items()}
        rows[r['plant_name_id']] = r
        if r['taxon_rank'] == 'Species':
            by_words[words(r['taxon_name'])].append(r)

INFRA = {'Subspecies', 'Variety', 'Form', 'Subvariety', 'Subform', 'Convariety', 'proles', 'nothosubsp.', 'nothovar.', 'lusus', 'microgène'}
def species_of(rid):
    r = rows.get(rid)
    if not r or r['taxon_status'] == 'Misapplied':
        return None
    if r['taxon_status'] not in ('Accepted', 'Artificial Hybrid'):
        r = rows.get(r['accepted_plant_name_id'] or '')
        if not r or r['taxon_status'] not in ('Accepted', 'Artificial Hybrid'):
            return None
    if r['taxon_rank'] == 'Species':
        return r['plant_name_id'] if r['taxon_status'] == 'Accepted' else None
    if r['taxon_rank'] in INFRA:
        p = rows.get(r['parent_plant_name_id'] or '')
        if p and p['taxon_rank'] == 'Species' and p['taxon_status'] == 'Accepted':
            return p['plant_name_id']
    return None

def strict(name):
    t = {species_of(r['plant_name_id']) for r in by_words.get(words(name), []) if r['taxon_status'] != 'Misapplied'}
    t.discard(None)
    return t.pop() if len(t) == 1 else None

# The list.
lst = {}
for l in open(A.list, encoding='utf8'):
    if l.startswith('#') or not l.strip():
        continue
    c = l.rstrip('\n').split('\t')
    lst[c[0]] = {'name': c[1], 'family': c[3], 'reason': c[4], 'gbif': c[5]}

# Scores.
sc = {}
with open(A.scores, encoding='utf8') as f:
    f.readline()
    for l in f:
        c = l.rstrip('\n').split('\t')
        sc[c[0]] = {'name': c[1], 'family': c[2], 'inat': int(c[3]), 'counted': int(c[4]), 'excluded': int(c[5]), 'undecided': int(c[6]), 'collector': c[7] == '1'}

# Today's reference.
merged = {l.split('\t')[0] for l in open(A.merged, encoding='utf8') if l.strip() and not l.startswith('#')}
index = json.load(open(os.path.join(A.dossiers, 'index.json'), encoding='utf8'))
today, unmatched, key_of = {}, [], {}
for e in index:
    if str(e['key']) in merged:
        continue
    d = json.load(open(os.path.join(A.dossiers, f"{e['key']}.json"), encoding='utf8'))
    entry = ((d.get('name') or {}).get('kew') or {}).get('entry') or ''
    sid = species_of(entry) if entry else None
    sid = sid or strict(d['name']['scientific'])
    if sid:
        today.setdefault(sid, []).append(e['name'])
        key_of[sid] = e['key']
    else:
        unmatched.append(e['name'])

out = {}
n_today = sum(len(v) for v in today.values()) + len(unmatched)
out['today_pages'] = n_today
out['today_kew_species'] = len(today)
out['today_unmatched'] = sorted(unmatched)
out['today_two_pages_one_species'] = {k: v for k, v in today.items() if len(v) > 1}
kept = [s for s in today if s in lst]
out['today_kept'] = len(kept)
clause = collections.Counter()
for s in kept:
    r = lst[s]['reason']
    clause['both' if ';' in r else 'collector genus' if r == 'collector genus' else 'records'] += 1
out['today_kept_by_clause'] = dict(clause)
dropped = sorted((s for s in today if s not in lst), key=lambda s: rows[s]['taxon_name'])
out['today_dropped'] = [f"{rows[s]['taxon_name']} ({rows[s]['family']}; Kew {s}; inat {sc.get(s, {}).get('inat', 0)}, gbif counted {sc.get(s, {}).get('counted', 0)}, excluded {sc.get(s, {}).get('excluded', 0)}, not decided {sc.get(s, {}).get('undecided', 0)}; today {', '.join(today[s])})" for s in dropped]
# GBIF key agreement with today's page keys.
agree = sum(1 for s in kept if lst[s]['gbif'] == str(key_of[s]))
nokey = sum(1 for s in kept if lst[s]['gbif'] == '-')
out['today_gbif_key'] = {'same': agree, 'none_in_list': nokey, 'other': len(kept) - agree - nokey,
                         'other_examples': [f"{lst[s]['name']}: list {lst[s]['gbif']}, today {key_of[s]}" for s in kept if lst[s]['gbif'] not in ('-', str(key_of[s]))][:30]}

# What the genebank filter removed: species that reach 3 with every living dataset counted, but not with the counted
# side alone, and are not kept by a collector genus.
def total(s, *sides):
    return sc[s]['inat'] + sum(sc[s][k] for k in sides)
fell_exc = [s for s in sc if not sc[s]['collector'] and total(s, 'counted') < 3 and total(s, 'counted', 'excluded') >= 3]
fell_und = [s for s in sc if not sc[s]['collector'] and total(s, 'counted') < 3 and total(s, 'counted', 'excluded') < 3 and total(s, 'counted', 'excluded', 'undecided') >= 3]
out['all_living_counted_would_select'] = sum(1 for s in sc if sc[s]['collector'] or total(s, 'counted', 'excluded', 'undecided') >= 3)
out['removed_by_genebank_side'] = len(fell_exc)
out['removed_by_not_decided_side'] = len(fell_und)
out['removed_by_genebank_side_by_family'] = collections.Counter(sc[s]['family'] for s in fell_exc).most_common(25)
out['removed_by_not_decided_by_family'] = collections.Counter(sc[s]['family'] for s in fell_und).most_common(15)
crops = ['Triticum aestivum', 'Triticum turgidum', 'Oryza sativa', 'Hordeum vulgare', 'Zea mays', 'Secale cereale', 'Avena sativa', 'Sorghum bicolor', 'Pisum sativum', 'Phaseolus vulgaris', 'Vicia faba', 'Brassica oleracea', 'Solanum tuberosum', 'Solanum lycopersicum', 'Lens culinaris', 'Cicer arietinum', 'Glycine max', 'Helianthus annuus', 'Linum usitatissimum', 'Beta vulgaris', 'Daucus carota', 'Allium cepa', 'Cucumis sativus', 'Capsicum annuum', 'Malus domestica', 'Prunus avium', 'Vitis vinifera', 'Aegilops tauschii', 'Triticum monococcum', 'Lathyrus sativus', 'Vigna unguiculata', 'Panicum miliaceum', 'Setaria italica', 'Fagopyrum esculentum', 'Medicago sativa', 'Trifolium pratense', 'Lolium perenne', 'Festuca pratensis', 'Dactylis glomerata', 'Phleum pratense']
out['crops'] = {}
for nm in crops:
    ids = [s for s in sc if sc[s]['name'] == nm]
    for s in ids:
        out['crops'][nm] = {'inat': sc[s]['inat'], 'counted': sc[s]['counted'], 'excluded': sc[s]['excluded'], 'undecided': sc[s]['undecided'], 'selected': s in lst}
ex = sorted(fell_exc, key=lambda s: -sc[s]['excluded'])
out['removed_by_genebank_examples'] = [f"{sc[s]['name']} ({sc[s]['family']}): inat {sc[s]['inat']}, counted {sc[s]['counted']}, genebank {sc[s]['excluded']}" for s in ex[:40]]
eu = sorted(fell_und, key=lambda s: -sc[s]['undecided'])
out['removed_by_not_decided_examples'] = [f"{sc[s]['name']} ({sc[s]['family']}): inat {sc[s]['inat']}, counted {sc[s]['counted']}, not decided {sc[s]['undecided']}" for s in eu[:30]]
# Crop species with genebank records that are still in (their records elsewhere reach 3).
still = sorted((s for s in sc if sc[s]['excluded'] >= 100 and s in lst), key=lambda s: -sc[s]['excluded'])
out['genebank_heavy_still_in'] = [f"{sc[s]['name']}: inat {sc[s]['inat']}, counted {sc[s]['counted']}, genebank {sc[s]['excluded']}" for s in still[:20]]
out['genebank_heavy_still_in_count'] = len(still)
# Families of the list, and species added beyond today.
fam = collections.Counter(lst[s]['family'] for s in lst if s not in today)
out['added_beyond_today'] = sum(1 for s in lst if s not in today)
out['added_by_family'] = fam.most_common(15)
json.dump(out, open(os.path.join(A.out, 'compare.json'), 'w', encoding='utf8'), indent=1, ensure_ascii=False)
print(json.dumps({k: v for k, v in out.items() if not isinstance(v, list) or len(v) < 50}, indent=1, ensure_ascii=False)[:20000])
