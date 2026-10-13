/**
 * Round seventy, W (triage-69 W5; S-E4, S-E6): the harness's addresses.
 *
 * Section 11 of REVIEW-ROUND-69 gave every `docAddress()` a random /48 of 3fff::/20, since every address had been one of
 * 198.51.100.0/24 and a network places ten new vaults a day: the five projects of a full run shared one server, and the
 * eleventh vault was refused. Nothing guarded it: set back to the /24, every unit test stayed green (S-E6). The first
 * case below draws the helper's addresses and reads them as the server counts them. A guard: it passes on the base, and
 * fails with the helper set back to `198.51.100.${randomInt(256)}`.
 *
 * And the two server specs made their vault from a documentation address but sent its first upload, where the place is
 * taken, with none, so from 127.0.0.1's /24 (S-E4): the round sixty-two guard (r62bh-vault-addresses) checks only the
 * creation. The second case reads every test that stores a batch or a photograph through `request` and requires an
 * address on each of its sync requests. FAILED on the base: both server specs.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { docAddress } from '../e2e/helpers/address';
import { addressKey, networkKey, upstreamNetwork } from '$lib/server/sync';

describe("section 11's fix: every vault-making call of the harness is a network of its own (S-E6)", () => {
  it('2,000 draws of docAddress() are IPv6 documentation addresses, each its own /64, on /48s that hardly ever meet', () => {
    const draws = Array.from({ length: 2000 }, () => docAddress());
    const nets = new Map<string, number>();
    for (const ip of draws) {
      // The network the server counts a vault's place to (`upstreamNetwork`, an IPv4 /24 or an IPv6 /48), and the /48 of
      // vault creation (`networkKey`): one and the same for these, and never an IPv4 /24 such as 127.0.0.1's.
      const net = upstreamNetwork(addressKey(ip));
      expect(net, ip).toMatch(/^3fff:[0-9a-f]{1,3}:[0-9a-f]{1,4}::\/48$/); // 3fff::/20 (RFC 9637)
      expect(networkKey(ip)).toBe(net);
      nets.set(net!, (nets.get(net!) ?? 0) + 1);
    }
    expect(new Set(draws.map(addressKey)).size).toBeGreaterThan(1990);
    // 2^28 /48s: two of 2,000 draws share one by a chance of under one in a hundred, three practically never. The ten a
    // day a network may place is far off either way.
    expect(Math.max(...nets.values())).toBeLessThanOrEqual(2);
    expect(nets.size).toBeGreaterThan(1990);
  });
});

const dir = resolve(__dirname, '../e2e');
const specs = readdirSync(dir).filter((f) => f.endsWith('.spec.ts'));
/** Each top-level `test(` block of a spec, as r62bh-vault-addresses reads them, nested tests inside describes too. */
function blocks(src: string): { title: string; body: string }[] {
  const starts = [...src.matchAll(/^\s*test(?:\.\w+)?\((['"`])(.*?)\1/gm)].map((m) => ({ at: m.index!, title: m[2] }));
  return starts.map((s, i) => ({ title: s.title, body: src.slice(s.at, starts[i + 1]?.at ?? src.length) }));
}
/** The text of a call from its opening parenthesis to the one that closes it. */
function callAt(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
}
/** The object literal that starts at `open` (a `{`), whole. */
function objectAt(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
}
const ADDRESS = /['"]cf-connecting-ip['"]\s*:/;
/** The names in a block bound to a headers object that carries an address, directly or by spreading one that does. */
function addressed(body: string): Set<string> {
  const out = new Set<string>();
  const defs = [...body.matchAll(/const (\w+) = \{/g)].map((m) => ({ name: m[1], obj: objectAt(body, m.index! + m[0].length - 1) }));
  for (let changed = true; changed; ) {
    changed = false;
    for (const d of defs) if (!out.has(d.name) && (ADDRESS.test(d.obj) || [...d.obj.matchAll(/\.\.\.(\w+)/g)].some((m) => out.has(m[1])))) { out.add(d.name); changed = true; }
  }
  return out;
}
/** Whether a `request.<verb>(…)` call sends an address: its `headers` names an addressed object or is a literal with one. */
function sendsAddress(call: string, named: Set<string>): boolean {
  const h = /headers(\s*:\s*|\s*[,}])/.exec(call);
  if (!h) return false;
  if (!h[1].includes(':')) return named.has('headers'); // shorthand `{ headers }`
  const at = h.index + h[0].length;
  if (call[at] === '{') { const obj = objectAt(call, at); return ADDRESS.test(obj) || [...obj.matchAll(/\.\.\.(\w+)/g)].some((m) => named.has(m[1])); }
  const id = /^\w+/.exec(call.slice(at))?.[0];
  return !!id && named.has(id);
}

describe('every request of a test that stores to a vault carries its address, the first upload\'s too (S-E4)', () => {
  const storing = specs.flatMap((f) => blocks(readFileSync(join(dir, f), 'utf8')).filter((b) => /\/api\/sync\/(log|photo)/.test(b.body) && /\brequest\.(put|post)\(/.test(b.body)).map((b) => ({ f, ...b })));
  it('finds the tests that store through `request` (the guard reads something)', () => {
    expect(storing.map((b) => b.f).sort()).toEqual(expect.arrayContaining(['r62bs-server.spec.ts', 'r62s-server.spec.ts']));
  });
  for (const f of specs) {
    it(`${f}: no sync request of a storing test goes without an address`, () => {
      const bare: string[] = [];
      for (const b of storing.filter((s) => s.f === f)) {
        const named = addressed(b.body);
        for (const m of b.body.matchAll(/\brequest\.(get|head|put|post|delete|fetch)\(/g)) {
          const call = callAt(b.body, m.index! + m[0].length - 1);
          if (!/\/api\/sync\/|\burl\b/.test(call)) continue;
          if (!sendsAddress(call, named)) bare.push(`${b.title}: ${call.slice(0, 80)}`);
        }
      }
      expect(bare).toEqual([]);
    });
  }
});
