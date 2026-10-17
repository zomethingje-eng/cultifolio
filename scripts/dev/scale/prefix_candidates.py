"""
How many candidates the exact pass of the search draws at 100,000 species if the postings keyed words by prefixes of up
to L characters rather than 3 (docs/SCALE-STUDY.md section 2). An entry is a candidate when, for every query word, some
word of the entry begins with the query word's first min(L, len) characters, as $core/postings reads them.
  python3 -I prefix_candidates.py <index.json>
"""
import json, re, sys, unicodedata, collections
idx = json.load(open(sys.argv[1]))
def words(s):
    s = unicodedata.normalize('NFD', s); s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"['’‘`ʼ]", '', s)
    return [w for w in re.split(r'[^a-z0-9]+', s) if w]
ews = []
for e in idx:
    ws = set()
    for f in [e['name'], e.get('common', ''), e.get('family', '')] + e.get('commons', []) + e.get('spellings', []) + e.get('origin', []) + e.get('syn', []) + e.get('older', []):
        ws.update(words(f))
    ews.append(ws)
queries = ['aloe', 'aloe vera', 'copiapoa cinerea', 'silver', 'string of pearls', 'mammillaria', 'cactus', 'echeveria', 'rose', 'monstera deliciosa', 'snake plant', 'phalaenopsis', 'japanese maple', 'south africa']
for L in (3, 4, 5, 6):
    by = collections.defaultdict(set)
    for i, ws in enumerate(ews):
        for w in ws:
            for n in range(1, min(L, len(w)) + 1):
                by[w[:n]].add(i)
    keys = len(by); rows = sum(len(v) for v in by.values())
    res = []
    for q in queries:
        acc = None
        for w in words(q):
            s = by.get(w[:L], set())
            acc = s if acc is None else acc & s
        res.append((q, len(acc)))
    print(json.dumps({'L': L, 'keys': keys, 'postingRows': rows, 'candidates': res}))

# The proposal's sizes: keys of 3 to 5 characters whose candidates are at most CAP carry their candidates' search docs
# inline (one read answers a query); shorter or heavier keys carry the whole index's best SHORT answers, as short.json does.
CAP, SHORT = 2000, 100
doc = [len(json.dumps({k: e.get(k) for k in ('name', 'common', 'commons', 'spellings', 'family', 'origin', 'syn', 'older', 'photos') if e.get(k)}, ensure_ascii=False)) for e in idx]
by = collections.defaultdict(set)
for i, ws in enumerate(ews):
    for w in ws:
        for n in range(1, min(5, len(w)) + 1):
            by[w[:n]].add(i)
inline_rows = inline_bytes = heavy = 0
sizes = []
for k, v in by.items():
    if len(k) >= 3 and len(v) <= CAP:
        b = sum(doc[i] for i in v); inline_rows += len(v); inline_bytes += b; sizes.append(b)
    else:
        heavy += 1
sizes.sort()
print(json.dumps({'docAvg': sum(doc) / len(doc), 'keys': len(by), 'inlineKeys': len(sizes), 'inlineRows': inline_rows, 'inlineBytes': inline_bytes, 'heavyKeys': heavy, 'heavyBytes': heavy * SHORT * 8, 'keyFileMedian': sizes[len(sizes) // 2], 'keyFileP99': sizes[int(len(sizes) * .99)], 'keyFileMax': sizes[-1]}))
