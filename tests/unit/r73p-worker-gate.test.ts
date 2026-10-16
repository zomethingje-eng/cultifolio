/**
 * Round seventy-three, agent P (self-F 10, the owner's decision): the service worker is registered from a visitor's
 * second page, or at once on a collection page or once the device holds a collection; a device that has one keeps it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { registerNow, countView, VIEWS_KEY, COLLECTION_PATH } from '../../src/lib/ui/worker-gate';

const gate = (o: Partial<Parameters<typeof registerNow>[0]>) => registerNow({ registered: false, views: 1, path: '/species/copiapoa-cinerea', records: 0, syncing: false, ...o });

function store(init: Record<string, string> = {}, broken = false) {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: (k: string) => { if (broken) throw new Error('blocked'); return m.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (broken) throw new Error('blocked'); m.set(k, v); }
  };
}

describe('round seventy-three (P): when the worker is registered', () => {
  it('a reader on a first page of the reference gets none', () => {
    for (const path of ['/', '/species/copiapoa-cinerea', '/compare', '/about/how', '/about/formats', '/settings', '/species/not-a-plant-zzz']) expect(gate({ path }), path).toBe(false);
  });
  it('a collection page registers it on the first page, the import, a plant and the frost redirect included', () => {
    for (const path of ['/plants', '/plants/new', '/plants/import', '/plants/2026-0001', '/places', '/places/k1', '/propagation', '/propagation/new', '/today', '/sync', '/labels', '/backup', '/frost']) expect(gate({ path }), path).toBe(true);
    expect(COLLECTION_PATH.test('/plantsx')).toBe(false);
  });
  it('the second page, a collection held, sync set up or a worker already there registers it anywhere', () => {
    expect(gate({ views: 2 })).toBe(true);
    expect(gate({ records: 1 })).toBe(true);
    expect(gate({ records: null })).toBe(false);
    expect(gate({ syncing: true })).toBe(true);
    expect(gate({ registered: true })).toBe(true);
  });
  afterEach(() => vi.unstubAllGlobals());
  it('a view is counted on the device, kept as one or two, and a page without storage counts its own', () => {
    const s = store();
    vi.stubGlobal('localStorage', s);
    expect(countView(0)).toBe(1);
    expect(s.m.get(VIEWS_KEY)).toBe('1');
    expect(countView(0)).toBe(2); // the next page loaded in full
    expect(countView(2)).toBe(2);
    expect(s.m.get(VIEWS_KEY)).toBe('2');
    vi.stubGlobal('localStorage', store({}, true));
    expect(countView(0)).toBe(1);
    expect(countView(1)).toBe(2); // a move inside the app, with storage refused
    vi.stubGlobal('localStorage', undefined);
    expect(countView(0)).toBe(1);
    vi.stubGlobal('localStorage', store({ [VIEWS_KEY]: 'junk' }));
    expect(countView(0)).toBe(1);
  });
  it('the layout registers the worker in one place, by the gate, and says so for the tests; the about page names the key', () => {
    const layout = readFileSync('src/routes/+layout.svelte', 'utf8');
    expect(layout.match(/serviceWorker\.register\(/g)).toHaveLength(1);
    const fn = layout.slice(layout.indexOf('function registerWorker()'));
    expect(fn.indexOf('serviceWorker.register(')).toBeLessThan(fn.indexOf('\n  }\n'));
    expect(layout).toMatch(/registerNow\(\{ registered: false, views: sessionViews, path, records: collection\.ready \? collection\.recordCount : null, syncing: sync\.configured \}\)/);
    expect(layout).toMatch(/dataset\.worker = 'deferred'/);
    const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8');
    expect(how).toContain(`<code>${VIEWS_KEY}</code>`);
  });
});
