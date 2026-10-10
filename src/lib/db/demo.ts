/**
 * The sample collection (round sixty; the product review's 3). It is a database of its own, chosen when the page
 * loads (`vault.ts`), so entering or leaving it reloads the page: nothing of the sample reaches the grower's own vault,
 * their log, a backup or sync. Its settings are the tab's own (`$lib/ui/stored`).
 *
 * Round sixty-one (the records review, 13): leaving tells the sample's other tabs, which go to the grower's own
 * collection and say why, rather than reload into a fresh sample under a false "updated in another tab"; and a sample
 * left behind (a tab closed without Leave) is deleted on the next load outside the sample, unless a sample tab is still
 * open. Round sixty-two (A9): Leave navigates first and the next page deletes the sample, so a "Leave site?" answered
 * Cancel leaves a working tab; Leave asks first when the visitor added or changed records; a delete that is blocked is
 * said, never taken as done.
 */
const KEY = 'cultifolio.demo';
export const DEMO_DB = 'cultifolio-demo';
/** The sample's tabs hear one another here: "closed" when one leaves. */
const LIFE = 'cultifolio-sample';
/** Held (shared) by every open sample tab; a tab outside the sample deletes a leftover sample only when no tab holds it. */
const OPEN_LOCK = 'cultifolio-sample-open';
/** Set in a tab sent home because the sample closed elsewhere, so its next page can say so. */
export const CLOSED_NOTE = 'cultifolio.sampleClosed';

/**
 * Where this tab's next page goes: the flag as the tab's storage holds it now. Not which collection this page shows,
 * which is `PAGE_IN_DEMO` (round sixty-seven; triage-66 V3).
 */
export function inDemo(): boolean {
  try { return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(KEY) === '1'; } catch { return false; }
}
/**
 * Which collection this page shows, read once as the page loads, as the vault chooses its database (round sixty-seven;
 * triage-66 V3; IND-1, S-A3, S-A4): the settings' scope, the persist ask, sync, the layout's hint and the bar all read
 * this, never the tab's flag of the moment. A Leave clears the flag before the next page loads, and a Leave called off
 * where the browser does not say so (Safari's engine, an older Firefox) left the example's page writing settings, the
 * hint and the persist ask as the grower's own for up to 10 seconds; a tab sent home by another tab's Leave and answered
 * Cancel did so for good.
 */
export const PAGE_IN_DEMO: boolean = inDemo();

/**
 * The example was closed under this page (another tab's Leave, or its database deleted): the page stays as it was drawn,
 * with anything typed still on screen to copy, and writes nothing more (round sixty-seven; triage-66 V3). The vault
 * refuses to open the example's database again with these words (`openVault`), so a page whose Leave was answered
 * Cancel can no longer re-create the database another tab has just deleted, nor lose a plant into it.
 */
export const CLOSED_WORDS = 'The example collection was closed in another tab, so nothing more is saved on this page; what you typed is still here to copy';
let closed = false;
const onClose = new Set<() => void>();
/** The page's hold on the "an example is open" lock, let go when the example closes under it. */
let releaseOpen: (() => void) | null = null;
/** The example was closed under this page: nothing more is written from it. */
export function exampleClosed(): boolean {
  return closed;
}
/** Put this page into the closed state: called by the vault's `blocking` for the example's database, and by the channel. */
export function markExampleClosed(): void {
  if (closed) return;
  closed = true;
  // The lock goes now, not with the page: the tab that left deletes the database under it (`finishLeaving`).
  try { releaseOpen?.(); } catch { /* nothing held */ }
  releaseOpen = null;
  for (const f of [...onClose]) { try { f(); } catch { /* one listener's fault is not the others' */ } }
}
/** Called once when the example closes under this page; returns the way to stop listening. */
export function onExampleClosed(f: () => void): () => void {
  if (closed) { f(); return () => {}; }
  onClose.add(f);
  return () => onClose.delete(f);
}
/**
 * Switch this tab to the sample collection and load it; the caller seeds it after the reload when it is empty. False when
 * the tab's storage refuses the flag: nothing happens, and the page shows its own empty state (round sixty-three, V2).
 *
 * A load the page calls off is no entry (round sixty-three, the fix pass; R1, 1): a "Leave site?" answered Cancel kept
 * the flag, so the tab showed the grower's own collection while it read as the example's (the hint unwritten, the
 * settings read from the example's copies, and the next load opening the example over a plant just saved). The flag is
 * taken off again, and `onStay` called, as soon as the page is known to stay, as Leave does (`leaveDemo`): the browser
 * says the navigation was called off (the Navigation API's `navigateerror`), or, in a browser without it, the page asked
 * "Leave site?" and is still showing 3 seconds later. No later fallback: a slow load is not a called-off one, and taking
 * the flag off under it would open the next page outside the example.
 */
