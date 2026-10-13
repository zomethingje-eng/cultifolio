import type { Page, TestInfo } from '@playwright/test';

/**
 * A recorder of one form's Save, for a test that has failed in an engine this sandbox does not have (round seventy;
 * triage-69 P1, IND-8: smoke's species-change Save and the 400-plant price edit left the plant form open for ten seconds
 * in WebKit on the owner's PC, and passed on retry). It records, in the page, with the page's own clock:
 *
 * - the press: each pointerdown, mousedown, pointerup, mouseup and click on the page, where it landed (the element and
 *   the point), and where Save was at that moment, so a press released after Save moved is seen as one;
 * - the form: Save's place whenever the species field's check words change (the cause r70p-save-moves found in
 *   Chromium), the form's submit, the Save's promise (its `aria-disabled` is true from the press until the write is
 *   settled), and the form closing;
 * - the log's writes: each IndexedDB transaction that writes, its stores, when it was asked for, when it ended and how
 *   many requests it made, and which transactions were still open when the form was submitted (a write waits for them);
 * - the check's requests (/api/names, /api/search) from the page's resource timings.
 *
 * Nothing is printed. `attachSaveTrace` (call it from `test.afterEach`) attaches the record as `save-trace.json`, with a
 * one-line reading as an annotation, only when the test failed or is a retry: a passing first run adds nothing. A retry
 * that passes is attached too, so the failed attempt can be read beside a good one.
 */
const traced = new Map<string, Page>();

/** Start recording in this page (and any page it navigates to). Call before the page opens the form. */
export async function traceSave(page: Page, info: TestInfo): Promise<void> {
  traced.set(info.testId, page);
  await page.addInitScript(recorder);
}

/** Mark a step of the test in the page's record (the test's own click, a wait begun), with the page's clock. */
export async function markSave(page: Page, step: string): Promise<void> {
  await page.evaluate((s) => (window as unknown as { __saveTrace?: { mark: (s: string) => void } }).__saveTrace?.mark(s), step).catch(() => {});
}

/** Attach the record when the test failed or is a retry; nothing otherwise, and nothing for a test that did not trace. */
export async function attachSaveTrace(info: TestInfo): Promise<void> {
  const page = traced.get(info.testId);
  traced.delete(info.testId);
  if (!page) return;
  if (info.status === info.expectedStatus && info.retry === 0) return;
  let record: SaveRecord | null = null;
  try {
    record = await page.evaluate(() => {
      const t = (window as unknown as { __saveTrace?: { dump: () => unknown } }).__saveTrace;
      return t ? (t.dump() as SaveRecord) : null;
    });
  } catch (e) {
    info.annotations.push({ type: 'save-trace', description: `not read: ${e instanceof Error ? e.message : String(e)}` });
    return;
  }
  if (!record) {
    info.annotations.push({ type: 'save-trace', description: 'no record in the page (it was not recording)' });
    return;
  }
  info.annotations.push({ type: 'save-trace', description: readSaveRecord(record) });
  await info.attach('save-trace.json', { body: JSON.stringify(record, null, 1), contentType: 'application/json' });
}

/** One entry: the page's time (ms since its start), what happened, and its details. */
export type SaveEvent = [number, string, Record<string, unknown>];
export type SaveRecord = { url: string; events: SaveEvent[]; requests: Array<{ name: string; start: number; end: number; status?: number }> };

/** The record read as one line: the press and its release against Save's place, the submit, the write, the close. */
export function readSaveRecord(r: SaveRecord): string {
  const ev = r.events;
  const out: string[] = [];
  const downs = ev.filter((e) => e[1] === 'pointerdown' && e[2].onSave);
  const lastDown = downs[downs.length - 1];
  if (!lastDown) out.push('no press landed on Save');
  else {
    const at = lastDown[0];
    const up = ev.find((e) => e[0] >= at && e[1] === 'mouseup');
    const click = ev.find((e) => e[0] >= at && e[1] === 'click');
    out.push(`pressed on Save at ${at} ms`);
    if (up) out.push(up[2].onSave ? `released on Save at ${up[0]} ms` : `released at ${up[0]} ms on ${String(up[2].target)}, not Save (Save then at y=${String((up[2].save as { y?: number } | null)?.y)}, pressed at y=${String(lastDown[2].y)})`);
    if (!click) out.push('no click followed');
    else if (!click[2].onSave) out.push(`the click went to ${String(click[2].target)}`);
    const moved = ev.filter((e) => e[1] === 'save-moved' && e[0] >= at - 1000 && (!up || e[0] <= up[0] + 1000));
    for (const m of moved) out.push(`Save moved ${String(m[2].dy)} px at ${m[0]} ms (${String(m[2].why)})`);
  }
  // What followed the last press on Save (or, with none, the last time the form opened).
  const from = lastDown?.[0] ?? [...ev].reverse().find((e) => e[1] === 'form-open')?.[0] ?? 0;
  const after = (kind: string) => ev.find((e) => e[1] === kind && e[0] >= from);
  const submit = after('submit');
  const busy = after('save-busy');
  const idle = after('save-settled');
  const closed = after('form-closed');
  out.push(submit ? `submitted at ${submit[0]} ms with ${String((submit[2].open as unknown[] | undefined)?.length ?? 0)} transaction(s) open` : 'never submitted');
  if (busy) out.push(`the Save's promise ran from ${busy[0]} ms${idle ? ` to ${idle[0]} ms` : ', unsettled'}`);
  const writes = ev.filter((e) => e[1] === 'tx-end' && e[2].mode === 'readwrite' && submit && e[0] >= submit[0]);
  for (const w of writes.slice(0, 4)) out.push(`a write on ${String(w[2].stores)} asked at ${String(w[2].asked)} ms, ended ${w[0]} ms (${String(w[2].requests)} requests, ${String(w[2].how)})`);
  out.push(closed ? `the form closed at ${closed[0]} ms` : 'the form did not close');
  return out.join('; ');
}

