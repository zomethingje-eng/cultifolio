/**
 * Round eighty-one (U): the words and the guard behind three phone fixes.
 *
 * - (P9) A photograph the browser cannot draw is named, and a HEIC one says the way forward (src/lib/photo/process.ts).
 * - (C1) "Share card" with its drawing code not fetched says which case it is (src/lib/ui/share-words.ts).
 * - (P3) The offline page opens a page from the device's copy of its data once per address, never in a loop, and not at
 *   all where session storage refuses (src/lib/ui/offline-kept.ts).
 *
 * On r81base: FAILED (none of the three exported: `unreadableWords`, `cardCodeWords`, `mayTryKept`).
 */
import { describe, it, expect } from 'vitest';
import { unreadableWords } from '../../src/lib/photo/process';
import { cardCodeWords } from '../../src/lib/ui/share-words';
import { mayTryKept, dataPath } from '../../src/lib/ui/offline-kept';

const file = (name: string, type: string) => Object.assign(new Blob(['x'], { type }), { name });

describe('r81u P9: a photograph that cannot be read', () => {
  it('names a HEIC by its file and says what to do, by its type or by its name', () => {
    for (const f of [file('IMG_0001.HEIC', 'image/heic'), file('IMG_0001.HEIC', ''), file('photo.heif', 'image/heif'), file('x.jpg', 'image/heic-sequence')]) {
      const w = unreadableWords(f);
      expect(w).toMatch(/^\S+ is a HEIC photograph, which this browser cannot read\. On an iPhone, choose it from Photos/);
      expect(w).toContain(f.name);
    }
  });
  it('names any other file it cannot read, and keeps the browser-neutral sentence without a name', () => {
    expect(unreadableWords(file('scan.tiff', 'image/tiff'))).toBe('scan.tiff is not an image this browser can read.');
    expect(unreadableWords(file('scan.tiff', 'image/tiff'), 'That file did not decode as an image.')).toBe('scan.tiff did not decode as an image.');
    expect(unreadableWords(new Blob(['x'], { type: 'image/png' }))).toBe('That file is not an image this browser can read.');
  });
});

describe('r81u C1: the share card without its drawing code', () => {
  it('says each case in words, never an address', () => {
    for (const k of ['offline', 'newer', 'unreached'] as const) expect(cardCodeWords(k)).not.toMatch(/_app|https?:|module|\.js/);
    expect(cardCodeWords('newer')).toMatch(/newer version of Cultifolio is out.*Reload the page/);
    expect(cardCodeWords('offline')).toMatch(/^No connection/);
    expect(cardCodeWords('unreached')).toMatch(/Reload the page to try again\.$/);
  });
});

describe('r81u P3: the offline page tries a kept page once', () => {
  const store = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
  it('once per address within a minute, again after it, and for another address at once', () => {
    const s = store();
    expect(mayTryKept('/species/a', 1_000, s)).toBe(true);
    expect(mayTryKept('/species/a', 30_000, s)).toBe(false);
    expect(mayTryKept('/species/a', 62_000, s)).toBe(true);
    expect(mayTryKept('/species/b', 62_001, s)).toBe(true);
  });
  it('never without session storage, or where it throws', () => {
    expect(mayTryKept('/species/a', 1, null)).toBe(false);
    expect(mayTryKept('/species/a', 1, { getItem: () => { throw new Error('denied'); }, setItem: () => {} })).toBe(false);
    expect(mayTryKept('/species/a', 1, { getItem: () => null, setItem: () => { throw new Error('quota'); } })).toBe(false);
  });
  it("asks for the page's data where the framework keeps it", () => {
    expect(dataPath('/species/echeveria-elegans')).toBe('/species/echeveria-elegans/__data.json');
    expect(dataPath('/about/how/')).toBe('/about/how/__data.json');
    expect(dataPath('/')).toBe('/__data.json');
  });
});
