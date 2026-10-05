/**
 * The words the private pages build from records (round sixty): plant names with cultivar and cross, Today's rows by
 * the rule and the figure in use, the sync engine's errors in plain sentences, the label stock by locale, the held
 * changes' sentence, and the toast that waits while it is being read.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { plantName, plantLabel, crossName, placeTail } from '$lib/ui/plant-label';
import { rhythmWords, restWords, dayWords, addedWords, monthRuns } from '$lib/ui/today-words';
import { syncWords } from '$lib/ui/sync-words';
import { defaultSheet } from '$lib/ui/label-sheet';
import { heldWords } from '$lib/ui/held-words';
import { plural, some, listWords } from '$lib/ui/words';
import { readerLat } from '$lib/ui/site.svelte';
import { toast } from '$lib/ui/toast.svelte';

describe('plant names where plants are told apart (the grower review, 7)', () => {
  it('keeps the cultivar', () => {
    expect(plantLabel({ taxonName: 'Haworthia truncata', cultivar: 'Lime Green' })).toBe('Haworthia truncata ‘Lime Green’');
    expect(plantName({ taxonName: 'Echeveria', cultivar: 'Blue Curls', nameKind: 'hybrid' })).toEqual({ sci: 'Echeveria', cultivar: 'Blue Curls' });
  });
  it('names a hybrid filed under its genus by its cross, the repeated genus dropped', () => {
    const a = { taxonName: 'Ariocarpus', nameKind: 'hybrid', parentage: 'Ariocarpus retusus × Ariocarpus trigonus' };
    expect(crossName(a)).toBe('Ariocarpus retusus × trigonus');
    expect(plantLabel(a)).toBe('Ariocarpus retusus × trigonus');
    // Five crosses read as five names, not five "Ariocarpus".
    expect(plantLabel({ ...a, parentage: 'Ariocarpus fissuratus × Ariocarpus kotschoubeyanus' })).not.toBe(plantLabel(a));
  });
  it('leaves a species alone, and a hybrid with no parents stated under its filed name', () => {
    expect(plantLabel({ taxonName: 'Copiapoa cinerea' })).toBe('Copiapoa cinerea');
    expect(crossName({ taxonName: 'Ariocarpus', nameKind: 'hybrid', parentage: null })).toBeNull();
  });
  it('shows the last segment of a place path (the grower review, 8)', () => {
    expect(placeTail('Greenhouse › Bench 1 › Tray A')).toBe('Tray A');
    expect(placeTail('Windowsill')).toBe('Windowsill');
  });
});

describe("Today's words (the grower review, 5; the words review)", () => {
  it('says the rhythm in use and where it comes from', () => {
    expect(rhythmWords([{ days: 10, from: 'Greenhouse' }])).toBe('Past its 10-day rhythm (Greenhouse)');
    expect(rhythmWords([{ days: 10, from: 'Greenhouse' }, { days: 10, from: 'Greenhouse' }])).toBe('Past their 10-day rhythm (Greenhouse)');
    expect(rhythmWords([{ days: 21, from: 'default' }])).toBe('Past its 21-day rhythm (the default)');
    expect(rhythmWords([{ days: 7, from: 'plant' }, { days: 14, from: 'Bench' }])).toBe('Past their watering rhythm (7 or 14 days)');
    expect(rhythmWords([{ days: 7, from: 'plant' }, { days: 14, from: 'Bench' }])).not.toMatch(/21/);
  });
  it('never calls the temperature rule a dry season or a rest', () => {
    const cool = restWords('cool', 'metric');
    expect(cool).not.toMatch(/dry season|rest|growing months the species sheet names/);
    expect(cool).toMatch(/warmer six months/);
    expect(restWords('cool', 'us')).toMatch(/in \(120 mm\)/);
    expect(restWords('rain', 'metric')).toMatch(/dry season/);
  });
  it('says today, not 0 d', () => {
    expect(dayWords(0)).toBe('today');
    expect(dayWords(11)).toBe('11 d');
    expect(addedWords(0)).toBe('added today, no watering yet');
    expect(addedWords(11)).toBe('added 11 d ago, no watering yet');
  });
  it('names months as the seasons run', () => {
    expect(monthRuns([1, 2, 12])).toBe('Dec to Feb');
    expect(monthRuns([6, 7])).toBe('Jun, Jul');
    expect(monthRuns([11, 12, 1, 2, 5])).toBe('May, Nov to Feb');
    expect(monthRuns([])).toBe('');
    expect(monthRuns([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe('every month');
  });
});

describe('sync errors in plain sentences, the detail kept (the words review, 15)', () => {
  it('turns the engine strings into sentences', () => {
    const cases: Array<[string, RegExp]> = [
      ['push failed: 400', /refused a change from this device \(400\)/],
      ['push failed: 503', /not taking changes from this vault/],
      ['batch 0001791144-0000-db19070a10f8-1a2b3c4d5e6f: 404', /sync bundle/],
      ['photo pmuu12: 404', /photograph listed on the server could not be fetched/],
      ['photo pmuu12 removal: 403 (tried again next time)', /removal did not reach the server/],
      ['pixels do not match the record', /arrived damaged/],
      ['not a batch this version understands', /newer version/],
      ['The server dated a batch 7 minutes ahead of its own clock; the batch was read, and the cursor stays before it, so listings are longer until that is sorted out.', /clock reads ahead/],
      ['the server asked this device to wait 60 s before syncing again', /asked this device to wait 60 seconds/]
    ];
    for (const [raw, want] of cases) {
      const w = syncWords(raw)!;
      expect(w.text, raw).toMatch(want);
      expect(w.detail, raw).toBe(raw);
      expect(w.text).not.toMatch(/: \d{3}$|cursor|^batch /);
    }
  });
  it('keeps a sentence the server or the device wrote as it is, and says nothing for nothing', () => {
    expect(syncWords('This device is out of space for the collection.')).toEqual({ text: 'This device is out of space for the collection.', detail: null });
    expect(syncWords(null)).toBeNull();
    expect(syncWords('weird thing')!.detail).toBe('weird thing');
  });
});

describe('label stock by locale (the grower review, 9)', () => {
  it('opens on Letter in the US and Canada, A4 elsewhere', () => {
    expect(defaultSheet('en-US')).toBe('5160');
    expect(defaultSheet('en-CA')).toBe('5160');
    expect(defaultSheet('fr-CA')).toBe('5160');
    expect(defaultSheet('en-GB')).toBe('L7160');
    expect(defaultSheet('de')).toBe('L7160');
    expect(defaultSheet('en_us')).toBe('5160');
    expect(defaultSheet(undefined)).toBe('L7160');
  });
});

describe('counting words', () => {
  it('says held changes in the lead\'s words (decision 2)', () => {
    expect(heldWords(1)).toBe("1 change from a device whose clock runs ahead is waiting. It appears when this device's date reaches it.");
    expect(heldWords(3)).toBe("3 changes from a device whose clock runs ahead are waiting. They appear when this device's date reaches them.");
    expect(heldWords(0)).toBe('');
  });
  it('never says "1 photos"', () => {
    expect(plural(1, 'photo')).toBe('1 photo');
    expect(plural(40, 'plant')).toBe('40 plants');
    expect(plural(2, 'propagation batch', 'propagation batches')).toBe('2 propagation batches');
    expect(plural(0, 'photo')).toBe('0 photos');
    expect(some(0, 'photo')).toBe('');
    expect(listWords(['40 plants', '', '6 places', '1 photo'])).toBe('40 plants, 6 places and 1 photo');
    expect(listWords(['a'])).toBe('a');
  });
});

describe("the reader's latitude (the self-review's 10)", () => {
  it('reads the site, else the first place with coordinates', () => {
    expect(readerLat([{ lat: null }, { lat: -33.9 }, { lat: 40 }], null)).toBe(-33.9);
    expect(readerLat([{ lat: -33.9 }], { lat: 51, lon: 0 })).toBe(51);
    expect(readerLat([], null)).toBeNull();
  });
});

describe('the toast waits while it is read (the accessibility review, 1)', () => {
  afterEach(() => { toast.hide(); vi.useRealTimers(); });
  it('holds its timer while focus or the pointer is on it, and gives at least two seconds back', () => {
    vi.useFakeTimers();
    toast.show('2026-0001 watered.', 2400, { label: 'Undo', run: () => {} });
    vi.advanceTimersByTime(7000);
    toast.hold();
    vi.advanceTimersByTime(60_000);
    expect(toast.text).toBe('2026-0001 watered.');
    toast.release();
    vi.advanceTimersByTime(1900);
    expect(toast.text).not.toBeNull();
    vi.advanceTimersByTime(200);
    expect(toast.text).toBeNull();
  });
  it('goes on time when nothing holds it', () => {
    vi.useFakeTimers();
    toast.show('Watered 3.');
    vi.advanceTimersByTime(2500);
    expect(toast.text).toBeNull();
  });
});
