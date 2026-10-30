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
import { PARK_MS, isParked } from '$core/log';
import { WAIT_PAST_MS } from '$core/hlc';
import { said, claim, spanWords, part } from '../about-pages';

const text = (f: string) => readFileSync(f, 'utf8').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const how = text('src/routes/about/how/+page.svelte');
const formats = text('src/routes/about/formats/+page.svelte');

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|svelte|js|html)$/.test(f)) out.push(p.replace(/\\/g, '/')); // forward slashes on Windows too: the filters below read '/' (round sixty-two, the first deploy)
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

  // Round seventy (triage-69 P2): the tests below read each sentence for its claim and drive the rule with it
  // (tests/about-pages.ts), in place of the sentence pinned whole.
  it('formats says how often a listing puts the vault total right, as sync.ts does it', () => {
    const s = said('formats', 'A listing of the vault puts its total right');
    expect(spanWords(claim(s, /on an open at most once (an hour|a day|\w+ minutes)/)), s.where).toBe(RECOUNT_MS);
  });

  it("formats parks by arrival on every device, the writer's own changes included, and by no device's own clock", () => {
    const s = said('formats', 'A change stamped more than two days past the arrival of the log batch');
    const span = spanWords(claim(s, /stamped more than (\w+ days) past the arrival/));
    expect(span, s.where).toBe(PARK_MS);
    expect(s.text).toMatch(/is parked, on every device including the one that made it/);
    // The writer's own change, judged by its batch's arrival: parked past the span, not at it.
    const arrival = Date.UTC(2026, 9, 1);
    const own = (wall: number) => `${wall}-0000-devicex00000x0z9`;
    const hold = { now: arrival, except: 'devicex00000', clockChecked: true, arrival };
    expect(isParked(own(arrival + span + 1), hold)).toBe(true);
    expect(isParked(own(arrival + span), hold)).toBe(false);
    // "No device keeps a verdict of its own clock alone": with no arrival, its own change is never parked by its clock.
    expect(said('formats', 'No device keeps a verdict of its own clock alone').text).toMatch(/^No device keeps a verdict of its own clock alone/);
    expect(isParked(own(arrival + 10 * span), { now: arrival, except: 'devicex00000', clockChecked: true })).toBe(false);
  });

  it('the glossary and the sync page use one word for a sync unit', () => {
    const g = said('how', 'A sealed bundle of changes one device sends');
    const word = (/<dt>(Sync bundle)<\/dt><dd>A sealed bundle of changes one device sends/.exec(readFileSync('src/routes/about/how/+page.svelte', 'utf8'))?.[1] ?? 'no term').toLowerCase();
    expect(readFileSync('src/lib/ui/sync-words.ts', 'utf8'), g.where).toMatch(new RegExp(word));
    expect(claim(g, /as the sync page names it; the formats page calls it a (log batch)/)).toBe('log batch');
    expect(said('formats', 'A log batch here is what the sync page calls a sync bundle').text).toMatch(/one device's sealed bundle of changes/);
  });

  it('formats states the clock slack and the snapshot key the code uses', () => {
    const s = said('formats', 'A reading is trusted only while it is under a week old');
    const slack = spanWords(claim(s, /not dated more than (\w+ minutes) after the device's own clock/));
    expect(readFileSync('src/lib/core/hlc.ts', 'utf8'), s.where).toMatch(new RegExp(`age > -${slack / 60_000} \\* 60_000`));
    const k = said('formats', 'Nor when it was built by another device');
    expect(part(k, 'by another device')).toMatch(/under another stored clock correction, or with that correction confirmed by a reading where it is now not, or the reverse/);
    const k2 = said('formats', 'A page load holds a correction of more than a day out of force');
    expect(spanWords(claim(k2, /A page load holds a correction of more than (a day|\w+ days) out of force until a reading/)), k2.where).toBe(WAIT_PAST_MS);
    const col = readFileSync('src/lib/db/collection.svelte.ts', 'utf8');
    expect(col).toMatch(/f\.checked/);
    expect(col).toMatch(/const clock = clockStored\(\);/);
  });

  it("formats' rank markers are the search's, both ways", () => {
    const s = said('formats', 'A query is read as a botanical name where');
    const ranks = claim(s, /where ((?:[a-z]+\.?, )+[a-z]+\.? and [a-z]+) are skipped/).split(/, | and /).map((w) => w.replace(/\.$/, ''));
    const q = said('formats', '"cf.", "cfr.", "aff." and "nr." are skipped');
    const quals = claim(q, /^("[a-z]+\.", "[a-z]+\.", "[a-z]+\." and "[a-z]+\.") are skipped/).match(/[a-z]+(?=\.")/g)!;
    expect(s.text).toMatch(/what follows cv\. is a cultivar and is not searched/);
    expect([...ranks, 'cv', ...quals, 'x'].sort(), s.where).toEqual([...RANK_MARKERS].sort());
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
    const s = said('formats', 'Names are checked against the reference: by hash group first');
    expect(s.text, s.where).toMatch(/by hash group first, then by the catalogue's search for those the groups do not settle; never by GBIF's name service/);
    const check = readFileSync('src/lib/import/check.ts', 'utf8');
    expect(check).toMatch(/hash group/);
    expect(check).toMatch(/look\.search\(/);
    expect(check).not.toMatch(/\/api\/names/);
  });
});
