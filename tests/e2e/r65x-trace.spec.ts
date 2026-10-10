import { test, type Page } from '@playwright/test';

/**
 * Round sixty-five, agent X: a trace for the write that never finishes in Safari's engine, run by hand on the PC (skipped
 * otherwise, so it never fails a strict run):
 *
 *   PW_PROBE=1 npx playwright test tests/e2e/r65x-trace.spec.ts --project webkit --retries 0 --reporter line
 *
 * Round sixty-four's probe says whether a write is held; this says by what. An init script wraps the page's own IndexedDB
 * and Web Locks (nothing of the app is changed): every transaction the page opens is numbered, with its database, stores,
 * mode, the requests it was given and how many of them answered, and whether it completed, aborted or is still open; every
 * lock asked for, granted and let go is noted. When a step has not finished after its wait, the trace prints every
 * transaction still open and every lock still asked for, oldest first, and the last thirty events. A transaction open
 * with all its requests answered is one the browser never ended; one with requests unanswered is one the browser never
 * served; a lock asked for and never granted is the lock. Every write of more than twenty requests that completed is listed
 * with its time and its milliseconds a request: the pace that tells a slow engine from a held one (helpers/pace.ts reads
 * about 16 ms a request in Playwright's WebKit on the PC from the rerun's own timings; this measures it).
 *
 * The three steps are the three shapes that hung on the PC: the example set out (r60 11 and nine others), six plants from
 * the add form (smoke 2306), and a second import of five on a new page (r63l). Each runs in a fresh context.
 */
test.skip(!process.env.PW_PROBE, 'run by hand: PW_PROBE=1');
test.use({ serviceWorkers: 'block' });

function trace(): void {
  type Tx = { n: number; db: string; stores: string[]; mode: string; at: number; asked: number; answered: number; failed: number; state: string; last: string };
  type Lk = { name: string; mode: string; at: number; granted?: number; released?: number };
  type Trace = { txs: Tx[]; events: string[]; locks: Lk[] };
  const w = window as unknown as { __trace: Trace };
  const T: Trace = (w.__trace = { txs: [], events: [], locks: [] });
  const now = () => Math.round(performance.now());
  const note = (s: string) => { T.events.push(`${now()} ${s}`); if (T.events.length > 400) T.events.shift(); };
  const txOf = new WeakMap<IDBTransaction, Tx>();
  const nameOf = (d: IDBDatabase) => { try { return d.name; } catch { return '?'; } };
  const realTx = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (this: IDBDatabase, stores: string | string[], mode?: IDBTransactionMode, opts?: IDBTransactionOptions) {
    const tx = realTx.call(this, stores, mode, opts);
    const t: Tx = { n: T.txs.length + 1, db: nameOf(this), stores: [...(Array.isArray(stores) ? stores : [stores])], mode: mode ?? 'readonly', at: now(), asked: 0, answered: 0, failed: 0, state: 'open', last: '' };
    T.txs.push(t);
    txOf.set(tx, t);
    tx.addEventListener('complete', () => { t.state = `complete@${now()}`; note(`tx${t.n} complete: ${t.asked} requests in ${now() - t.at} ms`); });
    tx.addEventListener('abort', () => { t.state = `abort@${now()} ${tx.error?.name ?? ''}`; note(`tx${t.n} abort ${tx.error?.name ?? ''}`); });
    tx.addEventListener('error', () => { t.failed++; });
    note(`tx${t.n} ${t.db} ${t.mode} [${t.stores.join(',')}]`);
    return tx;
  } as typeof IDBDatabase.prototype.transaction;
  const watch = (proto: object, names: string[], txOfThis: (self: unknown) => IDBTransaction) => {
    for (const name of names) {
      const real = (proto as Record<string, unknown>)[name] as ((...a: unknown[]) => IDBRequest) | undefined;
      if (typeof real !== 'function') continue;
      (proto as Record<string, unknown>)[name] = function (this: unknown, ...args: unknown[]) {
        let r: IDBRequest;
        try { r = real.apply(this, args); } catch (e) { const t = txOf.get(txOfThis(this)); if (t) t.last = `${name} threw ${(e as Error)?.name}`; note(`tx${t?.n} ${name} threw ${(e as Error)?.name}: ${(e as Error)?.message}`); throw e; }
        const t = txOf.get(txOfThis(this));
        if (t) {
          t.asked++;
          t.last = `${name} asked@${now()}`;
          r.addEventListener('success', () => { t.answered++; t.last = `${name} answered@${now()}`; });
          r.addEventListener('error', () => { t.answered++; t.failed++; t.last = `${name} failed@${now()} ${r.error?.name}`; note(`tx${t.n} ${name} failed ${r.error?.name}`); });
        }
        return r;
      };
    }
  };
  watch(IDBObjectStore.prototype, ['put', 'add', 'get', 'getAll', 'getAllKeys', 'getKey', 'count', 'delete', 'clear', 'openCursor', 'openKeyCursor'], (s) => (s as IDBObjectStore).transaction);
  watch(IDBIndex.prototype, ['get', 'getAll', 'getAllKeys', 'getKey', 'count', 'openCursor', 'openKeyCursor'], (s) => (s as IDBIndex).objectStore.transaction);
  const lm = (navigator as Navigator & { locks?: LockManager }).locks;
  if (lm) {
    const realReq = LockManager.prototype.request;
    LockManager.prototype.request = function (this: LockManager, name: string, ...rest: unknown[]) {
      const opts = (rest.length > 1 ? rest[0] : {}) as LockOptions;
      const cb = (rest.length > 1 ? rest[1] : rest[0]) as LockGrantedCallback<unknown>;
      const l: Lk = { name, mode: `${opts.mode ?? 'exclusive'}${opts.ifAvailable ? ' ifAvailable' : ''}`, at: now() };
      T.locks.push(l);
      note(`lock asked ${name} ${l.mode}`);
      const wrapped: LockGrantedCallback<unknown> = (lock: Lock | null) => { l.granted = now(); note(`lock granted ${name} (${lock ? 'held' : 'not available'})`); return cb(lock); };
      const p = realReq.call(this, name, opts, wrapped) as Promise<unknown>;
      void p.then(() => { l.released = now(); note(`lock let go ${name}`); }, () => { l.released = now(); note(`lock let go ${name} (rejected)`); });
      return p;
    } as typeof LockManager.prototype.request;
  }
  note('trace on');
}

