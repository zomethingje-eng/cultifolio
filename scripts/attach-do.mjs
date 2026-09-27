// The SvelteKit adapter writes a worker that exports only the app; a Durable Object class has to be exported from the
// same module for Cloudflare to find it. This appends that export after `vite build`, so `wrangler` bundles the class in.
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
const worker = '.svelte-kit/cloudflare/_worker.js';
if (!existsSync(worker)) {
  console.error(`attach-do: ${worker} is missing; run the build first`);
  process.exit(1);
}
const line = `\nexport { Counters } from '../../src/lib/server/counters.ts';\n`;
if (!readFileSync(worker, 'utf8').includes('src/lib/server/counters.ts')) appendFileSync(worker, line);
