/**
 * Round sixty-nine, agent R: a refused database is said on every page that waits for the collection (triage-68 R3; the
 * self-review's D4, R46-18). Round sixty-seven said it on Today and Backup only; My plants, a plant's page, Propagation
 * and a batch's page (and Places, a place's page and Labels, whose patches go to their owners) said "Opening your
 * collection…" for good. Each page's waiting line is now `Opening.svelte`, which reads `collection.failed`. Each case
 * marked "base" fails on 1609c19.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Pages whose waiting line was changed by a patch sent to their owner (X: Places, Labels; P: a place's page): applied at the merge of round sixty-nine, so none is left out. */
const AT_MERGE = new Set<string>();
const pages = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? pages(p) : p.endsWith('.svelte') ? [p] : []; });

describe('the waiting line says a refusal', () => {
  it('base: with the storage refused, it is the refusal, as an alert', async () => {
    const { render } = await import('svelte/server');
    const { collection } = await import('$lib/db/collection.svelte');
    const { default: Opening } = await import('$lib/db/Opening.svelte');
    expect(render(Opening, { props: {} }).body).toContain('Opening your collection…');
    collection.failed = 'This browser refused to open the storage the collection is kept in.';
    const body = render(Opening, { props: { cls: 'vern muted' } }).body;
    expect(body).toContain('role="alert"');
    expect(body).toContain('This browser refused to open the storage');
    expect(body).not.toContain('Opening your collection');
    collection.failed = null;
  });
  it('base: My plants, a plant\'s page, Propagation and a batch\'s page wait with it', () => {
    for (const f of ['src/routes/plants/+page.svelte', 'src/routes/plants/[acc]/+page.svelte', 'src/routes/propagation/+page.svelte', 'src/routes/propagation/[id]/+page.svelte']) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).toMatch(/<Opening\b/);
      expect(text, f).not.toMatch(/>Opening your collection…</);
    }
  });
  it('no other page writes the waiting line itself', () => {
    const own = pages('src/routes').filter((f) => />Opening your collection…</.test(readFileSync(f, 'utf8')));
    expect(own.filter((f) => !AT_MERGE.has(f.replace(/\\/g, '/')))).toEqual([]);
  });
});
