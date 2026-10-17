#!/usr/bin/env bash
# Pages through iNaturalist's species_counts for Plantae observations marked
# captive/cultivated and saves each page as JSON. One request every 2.2 s
# (the project's limit for api.inaturalist.org is one every two seconds).
# Usage: inat-captive-fetch.sh OUTDIR [EXTRA_QUERY]
# species_counts rolls infraspecific observations up to their species.
set -euo pipefail
out=${1:?outdir}; extra=${2:-}
mkdir -p "$out"
page=1
while :; do
  f="$out/page-$(printf %03d $page).json"
  if [ ! -s "$f" ]; then
    for try in 1 2 3 4 5; do
      code=$(curl -sS -A 'cultifolio-review/75' -o "$f.tmp" -w '%{http_code}' \
        "https://api.inaturalist.org/v1/observations/species_counts?captive=true&iconic_taxa=Plantae&per_page=500&page=$page$extra")
      sleep 2.2
      [ "$code" = 200 ] && break
      echo "page $page: HTTP $code, backing off" >&2; sleep $((try*30))
    done
    [ "$code" = 200 ] || { echo "giving up on page $page" >&2; exit 1; }
    mv "$f.tmp" "$f"
  fi
  n=$(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))['results']))" "$f")
  echo "page $page: $n"
  [ "$n" -lt 500 ] && break
  page=$((page+1))
done
