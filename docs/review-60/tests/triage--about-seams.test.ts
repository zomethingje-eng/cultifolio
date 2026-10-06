/**
 * Triage review of round sixty: seams between what /about/how and /about/formats say and what the code does.
 *
 * STATUS on 21257b7: FAILS (a reproduction). Four of the five tests fail:
 *   - "every device-storage key the code uses is on /about/how's list": cultifolio.persistAfterFirst,
 *     cultifolio.iosFirstHidden and cultifolio.backupNudgeHidden (round sixty's grower features) are missing, though the
 *     page says "What the device keeps outside the collection, every key".
 *   - "formats does not say a vault is listed on every open": the page says "A listing of the vault puts its total right
 *     on every open", while sync.ts recounts on open only when the last listing is over RECOUNT_MS (an hour) old.
 *   - "formats does not say this device never parks its own changes": collection.stampPast parks this device's own
 *     stamp more than two days ahead when the clock is confirmed (staleOwn -> markParked), so "never parks its own
 *     changes ... never parked" is false.
 *   - "the glossary and the sync page use one word for a sync unit": /about/how defines "Sync batch", the sync page
 *     and sync-words.ts say "sync bundle".
 * The fifth (CSP image hosts equal the hosts /about/how names) PASSES and is a guard worth keeping.
 *
 * Run: copy to tests/unit/ and `npx vitest run tests/unit/triage--about-seams.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RECOUNT_MS } from '$lib/server/sync';

const text = (f: string) => readFileSync(f, 'utf8').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const how = text('src/routes/about/how/+page.svelte');
const formats = text('src/routes/about/formats/+page.svelte');

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|svelte|js)$/.test(f)) out.push(p);
  }
  return out;
}

describe('about pages against the code (triage review of round sixty)', () => {
  it('every device-storage key the code uses is on /about/how\'s list', () => {
    const keys = new Set<string>();
    for (const f of walk('src')) {
      const s = readFileSync(f, 'utf8');
      // localStorage / sessionStorage keys: 'cultifolio.<name>' literals
      for (const m of s.matchAll(/['"`](cultifolio\.[A-Za-z][\w.]*)['"`]/g)) keys.add(m[1]);
    }
    // cookies are described in words on the page ("your units", "its hemisphere"), not by name
    keys.delete('cultifolio.units');
    keys.delete('cultifolio.hemi');
    const missing = [...keys].filter((k) => !how.includes(k)).sort();
    expect(missing).toEqual([]);
  });

  it('formats does not say a vault is listed on every open', () => {
    expect(RECOUNT_MS).toBeGreaterThan(0);
    expect(formats).not.toMatch(/puts its total right on every open/);
  });

  it('formats does not say this device never parks its own changes, when an edit parks its own stale stamp', () => {
    const code = readFileSync('src/lib/db/collection.svelte.ts', 'utf8');
    const parksOwnOnEdit = /this\.staleOwn\.add\(prev\)/.test(code) && /markParked\(await changesByKeys\(rebase\)\)/.test(code);
    expect(parksOwnOnEdit).toBe(true);
    expect(formats).not.toMatch(/never parks its own changes by its own clock, checked or not/);
  });

  it('the glossary and the sync page use one word for a sync unit', () => {
    const syncWords = readFileSync('src/lib/ui/sync-words.ts', 'utf8');
    const pagesSayBundle = /sync bundle/.test(syncWords);
    const glossarySaysBatch = /Sync batch:/.test(how);
    expect(pagesSayBundle && glossarySaysBatch).toBe(false);
  });

  it('CSP image hosts equal the photograph hosts /about/how names (guard)', () => {
    const cfg = readFileSync('svelte.config.js', 'utf8');
    const line = /'img-src':\s*\[([^\]]*)\]/.exec(cfg)![1];
    const hosts = [...line.matchAll(/https:\/\/([^'"]+)/g)].map((m) => m[1]).sort();
    for (const h of hosts) expect(how).toContain(h);
    expect(hosts.length).toBe(4);
  });
});
