import type { BrowserContext, Page } from '@playwright/test';

/**
 * IndexedDB requests counted, for request budgets (round sixty-seven; triage-66 H1, S-E9, R45-D). Adopted from reviewer
 * E's counter (round sixty-six, /tmp/rev66/E/tests/e2e/zz-e-count.spec.ts).
 *
 * Why count: Safari's engine as Playwright builds it for Windows answers about one request every 16 ms, and the WebKit
 * allowances (helpers/pace.ts) let a WebKit run wait for what that costs, so a change that multiplies the requests a step
 * makes passed in every engine: Chromium is fast enough not to notice, and WebKit was given the time. A count is the same
 * in every engine and on every machine, so a budget on it fails the change itself, whatever the pace.
 *
 * What is counted: every request a page asks of IndexedDB through an object store or an index (`get`, `put`, `add`,
 * `getAll`, `count`, `delete`, `clear`, `openCursor` and the rest) and every `cursor.continue()`, per transaction, from
 * the page's start (`countRequests` installs it on every page of the context, before the page's own scripts) to the
 * moment read. `markCount` sets the start of a step in the same page life; `countSince` reads the step.
 */
export type Count = {
  requests: number;
  transactions: number;
  readwrite: number;
  byMethod: Record<string, number>;
  /** Transactions of 20 requests or more, said in a line each: the database, mode, stores, count and method counts. */
  big: string[];
};

/** The counter itself: runs in the page, before its scripts. */
function counter(): void {
  type Tx = { db: string; stores: string; mode: string; n: number; byM: Record<string, number>; done: boolean };
  const C = { txs: [] as Tx[], base: 0 };
  (window as unknown as { __idbCount: typeof C }).__idbCount = C;
  const txOf = new WeakMap<IDBTransaction, Tx>();
  const realTx = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (this: IDBDatabase, stores: string | string[], mode?: IDBTransactionMode, o?: IDBTransactionOptions) {
    const tx = realTx.call(this, stores, mode, o);
    const t: Tx = { db: this.name, stores: [...(Array.isArray(stores) ? stores : [stores])].join(','), mode: mode ?? 'readonly', n: 0, byM: {}, done: false };
    C.txs.push(t);
    txOf.set(tx, t);
    const end = () => { t.done = true; };
    tx.addEventListener('complete', end);
    tx.addEventListener('abort', end);
    tx.addEventListener('error', end);
    return tx;
  } as typeof realTx;
  const wrap = (proto: object, names: string[], txOfThis: (s: unknown) => IDBTransaction, label: string) => {
    for (const name of names) {
      const real = (proto as Record<string, (...a: unknown[]) => IDBRequest>)[name];
      if (typeof real !== 'function') continue;
      (proto as Record<string, unknown>)[name] = function (this: unknown, ...args: unknown[]) {
        const r = real.apply(this, args);
        const t = txOf.get(txOfThis(this));
        if (t) { t.n++; const k = `${label}.${name}`; t.byM[k] = (t.byM[k] ?? 0) + 1; }
        return r;
      };
    }
  };
  wrap(IDBObjectStore.prototype, ['put', 'add', 'get', 'getAll', 'getAllKeys', 'getKey', 'getAllRecords', 'count', 'delete', 'clear', 'openCursor', 'openKeyCursor'], (s) => (s as IDBObjectStore).transaction, 'store');
  wrap(IDBIndex.prototype, ['get', 'getAll', 'getAllKeys', 'getKey', 'getAllRecords', 'count', 'openCursor', 'openKeyCursor'], (s) => (s as IDBIndex).objectStore.transaction, 'index');
  for (const name of ['continue', 'continuePrimaryKey', 'advance'] as const) {
    const real = IDBCursor.prototype[name] as (...a: unknown[]) => void;
    (IDBCursor.prototype as unknown as Record<string, unknown>)[name] = function (this: IDBCursor, ...a: unknown[]) {
      const src = this.source as IDBObjectStore | IDBIndex;
      const tx = 'objectStore' in src ? src.objectStore.transaction : src.transaction;
      const t = txOf.get(tx);
      if (t) { t.n++; const k = `cursor.${name}`; t.byM[k] = (t.byM[k] ?? 0) + 1; }
      return real.apply(this, a);
    };
  }
}

/** Count every page of `context` from its start. Call before the first page is opened. */
export async function countRequests(context: BrowserContext): Promise<void> {
  await context.addInitScript(counter);
}

/** The start of a step in this page life: `countSince` counts from here. */
export async function markCount(page: Page): Promise<void> {
  await page.evaluate(() => { const C = (window as unknown as { __idbCount: { txs: unknown[]; base: number } }).__idbCount; C.base = C.txs.length; });
}

/**
 * Wait until the page's IndexedDB work is over: every transaction it opened has finished and none has been opened for
 * `quietMs`. A step's count is read after this, so a write the step queued (a snapshot saved after a load) is in it.
 */
export async function idbQuiet(page: Page, quietMs = 1_000, maxMs = 60_000): Promise<void> {
  const t0 = Date.now();
  let last = -1, since = Date.now();
  for (;;) {
    const s = await page.evaluate(() => { const C = (window as unknown as { __idbCount: { txs: Array<{ done: boolean }> } }).__idbCount; return { n: C.txs.length, open: C.txs.filter((t) => !t.done).length }; });
    if (s.n !== last || s.open) { last = s.n; since = Date.now(); }
    else if (Date.now() - since >= quietMs) return;
    if (Date.now() - t0 > maxMs) throw new Error(`IndexedDB was still busy after ${maxMs} ms (${s.open} transactions open)`);
    await page.waitForTimeout(100);
  }
}

/** The requests since `markCount` (or since the page's start), after the page has gone quiet. */
export async function countSince(page: Page, label = ''): Promise<Count> {
  await idbQuiet(page);
  const r = await page.evaluate(() => {
    const C = (window as unknown as { __idbCount: { txs: Array<{ db: string; stores: string; mode: string; n: number; byM: Record<string, number> }>; base: number } }).__idbCount;
    const txs = C.txs.slice(C.base);
    const byMethod: Record<string, number> = {};
    for (const t of txs) for (const [k, v] of Object.entries(t.byM)) byMethod[k] = (byMethod[k] ?? 0) + v;
    return {
      requests: txs.reduce((s, t) => s + t.n, 0),
      transactions: txs.length,
      readwrite: txs.filter((t) => t.mode === 'readwrite').length,
      byMethod,
      big: txs.filter((t) => t.n >= 20).map((t) => `${t.db} ${t.mode} [${t.stores}] ${t.n} requests ${JSON.stringify(t.byM)}`)
    };
  });
  if (label) console.log(`requests: ${label}: ${JSON.stringify(r)}`);
  return r;
}
