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

export function inDemo(): boolean {
  try { return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(KEY) === '1'; } catch { return false; }
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
  const opened = inDemo();
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
/** The flag and the tab's own copies of the settings, gone. */
function clearFlag(): void {
  try {
    sessionStorage.removeItem(KEY);
    for (let i = sessionStorage.length - 1; i >= 0; i--) { const k = sessionStorage.key(i); if (k?.startsWith(`${KEY}.`)) sessionStorage.removeItem(k); }
  } catch { /* the flag goes with the tab anyway */ }
}
/** Set as a sample tab goes on Leave, so the next page deletes the sample and says how that went. */
const LEFT = 'cultifolio.sampleLeft';
/** The meta key under which the sample keeps the last stamp it was set out with: what came after is the visitor's. */
export const SEED_TOP = 'demoSeedTop';

/**
 * The sample was closed in another tab: this tab goes to the grower's own collection, and its next page says why. One
 * function for both ways a tab hears it, the channel (`keepSampleOpen`) and the vault's `versionchange` (round sixty-two;
 * the triage's 4): the two copies disagreed, and the vault's left the tab's settings behind and said nothing.
 */
export function sampleClosedHere(): void {
  clearFlag();
  markOut();
  try { sessionStorage.setItem(CLOSED_NOTE, '1'); } catch { /* said nowhere, then */ }
  location.href = '/';
}

/**
 * How many records the visitor added or changed in the sample since it was set out: Leave asks before deleting them
 * (round sixty-two; A9). Read from the sample's own log: every record a change after the seed's last stamp touched. A
 * sample set out before round sixty-two has no such stamp, and counts the records not of the seed.
 */
export async function sampleEdits(): Promise<number> {
  if (!inDemo()) return 0;
  try {
    const { allChanges, getMeta } = await import('./vault');
    const top = await getMeta<string>(SEED_TOP);
    const touched = new Set<string>();
    for (const c of await allChanges()) {
      if (top ? c.t > top : c.kind !== 'taxon' && c.kind !== 'setting' && !c.id.endsWith('sampleseeds0')) touched.add(`${c.kind}:${c.id}`);
    }
    return touched.size;
  } catch {
    return 0;
  }
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
  location.href = `${to}${to.includes('?') ? '&' : '?'}left=sample`;
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
 * Null when this page does not follow a Leave. No lock is asked for: the grower asked for this deletion, the sample's
 * other tabs were told to go, and a tab that has not gone yet only holds the delete until it does.
 */
export async function finishLeaving(waitMs = 10_000): Promise<'deleted' | 'blocked' | 'failed' | null> {
  if (inDemo()) return null;
  try { if (sessionStorage.getItem(LEFT) !== '1') return null; sessionStorage.removeItem(LEFT); } catch { return null; }
  return deleteSample(waitMs);
}

/**
 * In a sample tab, for the page's life: hold the "a sample is open" lock, and when another tab leaves the sample, go to
 * the grower's own collection and say so there. Returns the way to stop listening.
 */
export function keepSampleOpen(): () => void {
  let release: () => void = () => {};
  try {
    void navigator.locks?.request(OPEN_LOCK, { mode: 'shared' }, () => new Promise<void>((r) => (release = r)));
  } catch { /* no locks: a leftover is then never deleted from under an open tab, as below */ }
  let chan: BroadcastChannel | null = null;
  try {
    chan = new BroadcastChannel(LIFE);
    chan.onmessage = (e) => { if (e.data === 'closed') sampleClosedHere(); };
  } catch { /* no channel: the vault's own reload catches it */ }
  return () => { chan?.close(); release(); };
}

/**
 * Outside the sample: a sample database no tab has open is a leftover (a tab closed without Leave, an installed app
 * closed in the sample) and is deleted, so the next "Try it" starts fresh. Only when the browser can say that no sample
 * tab is open (Web Locks); otherwise it is left, never deleted from under a visitor.
 */
export async function dropLeftoverSample(): Promise<boolean> {
  if (inDemo() || typeof navigator === 'undefined' || !navigator.locks) return false;
  try {
    const known = typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).some((d) => d.name === DEMO_DB) : true;
    if (!known) return false;
    return await navigator.locks.request(OPEN_LOCK, { ifAvailable: true }, async (lock) => {
      if (!lock) return false; // a sample tab is open
      return (await deleteSample(10_000)) === 'deleted'; // blocked or failed is not done: tried again on a later load
    });
  } catch {
    return false;
  }
}
