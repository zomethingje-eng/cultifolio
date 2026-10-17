"""
Which species: the scaling study's selection measures (docs/SCALE-STUDY.md section 1). Offline; reads what
inat-captive-fetch.sh and gbif-facets.sh saved, Kew's wcvp_names.csv, GBIF's backbone (simple.txt.gz) and the
corpus's dossiers, and prints the tables the study quotes.

  python3 -I select_species.py --inat DIR --gbif DIR --wcvp wcvp_names.csv --backbone simple.txt.gz \
      --dossiers DIR --out DIR

The match to Kew (rule 3, no guessing). A source name (no author) is compared with Kew's rows of species rank of the
same words (hybrid sign, spacing and case aside). Misapplied rows are not the name's own sense and are left out. Each
remaining row leads to an accepted species: its own id when Accepted or an Artificial Hybrid, else its accepted id, and
an accepted infraspecific taxon leads to its parent species. The name is matched only when every row leads to the same
accepted species ("strict"). Refused, and counted by reason: no Kew row of those words; rows only unplaced or
misapplied; rows leading to two or more species.

Two sourced ways past "two or more species", each counted apart:
  - iNaturalist's names, "framework": iNaturalist's taxonomy for vascular plants is a taxon framework sourced to POWO
    (Kew's data) down to subspecies, with its deviations listed (https://www.inaturalist.org/taxa/211194, taxonomy
    details). A name of which Kew accepts exactly one species is that species; a name with no accepted row falls back
    to the strict rule. (The listed deviations are not applied here: a production rule reads them and refuses those.)
  - GBIF's names, "author": GBIF's backbone gives each key's authorship, so the name and author are matched to Kew's
    rows of the same words and author (spacing and full stops aside); one species so reached is that species, else the
    strict rule.
"""
import argparse, collections, glob, gzip, json, os, re, sys

ap = argparse.ArgumentParser()
for a in ('--inat', '--gbif', '--wcvp', '--backbone', '--dossiers', '--out'):
    ap.add_argument(a, required=True)
A = ap.parse_args()
os.makedirs(A.out, exist_ok=True)

def words(n):
    return re.sub(r'\s+', ' ', re.sub(r'×\s*', '', n)).strip().lower()

# ---- Kew ----
rows, by_words = {}, collections.defaultdict(list)
with open(A.wcvp, encoding='utf8') as f:
    h = f.readline().rstrip('\n').split('|')
    I = {k: h.index(k) for k in ('plant_name_id', 'taxon_rank', 'taxon_status', 'family', 'taxon_name', 'accepted_plant_name_id', 'parent_plant_name_id', 'taxon_authors', 'lifeform_description')}
    for line in f:
        x = line.rstrip('\n').split('|')
        r = {k: x[i] for k, i in I.items()}
        rows[r['plant_name_id']] = r
        if r['taxon_rank'] == 'Species':
            by_words[words(r['taxon_name'])].append(r)

def species_of(rid):
    """The accepted species a row leads to, or None."""
    r = rows.get(rid)
    if not r:
        return None
    if r['taxon_status'] not in ('Accepted', 'Artificial Hybrid'):
        r = rows.get(r['accepted_plant_name_id'] or '')
        if not r or r['taxon_status'] not in ('Accepted', 'Artificial Hybrid'):
            return None
    if r['taxon_rank'] == 'Species':
        return r['plant_name_id']
    if r['taxon_rank'] in ('Subspecies', 'Variety', 'Form', 'Subvariety', 'Subform', 'Convariety', 'proles', 'nothosubsp.', 'nothovar.'):
        p = rows.get(r['parent_plant_name_id'] or '')
        if p and p['taxon_rank'] == 'Species' and p['taxon_status'] in ('Accepted', 'Artificial Hybrid'):
            return p['plant_name_id']
    return None

def auth(a):
    return re.sub(r'[\s.]', '', a or '').lower()

def resolve(name, author=None):
    rs = [r for r in by_words.get(words(name), []) if r['taxon_status'] != 'Misapplied']
    if author:
        same = {t for t in (species_of(r['plant_name_id']) for r in rs if auth(r['taxon_authors']) == auth(author)) if t}
        if len(same) == 1:
            return same.pop(), 'ok', None
    if not by_words.get(words(name)):
        return None, 'no Kew row of these words', None
    targets = {t for t in (species_of(r['plant_name_id']) for r in rs) if t}
    acc = [r for r in rs if r['taxon_status'] in ('Accepted', 'Artificial Hybrid')]
    loose = acc[0]['plant_name_id'] if len(acc) == 1 else None
    if not targets:
        return None, 'rows only unplaced, misapplied or not leading to a species', loose
    if len(targets) > 1:
        return None, 'rows lead to two or more species', loose
    return targets.pop(), 'ok', loose

