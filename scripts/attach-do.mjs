// The SvelteKit adapter writes a worker that exports only the app; a Durable Object class has to be exported from the
// same module for Cloudflare to find it. This appends that export after `vite build`, so `wrangler` bundles the class
// in, and then checks the result: the export line present, the class file present and named as the binding expects.
// The build's own validation runs against wrangler.dev.jsonc, which has no object, so it does not see this step at all.
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const worker = '.svelte-kit/cloudflare/_worker.js';
const cls = 'src/lib/server/counters.ts';
if (!existsSync(worker)) {
  console.error(`attach-do: ${worker} is missing; run the build first`);
  process.exit(1);
}
const line = `\nexport { Counters } from '../../${cls}';\n`;
if (!readFileSync(worker, 'utf8').includes(cls)) appendFileSync(worker, line);
// The release assertion: the worker exports the class the binding names, and the class is what wrangler.jsonc binds.
const out = readFileSync(worker, 'utf8');
const src = readFileSync(cls, 'utf8');
const cfg = readFileSync('wrangler.jsonc', 'utf8');
const bound = /"class_name":\s*"(\w+)"/.exec(cfg)?.[1];
const fail = (m) => { console.error(`attach-do: ${m}`); process.exit(1); };
if (!out.includes(`export { Counters } from '../../${cls}'`)) fail('the export line did not land in the worker');
if (!/export class Counters extends DurableObject/.test(src)) fail(`${cls} does not export class Counters extending DurableObject`);
if (bound !== 'Counters') fail(`wrangler.jsonc binds class "${bound}", not Counters`);
console.log('attach-do: Counters exported from the worker and bound as COUNTERS');
// The bundle gate runs here, at the end of every build, so a build that ships the grower's feature set or the backup
// module in the root layout fails before anything deploys it; it first records the sources this build was made from
// (round sixty-two; the harness review's 3, A43). `npm run build` ends with this script, so package.json is unchanged.
const gate = spawnSync(process.execPath, ['scripts/check-bundle.mjs', '--record'], { stdio: 'inherit' });
if (gate.status !== 0) process.exit(gate.status ?? 1);
