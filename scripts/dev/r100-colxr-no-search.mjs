// Round one hundred (docs/PLAN-100.md, 4, step 3): the trial's dry run reads the COL XR download alone. An offline build asks
// GBIF's occurrence search for a key the download holds no records of (the API path); in the trial those are the pages COL
// XR gives no records and the other keys a page reads beside its own (a subspecies or synonym the backbone keeps apart),
// which under COL XR read nothing beyond the page's taxon and the taxa below it. Loaded with --import before tsx, this
// answers every such search with GBIF's empty answer, sends nothing, and lists each address it answered in
// bulk/colxr/trial-no-search.txt. The builder is not changed.
//   node --import ./scripts/dev/r100-colxr-no-search.mjs --import tsx scripts/build-dossiers.ts --dry-run --offline --bulk bulk/colxr/trial-bulk ...
import { appendFileSync, writeFileSync } from 'node:fs';
const LOG = 'bulk/colxr/trial-no-search.txt';
writeFileSync(LOG, '# Round one hundred (docs/PLAN-100.md, 4, step 3): GBIF occurrence searches the trial answered with no records (scripts/dev/r100-colxr-no-search.mjs); nothing sent\n');
const real = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const u = typeof input === 'string' ? input : input?.url ?? String(input);
  if (/api\.gbif\.org\/v1\/occurrence\/search\?/.test(u)) {
    appendFileSync(LOG, u + '\n');
    const limit = Number(new URL(u).searchParams.get('limit') ?? 20), offset = Number(new URL(u).searchParams.get('offset') ?? 0);
    return Promise.resolve(new Response(JSON.stringify({ offset, limit, endOfRecords: true, count: 0, results: [], facets: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
  }
  return real(input, init);
};