# ---- iNaturalist, captive/cultivated ----
inat = collections.Counter()
inat_loose = collections.Counter()
inat_why = collections.Counter()
inat_refused = []
nonspecies = collections.Counter()
for fn in sorted(glob.glob(os.path.join(A.inat, 'page-*.json'))):
    for x in json.load(open(fn))['results']:
        t = x['taxon']
        if t['rank'] not in ('species', 'hybrid'):
            nonspecies[t['rank']] += 1
            continue
        sid, why, loose = resolve(t['name'])
        inat_why[why] += 1
        if sid:
            inat[sid] += x['count']
        else:
            inat_refused.append((x['count'], t['name'], why))
        if sid or loose:
            inat_loose[sid or loose] += x['count']

# ---- GBIF backbone: species key → canonical name ----
canon = {}
with gzip.open(A.backbone, 'rt', encoding='utf8', errors='replace') as f:
    for line in f:
        x = line.rstrip('\n').split('\t')
        # id, parent, basionym, is_synonym, status, rank, nom_status, constituent, origin, source_taxon, kingdom, phylum,
        # class, order, family, genus, species, name_id, scientific_name, canonical_name, ...
        if len(x) > 24 and x[5] == 'SPECIES' and x[10] == '6':
            canon[x[0]] = (x[19], x[24] if x[24] != '\\N' else None)

def facet(prefix):
    c = collections.Counter()
    for fn in sorted(glob.glob(os.path.join(A.gbif, prefix + '-*.json'))):
        d = json.load(open(fn))
        for kv in d['facets'][0]['counts'] if d['facets'] else []:
            c[kv['name']] += kv['count']
    return c

def to_kew(fc):
    out, why = collections.Counter(), collections.Counter()
    for k, n in fc.items():
        nm = canon.get(k)
        if not nm:
            why['key not a species in the backbone file'] += 1
            continue
        sid, w, _ = resolve(nm[0], nm[1])
        why[w] += 1
        if sid:
            out[sid] += n
    return out, why

living_keys = facet('living')
coords_keys = facet('coords')
living, living_why = to_kew(living_keys)
coords, coords_why = to_kew(coords_keys)

# ---- Today's corpus ----
today = {}
today_unmatched = []
for fn in glob.glob(os.path.join(A.dossiers, '[0-9]*.json')):
    d = json.load(open(fn))
    e = ((d.get('name') or {}).get('kew') or {}).get('entry') or ''
    sid = species_of(e) if e else None
    if not sid:
        sid, _, _ = resolve(d['name']['scientific'])
    if sid:
        today[sid] = d['name']['scientific']
    else:
        today_unmatched.append(d['name']['scientific'])

def name(sid):
    r = rows[sid]
    return f"{r['taxon_name']} ({r['family']})"

out = {}
out['wcvp_accepted_species'] = sum(1 for r in rows.values() if r['taxon_rank'] == 'Species' and r['taxon_status'] in ('Accepted', 'Artificial Hybrid'))
out['inat'] = {'taxa_species_or_hybrid': sum(inat_why.values()), 'not_species_rank': dict(nonspecies), 'match': dict(inat_why), 'kew_species_strict': len(inat), 'kew_species_loose': len(inat_loose)}
out['gbif_living'] = {'keys': len(living_keys), 'match': dict(living_why), 'kew_species': len(living)}
out['gbif_coords'] = {'keys': len(coords_keys), 'match': dict(coords_why), 'kew_species': len(coords)}
out['today'] = {'dossiers_matched': len(today), 'unmatched': len(today_unmatched)}

def table(score, label):
    t = []
    for k in (1, 2, 3, 5, 10, 20, 50, 100, 200, 500, 1000):
        sel = {s for s, n in score.items() if n >= k}
        t.append({'k': k, 'species': len(sel), 'today_kept': len(sel & today.keys())})
    out[label] = t