export function enterDemo(to = '/today', onStay?: () => void): boolean {
  try { sessionStorage.setItem(KEY, '1'); } catch { return false; }
  // A note of an earlier close not yet said would take the new flag off at the next page's first script (app.html).
  try { sessionStorage.removeItem(CLOSED_NOTE); } catch { /* none to take off */ }
  if (typeof addEventListener !== 'function') { location.href = to; return true; } // no page to stay (a test without one)
  let armed = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const nav = (globalThis as { navigation?: EventTarget }).navigation;
  const disarm = () => { armed = false; try { removeEventListener('pagehide', disarm); removeEventListener('beforeunload', asked); nav?.removeEventListener('navigateerror', stay); } catch { /* nothing was listening */ } clearTimeout(timer); };
  function stay() {
    if (!armed) return;
    disarm();
    try { sessionStorage.removeItem(KEY); } catch { /* it was set a moment ago; a storage that refuses now keeps it */ }
    onStay?.();
  }
  /** After the page's own listeners (added before this one): whether it will ask "Leave site?". */
  let prompted = false;
  function asked(e: Event) { const b = e as BeforeUnloadEvent; if (b.defaultPrevented || (typeof b.returnValue === 'string' && b.returnValue !== '')) prompted = true; }
  addEventListener('pagehide', disarm); // really going: the flag is the next page's
  addEventListener('beforeunload', asked);
  try { nav?.addEventListener('navigateerror', stay); } catch { /* no Navigation API: the timer below */ }
  location.href = to;
  if (!nav && armed) timer = setTimeout(() => { if (prompted && (typeof document === 'undefined' || document.visibilityState === 'visible')) stay(); }, 3000);
  return true;
}

/**
 * A page brought back from the back-forward cache into a tab whose mode changed since it was shown (it was the grower's
 * own and the tab is now the example's, or the other way) loads afresh (round sixty-three, the fix pass; R1, 3): Safari
 * restored the front page from before a tap into the example, its own vault open and no bar, in a tab marked as the
 * example's, and a plant added there went into the grower's own collection under the example's settings. Returns the way
 * to stop listening.
 */
export function freshOnRestore(): () => void {
  const opened = PAGE_IN_DEMO; // the collection this page shows, against where the tab now goes (round sixty-seven; triage-66 V3)
  const f = (e: Event) => { if ((e as PageTransitionEvent).persisted && inDemo() !== opened) location.reload(); };
  addEventListener('pageshow', f);
  return () => removeEventListener('pageshow', f);
}
/**
 * Set in a tab that has left the sample (by Leave, or sent home because another tab closed it): an empty Today, Places or
 * Propagation then offers the example instead of opening it again, so Leave never loops back into it (round sixty-three, V2).
 */
export const OUT = 'cultifolio.sampleOut';
/** This tab has left the sample: an empty grower page offers it rather than opening it by itself. */
export function leftHere(): boolean {
  try { return sessionStorage.getItem(OUT) === '1'; } catch { return true; } // no storage: never entered by itself either
}
function markOut(): void {
  try { sessionStorage.setItem(OUT, '1'); } catch { /* without storage the sample is never entered by itself */ }
}
/**
 * On a page outside the example, with the tab not on its way in: any copies of the example's settings still in the tab
 * go (round sixty-seven; triage-66 V3). A page that keeps its state as it goes (Labels' picks, at `pagehide`) writes it
 * as the example's after Leave has cleared the copies; the first page outside takes what is left.
 */
