# Medians, 90th percentiles and maxima of page-cpu.mjs and page-cpu-workerd.mjs output (round seventy-seven):
#   python3 scripts/dev/scale/page-cpu-stats.py <file.jsonl> ...
import json,sys,statistics as st,collections
def q(v,p): v=sorted(v); return v[min(len(v)-1,int(round(p*(len(v)-1))))]
for f in sys.argv[1:]:
  xs=[json.loads(l) for l in open(f)]
  skip=0
  print(f.split('/')[-1], 'n',len(xs),'statuses',dict(collections.Counter(x['status'] for x in xs)))
  for k in ['cpuMs','wallMs','heapMB','allocatedMB','htmlBytes','dataBytes','allocMB','heldMB']:
    v=[x[k] for x in xs if k in x]
    if v: print(f'  {k:12} med {st.median(v):9.1f}  p90 {q(v,.9):9.1f}  max {max(v):9.1f}  mean {st.mean(v):8.1f}')
  by=collections.Counter()
  for x in xs:
    for k,v in (x.get('by') or {}).items(): by[k]+=v
  tot=sum(by.values())
  for k,v in by.most_common(16): print(f'    {v/len(xs):7.2f} ms {100*v/tot:5.1f}% {k}')
  p=collections.Counter()
  for x in xs:
    for k,v in (x.get('parse') or {}).items(): p[k]+=v
  if p: print('   parse/req', {k: round(v/len(xs),2) for k,v in p.most_common()})