table(inat, 'inat_k_strict')
table(inat_loose, 'inat_k_framework')
inat_strict = inat
inat = inat_loose  # the headline from here on: iNaturalist by its framework, GBIF by name and author
table(living, 'living_k')
union = collections.Counter()
for s in set(inat) | set(living):
    union[s] = 1
for ki in (1, 2, 3, 5):
    for kl in (1, 2, 3, 5, 10):
        sel = {s for s, n in inat.items() if n >= ki} | {s for s, n in living.items() if n >= kl}
        out.setdefault('union', []).append({'inat_k': ki, 'living_k': kl, 'species': len(sel), 'today_kept': len(sel & today.keys()), 'with_today': len(sel | today.keys())})

# Whole genera: every accepted species (hybrids aside) of a genus in which at least a share f has cultivation evidence.
evidence = {s for s, n in inat.items() if n >= 1} | {s for s, n in living.items() if n >= 1}
genus_of = lambda s: rows[s]['taxon_name'].split(' ')[0]
acc_by_genus = collections.defaultdict(set)
for r in rows.values():
    if r['taxon_rank'] == 'Species' and r['taxon_status'] == 'Accepted':
        acc_by_genus[r['taxon_name'].split(' ')[0]].add(r['plant_name_id'])
ev_by_genus = collections.Counter(genus_of(s) for s in evidence)
for f in (0.2, 0.25, 0.33, 0.5, 0.67):
    whole = set()
    for g, sp in acc_by_genus.items():
        if ev_by_genus[g] >= f * len(sp):
            whole |= sp
    sel = evidence | whole
    out.setdefault('genus_fill', []).append({'share': f, 'species': len(sel), 'added': len(sel - evidence), 'today_kept': len(sel & today.keys()), 'with_today': len(sel | today.keys())})

# Records with coordinates per selected species, for occurrence.zip's size (section 3).
def occ_sum(sel, cap=100000):
    n = [coords.get(s, 0) for s in sel]
    return {'species': len(sel), 'genera': len({rows[x]['taxon_name'].split(' ')[0] for x in sel}), 'families': len({rows[x]['family'] for x in sel}), 'records_all': sum(n), 'records_kept_2000': sum(min(x, 2000) for x in n), 'records_le_cap': sum(x for x in n if x <= cap), 'species_over_cap': sum(1 for x in n if x > cap), 'species_with_none': sum(1 for x in n if x == 0)}
out['occ_today'] = occ_sum(set(today))
for ki, kl in ((1, 1), (2, 2), (1, 2), (3, 3), (5, 5)):
    sel = {s for s, n in inat.items() if n >= ki} | {s for s, n in living.items() if n >= kl}
    out[f'occ_inat{ki}_living{kl}'] = occ_sum(sel)
for k in (1, 2, 3):
    out[f'occ_inat{k}'] = occ_sum({s for s, n in inat.items() if n >= k})
# The 100,000 most-recorded accepted species with coordinates, as an upper bracket.
top = [s for s, _ in coords.most_common()]
for n in (50000, 100000):
    out[f'occ_top{n}_by_records'] = occ_sum(set(top[:n]))

# One score: cultivated records of either kind, summed.
score = collections.Counter()
for s_ in set(inat) | set(living):
    score[s_] = inat.get(s_, 0) + living.get(s_, 0)
table(score, 'sum_k')
# The two rules the study recommends.
def rule50(k=3):
    return {s_ for s_, n in score.items() if n >= k}
def rule100(f=0.5):
    whole = set()
    for g, sp in acc_by_genus.items():
        if ev_by_genus[g] >= f * len(sp):
            whole |= sp
    return evidence | whole | set(today)
for k in (2, 3, 4, 5):
    out[f'occ_sum{k}'] = occ_sum(rule50(k))
    out[f'occ_sum{k}_with_today'] = occ_sum(rule50(k) | set(today))