export function clearExampleCopies(): void {
  if (PAGE_IN_DEMO || inDemo()) return;
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) { const k = sessionStorage.key(i); if (k?.startsWith(`${KEY}.`)) sessionStorage.removeItem(k); }
  } catch { /* they go with the tab anyway */ }
}
/** The flag and the tab's own copies of the settings, gone. */
function clearFlag(): void {
  try {
    sessionStorage.removeItem(KEY);
    for (let i = sessionStorage.length - 1; i >= 0; i--) { const k = sessionStorage.key(i); if (k?.startsWith(`${KEY}.`)) sessionStorage.removeItem(k); }
  } catch { /* the flag goes with the tab anyway */ }
}
/** Set as a sample tab goes on Leave, so the next page deletes the sample and says how that went. */
const LEFT = 'cultifolio.sampleLeft';
/** The meta key under which a sample of round sixty-two to sixty-six kept the last stamp it was set out with; no longer read, the seed's arrival number is (`SEED_MARK`). */
export const SEED_TOP = 'demoSeedTop';
/**
 * The meta key holding the seed's own last arrival number, written in the seed's commit (round sixty-seven; triage-66
 * V5; IND-6, S-A7, R45-16): what arrived after it is the visitor's. A stamp taken from the whole log a moment later took
 * in a visitor's edit made in between, and a reload between the commit and that write left none at all.
 */
export const SEED_MARK = 'demoSeedSeq';
/** The meta key under which the leftover's offer notes the last arrival it was made for: offered once, not on every load (triage-66 V2). */
const OFFERED = 'demoOfferedSeq';
/** The tail of every id the seed gives its records (demo-seed.ts). */
export const SEED_TAG = 'sampleseeds0';

/** One change as the example's log holds it, in arrival order, with its arrival number. */
export type Arrival = { seq: number; t: string; kind: string; id: string; field: string; value: unknown };

/**
 * The seed's own last change in the example's log, in arrival order, or null when the seed is not in it (round
 * sixty-seven; triage-66 V5). The seed is one commit whose last change is a field of its pot-up line, the one pot-up whose
 * plants all carry the seed's tag: a visitor's pot-up makes plants of their own. The line's fields as first written are
 * the seed's; a later edit of it is the visitor's. Pure, so the repair is tested on its own.
 */
export function seedLast<T extends Omit<Arrival, 'seq'>>(log: readonly T[]): T | null {
  const firstOf = new Map<string, T>();
  for (const c of log) { const k = `${c.kind}\0${c.id}\0${c.field}`; if (!firstOf.has(k)) firstOf.set(k, c); }
  const potUps = new Set<string>();
  for (const c of firstOf.values()) {
    if (c.kind !== 'event' || c.field !== 'plants' || !Array.isArray(c.value) || !c.value.length) continue;
    if (c.value.every((p) => typeof p === 'string' && p.endsWith(SEED_TAG)) && firstOf.get(`event\0${c.id}\0t`)?.value === 'potup') potUps.add(c.id);
  }
  let last: T | null = null;
  // The end of the pot-up line's fields as the seed's commit wrote them, one after another; a field the visitor gave it
  // later arrived apart from them. Failing that (a log this build did not seed), the end of the run of seed-tagged
  // records the log opens with, which is never past the seed's commit and counts its later lines as the visitor's: a
  // question too many, never one too few.
  const start = log.findIndex((c) => c.kind === 'event' && potUps.has(c.id));
  if (start >= 0) for (let i = start; i < log.length && log[i].kind === 'event' && log[i].id === log[start].id; i++) last = log[i];
  if (!last) for (const c of log) { if (!c.id.endsWith(SEED_TAG)) break; last = c; }
  return last;
}
/** How many records the changes touched: what Leave and the leftover's offer count as "added or changed". */
export function recordsTouched(log: readonly Pick<Arrival, 'kind' | 'id'>[]): number {
  return new Set(log.map((c) => `${c.kind}:${c.id}`)).size;
}

/**
 * The example was closed in another tab: this page goes into the closed state (`markExampleClosed`) and asks to go to
 * the grower's own collection, whose first page says why. One function for both ways a tab hears it, the channel
 * (`keepSampleOpen`) and the vault's `versionchange` (round sixty-two; the triage's 4).
 *
 * The flag and the example's settings go only when the page really goes (round sixty-seven; triage-66 V3; IND-1): they
 * went before the navigation was asked for, and a "Leave site?" answered Cancel left a page showing the example whose
 * settings, persist ask and hint were the grower's. The note `CLOSED_NOTE` is written now instead, and the next page's
 * first script (app.html) reads it and takes the flag off there; so does the address. Asked once: the channel and the
 * database each tell the tab, and a visitor who answered Cancel is not asked twice.
 */
