/**
 * Round one hundred and one: whether GBIF still serves the backbone our pages are pinned to (docs/PLAN-100.md, 4). GBIF is
 * moving to the Catalogue of Life eXtended Release (COL XR); the build asks the backbone three ways (the name match, the
 * species record, the occurrence search under the backbone's checklistKey), and the day GBIF stops answering any of them as
 * the backbone, PLAN-100's move by rule is due. One probe a way, of one plant (Fagus sylvatica, backbone key 2882316),
 * read by `backboneVerdict`: a way that answered otherwise is "changed", a way that did not answer is "not answered" and
 * never said as changed (rule 2). The live check prints its sentence as a note: a change at GBIF is no fault of the site and
 * stops no deploy and no corpus step.
 *   node scripts/gbif-backbone-check.mjs     the three asked and the sentence printed; exit 0 always
 */
export const BACKBONE = 'd7dddbf4-2cf0-4f39-9b2a-bb099caae36c';
export const PROBE = { name: 'Fagus sylvatica', key: 2882316 };
const API = 'https://api.gbif.org/v1';
export const PROBE_URLS = {
  match: `${API}/species/match?name=${encodeURIComponent(PROBE.name)}&strict=true`,
  species: `${API}/species/${PROBE.key}`,
  search: `${API}/occurrence/search?taxonKey=${PROBE.key}&checklistKey=${BACKBONE}&hasCoordinate=true&limit=0`
};

/**
 * The verdict of the three answers, each { status, data } (status 0: no answer). Returns { changed: string[], unanswered:
 * string[], sentence }.
 */
export function backboneVerdict({ match, species, search }) {
  const changed = [], unanswered = [];
  const read = (what, r, okIf, says) => {
    if (!r || !r.status || r.status >= 500 || r.status === 429) { unanswered.push(`${what} (${r?.status ? `HTTP ${r.status}` : 'no answer'})`); return; }
    if (r.status !== 200 || !okIf(r.data ?? {})) changed.push(`${what}: ${r.status !== 200 ? `HTTP ${r.status}` : says(r.data ?? {})}`);
  };
  read('the name match', match, (d) => d.usageKey === PROBE.key && d.matchType === 'EXACT', (d) => `${PROBE.name} matched ${d.usageKey ?? 'nothing'} (${d.matchType ?? 'no match type'}), not the backbone's ${PROBE.key}`);
  read('the species record', species, (d) => d.key === PROBE.key && d.datasetKey === BACKBONE, (d) => `key ${PROBE.key} is ${d.datasetKey ? `of dataset ${d.datasetKey}` : 'of no dataset'}, not the backbone's`);
  read('the occurrence search under the backbone', search, (d) => typeof d.count === 'number' && d.count > 0, (d) => `${PROBE.name} (${PROBE.key}) has ${d.count ?? 'no'} records under it`);
  const sentence = changed.length
    ? `WARNING: GBIF no longer answers as the backbone our pages are pinned to: ${changed.join('; ')}. The build's records and names depend on it; docs/PLAN-100.md (4) holds the move to COL XR by rule.`
    : unanswered.length === 3
      ? `GBIF did not answer (${unanswered.join('; ')}): whether it still serves the backbone was not checked.`
      : `GBIF still serves the backbone our pages are pinned to (${PROBE.name}: the match, the species record and the occurrence search${unanswered.length ? `; not answered: ${unanswered.join('; ')}` : ''}).`;
  return { changed, unanswered, sentence };
}

/** The three asked (twenty seconds each, a generic client name) and read. */
export async function checkBackbone(ua = 'cultifolio-live-check (deploy; https://cultifolio.com)') {
  const ask = async (url) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'user-agent': ua } });
      return { status: r.status, data: await r.json().catch(() => ({})) };
    } catch { return { status: 0 }; }
  };
  const [match, species, search] = await Promise.all([ask(PROBE_URLS.match), ask(PROBE_URLS.species), ask(PROBE_URLS.search)]);
  return backboneVerdict({ match, species, search });
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/').replace(/^\//, '')}` || process.argv[1]?.endsWith('gbif-backbone-check.mjs')) {
  const v = await checkBackbone();
  console.log(`  ${v.sentence}`);
}