async function report(page: Page, step: string, done: boolean, ms: number): Promise<string> {
  const out = await page.evaluate(async () => {
    const T = (window as unknown as { __trace?: { txs: Array<{ n: number; db: string; stores: string[]; mode: string; at: number; asked: number; answered: number; failed: number; state: string; last: string }>; events: string[]; locks: Array<{ name: string; mode: string; at: number; granted?: number; released?: number }> } }).__trace;
    if (!T) return { error: 'no trace in this page' };
    const now = Math.round(performance.now());
    const locks = 'locks' in navigator ? await navigator.locks.query().catch((e) => String(e)) : 'no navigator.locks';
    return {
      now,
      open: T.txs.filter((t) => t.state === 'open').map((t) => `tx${t.n} ${t.db} ${t.mode} [${t.stores.join(',')}] opened ${now - t.at} ms ago; asked ${t.asked}, answered ${t.answered}, failed ${t.failed}; last: ${t.last}`),
      transactions: T.txs.length,
      // The pace: each write that completed, its requests and its time, so a slow engine shows its ms a request.
      writes: T.txs.filter((t) => t.mode === 'readwrite' && t.asked > 20).map((t) => `tx${t.n} [${t.stores.join(',')}] ${t.asked} requests, ${t.state}${t.state.startsWith('complete@') ? `, ${(Number(t.state.slice(9)) - t.at)} ms, ${((Number(t.state.slice(9)) - t.at) / t.asked).toFixed(1)} ms a request` : ''}`),
      locksAsked: T.locks.filter((l) => l.released === undefined).map((l) => `${l.name} ${l.mode}: asked ${now - l.at} ms ago, ${l.granted === undefined ? 'NOT GRANTED' : `granted after ${l.granted - l.at} ms`}`),
      locks,
      status: [...document.querySelectorAll('[role=status],[role=alert]')].map((s) => s.textContent?.trim()).filter(Boolean),
      last: T.events.slice(-30)
    };
  });
  const text = `r65x trace, ${step}: ${done ? 'finished' : 'NOT finished'} after ${ms} ms\n${JSON.stringify(out, null, 1)}`;
  console.log(text);
  return text;
}

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached', timeout: 60_000 });
}

test('trace 1: the example collection set out', async ({ browser }, info) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await ctx.addInitScript(trace);
  const page = await ctx.newPage();
  await page.goto('/plants');
  await ready(page);
  await page.click('#try-sample');
  await ready(page);
  const t0 = Date.now();
  const done = await page.locator('.rows > *').nth(11).waitFor({ timeout: 40_000 }).then(() => true, () => false);
  await info.attach('trace 1', { body: await report(page, 'the example set out', done, Date.now() - t0), contentType: 'text/plain' });
  await ctx.close();
});

test('trace 2: six plants from the add form, on the first page', async ({ browser }, info) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await ctx.addInitScript(trace);
  await ctx.addInitScript(() => { try { sessionStorage.setItem('cultifolio.sampleOut', '1'); } catch { /* none */ } });
  const page = await ctx.newPage();
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await ready(page);
  await page.locator('details.moredetails > summary').click();
  await page.fill('#f-count', '6');
  const t0 = Date.now();
  await page.getByRole('button', { name: /^Add/ }).click();
  const done = await page.waitForURL(/\/plants$/, { timeout: 40_000 }).then(() => true, () => false);
  await info.attach('trace 2', { body: await report(page, 'six plants added', done, Date.now() - t0), contentType: 'text/plain' });
  await ctx.close();
});

test('trace 3: a second import of five on a new page', async ({ browser }, info) => {
  test.setTimeout(150_000);
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await ctx.addInitScript(trace);
  const page = await ctx.newPage();
  const add = async (text: string) => {
    await page.goto('/plants/import');
    await ready(page);
    await page.fill('#imp-text', text);
    await page.click('#imp-check');
    await page.locator('#imp-review-h').waitFor({ timeout: 30_000 });
    const t0 = Date.now();
    await page.click('#imp-add');
    const done = await page.locator('#imp-done').waitFor({ timeout: 40_000 }).then(() => true, () => false);
    return report(page, `an import of ${text.split('\n').length}`, done, Date.now() - t0);
  };
  const one = await add('Copiapoa cinerea; ; 0001\nCopiapoa humilis; ; 0002\nLithops lesliei; ; 0003');
  const two = await add('Aloe vera; ; A9\nAloe ferox; ; A95\nAloe arborescens; ; A77\nAloe striata; ; 2014-0001\nAloe marlothii; ; A10');
  await info.attach('trace 3', { body: `${one}\n\n${two}`, contentType: 'text/plain' });
  await ctx.close();
});