let sentHome = false;
export function sampleClosedHere(): void {
  markExampleClosed();
  if (sentHome) return;
  sentHome = true;
  markOut();
  try { sessionStorage.setItem(CLOSED_NOTE, '1'); } catch { /* said nowhere, then */ }
  if (typeof addEventListener === 'function') addEventListener('pagehide', clearFlag, { once: true });
  else clearFlag(); // no page to hide (a test): it goes now
  location.href = `/?${LEFT_PARAM}=sample`;
}

/**
 * The example's log, in arrival order, from inside the example: through its vault (round sixty-seven; triage-66 V5).
 * The seed's mark when it is there; otherwise the mark is found from the seed's own changes.
 */
async function exampleLog(): Promise<{ after: Array<Omit<Arrival, 'seq'>>; mark: number | null; stored: boolean; empty: boolean }> {
  const { arrivalsAfter, arrivalsOf, getMeta } = await import('./vault');
  const had = await getMeta<number>(SEED_MARK);
  if (typeof had === 'number') return { after: (await arrivalsAfter(had)).changes, mark: had, stored: true, empty: false };
  const all = (await arrivalsAfter(0)).changes;
  const last = seedLast(all);
  if (!last) return { after: all, mark: null, stored: false, empty: !all.length };
  const mark = (await arrivalsOf([last.t])).get(last.t);
  if (mark === undefined) return { after: all.slice(all.indexOf(last) + 1), mark: null, stored: false, empty: false }; // no arrival number for it: by its place in the order read
  return { after: (await arrivalsAfter(mark)).changes, mark, stored: false, empty: false };
}

/**
 * How many records the visitor added or changed in the example since it was set out: Leave asks before deleting them
 * (round sixty-two; A9). Read from the example's own log: every record a change that arrived after the seed's own last
 * change touched (round sixty-seven; triage-66 V5), whatever its stamp, so an edit made while the seed's commit was
 * landing counts, and a seed whose mark a reload cut off counts none of its own lines.
 */
export async function sampleEdits(): Promise<number> {
  if (!PAGE_IN_DEMO || closed) return 0;
  try {
    return recordsTouched((await exampleLog()).after);
  } catch {
    return 0;
  }
}
/**
 * Where the example's seed stands, from inside it (round sixty-seven; triage-66 V5): 'marked' (its mark is stored),
 * 'repaired' (its changes are in the log and the mark was missing, so the mark, and the seeded flag with it, are written
 * now), 'empty' (nothing in the log: set it out) or 'other' (the log holds changes, none of them the seed's). An example cut off between its commit and its mark (a seed of round sixty-six reloaded at the wrong moment) is
 * repaired here, so Leave counts what the visitor did, and one whose plants were all removed is never seeded twice.
 */
export async function seedState(seededKey: string): Promise<'marked' | 'repaired' | 'empty' | 'other'> {
  const { setMeta } = await import('./vault');
  const log = await exampleLog();
  if (log.stored) return 'marked';
  if (log.mark !== null) {
    await setMeta(SEED_MARK, log.mark);
    await setMeta(seededKey, true);
    return 'repaired';
  }
  return log.empty ? 'empty' : 'other';
}

/** This tab is going on Leave: the flag and the tab's copies go, the sample's other tabs are told, and the next page deletes it. */
function leaving(): void {
  clearFlag();
  markOut();
  try { sessionStorage.setItem(LEFT, '1'); } catch { /* the leftover is then deleted on a later load */ }
  tellOthers();
}
function tellOthers(): void {
  try { const c = new BroadcastChannel(LIFE); c.postMessage('closed'); c.close(); } catch { /* no other tab to tell */ }
}
/**
 * Before the navigation is asked for, the flag goes and the next page is told to delete the sample; a Leave called off
 * puts both back (round sixty-two, the first deploy). Done at `pagehide`, as the first pass had it, it lost a race one
 * time in five in Chromium: the next page commits, and its first script reads the tab's storage, before the old page's
 * `pagehide` runs, so it opened in the sample again with the sample kept. The tab's own copies of the settings go at
 * `pagehide` still, when the page is really going (a Leave called off keeps them), and the next page reads none of them.
 */
/** The address the first page after a Leave is opened at carries `left=sample`; the page takes it off its address once read. */
export const LEFT_PARAM = 'left';
function readyToLeave(): void {
  try { sessionStorage.removeItem(KEY); sessionStorage.setItem(LEFT, '1'); } catch { /* the leftover is then deleted on a later load */ }
  markOut(); // kept by a Leave called off too: it is read only outside the sample, where a later Leave would set it again
}
/** The first page after a Leave marks the tab as out of the sample by its address too, which reaches it whatever the storage race `leaveDemo` describes (round sixty-three, V2). */
export function markLeftByAddress(): void {
  markOut();
}
function stayInSample(): void {
  try { sessionStorage.setItem(KEY, '1'); sessionStorage.removeItem(LEFT); } catch { /* the tab then loads outside the sample next time */ }
}

