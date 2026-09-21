// Clears the build output before `vite build`. On Windows a file just written can be held for a moment by the
// antivirus, the search indexer or a folder-sync agent, and SvelteKit's own clean (fs.rmSync without retries)
// fails with EPERM. Node's rmSync retries when asked; this asks, ten times over five seconds, per folder.
import { rmSync, existsSync } from 'node:fs';
for (const dir of ['.svelte-kit/cloudflare', '.svelte-kit/output']) {
  if (!existsSync(dir)) continue;
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  } catch (e) {
    console.error(`could not clear ${dir}: ${e.message}\nSomething holds a file in it: an editor, a running \`wrangler dev\`, or a scan. Close it and run again.`);
    process.exit(1);
  }
}
