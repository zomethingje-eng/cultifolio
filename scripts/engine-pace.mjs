// How many workers each browser engine may take in a run (round seventy-five; the harness, H). One file, read by
// playwright.config.ts (which sets each project's own count), scripts/predeploy.mjs (which says them before the run) and
// scripts/flake-check.mjs (which runs at two workers), so the line printed and the counts used cannot drift apart.
//
// The run's own count (`--workers`, predeploy's four) is shared by every project. Chromium and the Chromium phone may
// take all of it; WebKit (with its phone) and Firefox each take at most their own count, two unless the environment
// names another: two WebKit pages writing IndexedDB at its pace already fill the PC's share of one wrangler dev (round
// seventy-two), and Firefox at four was where five of round seventy-four's nine one-off flakes were.

/** The engines' own caps, from the environment: PW_WEBKIT_WORKERS and PW_FIREFOX_WORKERS, two each by default. */
export function engineWorkers(env = process.env) {
  const n = (v) => {
    const x = Number(v);
    return v !== undefined && v !== '' && Number.isInteger(x) && x > 0 ? x : 2;
  };
  return { webkit: n(env.PW_WEBKIT_WORKERS), firefox: n(env.PW_FIREFOX_WORKERS) };
}

/**
 * The sentence predeploy prints before the browser suite: what runs, and at how many workers each engine runs.
 * `engines` are the named engines beyond Chromium ('webkit', 'firefox'); `workers` the run's count, or null when the
 * command line named its own (`--workers`, `-j`); `chromium` whether the Chromium projects run.
 */
export function paceLine({ engines, workers, chromium = true, env = process.env }) {
  const own = engineWorkers(env);
  const total = workers == null ? null : Number(workers);
  const at = (cap) => (total == null ? `at most ${cap} of the workers named` : `${Math.min(cap, total)} ${Math.min(cap, total) === 1 ? 'worker' : 'workers'}`);
  const parts = [];
  if (chromium) parts.push(`Chromium and the Chromium phone at ${total == null ? 'the workers named' : `${total} ${total === 1 ? 'worker' : 'workers'}`}`);
  if (engines.includes('webkit')) parts.push(`WebKit and the WebKit phone at ${at(own.webkit)} (PW_WEBKIT_WORKERS)`);
  if (engines.includes('firefox')) parts.push(`Firefox at ${at(own.firefox)} (PW_FIREFOX_WORKERS)`);
  const shared = total != null && parts.length > 1 ? `, ${total} in all at once` : '';
  return `${parts.join('; ')}${shared}`;
}