out['occ_rule100'] = occ_sum(rule100())
# The same with the project's excluded families (scripts/excluded-families.txt) left out, as derive-names.ts does.
xf = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'excluded-families.txt')
excluded = {l.strip().lower() for l in open(xf) if l.strip() and not l.startswith('#')}
keep = lambda sel: {x for x in sel if rows[x]['family'].lower() not in excluded}
out['excluded_families'] = {'sum3': len(keep(rule50(3))), 'sum3_with_today': len(keep(rule50(3)) | set(today)), 'sum2_with_today': len(keep(rule50(2)) | set(today)), 'rule100': len(keep(rule100() - set(today)) | set(today)), 'rule100_share033': len(keep(rule100(0.33) - set(today)) | set(today))}
out['occ_today']['genera'] = len({rows[x]['taxon_name'].split(' ')[0] for x in today})
json.dump(out, open(os.path.join(A.out, 'select.json'), 'w'), indent=1)
with open(os.path.join(A.out, 'rule-examples.txt'), 'w') as f:
    for label, sel in (('rule50: sum>=3 with today', rule50(3) | set(today)), ('rule100', rule100())):
        gone = sorted(set(today) - sel, key=lambda s_: today[s_])
        new = sel - set(today)
        f.write(f'== {label}: {len(sel)} species; today kept {len(sel & set(today))}; out {len(gone)}; in {len(new)}\n')
        fam = collections.Counter(rows[s_]['family'] for s_ in new)
        f.write('  in, by family: ' + ', '.join(f'{k} {v}' for k, v in fam.most_common(25)) + '\n')
        ranked = sorted(new, key=lambda s_: -score.get(s_, 0))
        for s_ in ranked[:25] + ranked[len(ranked)//2:len(ranked)//2+15] + ranked[-15:]:
            f.write(f'  in: {name(s_)}  inat {inat.get(s_, 0)}  living {living.get(s_, 0)}\n')
    # what falls out of today's under evidence alone
    ev3 = rule50(3)
    gone = sorted(set(today) - ev3, key=lambda s_: today[s_])
    f.write(f'== today without cultivation evidence (sum<3): {len(gone)}\n')
    fam = collections.Counter(rows[s_]['family'] for s_ in gone)
    f.write('  by family: ' + ', '.join(f'{k} {v}' for k, v in fam.most_common(20)) + '\n')
    for s_ in gone[::max(1, len(gone)//30)]:
        f.write(f'  {name(s_)}  inat {inat.get(s_, 0)}  living {living.get(s_, 0)}\n')

# Examples: what comes in and what falls out under the rules the study weighs.
with open(os.path.join(A.out, 'examples.txt'), 'w') as f:
    for ki, kl in ((2, 2), (1, 1)):
        sel = {s for s, n in inat.items() if n >= ki} | {s for s, n in living.items() if n >= kl}
        gone = sorted(set(today) - sel, key=lambda s: today[s])
        f.write(f'== inat>={ki} or living>={kl}: {len(sel)} species; today kept {len(sel & today.keys())}; falls out {len(gone)}\n')
        fam = collections.Counter(rows[s]['family'] for s in gone)
        f.write('  falls out, by family: ' + ', '.join(f'{k} {v}' for k, v in fam.most_common(15)) + '\n')
        for s in gone[:: max(1, len(gone) // 40)]:
            f.write(f'  out: {name(s)}  inat {inat.get(s, 0)}  living {living.get(s, 0)}\n')
        new = sorted(sel - set(today), key=lambda s: -inat.get(s, 0))
        famn = collections.Counter(rows[s]['family'] for s in new)
        f.write('  comes in, by family: ' + ', '.join(f'{k} {v}' for k, v in famn.most_common(20)) + '\n')
        for s in new[:40]:
            f.write(f'  in (most observed): {name(s)}  inat {inat.get(s, 0)}  living {living.get(s, 0)}\n')
        for s in new[-15:]:
            f.write(f'  in (least observed): {name(s)}  inat {inat.get(s, 0)}  living {living.get(s, 0)}\n')
    f.write('== iNaturalist names refused, most observed first\n')
    for c, n, w in sorted(inat_refused, reverse=True)[:60]:
        f.write(f'  {c}\t{n}\t{w}\n')
    f.write('== today unmatched\n' + '\n'.join(today_unmatched) + '\n')
# The per-species scores, for re-use.
with open(os.path.join(A.out, 'scores.tsv'), 'w') as f:
    f.write('plant_name_id\ttaxon_name\tfamily\tinat_captive\tgbif_living\tgbif_coords\tin_today\n')
    for s in sorted(set(inat) | set(living) | set(today)):
        f.write(f"{s}\t{rows[s]['taxon_name']}\t{rows[s]['family']}\t{inat.get(s, 0)}\t{living.get(s, 0)}\t{coords.get(s, 0)}\t{int(s in today)}\n")
print(json.dumps(out, indent=1))