/**
 * Leave the sample (round sixty-two; A9): the tab navigates first, and only when the page is really going (`pagehide`)
 * does it leave the sample; the next page, outside it, deletes the sample's database (`finishLeaving`). A page that asks
 * "Leave site?" (an unsaved form) and is answered Cancel stays a working sample tab: before, the database was closed and
 * the flag cleared first, and the tab was left with neither. Returns once the navigation is asked for, with the way to
 * call the Leave off.
 *
 * A Leave the page stays through is no Leave (round sixty-two, second pass; triage-outside 1, the verification grower
 * review, 4): the `pagehide` listener stayed armed after a Cancel, so the next reload or closing the tab left the sample,
 * deleted it with the visitor's records and sent the other sample tabs home. It is taken off, and `onStay` called, as
 * soon as the page is known to stay: the browser says the navigation was called off (the Navigation API's
 * `navigateerror`, which a "Leave site?" answered Cancel raises); or, in a browser without it, the page asked "Leave
 * site?" and is still showing 3 seconds later; or, in any browser, it is still showing 10 seconds later. A navigation
 * slower than that lands in the sample, which is still whole; Leave is pressed again.
 */
/** `to` with `left=sample` in its query, before any `#`: `/places#add` is `/places?left=sample#add` (round sixty-seven; triage-66 V1, the top bar's "+" on Places). */
export function leftAddress(to: string): string {
  const at = to.indexOf('#');
  const path = at < 0 ? to : to.slice(0, at);
  return `${path}${path.includes('?') ? '&' : '?'}${LEFT_PARAM}=sample${at < 0 ? '' : to.slice(at)}`;
}
export function leaveDemo(to = '/', onStay?: () => void): () => void {
  if (typeof addEventListener !== 'function') { leaving(); location.href = to; return () => {}; } // no page to hide (a test): leave now
  let armed = true;
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const nav = (globalThis as { navigation?: EventTarget }).navigation;
  const off = (t: string, f: (e: Event) => void, on: EventTarget | undefined = undefined) => { try { (on ?? globalThis).removeEventListener(t, f); } catch { /* nothing was listening */ } };
  const disarm = () => { armed = false; off('pagehide', hide); off('beforeunload', asked); off('navigateerror', stay, nav); for (const t of timers) clearTimeout(t); };
  function hide() {
    if (!armed) return;
    disarm();
    clearFlag();
    tellOthers();
    // Brought back from the back-forward cache after it left: it is no longer the sample's tab, so it loads afresh.
    addEventListener('pageshow', (e) => { if ((e as PageTransitionEvent).persisted) location.reload(); }, { once: true });
  }
  function stay() {
    if (!armed) return;
    disarm();
    stayInSample();
    onStay?.();
  }
  /** After the page's own listeners (added before this one): whether it will ask "Leave site?". */
  let prompted = false;
  function asked(e: Event) { const b = e as BeforeUnloadEvent; if (b.defaultPrevented || (typeof b.returnValue === 'string' && b.returnValue !== '')) prompted = true; }
  const showing = () => typeof document === 'undefined' || document.visibilityState === 'visible';
  addEventListener('pagehide', hide);
  addEventListener('beforeunload', asked);
  try { nav?.addEventListener('navigateerror', stay); } catch { /* no Navigation API: the timers below */ }
  readyToLeave();
  // The address says it too (`left=sample`), and the next page's first script reads it before anything else (app.html):
  // the tab's storage set just above can reach a new page late (the race below), the address cannot.
  location.href = leftAddress(to);
  // Chromium asks "Leave site?" inside the line above and says a Cancel as `navigateerror` before it returns; a browser without the Navigation API is given 3 seconds.
  // So is one with it that does not say a Cancel that way: in Safari's engine the button stayed "Leaving…" past the 1.5 s
  // the browser test allows, so it waited for the 10 s below (round sixty-four; the all-engines run). The address carries
  // `left=sample` whatever this decides, so a page that does go still leaves the sample.
  timers.push(setTimeout(() => { if (prompted && showing()) stay(); }, 3000));
  timers.push(setTimeout(() => { if (showing()) stay(); }, 10_000));
  return stay;
}

