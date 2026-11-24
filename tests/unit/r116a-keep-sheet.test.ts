/**
 * Round 116 (MYPLANTS 26, docs/PLAN-IPHONE.md): when the "keep your plants" sheet shows by itself, and the list's line on
 * each device.
 *
 * - In Safari on an iPhone or iPad, from the first plant, with no backup and no sync: due once, and again a week after it
 *   was last shown. Never in the Home Screen app or elsewhere, never with no plant, with sync on, after a backup, or in
 *   the example.
 * - The line says Safari may delete it after seven days unused on that device, and what it said before everywhere else.
 *
 * On 1764df3 there is no sheet and the line said "install the app" on an iPhone too: every test FAILED.
 */
import { describe, it, expect } from 'vitest';
import { sheetDue, storageWords, WEEK_MS } from '../../src/lib/ui/grow/keep-sheet.svelte';

const base = { iosSafari: true, plants: 1, lastBackup: null, synced: false, lastShown: null, now: 1_800_000_000_000 };

describe('r116a sheetDue', () => {
  it('in Safari on an iPhone, from the first plant, with nothing done', () => {
    expect(sheetDue(base)).toBe(true);
    expect(sheetDue({ ...base, plants: 0 })).toBe(false);
  });
  it('never elsewhere, with sync, after a backup, in the example, or before the last backup is read', () => {
    expect(sheetDue({ ...base, iosSafari: false })).toBe(false);
    expect(sheetDue({ ...base, synced: true })).toBe(false);
    expect(sheetDue({ ...base, lastBackup: '2026-11-20T10:00:00Z' })).toBe(false);
    expect(sheetDue({ ...base, demo: true })).toBe(false);
    expect(sheetDue({ ...base, lastBackup: undefined })).toBe(false);
  });
  it('again a week after it was last shown, not before', () => {
    expect(sheetDue({ ...base, lastShown: base.now - WEEK_MS + 60_000 })).toBe(false);
    expect(sheetDue({ ...base, lastShown: base.now - WEEK_MS })).toBe(true);
  });
});

describe('r116a the list\'s line', () => {
  it('true of the device it is read on', () => {
    expect(storageWords(true)).toEqual({ lead: 'Kept in Safari on this device only, which may delete it after seven days unused:', act: 'keep your plants' });
    expect(storageWords(false).act).toBe('back up or install the app');
  });
});
