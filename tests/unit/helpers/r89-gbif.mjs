// Round eighty-nine: GBIF's occurrence search for a builder run in a test (`node --import` this file). It answers each
// `occurrence/search?taxonKey=<k>&hasCoordinate=true…` from r89-answers.json in the run's folder (records by GBIF key,
// one page of them, as GBIF answers a key with fewer than 300) and writes each address it answers, a line each, to
// r89-asked.txt there, so a test counts what was asked. Any other address goes to the fetch the process had. The
// round-88 tests' builder runs under it too, so no test asks GBIF itself.
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const real = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const m = /api\.gbif\.org\/v1\/occurrence\/search\?taxonKey=(\d+)&hasCoordinate=true/.exec(url);
  if (!m) return real(input, init);
  appendFileSync(join(process.cwd(), 'r89-asked.txt'), url + '\n');
  // No r89-answers.json: no records under any key, as GBIF answers a key it holds none of.
  let answers = {};
  try { answers = JSON.parse(readFileSync(join(process.cwd(), 'r89-answers.json'), 'utf8')); } catch { /* none */ }
  const offset = Number(/[?&]offset=(\d+)/.exec(url)?.[1] ?? 0);
  const all = answers[m[1]] ?? [];
  const results = all.slice(offset, offset + 300);
  const body = JSON.stringify({ offset, limit: 300, endOfRecords: offset + 300 >= all.length, count: all.length, results });
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
};
