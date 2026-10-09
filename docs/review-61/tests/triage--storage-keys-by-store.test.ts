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
function keysByStore() {
  const local = new Set<string>(), session = new Set<string>(), direct = new Map<string, string[]>(), viaHelper = new Set<string>();
  for (const f of walk('src')) {
    if (f.endsWith('stored.ts') || f.includes('/about/')) continue;
    const s = readFileSync(f, 'utf8');
    const consts = new Map<string, string>();
    for (const m of s.matchAll(/(?:const|let)\s+([A-Z_][A-Z0-9_]*)\s*=\s*['"`]([\w.-]+)['"`]/g)) consts.set(m[1], m[2]);
    for (const m of s.matchAll(/export const ([A-Z_]+) = ['"`]([\w.-]+)['"`]/g)) consts.set(m[1], m[2]);
    const key = (arg: string) => { const a = arg.trim(); const lit = /^['"`]([\w.-]+)['"`]$/.exec(a); return lit ? lit[1] : consts.get(a) ?? null; };
    for (const m of s.matchAll(/(localStorage|sessionStorage)\.(getItem|setItem|removeItem)\(\s*([^,)]+)/g)) {
      const k = key(m[3]);
      if (!k || k === 'k') continue;
      (m[1] === 'localStorage' ? local : session).add(k);
      if (m[1] === 'localStorage' && m[2] !== 'getItem') direct.set(k, [...(direct.get(k) ?? []), f]);
    }
    for (const m of s.matchAll(/(?:readSetting|writeSetting)\(\s*([^,)]+)/g)) { const k = key(m[1]); if (k) { local.add(k); viaHelper.add(k); } }
  }
  return { local, session, direct, viaHelper };
}

describe("/about/how's key list against the store each key is kept in", () => {
  const { local, session, direct, viaHelper } = keysByStore();
  it('the walk found the code', () => {
    expect(local.size).toBeGreaterThan(10);
    expect(session.size).toBeGreaterThan(5);
  });
  it('every localStorage key is listed under local storage', () => {
    // The units are a cookie outside the sample; stored.ts is asked for them only in a sample tab (units.svelte.ts).
    const cookies = new Set(['cultifolio.units', 'cultifolio.hemi']);
    expect([...local].filter((k) => !cookies.has(k) && !localPart.includes(k)).sort()).toEqual([]);
  });
  it('every sessionStorage key is listed under session storage', () => {
    expect([...session].filter((k) => !sessionPart.includes(k)).sort()).toEqual([]);
  });
  it('a setting kept through stored.ts has no second, direct writer', () => {
    const both = [...viaHelper].filter((k) => direct.has(k)).map((k) => `${k}: ${direct.get(k)!.join(', ')}`);
    expect(both).toEqual([]);
  });
});
