/**
 * A documentation address of its own for every spec that makes a vault (round sixty-two second pass; the machine's
 * limit). The server allows five new vaults a day from one address (`allowCreation` in src/lib/server/sync.ts), and
 * every request of a run came from 127.0.0.1: the full suite, run twice in a day against the same state, met that
 * limit and failed tests that had nothing to do with it. Here each call gives the next address of 198.51.100.0/24
 * (TEST-NET-2, RFC 5737: never a real host), and `fromAddress` sends it as `cf-connecting-ip`, which wrangler dev, like
 * Cloudflare's edge, takes as the client's address. The one test of the limit itself (smoke, "five new vaults a
 * day…") takes its address from `limitAddress`, a part of the range `docAddress` never hands out, so its five can
 * never be met by a test that makes one vault, in this run or a later one against the same server.
 *
 * Distinct within a run: the n-th call in a worker gives n * workers + its parallel slot, so two workers never meet
 * below 198 calls. Spread across runs: the config sets CULTIFOLIO_E2E_RUN once per run, before the workers start, and
 * its hash moves the whole sequence, so a hand-started server reused without `fresh-state.mjs` sees other addresses on
 * the next run (the webServer resets the state anyway).
 */
import { test, type BrowserContext, type Page } from '@playwright/test';

/** 198.51.100.62 and .63 are written by hand in r62s-server.spec.ts and agent S's second-pass r62bs-server.spec.ts: never
 *  handed out here, so a vault this helper makes is never counted against theirs (until they take theirs from `docAddress`). */
const RESERVED = new Set([62, 63]);
/** .1 to .199 for the specs that make a vault or two; .200 to .254 for the limit's own test alone. */
const HOSTS = Array.from({ length: 199 }, (_, i) => i + 1).filter((h) => !RESERVED.has(h));
const LIMIT_HOSTS = Array.from({ length: 55 }, (_, i) => i + 200);

function runSalt(): number {
  const run = process.env.CULTIFOLIO_E2E_RUN ?? '';
  let h = 0;
  for (const ch of run) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

let taken = 0;
/** The next documentation address for this worker: distinct from every other call in this run (see above). */
export function docAddress(): string {
  const info = test.info();
  const workers = Math.max(1, info.config.workers);
  const n = taken++ * workers + info.parallelIndex;
  return `198.51.100.${HOSTS[(runSalt() + n) % HOSTS.length]}`;
}

/** The projects of playwright.config.ts, in its order: each has its own limit address in a run (`limitAddress`). */
const PROJECTS = ['chromium', 'phone', 'webkit', 'phone-webkit', 'firefox'];
/**
 * The address for the one test that spends a whole day's five on purpose: never one `docAddress` gives, and one of its
 * own for each project of the run. One address for the whole run let the first engine's run of the test spend the five
 * and the next engine's first vault be refused (round sixty-four; the Firefox run, 429 on its first vault). The five
 * projects sit eleven apart in the fifty-five.
 */
export function limitAddress(): string {
  const p = PROJECTS.indexOf(test.info().project.name);
  return `198.51.100.${LIMIT_HOSTS[(runSalt() + 11 * Math.max(0, p)) % LIMIT_HOSTS.length]}`;
}

/**
 * Every request of this context to the sync API (the page's and its service worker's) carries `ip` as the client's
 * address. `fallback`, not `continue`, so a route the test sets on the same requests still sees them. Returns the address.
 */
export async function fromAddress(target: BrowserContext | Page, ip = docAddress()): Promise<string> {
  const context = 'context' in target ? target.context() : target;
  await context.route('**/api/sync/**', (route) => route.fallback({ headers: { ...route.request().headers(), 'cf-connecting-ip': ip } }));
  return ip;
}
