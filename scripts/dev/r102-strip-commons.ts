// Round 102 (docs/PLAN-102.md, 4): what a Commons-first rule would give the front page's strip, measured, nothing changed.
// The strip's pool (featured.json, the build's 48: one species a popular genus, by the most-grown rule) with each species'
// tile today (its page's lead photograph) and the first of its page's Commons photographs, where it holds one. A dossier's
// Commons photographs are those the build kept, each having passed photo-kind's test when the build read it (round 69).
// Reads static/s/v3 (the corpus on disk); writes bulk/r102-strip-commons.txt.
//   node --import tsx scripts/dev/r102-strip-commons.ts
import { readFileSync, writeFileSync } from 'node:fs';

const DIR = 'static/s/v3';
const manifest = JSON.parse(readFileSync(`${DIR}/manifest.json`, 'utf8')) as Record<string, unknown>;
const files = (manifest.products ?? manifest.files ?? manifest) as Record<string, string>;
const hash = files['featured.json'];
if (!hash) throw new Error('manifest.json names no featured.json');
const pool = JSON.parse(readFileSync(`${DIR}/p/${hash}.json`, 'utf8')) as Array<{ slug: string; name: string; thumb: string }>;
const index = JSON.parse(readFileSync(`${DIR}/index.json`, 'utf8')) as unknown;
const entries = (Array.isArray(index) ? index : (index as { species: unknown[] }).species) as Array<{ slug: string; key: string }>;
const bySlug = new Map(entries.map((e) => [e.slug, e.key]));
type Photo = { src?: string; url?: string; thumb?: string; title?: string; page?: string };
const out: string[] = [];
let withCommons = 0;
for (const f of pool) {
  const key = bySlug.get(f.slug);
  const d = key ? (JSON.parse(readFileSync(`${DIR}/${key}.json`, 'utf8')) as { photos?: Photo[] }) : null;
  const photos = d?.photos ?? [];
  const commons = photos.filter((p) => p.src === 'commons');
  if (commons.length) withCommons++;
  const tileSrc = photos.find((p) => p.thumb === f.thumb || p.url === f.thumb)?.src ?? '?';
  out.push([f.name, `tile ${tileSrc}: ${f.thumb}`, commons.length ? `${commons.length} Commons, first ${commons[0].page ?? commons[0].url}` : 'no Commons photograph'].join('\t'));
}
const head = `# Round 102: the strip's 48 (featured.json ${hash}) and their Commons photographs, from ${DIR}, by scripts/dev/r102-strip-commons.ts. ${withCommons} of ${pool.length} hold one.`;
writeFileSync('bulk/r102-strip-commons.txt', [head, '# species\ttile today\tCommons', ...out].join('\n') + '\n');
console.log(`read ${DIR}/manifest.json, featured.json and ${pool.length} dossiers; ${withCommons} of ${pool.length} hold a Commons photograph; wrote bulk/r102-strip-commons.txt`);
