// `wrangler dev` keeps its KV and Durable Object state in .wrangler/state between runs, so the vault-creation counters
// carry over: the e2e suite creates vaults from one address and, on the third run of a day, met the per-address
// ceiling (round twenty-one, 2). The e2e web server clears that state before it starts.
import { rmSync, existsSync } from 'node:fs';
if (existsSync('.wrangler/state')) rmSync('.wrangler/state', { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
