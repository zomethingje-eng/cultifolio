#!/usr/bin/env bash
# Counts GBIF occurrences per plant species key (Plantae, kingdomKey=6) as
# facets, 100,000 keys a request, paged with facetOffset. Two filters:
#   coords: the occurrence.zip predicate (coordinates, no geospatial issue, present)
#   living: basisOfRecord=LIVING_SPECIMEN (botanic-garden and other living collections)
# Writes OUTDIR/<name>-<offset>.json. At most one request every 1.5 s.
set -euo pipefail
out=${1:?outdir}; mkdir -p "$out"
G='https://api.gbif.org/v1/occurrence/search?kingdomKey=6&limit=0&facet=speciesKey&facetLimit=100000'
run() { local name=$1 q=$2 off=0
  while :; do
    f="$out/$name-$off.json"
    for try in 1 2 3 4 5; do
      [ -s "$f" ] && break
      curl -sS --max-time 300 -A 'cultifolio-review/75' -o "$f.tmp" "$G&$q&facetOffset=$off" && mv "$f.tmp" "$f" || { echo "retry $try" >&2; sleep $((try*20)); }
      sleep 1.5
    done
    n=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(len(d['facets'][0]['counts']) if d['facets'] else 0)" "$f")
    echo "$name offset $off: $n"
    [ "$n" -lt 100000 ] && break
    off=$((off+100000))
  done; }
run coords 'hasCoordinate=true&hasGeospatialIssue=false&occurrenceStatus=PRESENT'
run living 'basisOfRecord=LIVING_SPECIMEN'
