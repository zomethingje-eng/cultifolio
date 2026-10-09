/**
 * Round sixty-two, second pass, agent S (the server review, 6): a sheets bucket that cannot be read is derived again on
 * every request. Now the refusal is kept in the isolate for half a minute, with its Retry-After, and the unreadable
 * dossiers are named in the log.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sheetsIn, SheetsUnreadable, _forgetRefusedSheets } from '$lib/server/sheets';
import { corpusNow } from '$lib/server/dossiers';
import { bucketOf } from '$core/bucket';

const T = Date.UTC(2026, 9, 4, 12);
beforeEach(() => { _forgetRefusedSheets(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('a sheets bucket with a dossier that cannot be read', () => {
  it('is refused, and the refusal is kept half a minute without deriving the bucket again; the dossier is named in the log', async () => {
    let reads = 0;
    const fetch = (async () => { reads++; return new Response('', { status: 404 }); }) as typeof globalThis.fetch;
    const platform = { env: {} } as never;
    const c0 = await corpusNow(platform, fetch);
    const slug = 'zz-unreadable-species';
    const c = { ...c0, manifest: null, idx: [...c0.idx, { key: 987654321, slug, name: 'Zz unreadable', photos: 0, open: 0, climate: '' }] };
    const b = bucketOf(slug, c.buckets);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = await sheetsIn(c as never, platform, fetch, b).catch((e) => e);
    expect(first).toBeInstanceOf(SheetsUnreadable);
    expect(String(log.mock.calls.flat().join(' '))).toContain('987654321 (zz-unreadable-species)');
    const spent = reads;
    expect(spent).toBeGreaterThan(0);
    vi.setSystemTime(T + 10_000);
    const again = await sheetsIn(c as never, platform, fetch, b).catch((e) => e);
    expect(again).toBeInstanceOf(SheetsUnreadable);
    expect((again as SheetsUnreadable).retryAfter).toBe(20);
    expect(reads).toBe(spent); // nothing derived again
    vi.setSystemTime(T + 31_000);
    await expect(sheetsIn(c as never, platform, fetch, b)).rejects.toBeInstanceOf(SheetsUnreadable);
    expect(reads).toBeGreaterThan(spent); // derived again once the half minute is over
  });
});