/** The sample's database deleted: 'deleted', 'blocked' while a tab still holds it open (the delete then waits for it), or 'failed'. */
function deleteSample(waitMs: number): Promise<'deleted' | 'blocked' | 'failed'> {
  return new Promise((done) => {
    try {
      const r = indexedDB.deleteDatabase(DEMO_DB);
      let t: ReturnType<typeof setTimeout> | undefined;
      r.onsuccess = () => { clearTimeout(t); done('deleted'); };
      r.onerror = () => { clearTimeout(t); done('failed'); };
      // Blocked is not done: the request waits for the other connection to close. Said if it is still waiting after a while.
      r.onblocked = () => { t = setTimeout(() => done('blocked'), waitMs); };
    } catch {
      done('failed');
    }
  });
}


/**
 * On the first page after Leave: the sample's database is deleted, and what happened is returned for the page to say.
 * Null when this page does not follow a Leave.
 *
 * Only for a tab that was leaving, and only under the open lock (round sixty-seven; triage-66 V6; S-A5). The mark
 * `sampleLeft` is set by Leave itself (`readyToLeave`), never by the address: `?left=sample` from a copied link, a
 * bookmark or the history takes a tab out of the example, and deletes nothing. And no tab may hold the example open: a
 * copied link opened beside an example tab deleted that tab's database, the visitor's records with it, with no question
 * asked. The tabs Leave told let go of the lock at once (`markExampleClosed`), or as they close; until then the delete
 * waits, and after `waitMs` the page says it is held up, as it said a delete the browser held up.
 */
export async function finishLeaving(waitMs = 10_000): Promise<'deleted' | 'blocked' | 'failed' | null> {
  if (PAGE_IN_DEMO) return null;
  try { if (sessionStorage.getItem(LEFT) !== '1') return null; sessionStorage.removeItem(LEFT); } catch { return null; }
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (!locks) return deleteSample(waitMs); // no locks: the browser's own hold on an open database is all there is
  return new Promise((done) => {
    const t = setTimeout(() => done('blocked'), waitMs);
    locks.request(OPEN_LOCK, async () => {
      const r = await deleteSample(waitMs);
      clearTimeout(t);
      done(r);
    }).catch(() => { clearTimeout(t); done('failed'); });
  });
}

/**
 * In a sample tab, for the page's life: hold the "a sample is open" lock, and when another tab leaves the sample, go to
 * the grower's own collection and say so there. Returns the way to stop listening. The lock is let go as soon as the
 * example closes under the page, not when the page goes (round sixty-seven; triage-66 V3): a tab whose "Leave site?" was
 * answered Cancel stays, closed, and must not hold the delete up.
 */
export function keepSampleOpen(): () => void {
  let release: () => void = () => {};
  try {
    void navigator.locks?.request(OPEN_LOCK, { mode: 'shared' }, () => new Promise<void>((r) => {
      release = r;
      if (closed) r(); else releaseOpen = r;
    }));
  } catch { /* no locks: a leftover is then never deleted from under an open tab, as below */ }
  let chan: BroadcastChannel | null = null;
  try {
    chan = new BroadcastChannel(LIFE);
    chan.onmessage = (e) => { if (e.data === 'closed') sampleClosedHere(); };
  } catch { /* no channel: the vault's own reload catches it */ }
  return () => { chan?.close(); release(); };
}

/** What a leftover example holds that its visitor made: the records they added or changed, and whether that was already offered back. */
type Leftover = { edits: number; last: number; offered: boolean };
/**
 * The leftover example's log read from outside it, straight from its database (the page's vault is the grower's), in
 * one read-only transaction, never creating it: a database that is not there is not made by the asking. Null when it
 * cannot be read.
 */
