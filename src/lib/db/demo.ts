/**
 * The sample collection (round sixty; the product review's 3). It is a database of its own, chosen when the page
 * loads (`vault.ts`), so entering or leaving it reloads the page: nothing of the sample reaches the grower's own vault,
 * their log, a backup or sync.
 */
const KEY = 'cultifolio.demo';
export function inDemo(): boolean {
  try { return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(KEY) === '1'; } catch { return false; }
}
/** Switch this tab to the sample collection and load it; the caller seeds it after the reload when it is empty. */
export function enterDemo(to = '/plants'): void {
  try { sessionStorage.setItem(KEY, '1'); } catch { return; }
  location.href = to;
}
/** Leave the sample: its database is deleted whole and the tab goes back to the grower's own collection. */
export async function leaveDemo(to = '/'): Promise<void> {
  try { sessionStorage.removeItem(KEY); } catch { /* the flag goes with the tab anyway */ }
  await new Promise<void>((done) => { try { const r = indexedDB.deleteDatabase('cultifolio-demo'); r.onsuccess = r.onerror = r.onblocked = () => done(); } catch { done(); } });
  location.href = to;
}
