/**
 * Round eighty-six (the plan's B16): the pages whose origin names no TDWG level-3 region, from an index (`wide-origins.ts`
 * says why). Reads only the file it is given and writes to the screen.
 *
 *   npx tsx scripts/dev/r86-wide-origins.ts static/s/v3/index.json
 */
import { readFileSync } from 'node:fs';
import { wideOrigins } from '../../src/lib/dossier/wide-origins';

const file = process.argv[2] ?? 'static/s/v3/index.json';
const index = JSON.parse(readFileSync(file, 'utf8')) as Array<{ key: string; name: string; origin?: string[] }>;
const pages = wideOrigins(index);
const by = new Map<string, number>();
for (const p of pages) for (const w of p.wide) by.set(w, (by.get(w) ?? 0) + 1);
console.log(`${index.length} pages in ${file}; ${pages.length} with an origin that is no level-3 region (${[...by].map(([w, n]) => `${w === '' ? '(no name)' : w} ${n}`).join(', ')}):`);
for (const p of pages) console.log(`  ${p.key}\t${p.name}\t${p.origin.map((o) => (o === '' ? '(no name)' : o)).join(', ')}`);