function readLeftover(): Promise<Leftover | null> {
  return new Promise((done) => {
    let r: IDBOpenDBRequest;
    try { r = indexedDB.open(DEMO_DB); } catch { done(null); return; }
    r.onupgradeneeded = () => { try { r.transaction?.abort(); } catch { /* the open fails either way */ } };
    r.onerror = () => done(null);
    r.onblocked = () => done(null);
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => db.close(); // never holds up a delete or a newer build
      const finish = (v: Leftover | null) => { db.close(); done(v); };
      const stores = ['order', 'changes', 'meta'].filter((s) => db.objectStoreNames.contains(s));
      if (stores.length < 3) { finish({ edits: 0, last: 0, offered: false }); return; } // no order of arrival kept: nothing to tell apart
      try {
        const tx = db.transaction(stores, 'readonly');
        const order = tx.objectStore('order'), changes = tx.objectStore('changes'), meta = tx.objectStore('meta');
        const got: { rows?: Array<{ t: string }>; keys?: IDBValidKey[]; all?: Array<Omit<Arrival, 'seq'>>; mark?: unknown; offered?: unknown } = {};
        order.getAll().onsuccess = (e) => (got.rows = (e.target as IDBRequest).result);
        order.getAllKeys().onsuccess = (e) => (got.keys = (e.target as IDBRequest).result);
        changes.getAll().onsuccess = (e) => (got.all = (e.target as IDBRequest).result);
        meta.get(SEED_MARK).onsuccess = (e) => (got.mark = (e.target as IDBRequest).result);
        meta.get(OFFERED).onsuccess = (e) => (got.offered = (e.target as IDBRequest).result);
        tx.oncomplete = () => {
          const byT = new Map((got.all ?? []).map((c) => [c.t, c]));
          const log: Arrival[] = [];
          (got.rows ?? []).forEach((row, i) => { const c = byT.get(row?.t); if (c) log.push({ ...c, seq: Number((got.keys ?? [])[i]) }); });
          const last = log.length ? log[log.length - 1].seq : 0;
          const mark = typeof got.mark === 'number' ? got.mark : (seedLast(log)?.seq ?? 0);
          finish({ edits: recordsTouched(log.filter((c) => c.seq > mark)), last, offered: typeof got.offered === 'number' && got.offered >= last });
        };
        tx.onerror = tx.onabort = () => finish(null);
      } catch {
        finish(null);
      }
    };
  });
}
/** Note in the leftover that its offer was made for what it holds now, so it is made once (triage-66 V2). */
function noteOffered(last: number): Promise<void> {
  return new Promise((done) => {
    let r: IDBOpenDBRequest;
    try { r = indexedDB.open(DEMO_DB); } catch { done(); return; }
    r.onupgradeneeded = () => { try { r.transaction?.abort(); } catch { /* not made */ } };
    r.onerror = r.onblocked = () => done();
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => db.close();
      try {
        const tx = db.transaction('meta', 'readwrite');
        tx.objectStore('meta').put(last, OFFERED);
        tx.oncomplete = tx.onerror = tx.onabort = () => { db.close(); done(); };
      } catch { db.close(); done(); }
    };
  });
}

/**
 * Outside the sample: a sample database no tab has open is a leftover (a tab closed without Leave, an installed app
 * closed in the sample). Only when the browser can say that no sample tab is open (Web Locks); otherwise it is left,
 * never deleted from under a visitor.
 *
 * A leftover holding records the visitor added or changed is kept, and offered back once through `offer` with their
 * number (round sixty-seven; triage-66 V2; R45-2): closing the tab, going to another site, or Safari putting the tab away
 * deleted a first plant typed into the example with no question, where Leave asks. One with nothing of the visitor's in
 * it is deleted, so the next "See the example collection" starts fresh.
 */
export async function dropLeftoverSample(offer?: (edits: number) => void): Promise<boolean> {
  if (PAGE_IN_DEMO || typeof navigator === 'undefined' || !navigator.locks) return false;
  try {
    const known = typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).some((d) => d.name === DEMO_DB) : true;
    if (!known) return false;
    return await navigator.locks.request(OPEN_LOCK, { ifAvailable: true }, async (lock) => {
      if (!lock) return false; // a sample tab is open
      const held = await readLeftover();
      if (!held) return false; // not read: kept, and tried again on a later load
      if (held.edits > 0) {
        if (!held.offered) { await noteOffered(held.last); offer?.(held.edits); }
        return false;
      }
      return (await deleteSample(10_000)) === 'deleted'; // blocked or failed is not done: tried again on a later load
    });
  } catch {
    return false;
  }
}
/** The leftover's "Delete it": deleted under the open lock, so never from under a tab that has it open again. */
export async function deleteLeftoverSample(): Promise<'deleted' | 'blocked' | 'failed'> {
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (!locks) return deleteSample(10_000);
  return locks.request(OPEN_LOCK, { ifAvailable: true }, async (lock) => (lock ? deleteSample(10_000) : 'blocked'));
}
