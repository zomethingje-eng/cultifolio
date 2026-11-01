/**
 * Round eighty-five, agent U: the collection's frame, as the three reviews of 08094db found it.
 *
 * - A17, C7: a photograph the server failed to hand over was counted (`sync.photosLater`) and told only to the console,
 *   while the status card said "everything on the server just now is here". The card's words now say how many, and a
 *   503 (another device storing or removing it) counts as not received too.
 * - A19: `localDateOf('2026-10-31')` was the 30th west of Greenwich (the date read as midnight in Greenwich); a site name
 *   set through `site.set` (Settings' own field) was stored at any length; the refold after a change of the clock
 *   swallowed its failure.
 *
 * On r85base: `photosLaterWords` and `syncedWords` did not exist; `localDateOf('2026-10-31')` in New York was
 * '2026-10-30'; `site.set` kept a 600-character name whole; the failed refold left `collection.readBehind` null.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { photosLaterWords, syncedWords } from '$lib/ui/sync-words';
import { localDateOf, daysSince } from '$core/dates';

describe('the status card says the photographs a run did not receive (A17, C7)', () => {
  const ago = () => 'just now';
  it('a run with none left out says everything is here; with some, the records are here and how many photographs wait', () => {
    expect(photosLaterWords(0)).toBeNull();
    expect(photosLaterWords(1)).toBe('1 photograph was not received this run; asked for again at the next sync');
    expect(photosLaterWords(2)).toBe('2 photographs were not received this run; asked for again at the next sync');
    expect(syncedWords('2026-10-31T12:00:00Z', ago, 0)).toBe('everything on the server just now is here');
    expect(syncedWords('2026-10-31T12:00:00Z', ago, 2)).toBe('the records on the server just now are here; 2 photographs were not received this run; asked for again at the next sync');
    expect(syncedWords(null, ago, 2)).toBe('not yet');
  });
});

describe('a calendar date is its own day, wherever the reader is (A19)', () => {
  const tz = process.env.TZ;
  afterEach(() => { if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz; });
  it('in New York, 31 October is 31 October, not the 30th; an impossible date is no date', () => {
    process.env.TZ = 'America/New_York';
    expect(new Date(Date.parse('2026-10-31')).getDate()).toBe(30); // the trap: midnight in Greenwich is the evening before here
    expect(localDateOf('2026-10-31')).toBe('2026-10-31'); // r85base: '2026-10-30'
    expect(daysSince('2026-10-31', '2026-10-31')).toBe(0); // r85base: 1
    expect(localDateOf('2026-02-30')).toBeNull();
    expect(localDateOf('2026-13-01')).toBeNull();
    // An instant is still read on the reader's calendar: 01:00 in Greenwich on the 31st is the 30th here.
    expect(localDateOf('2026-10-31T01:00:00Z')).toBe('2026-10-30');
    expect(localDateOf('garbage')).toBeNull();
  });
});

describe('a site name set from Settings is bounded on the way in (A19)', () => {
  it('a name of 600 characters is kept at 120 at most, marked; a name of spaces is no name', async () => {
    const { site, SITE_NAME_MAX } = await import('$lib/ui/site.svelte');
    site.set({ lat: 40.38, lon: -80.05, name: 'Greenhouse '.repeat(55) });
    expect(site.current!.name!.length).toBeLessThanOrEqual(SITE_NAME_MAX); // r85base: 605
    expect(site.current!.name!.endsWith('…')).toBe(true);
    site.set({ lat: 40.38, lon: -80.05, name: ' \n\t ' });
    expect(site.current).toEqual({ lat: 40.38, lon: -80.05 });
    site.set({ lat: 40.38, lon: -80.05, name: 'Mt.\u0000 Lebanon' });
    expect(site.current!.name).toBe('Mt. Lebanon');
    site.set(null);
    expect(site.current).toBeNull();
  });
});

describe('the refold after a change of the clock says when it fails (A19)', () => {
  it('a failed refold puts the reload line up; the next that works takes it down', async () => {
    vi.resetModules();
    const vault = await import('$lib/db/vault');
    await vault.wipeVault();
    await wipeMeta(vault);
    await vault.setMeta('device', 'aaaaaaaaaaaa');
    const { collection } = await import('$lib/db/collection.svelte');
    const { sync, CLOCK_FOLD_FAILED } = await import('$lib/sync/engine.svelte');
    await collection.load();
    expect(collection.readBehind).toBeNull();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rebuild = vi.spyOn(collection, 'rebuild').mockRejectedValueOnce(new Error('the database connection is closing'));
    const engine = sync as unknown as { clockChanged(): void; clockFold: Promise<void> | null };
    engine.clockChanged();
    await engine.clockFold;
    expect(collection.readBehind).toBe(CLOCK_FOLD_FAILED); // r85base: null, the failure swallowed
    expect(warn).toHaveBeenCalled();
    engine.clockChanged();
    await engine.clockFold;
    expect(rebuild).toHaveBeenCalledTimes(2);
    expect(collection.readBehind).toBeNull();
    warn.mockRestore();
    rebuild.mockRestore();
  });
});
