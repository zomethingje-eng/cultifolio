import { describe, it, expect } from 'vitest';
import { readExif, toDay, fakeExifJpeg } from '$lib/photo/exif';
import { fit } from '$lib/photo/process';

describe('EXIF', () => {
  it('reads DateTimeOriginal and Orientation, both byte orders', () => {
    for (const littleEndian of [false, true]) {
      const buf = fakeExifJpeg({ taken: '2026:09:14 16:03:22', orientation: 6, littleEndian });
      expect(readExif(buf)).toEqual({ taken: '2026-09-14', orientation: 6 });
    }
  });
  it('a file with no EXIF, or not a JPEG, yields nothing rather than throwing', () => {
    expect(readExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toEqual({ taken: null, orientation: null });
    expect(readExif(new Uint8Array([0xff, 0xd8, 0xff, 0xda]).buffer)).toEqual({ taken: null, orientation: null });
    expect(readExif(new ArrayBuffer(0))).toEqual({ taken: null, orientation: null });
    expect(readExif(fakeExifJpeg({}))).toEqual({ taken: null, orientation: null });
  });
  it('a truncated segment does not read past the buffer', () => {
    const buf = fakeExifJpeg({ taken: '2026:01:02 00:00:00', orientation: 1 });
    for (let n = 0; n < buf.byteLength; n += 3) expect(() => readExif(buf.slice(0, n))).not.toThrow();
  });
  it('a camera with no clock is not a date', () => {
    expect(toDay('0000:00:00 00:00:00')).toBeNull();
    expect(toDay('    :  :     :  :  ')).toBeNull();
    expect(toDay('2026:13:01 00:00:00')).toBeNull();
    expect(toDay('1970:01:01 00:00:00')).toBeNull();
    expect(toDay('2026:09:14 16:03:22')).toBe('2026-09-14');
  });
  it('an orientation outside 1–8 is ignored', () => {
    expect(readExif(fakeExifJpeg({ orientation: 9 })).orientation).toBeNull();
  });
});

describe('resizing', () => {
  it('fits the long edge and never enlarges', () => {
    expect(fit(4000, 3000, 1600)).toEqual({ w: 1600, h: 1200 });
    expect(fit(3000, 4000, 1600)).toEqual({ w: 1200, h: 1600 });
    expect(fit(800, 600, 1600)).toEqual({ w: 800, h: 600 });
    expect(fit(1600, 1, 320)).toEqual({ w: 320, h: 1 });
  });
});
