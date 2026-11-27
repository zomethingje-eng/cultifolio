/**
 * SPECIES 23's count before any fill (docs/PLAN-133.md): on pages spread through the index, how many have papers under
 * round 8's rule (title or abstract, any type but datasets, the name checked in the title or abstract), and how many of
 * those keep any under the hand-off's rule (the name in the title only, the four work types, a DOI). The hand-off: report
 * if the title-only rule leaves more than half of the pages that had papers with none.
 *
 * Reads the OpenAlex key from bulk/openalex-key.txt (never printed or written anywhere); one request a second; writes
 * bulk/r133/count-<day>.tsv and prints the totals. Asks nothing but OpenAlex, and writes nothing in the corpus.
 *
 *   npx tsx scripts/dev/r133-literature-count.ts --index static/s/v3/index.json --key-file "<project>/bulk/openalex-key.txt" --n 200
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { abstractText, namesSpecies, isDatasetDoi } from '../../src/lib/dossier/sources/openalex';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const index = JSON.parse(readFileSync(arg('--index', 'static/s/v3/index.json')!, 'utf8')) as Array<{ name: string; slug: string }> | { entries?: Array<{ name: string; slug: string }> };
const rows = (Array.isArray(index) ? index : index.entries ?? []).filter((e) => /^[A-Z][a-z-]+ [a-z-]+$/.test(e.name));
const n = Number(arg('--n', '200'));
const key = readFileSync(arg('--key-file', 'bulk/openalex-key.txt')!, 'utf8').trim();
const step = Math.max(1, Math.floor(rows.length / n));
const sample = Array.from({ length: Math.min(n, rows.length) }, (_, i) => rows[i * step]);
const TYPES = 'article|review|book-chapter|preprint';
const UA = { 'User-Agent': 'cultifolio-reference (https://cultifolio.com)' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type W = { doi?: string | null; title?: string | null; type?: string; abstract_inverted_index?: Record<string, number[]> | null; primary_location?: { source?: { display_name?: string } } };
async function ask(q: string): Promise<{ count: number; results: W[] } | null> {
  for (let t = 0; t < 4; t++) {
    const r = await fetch(`https://api.openalex.org/works?${q}&api_key=${encodeURIComponent(key)}`, { headers: UA }).catch(() => null);
    if (r?.ok) { const j = await r.json() as { meta: { count: number }; results: W[] }; return { count: j.meta.count, results: j.results }; }
    await sleep(2000 * (t + 1));
  }
  return null;
}

const out: string[] = ['name\told_any\told_kept\tnew_count\tnew_any'];
let hadOld = 0, oldKeptNew = 0, oldLostNew = 0, newOnly = 0, unanswered = 0;
for (const [i, e] of sample.entries()) {
  const phrase = encodeURIComponent(`"${e.name}"`);
  const a = await ask(`filter=title_and_abstract.search:${phrase},type:!dataset&per-page=24&sort=cited_by_count:desc&select=doi,title,abstract_inverted_index,primary_location`);
  await sleep(1000);
  const b = await ask(`filter=title.search:${phrase},type:${TYPES},has_doi:true&per-page=1&select=doi,title`);
  await sleep(1000);
  if (!a || !b) { unanswered++; out.push(`${e.name}\t?\t?\t?\t?`); continue; }
  const kept = a.results.filter((w) => !isDatasetDoi(w.doi) && namesSpecies(`${w.title ?? ''} ${abstractText(w.abstract_inverted_index)}`, e.name)).length;
  const oldAny = kept > 0, newAny = b.count > 0;
  if (oldAny) { hadOld++; if (newAny) oldKeptNew++; else oldLostNew++; } else if (newAny) newOnly++;
  out.push(`${e.name}\t${a.count}\t${kept}\t${b.count}\t${newAny ? 1 : 0}`);
  if ((i + 1) % 25 === 0) console.log(`  ${i + 1} of ${sample.length} pages asked…`);
}
const day = new Date().toISOString().slice(0, 10);
mkdirSync('bulk/r133', { recursive: true });
writeFileSync(`bulk/r133/count-${day}.tsv`, out.join('\n') + '\n');
console.log(`${sample.length} pages, every ${step}th of the index's ${rows.length} two-word names; ${unanswered} not answered.`);
console.log(`Round 8's rule: ${hadOld} pages with papers. Of those, the title-only rule with a DOI keeps papers on ${oldKeptNew} and leaves ${oldLostNew} with none (${hadOld ? Math.round((oldLostNew / hadOld) * 100) : 0}%). ${newOnly} pages have papers only under the title-only rule.`);
console.log(`Written: bulk/r133/count-${day}.tsv`);
