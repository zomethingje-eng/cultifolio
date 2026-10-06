/**
 * Harness review of round sixty: app.html's inline script was changed this round (it now reads `cultifolio.hasMine`
 * before paint) and its CSP hash in svelte.config.js was updated by hand. No test ties the two: an edit to the script
 * that forgets the hash ships a page whose browser refuses the script, silently (no theme before paint, the tab bar
 * flips again), and every test that reads the DOM after hydration still passes.
 * PASSES on round-sixty code; FAILS if the script and the hash drift apart (checked by adding one space to the script).
 * Run: copy to tests/unit/ and `npx vitest run tests/unit/harness--csp-hash.test.ts`.
 */
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

it('every inline script in app.html has its sha256 in the CSP script-src (harness review)', () => {
  const html = readFileSync('src/app.html', 'utf8');
  const config = readFileSync('svelte.config.js', 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  expect(scripts.length).toBeGreaterThan(0);
  for (const s of scripts) {
    const h = `sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}`;
    expect(config).toContain(`'${h}'`);
  }
});