/** Runs in the page before its own scripts (addInitScript): keep it self-contained. */
function recorder() {
  const w = window as unknown as { __saveTrace?: unknown };
  if (w.__saveTrace) return;
  const now = () => Math.round(performance.now());
  const events: Array<[number, string, Record<string, unknown>]> = [];
  const rec = (kind: string, detail: Record<string, unknown> = {}) => { if (events.length < 3000) events.push([now(), kind, detail]); };
  const describe = (el: EventTarget | null): string => {
    if (!(el instanceof Element)) return String(el);
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    const text = (el.textContent ?? '').trim().slice(0, 30);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
  };
  const saveButton = () => document.querySelector<HTMLButtonElement>('.editform button[type=submit]');
  const rect = (el: Element | null) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y * 10) / 10, w: Math.round(b.width), h: Math.round(b.height) }; };
  // The press and its release.
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    window.addEventListener(type, (e) => {
      const save = saveButton();
      const m = e as MouseEvent;
      rec(type, { target: describe(e.target), onSave: !!save && e.target instanceof Node && save.contains(e.target), x: Math.round(m.clientX), y: Math.round(m.clientY), save: rect(save), trusted: e.isTrusted });
    }, { capture: true });
  }
  // The form: open and closed, its Save's place, the check's words, the Save's promise.
  let formOpen = false;
  let lastY: number | null = null;
  let lastWords = '';
  let lastBusy: string | null = null;
  const look = () => {
    const form = document.querySelector('.editform');
    if (!!form !== formOpen) { formOpen = !!form; rec(formOpen ? 'form-open' : 'form-closed'); lastY = null; lastBusy = null; }
    if (!form) return;
    const save = saveButton();
    const words = (form.querySelector('.picker .status')?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const y = save ? save.getBoundingClientRect().y + window.scrollY : null;
    if (words !== lastWords) { rec('name-check', { words: words.slice(0, 160), save: rect(save) }); }
    if (y != null && lastY != null && Math.abs(y - lastY) >= 1) rec('save-moved', { dy: Math.round((y - lastY) * 10) / 10, why: words !== lastWords ? `the check's words: "${words.slice(0, 80)}"` : 'another change of the page' });
    lastWords = words;
    if (y != null) lastY = y;
    const busy = save?.getAttribute('aria-disabled') ?? null;
    if (busy !== lastBusy) { if (busy === 'true') rec('save-busy'); else if (lastBusy === 'true') rec('save-settled'); lastBusy = busy; }
  };
  const start = () => {
    new MutationObserver(look).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-disabled', 'class', 'style'] });
    look();
  };
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
  // The log's writes: every transaction, timed; the open ones listed at the submit.
  type Tx = { id: number; mode: string; stores: string; asked: number; requests: number };
  const open = new Map<IDBTransaction, Tx>();
  const txOf = new WeakMap<IDBTransaction, Tx>();
  let n = 0;
  const origTx = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
    const tx = origTx.apply(this, args);
    const info: Tx = { id: ++n, mode: tx.mode, stores: [...(Array.isArray(args[0]) ? args[0] : [args[0]])].join(','), asked: now(), requests: 0 };
    open.set(tx, info);
    txOf.set(tx, info);
    const end = (how: string) => () => {
      open.delete(tx);
      // Reads that end quickly are many on a page load and say nothing of a write's wait: a write, or a read that took 50 ms or more, is kept.
      if (info.mode !== 'readonly' || now() - info.asked >= 50) rec('tx-end', { ...info, how, took: now() - info.asked });
    };
    tx.addEventListener('complete', end('complete'));
    tx.addEventListener('abort', end('abort'));
    return tx;
  } as IDBDatabase['transaction'];
  const count = (proto: object, names: string[]) => {
    for (const name of names) {
      const p = proto as Record<string, unknown>;
      const orig = p[name];
      if (typeof orig !== 'function') continue;
      p[name] = function (this: IDBObjectStore | IDBIndex, ...a: unknown[]) {
        const store = this instanceof IDBIndex ? this.objectStore : this;
        const info = txOf.get(store.transaction);
        if (info) info.requests++;
        return (orig as (...x: unknown[]) => unknown).apply(this, a);
      };
    }
  };
  count(IDBObjectStore.prototype, ['get', 'getAll', 'getAllKeys', 'getKey', 'put', 'add', 'delete', 'clear', 'count', 'openCursor', 'openKeyCursor']);
  count(IDBIndex.prototype, ['get', 'getAll', 'getAllKeys', 'getKey', 'count', 'openCursor', 'openKeyCursor']);
  document.addEventListener('submit', (e) => {
    rec('submit', { form: describe(e.target), open: [...open.values()].map((t) => ({ ...t, age: now() - t.asked })) });
  }, { capture: true });
  w.__saveTrace = {
    mark: (s: string) => rec('test', { step: s }),
    dump: () => ({
      url: location.href,
      events,
      requests: (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
        .filter((r) => /\/api\/(names|search)/.test(r.name))
        .map((r) => ({ name: r.name.replace(location.origin, ''), start: Math.round(r.startTime), end: Math.round(r.responseEnd), status: (r as PerformanceResourceTiming & { responseStatus?: number }).responseStatus }))
    })
  };
}
