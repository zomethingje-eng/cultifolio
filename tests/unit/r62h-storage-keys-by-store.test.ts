/**
 * Triage reviewer, round sixty-one self-review. PASSES on f4ab4f8: a guard worth adopting beside
 * tests/unit/r61w-about-seams.test.ts, which checks only that every 'cultifolio.*' literal appears somewhere on
 * /about/how. This one checks what that test does not:
 *   1. the store: a key the code keeps in localStorage is listed under "in the browser's local storage", a key it keeps in
 *      sessionStorage under "in this tab's session storage" (a key moved from one to the other passes the old test);
 *   2. keys without the 'cultifolio.' prefix (`storage-notice-hidden`), and keys named through a constant;
 *   3. a setting routed through src/lib/ui/stored.ts (readSetting/writeSetting) is not also written directly with
 *      localStorage.setItem/removeItem elsewhere, so the sample's scope cannot be bypassed by a second writer.
 * Run: npx vitest run tests/unit/triage--storage-keys-by-store.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|svelte|js|html)$/.test(f)) out.push(p);
  }
  return out;
}
const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const list = how.slice(how.indexOf('every key:'), how.indexOf('in IndexedDB'));
const localPart = list.slice(0, list.indexOf("in this tab's session storage"));
const sessionPart = list.slice(list.indexOf("in this tab's session storage"));

/** Keys each store is used with, constants resolved within the file. */
/** Every exported string constant in src/, so a key imported from another file resolves too (round sixty-two second pass). */
const exported = new Map<string, string>();
for (const f of walk('src')) for (const m of readFileSync(f, 'utf8').matchAll(/export const ([A-Z_][A-Z0-9_]*) = ['"`]([\w.-]+)['"`]/g)) exported.set(m[1], m[2]);
function keysByStore() {
  const local = new Set<string>(), session = new Set<string>(), direct = new Map<string, string[]>(), viaHelper = new Set<string>(), unresolved: string[] = [];
  for (const f of walk('src')) {
    if (f.endsWith('stored.ts') || f.includes('/about/')) continue;
    const s = readFileSync(f, 'utf8');
    const consts = new Map<string, string>(exported);
    // Each name = 'literal' in the file, also the second and third of one `const A = '…', B = '…'` (round sixty-two second pass).
    for (const m of s.matchAll(/(?:\b(?:const|let)\s+|,\s*)([A-Z_][A-Z0-9_]*)\s*=\s*['"`]([\w.-]+)['"`]/g)) consts.set(m[1], m[2]);
    for (const m of s.matchAll(/export const ([A-Z_]+) = ['"`]([\w.-]+)['"`]/g)) consts.set(m[1], m[2]);
    const key = (arg: string) => { const a = arg.trim(); const lit = /^['"`]([\w.-]+)['"`]$/.exec(a); return lit ? lit[1] : consts.get(a) ?? null; };
    for (const m of s.matchAll(/(localStorage|sessionStorage)\.(getItem|setItem|removeItem)\(\s*([^,)]+)/g)) {
      const k = key(m[3]);
      if (m[3].trim() === 'k') continue; // the one helper whose parameter is named k: its callers pass the keys, read here
      if (!k) { unresolved.push(`${f}: ${m[3].trim()}`); continue; } // reported, never skipped silently (round sixty-two second pass; the words review's 26)
      (m[1] === 'localStorage' ? local : session).add(k);
      if (m[1] === 'localStorage' && m[2] !== 'getItem') direct.set(k, [...(direct.get(k) ?? []), f]);
    }
    // The scope says the store: 'tab' is sessionStorage, any other localStorage outside the sample (round sixty-two).
    for (const m of s.matchAll(/(?:readSetting|writeSetting)\(\s*([^,)]+),\s*['"`](\w+)['"`]/g)) { const k = key(m[1]); if (k) { (m[2] === 'tab' ? session : local).add(k); viaHelper.add(k); } else unresolved.push(`${f}: ${m[1].trim()}`); }
  }
  return { local, session, direct, viaHelper, unresolved };
}

describe("/about/how's key list against the store each key is kept in", () => {
  const { local, session, direct, viaHelper, unresolved } = keysByStore();
  /** A key is listed when the page names it whole, in its own <code>, not as part of a longer key ("cultifolio.labels" in "cultifolio.labelsPicked"). */
  const names = (part: string, k: string) => new RegExp(`(^|[^\\w.-])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-]|\\.\\w)`).test(part);
  it('the walk found the code', () => {
    expect(local.size).toBeGreaterThan(10);
    expect(session.size).toBeGreaterThan(5);
  });
  it('every localStorage key is listed under local storage', () => {
    // The units are a cookie outside the sample; stored.ts is asked for them only in a sample tab (units.svelte.ts).
    const cookies = new Set(['cultifolio.units', 'cultifolio.hemi']);
    expect([...local].filter((k) => !cookies.has(k) && !names(localPart, k)).sort()).toEqual([]);
  });
  it('every sessionStorage key is listed under session storage', () => {
    expect([...session].filter((k) => !names(sessionPart, k)).sort()).toEqual([]);
  });
  it('every key the code names is one the walk could read', () => {
    expect(unresolved).toEqual([]);
  });
  it('a setting kept through stored.ts has no second, direct writer', () => {
    const both = [...viaHelper].filter((k) => direct.has(k)).map((k) => `${k}: ${direct.get(k)!.join(', ')}`);
    expect(both).toEqual([]);
  });
});
