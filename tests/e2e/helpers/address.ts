/**
 * A documentation address of its own for every spec that makes a vault (round sixty-two second pass; the machine's
 * limit), sent by `fromAddress` as `cf-connecting-ip`, which wrangler dev, like Cloudflare's edge, takes as the client's
 * address.
 *
 * Each call is an IPv6 network of its own (round sixty-nine, the owner's run on every engine). Until then every address
 * was one of 198.51.100.0/24, and since round sixty-seven a network may place ten new vaults a day
 * (`MAX_NEW_VAULTS_PER_NETWORK_PER_DAY`, counted by /24 or /48): the five projects of a full run share one server, so
 * Firefox, run last, found the day's ten spent and every sync it started stayed unsynced. And the n-th call of a worker
 * was taken from a count kept in the worker's memory, which a worker restarted after a failure starts again from nought,
 * so an address could be handed out twice and reach its own five. Now a call is a random /48 of 3fff::/20, the IPv6
 * documentation prefix (RFC 9637: never a real host), 2^28 of them: two calls of a run share one by a chance of a few
 * in a million, and two would still be under every limit.
 *
 * The one test of the per-address limit (smoke, "five new vaults a day…") takes its address from `limitAddress`, in
 * 2001:db8::/32 (RFC 3849), which `docAddress` never hands out, so its five are never met by a test that makes one vault.
 */
import { test, type BrowserContext, type Page } from '@playwright/test';
import { randomInt } from 'node:crypto';

function runSalt(): number {
  const run = process.env.CULTIFOLIO_E2E_RUN ?? '';
  let h = 0;
  for (const ch of run) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

const hex = (n: number) => n.toString(16);
/** A documentation address on a /48 of its own: 3fff:0xxx:yyyy::1, its /48 drawn at random (see above). */
export function docAddress(): string {
  return `3fff:${hex(randomInt(0x1000))}:${hex(randomInt(0x10000))}::1`;
}

/** The projects of playwright.config.ts, in its order: each has its own limit address in a run (`limitAddress`). */
const PROJECTS = ['chromium', 'phone', 'webkit', 'phone-webkit', 'firefox'];
/**
 * The address for the one test that spends a whole day's five on purpose: never one `docAddress` gives, and a /48 of its
 * own for each project of the run, moved by the run's salt so a server reused on a later run sees another. One address
 * for the whole run let the first engine's run of the test spend the five and the next engine's first vault be refused
 * (round sixty-four; the Firefox run, 429 on its first vault).
 */
export function limitAddress(): string {
  const info = test.info();
  const p = Math.max(0, PROJECTS.indexOf(info.project.name));
  // And one for each attempt and each repeat (round seventy; triage-69 P3, R47-19): the address depended on the project and
  // the run alone, so a retry, or `--repeat-each`, came back to an address whose five were already spent, and under
  // `retries: 1` any passing failure of the first attempt became a certain one. Eight slots a project (an attempt each,
  // and Playwright retries far fewer times), and a block of 64 for each repeat.
  return `2001:db8:${hex((runSalt() + p + 8 * (info.retry % 8) + 64 * info.repeatEachIndex) & 0xffff)}::1`;
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
