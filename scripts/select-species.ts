/**
 * The species list (round seventy-eight; the owner's decisions 1 and 5 of 2026-10-19): writes scripts/species-list.txt,
 * every species Kew accepts with at least three cultivated records, plus every accepted species of the collector genera
 * taken whole, plus every species already in the reference, one line a species by Kew's plant_name_id (a page of the
 * reference that Kew's checklist cannot place by its GBIF key alone). Round seventy-nine builds the reference from it.
 *
 *   node --max-old-space-size=4096 --import tsx scripts/select-species.ts [--cache bulk/select] [--bulk bulk] [--backbone bulk/backbone/simple.txt.gz] \
 *     [--out scripts/species-list.txt] [--reference static/s/v3, else static/s/v2] [--merged scripts/merged-pages.txt] [--offline] [--deviations <file>]
 *
 * The reference is the corpus on disk (its index.json and dossiers): each page's species is the Kew entry it cites,
 * followed to its accepted species, else its name by the strict rule; a page merged into another (scripts/merged-pages.txt)
 * is not a page.
 *
 * About a minute and up to 4 GB of memory once the sources are kept (Kew's 1.4 million names are held at once).
 *
 * Cultivated records: iNaturalist's observations of plants marked captive or cultivated (species_counts, every page),
 * and GBIF's living-specimen records of plants from the datasets the dataset rule counts (scripts/select-species-lib.ts,
 * DATASET_RULE): a botanic garden's living collection is counted, a genebank's accessions are not, and a dataset the rule
 * cannot decide is not counted. The two are added together.
 *
 * Names: matched to Kew's checklist (bulk/wcvp_names.csv, `npm run bulk -- wcvp`) offline under rule 3, iNaturalist's
 * names also by its taxon framework sourced to POWO (decision 5), GBIF's keys by the backbone's name and author
 * (bulk/backbone/simple.txt.gz, from https://hosted-datasets.gbif.org/datasets/backbone/current/simple.txt.gz).
 *
 * Writes, beside the list: scripts/excluded-datasets.txt, scripts/counted-datasets.txt and scripts/undecided-datasets.txt
 * (every dataset, by side, with the rule's reason), scripts/species-refused.txt (every name or key refused, with its
 * reason), and <cache>/scores.tsv (every species with a record, by source and side; for review, droppable).
 *
 * Re-runnable: every answer is kept under --cache, so a second run asks nothing; --offline asks nothing and stops on a
 * missing file. A first run asks GBIF about 740 times (one a second: a dataset facet, then each dataset's metadata,
 * publisher and species) and iNaturalist about 120 times (one every two seconds): about 20 minutes.
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { writeAtomic } from './write-atomic';
import { gbifLiving, inatCaptive, cacheDays, datasetFacetUrl, inatPageUrl, speciesFacetUrl, type Cache, type LivingDataset } from './select-species-sources';
import {
  DATASET_RULE, MIN_RECORDS, REFUSALS, backboneLine, classifyDataset, collectorSpecies, deviationsOf, formatSpeciesList, gbifKeyFor, kewLoader,
  matchInat, matchStrict, referenceSpecies, select, heldThroughRange, REASON_REFERENCE, type ReferencePage, words, type BackboneName, type DatasetFacts, type DatasetVerdict, type FrameworkRelationship, type Kew
} from './select-species-lib';

const args = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const cacheDir = arg('--cache', 'bulk/select');
const bulkDir = arg('--bulk', 'bulk');
const backbonePath = arg('--backbone', `${bulkDir}/backbone/simple.txt.gz`);
const out = arg('--out', 'scripts/species-list.txt');
const outDir = out.includes('/') ? out.slice(0, out.lastIndexOf('/')) : '.';
const generaPath = arg('--genera', 'scripts/specialist-genera.txt');
const deviationsPath = arg('--deviations', '');
// The corpus on disk: version 3 (pages by id, round seventy-eight) once its corpus step has written it, else version 2.
const referenceDir = arg('--reference', existsSync('static/s/v3/index.json') ? 'static/s/v3' : 'static/s/v2');
const mergedPath = arg('--merged', 'scripts/merged-pages.txt');
const offline = args.includes('--offline');
const log = (s: string) => console.log(s);

/** A large file's lines, streamed: never the whole file in memory. */
function lines(p: string) {
  const input = createReadStream(p);
  return createInterface({ input: p.endsWith('.gz') ? input.pipe(createGunzip()) : input, crlfDelay: Infinity });
}

