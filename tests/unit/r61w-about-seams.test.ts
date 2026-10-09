/**
 * The seams between what /about/how and /about/formats say and what the code does, kept as guards (round sixty-one;
 * adopted from docs/review-60/tests/triage--about-seams.test.ts, the triage review of round sixty). On the base of round
 * sixty-one, four of these failed: three storage keys missing from /about/how's "every key", formats' "on every open",
 * formats' "never parks its own changes", and the glossary's "Sync batch". They pass once the pages are true, and stay
 * so: a key, a host or a rule added to the code without a line on the page fails here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RECOUNT_MS } from '$lib/server/sync';
import { RANK_MARKERS } from '$core/search';

const text = (f: string) => readFileSync(f, 'utf8').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const how = text('src/routes/about/how/+page.svelte');
const formats = text('src/routes/about/formats/+page.svelte');

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|svelte|js|html)$/.test(f)) out.push(p);
  }
  return out;
}

describe('about pages against the code', () => {
  it("every device-storage key the code uses is on /about/how's list", () => {
    const keys = new Set<string>();
    for (const f of walk('src')) {
      const s = readFileSync(f, 'utf8');
      // localStorage / sessionStorage keys: 'cultifolio.<name>' literals
      for (const m of s.matchAll(/['"`](cultifolio\.[A-Za-z][\w.]*)['"`]/g)) keys.add(m[1]);
    }
    // cookies are described in words on the page ("your units", "its hemisphere"), not by name
    keys.delete('cultifolio.units');
    keys.delete('cultifolio.hemi');
    expect(keys.size).toBeGreaterThan(10); // the walk found the code
    const missing = [...keys].filter((k) => !how.includes(k)).sort();
    expect(missing).toEqual([]);
  });

  it('formats says how often a listing puts the vault total right, as sync.ts does it', () => {
    expect(formats).not.toMatch(/puts its total right on every open/);
    // No `if`: a change of the figure must fail here until the page says the new one (round sixty-two; outside review A5).
    expect(RECOUNT_MS).toBe(3_600_000);
    expect(formats).toMatch(/on an open at most once an hour/); // the merged wording (round sixty-one; agent S's text)
  });

  it("formats parks by arrival on every device, the writer's own changes included, and by no device's own clock", () => {
    expect(formats).not.toMatch(/never parks its own changes/);
    expect(formats).toMatch(/parked, on every device including the one that made it, and listed with Apply/);
    expect(formats).toMatch(/No device keeps a verdict of its own clock alone/); // the merged wording (round sixty-one; agent L's text)
  });

  it('the glossary and the sync page use one word for a sync unit', () => {
    const syncWords = readFileSync('src/lib/ui/sync-words.ts', 'utf8');
    expect(syncWords).toMatch(/sync bundle/); // the word the sync page uses; no `if` (round sixty-two)
    expect(how).not.toMatch(/Sync batch:/);
    expect(how).toMatch(/Sync bundle:/);
  });

  it('formats states the clock slack and the snapshot key the code uses', () => {
    const hlc = readFileSync('src/lib/core/hlc.ts', 'utf8');
    expect(hlc).toMatch(/age > -5 \* 60_000/); // the slack the page states; no `if` (round sixty-two)
    expect(formats).toMatch(/more than five minutes after the device's own clock/);
    const col = readFileSync('src/lib/db/collection.svelte.ts', 'utf8');
    expect(col).toMatch(/f\.checked/);
    expect(formats).toMatch(/with the clock confirmed where it is now not/);
  });

  it("formats' rank markers are the search's", () => {
    for (const m of RANK_MARKERS) if (m !== 'x') expect(formats, m).toMatch(new RegExp(`\\b${m}\\b`));
  });

  it('CSP image hosts equal the photograph hosts /about/how names, and the browser connects to no other host', () => {
    const cfg = readFileSync('svelte.config.js', 'utf8');
    const line = /'img-src':\s*\[([^\]]*)\]/.exec(cfg)![1];
    const hosts = [...line.matchAll(/https:\/\/([^'"]+)/g)].map((m) => m[1]).sort();
    for (const h of hosts) expect(how).toContain(h);
    expect(hosts.length).toBe(4);
    expect(/'connect-src':\s*\[([^\]]*)\]/.exec(cfg)![1].trim()).toBe("'self'");
  });

  it('every outside host the Worker asks at run time is named on /about/how', () => {
    // The Worker's own code; the build-time sources under src/lib/dossier and src/lib/climate run on the PC, not the site.
    const files = [...walk('src/lib/server'), ...walk('src/lib/weather'), ...walk('src/routes')];
    const hosts = new Set<string>();
    for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/[`'"]https:\/\/(api\.[a-z.]+)\//g)) hosts.add(m[1]);
    expect(hosts.size).toBeGreaterThan(1); // the walk found the code
    const missing = [...hosts].filter((h) => !how.includes(h)).sort();
    expect(missing).toEqual([]);
  });

  it('formats says how imported names are checked, and it is what the import does', () => {
    const check = readFileSync('src/lib/import/check.ts', 'utf8');
    expect(check).toMatch(/hash group/);
    expect(check).not.toMatch(/\/api\/names/);
    expect(formats).not.toMatch(/checked as the Add form checks them/);
    expect(formats).toMatch(/never by GBIF's name service/);
  });
});
