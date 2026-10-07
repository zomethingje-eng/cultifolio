/**
 * The sample collection (round sixty; the product review's 3). It is a database of its own, chosen when the page
 * loads (`vault.ts`), so entering or leaving it reloads the page: nothing of the sample reaches the grower's own vault,
 * their log, a backup or sync. Its settings are the tab's own (`$lib/ui/stored`).
 *
 * Round sixty-one (the records review, 13): leaving tells the sample's other tabs, which go to the grower's own
 * collection and say why, rather than reload into a fresh sample under a false "updated in another tab"; leaving closes
 * this tab's own connection first, so its own deletion does not reload it either; and a sample left behind (a tab
 * closed without Leave) is deleted on the next load outside the sample, unless a sample tab is still open.
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
/** Switch this tab to the sample collection and load it; the caller seeds it after the reload when it is empty. */
export function enterDemo(to = '/plants'): void {
  try { sessionStorage.setItem(KEY, '1'); } catch { return; }
  location.href = to;
}
/** The flag and the tab's own copies of the settings, gone. */
function clearFlag(): void {
  try {
    sessionStorage.removeItem(KEY);
    for (let i = sessionStorage.length - 1; i >= 0; i--) { const k = sessionStorage.key(i); if (k?.startsWith(`${KEY}.`)) sessionStorage.removeItem(k); }
  } catch { /* the flag goes with the tab anyway */ }
}
/** Leave the sample: its other tabs are told, its database is deleted whole, and the tab goes back to the grower's own collection. */
export async function leaveDemo(to = '/'): Promise<void> {
  // This tab's own connection is closed first (the vault module is the sample's, loaded with the page): open, it heard its
  // own deletion as "updated in another tab" and reloaded, which sometimes won the race against the move below (the
  // records review, 13).
  try { const { openVault } = await import('./vault'); (await openVault()).close(); } catch { /* not open */ }
  clearFlag();
  try { const c = new BroadcastChannel(LIFE); c.postMessage('closed'); c.close(); } catch { /* no other tab to tell */ }
  await new Promise<void>((done) => { try { const r = indexedDB.deleteDatabase(DEMO_DB); r.onsuccess = r.onerror = r.onblocked = () => done(); } catch { done(); } });
  location.href = to;
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
    chan.onmessage = (e) => {
      if (e.data !== 'closed') return;
      clearFlag();
      try { sessionStorage.setItem(CLOSED_NOTE, '1'); } catch { /* said nowhere, then */ }
      location.href = '/';
    };
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
      await new Promise<void>((done) => { const r = indexedDB.deleteDatabase(DEMO_DB); r.onsuccess = r.onerror = r.onblocked = () => done(); });
      return true;
    });
  } catch {
    return false;
  }
}