const readList = (p: string) => readFileSync(p, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const n = (x: number) => x.toLocaleString('en-GB');
const tsv = (...c: Array<string | number>) => c.map((x) => String(x).replace(/[\t\r\n]+/g, ' ')).join('\t');

async function main() {
  const wcvpPath = `${bulkDir}/wcvp_names.csv`;
  for (const p of [wcvpPath, backbonePath, generaPath, `${referenceDir}/index.json`, mergedPath]) if (!existsSync(p)) throw new Error(`${p} is missing (Kew's file: npm run bulk -- wcvp; the backbone: see this script's header; the reference: the corpus on disk).`);
  const cache: Cache = { dir: cacheDir, offline, asked: {}, missing: [] };

  log('GBIF living-specimen datasets of plants…');
  const living = await gbifLiving(cache, log);
  log('iNaturalist observations marked captive or cultivated…');
  const inat = await inatCaptive(cache, log);
  if (cache.missing.length) throw new Error(`--offline, and ${cache.missing.length} source files are not in ${cacheDir}: ${cache.missing.slice(0, 5).join(', ')}${cache.missing.length > 5 ? ', …' : ''}. Run without --offline once.`);
  const incomplete = living.datasets.filter((d) => !d.meta || !d.species);
  if (incomplete.length) throw new Error(`${incomplete.length} datasets were not read whole; run again.`);

  // ---- the datasets ----
  const verdicts = new Map<string, DatasetVerdict & { facts: DatasetFacts; d: LivingDataset; licence: string }>();
  for (const d of living.datasets) {
    const m = d.meta!;
    const facts: DatasetFacts = {
      key: d.key,
      title: m.title ?? '',
      description: m.description ?? '',
      type: m.type ?? '',
      publisher: d.publisher ?? '',
      keywords: (m.keywordCollections ?? []).flatMap((k) => k.keywords ?? [])
    };
    verdicts.set(d.key, { ...classifyDataset(facts), facts, d, licence: String((m as { license?: string }).license ?? '').replace(/^https?:\/\/creativecommons\.org\/(?:licenses|publicdomain)\/([^/]+)\/([^/]+)\/.*$/, (_, a, b) => `${a === 'zero' ? 'CC0' : `CC ${a.toUpperCase()}`} ${b}`) });
  }
  const sides = ['excluded', 'counted', 'not decided'] as const;
  const sideOf = (s: (typeof sides)[number]) => [...verdicts.values()].filter((v) => v.side === s).sort((a, b) => b.d.records - a.d.records);
  const recordsOf = (s: (typeof sides)[number]) => sideOf(s).reduce((t, v) => t + v.d.records, 0);
  const day = new Date().toISOString().slice(0, 10);
  const gbifDays = cacheDays(cacheDir, 'gbif');
  const dsHeader = (what: string, s: (typeof sides)[number]) => [
    `# GBIF datasets holding living-specimen records of plants: ${what}. Written by scripts/select-species.ts on ${day}; run it again to refresh.`,
    `# The rule: ${DATASET_RULE}`,
    '# The words are in scripts/select-species-lib.ts (GENEBANK_WORDS, LIVING_COLLECTION_WORDS); a dataset is read by its own metadata at GBIF (dataset/<key>: title, description, type, keywords) and its publisher\'s name (organization/<key>).',
    `# Source: ${datasetFacetUrl()}, read ${gbifDays ? (gbifDays.first === gbifDays.last ? gbifDays.first : `${gbifDays.first} to ${gbifDays.last}`) : day}: ${n(living.datasets.length)} datasets, ${n(living.total)} records.`,
    `# This side: ${n(sideOf(s).length)} datasets, ${n(recordsOf(s))} records.`,
    '# key\ttitle\tpublisher\trecords\tlicence\treason'
  ];
  const dsLines = (s: (typeof sides)[number]) => sideOf(s).map((v) => tsv(v.d.key, v.facts.title, v.facts.publisher || '-', v.d.records, v.licence || '-', v.reason));
  writeAtomic(`${outDir}/excluded-datasets.txt`, [...dsHeader('excluded, a genebank by the rule; their records are not counted', 'excluded'), ...dsLines('excluded')].join('\n') + '\n');
  writeAtomic(`${outDir}/counted-datasets.txt`, [...dsHeader('counted, a living collection by the rule', 'counted'), ...dsLines('counted')].join('\n') + '\n');
  writeAtomic(`${outDir}/undecided-datasets.txt`, [...dsHeader('not decided by the rule; their records are not counted', 'not decided'), ...dsLines('not decided')].join('\n') + '\n');
  for (const s of sides) log(`  ${s}: ${sideOf(s).length} datasets, ${n(recordsOf(s))} records`);

  // ---- Kew ----
  log(`Reading ${wcvpPath}…`);
  const loader = kewLoader();
  for await (const line of lines(wcvpPath)) loader.add(line);
  const kew: Kew = loader.kew;
  let acceptedSpecies = 0;
  for (const r of kew.rows.values()) if (r.rank === 'Species' && r.status === 'Accepted') acceptedSpecies++;
  log(`  ${n(kew.rows.size)} names, ${n(acceptedSpecies)} accepted species`);

  // ---- GBIF's backbone: the facet's keys to names, and Kew's species to keys ----
  const wantKeys = new Set<string>();
  for (const d of living.datasets) for (const k of d.species!.keys()) wantKeys.add(k);
  log(`Reading ${backbonePath} for ${n(wantKeys.size)} species keys…`);
  const byKey = new Map<string, BackboneName>();
  const byWords = new Map<string, BackboneName[]>();
  for await (const line of lines(backbonePath)) {
    const b = backboneLine(line);
    if (!b) continue;
    if (wantKeys.has(b.key)) byKey.set(b.key, b);
    if (b.status === 'ACCEPTED' || b.status === 'DOUBTFUL') {
      const w = words(b.name);
      if (!kew.byWords.has(w)) continue; // only the names Kew holds a species of are ever asked for
      const l = byWords.get(w);
      if (l) l.push(b);
      else byWords.set(w, [b]);
    }
  }

  const refused: string[] = [];
  const refusals: Record<string, Record<string, number>> = { inat: {}, gbif: {} };
  const bump = (src: 'inat' | 'gbif', why: string) => (refusals[src][why] = (refusals[src][why] ?? 0) + 1);

  // GBIF: each species key once, then its records by side.
  const gbifBy = { excluded: new Map<string, number>(), counted: new Map<string, number>(), 'not decided': new Map<string, number>() };
  const gbifHow: Record<string, number> = {};
  const keyMatch = new Map<string, string | null>();
  const keyRecords = new Map<string, Record<string, number>>();
  for (const d of living.datasets) {
    const side = verdicts.get(d.key)!.side;
    for (const [k, c] of d.species!) {
      const r = keyRecords.get(k) ?? {};
      r[side] = (r[side] ?? 0) + c;
      keyRecords.set(k, r);
    }
  }
  for (const [k, recs] of keyRecords) {
    const b = byKey.get(k);
    let id: string | null = null;
    let why = '';
    if (!b) why = REFUSALS.notInKew;
    else {
      const m = matchStrict(kew, b.name, b.author);
      if (m.id !== null) { id = m.id; gbifHow[m.how] = (gbifHow[m.how] ?? 0) + 1; }
      else why = m.refused;
    }
    keyMatch.set(k, id);
    if (id) for (const s of sides) if (recs[s]) gbifBy[s].set(id, (gbifBy[s].get(id) ?? 0) + recs[s]);
    if (!id) {
      bump('gbif', why);
      refused.push(tsv('gbif', k, b ? `${b.name}${b.author ? ' ' + b.author : ''}` : '-', recs.counted ?? 0, recs.excluded ?? 0, recs['not decided'] ?? 0, why));
    }
  }

  // iNaturalist.
  let deviations = null as ReturnType<typeof deviationsOf> | null;
  if (deviationsPath) deviations = deviationsOf(JSON.parse(readFileSync(deviationsPath, 'utf8')) as FrameworkRelationship[]);
  const inatBy = new Map<string, number>();
  const inatHow: Record<string, number> = {};
  for (const r of inat.rows) {
    const m = matchInat(kew, r.taxon, deviations);
    if (m.id !== null) {
      inatBy.set(m.id, (inatBy.get(m.id) ?? 0) + r.count);
      inatHow[m.how] = (inatHow[m.how] ?? 0) + 1;
    } else {
      bump('inat', m.refused);
      refused.push(tsv('inat', r.taxon.id, `${r.taxon.name} (${r.taxon.rank})`, r.count, 0, 0, m.refused));
    }
  }

  // ---- the selection ----
  const genera = new Set(readList(generaPath));
  const collector = collectorSpecies(kew, genera);
  // The reference: every page on disk, less those merged into another.
  const merged = new Set(readList(mergedPath).map((l) => Number(l.split('\t')[0])));
  // An index of version 3 names each page by its id (its file's name) and carries its GBIF key as `gbif` (round
  // seventy-eight); one of version 2 names it by its GBIF key. A page is held here by its GBIF key either way.
  const index = (JSON.parse(readFileSync(`${referenceDir}/index.json`, 'utf8')) as Array<{ key: number | string; gbif?: number; name: string }>)
    // A page without a GBIF key (round seventy-nine) is held by its Kew entry alone.
    .map((e) => ({ file: String(e.key), key: typeof e.key === 'number' ? e.key : (e.gbif ?? null) }))
    .filter((e) => e.key == null || !merged.has(e.key));
  const pages: ReferencePage[] = index.map((e) => {
    const d = JSON.parse(readFileSync(`${referenceDir}/${e.file}.json`, 'utf8')) as { name: { scientific: string; authorship?: string; family?: string; kew?: { entry?: string } }; distribution?: { via?: { entry?: string; kind?: string } } };
    return { key: e.key, name: d.name.scientific, author: d.name.authorship ?? '', family: d.name.family ?? '', kewEntry: d.name.kew?.entry || null, via: d.distribution?.via ?? null };
  });
  const reference = referenceSpecies(kew, pages);
  const manifestId = existsSync(`${referenceDir}/manifest.json`) ? (JSON.parse(readFileSync(`${referenceDir}/manifest.json`, 'utf8')) as { id?: string }).id : undefined;
  const twoPages = [...reference.byKew.values()].filter((v) => v.length > 1).length;
  log(`  reference: ${n(pages.length)} pages, ${n(reference.byKew.size)} Kew species (${twoPages} held by two pages or more), ${reference.unmatched.length} matching none`);

  const selected = select(kew, inatBy, gbifBy.counted, collector, (r) => gbifKeyFor(r, byWords, kew), MIN_RECORDS, reference);
  // A species without a GBIF key that a reference page holds through its range is that page (round eighty, X).
  const held = heldThroughRange(selected.map((x) => ({ kewId: x.id, name: x.name, author: x.author, gbifKey: x.gbifKey == null ? null : Number(x.gbifKey) })), pages);
  const list = selected.filter((x) => !x.id || !held.has(x.id));
  if (held.size) log(`  ${held.size} species without a GBIF key left out, a page of the reference holding each through its range: ${[...held].map(([id, h]) => `${id} (${h.entry}, by page g${h.key})`).join('; ')}`);
  const count = (f: (s: (typeof list)[number]) => boolean) => list.filter(f).length;
  const byCounts = count((s) => s.byCounts), byGenus = count((s) => s.byGenus), byReference = count((s) => s.byReference);
  const byCountsOnly = count((s) => s.byCounts && !s.byGenus && !s.byReference);
  const byGenusOnly = count((s) => !s.byCounts && s.byGenus && !s.byReference);
  const byReferenceOnly = count((s) => !s.byCounts && !s.byGenus && s.byReference);
  const noKew = count((s) => s.id === null);
  const withKey = count((s) => s.gbifKey !== null);
  const inatDays = cacheDays(cacheDir, 'inat');
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  const inatTaken = Object.values(inatHow).reduce((a, b) => a + b, 0);
  const inatRefused = Object.values(refusals.inat).reduce((a, b) => a + b, 0);
  const gbifTaken = Object.values(gbifHow).reduce((a, b) => a + b, 0);
  const gbifRefused = Object.values(refusals.gbif).reduce((a, b) => a + b, 0);
  const fmt = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${n(v)} ${k}`).join('; ');
  const header = [
    `Written by scripts/select-species.ts on ${day}; run it again to refresh (it reads its sources from ${cacheDir}/ and asks only for what is not there).`,
    `The rule: every species Kew accepts with at least ${MIN_RECORDS} cultivated records (iNaturalist observations marked captive or cultivated, and GBIF living-specimen records of the datasets the dataset rule counts, added together), plus every accepted species of the ${genera.size} collector genera of ${generaPath} taken whole, plus every species already in the reference.`,
    `The reference: ${referenceDir}/index.json${manifestId ? ` (corpus ${manifestId})` : ''}, ${n(pages.length)} pages (the pages of ${mergedPath} left out), each page's species being the Kew entry it cites, followed to its accepted species, else its name by the strict rule: ${n(reference.byKew.size)} Kew species, ${twoPages} of them held by two pages; ${reference.unmatched.length} pages match no species Kew accepts and are listed by their GBIF key, with "-" for plant_name_id (page id "g<GBIF key>").`,
    `The dataset rule: ${DATASET_RULE} (scripts/counted-datasets.txt, excluded-datasets.txt and undecided-datasets.txt list every dataset and why.)`,
    'Names: matched to Kew\'s accepted species under rule 3 (every Kew row of the name\'s words leads to one accepted species); GBIF\'s keys first by the backbone\'s name and author; iNaturalist\'s names also by its taxon framework for vascular plants, sourced to POWO down to subspecies (https://inaturalist.ala.org.au/taxa/211194-Tracheophyta/taxonomy_details): where Kew accepts exactly one species of those words, that species.',
    deviations
      ? `iNaturalist's listed deviations from POWO applied from ${deviationsPath} (${n(deviations.size)} taxa).`
      : 'iNaturalist\'s listed deviations from POWO (4,117 on the framework page) are not applied: their list is not had (the pages are behind a browser check and the JSON form answers 500), so a name iNaturalist holds apart from POWO is matched by the rules above. --deviations reads the list when it is had.',
    `Source: Kew, World Checklist of Vascular Plants (Govaerts et al.), ${wcvpPath} of ${new Date(statSync(wcvpPath).mtimeMs).toISOString().slice(0, 10)}, CC BY 4.0: ${n(acceptedSpecies)} accepted species.`,
    `Source: iNaturalist, ${inatPageUrl(1).replace('&page=1', '&page=<n>')}, read ${inatDays ? (inatDays.first === inatDays.last ? inatDays.first : `${inatDays.first} to ${inatDays.last}`) : day}, ${inat.pages} pages, ${n(inat.rows.length)} taxa (${n(inat.total ?? 0)} by its total), ${n(inat.rows.reduce((t, r) => t + r.count, 0))} observations. Counts read under iNaturalist's Terms of Use (https://www.inaturalist.org/pages/terms) and API Recommended Practices (https://www.inaturalist.org/pages/api+recommended+practices), one request every two seconds; counts are facts, no observation's text or photograph is taken. Credit: iNaturalist and its observers.`,
    `Source: GBIF.org, ${speciesFacetUrl('<dataset>', 0).replace('&facetOffset=0', '')} for each of ${n(living.datasets.length)} datasets, read ${gbifDays ? (gbifDays.first === gbifDays.last ? gbifDays.first : `${gbifDays.first} to ${gbifDays.last}`) : day}, under GBIF's data user agreement (https://www.gbif.org/terms/data-user), one request a second; counts of records, each dataset's licence in the dataset files. Counted: ${sideOf('counted').length} datasets, ${n(recordsOf('counted'))} records; excluded: ${sideOf('excluded').length}, ${n(recordsOf('excluded'))}; not decided: ${sideOf('not decided').length}, ${n(recordsOf('not decided'))}.`,
    `Source: GBIF Backbone Taxonomy (https://doi.org/10.15468/39omei), ${backbonePath}, CC BY 4.0: each species key's name and author, and the gbif_key column: for a species held by one page of the reference, that page's own GBIF key; for any other, the backbone's one accepted species of the name's words, or of several the one of Kew's author, or with none accepted the one doubtful; "-" where none is one.`,
    `iNaturalist: ${n(inatTaken)} taxa taken (${fmt(inatHow)}), ${n(inatRefused)} refused (${fmt(refusals.inat)}), ${n(inatBy.size)} Kew species, ${n(sum(inatBy))} observations.`,
    `GBIF: ${n(keyRecords.size)} species keys; ${n(gbifTaken)} taken (${fmt(gbifHow)}), ${n(gbifRefused)} refused (${fmt(refusals.gbif)}); counted datasets: ${n(gbifBy.counted.size)} Kew species, ${n(sum(gbifBy.counted))} records.`,
    'Every refusal is in scripts/species-refused.txt with its reason.',
    `Selected: ${n(list.length)} species: ${n(byCounts)} by their records, ${n(byGenus)} by their collector genus, ${n(byReference)} already in the reference; ${n(byCountsOnly)} by their records alone, ${n(byGenusOnly)} by their collector genus alone, ${n(byReferenceOnly)} only because they are already in the reference (${noKew} of them with no Kew id); ${n(withKey)} with a GBIF key, ${n(list.length - withKey)} without.`,
    ...(held.size ? [`Left out (round eighty): ${held.size} species without a GBIF key that a page of the reference holds through its range (its range read through that species' Kew entry, the page matching no species Kew accepts by its own name): ${[...held].map(([id, h]) => `${id} ${h.entry}, by page g${h.key}`).join('; ')}.`] : []),
    `reason: "inat <observations> + gbif <records>" when the two reach ${MIN_RECORDS}, "collector genus" for a species of a collector genus, "${REASON_REFERENCE}" for a species of a page of the reference; every one that applies, separated by "; ".`
  ];
  writeAtomic(out, formatSpeciesList(header, list));
  writeAtomic(`${outDir}/species-refused.txt`, [
    `# Every name or key the species list (scripts/species-list.txt) refused to match to a species Kew accepts, and why. Written by scripts/select-species.ts on ${day}.`,
    `# iNaturalist: ${n(inatRefused)} taxa (${fmt(refusals.inat)}). GBIF: ${n(gbifRefused)} species keys (${fmt(refusals.gbif)}).`,
    '# source\tid\tname\trecords (iNaturalist observations; GBIF counted)\tGBIF excluded\tGBIF not decided\treason',
    ...refused.sort()
  ].join('\n') + '\n');

  // For review: every species with a record, by source and side (droppable; the list is the product).
  const all = new Set([...inatBy.keys(), ...gbifBy.counted.keys(), ...gbifBy.excluded.keys(), ...gbifBy['not decided'].keys(), ...collector]);
  const chosen = new Set(list.map((s) => s.id)), inGenus = new Set(collector);
  for (const id of reference.byKew.keys()) all.add(id);
  writeAtomic(`${cacheDir}/scores.tsv`, ['plant_name_id\tname\tfamily\tinat\tgbif_counted\tgbif_excluded\tgbif_undecided\tcollector\tselected',
    ...[...all].map((id) => { const r = kew.rows.get(id)!; return tsv(id, r.name, r.family, inatBy.get(id) ?? 0, gbifBy.counted.get(id) ?? 0, gbifBy.excluded.get(id) ?? 0, gbifBy['not decided'].get(id) ?? 0, inGenus.has(id) ? 1 : 0, chosen.has(id) ? 1 : 0); })].join('\n') + '\n');
  log(`${out}: ${n(list.length)} species (${n(byCounts)} by records, ${n(byGenus)} by genus, ${n(byReference)} in the reference, ${n(byReferenceOnly)} by the reference alone, ${noKew} with no Kew id; ${n(withKey)} with a GBIF key). Requests this run: ${JSON.stringify(cache.asked)}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
