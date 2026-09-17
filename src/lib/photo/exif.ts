/**
 * The two things we want from a camera file's EXIF: when it was taken and
 * which way up it is. A JPEG carries EXIF in an APP1 segment holding a TIFF
 * structure; HEIC and others are decoded by the browser, which handles
 * orientation itself, and give us no date. Nothing else is read: no GPS, no
 * camera model. What we do not read we cannot leak.
 */

export interface ExifBits {
  /** DateTimeOriginal as YYYY-MM-DD, when present and well-formed. */
  taken: string | null;
  /** The EXIF orientation tag, 1–8, when present. */
  orientation: number | null;
}

const TAG_ORIENTATION = 0x0112;
const TAG_EXIF_IFD = 0x8769;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_DATETIME = 0x0132;

export function readExif(buf: ArrayBuffer): ExifBits {
  const none: ExifBits = { taken: null, orientation: null };
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return none; // not a JPEG
  let off = 2;
  // Walk segments until APP1/Exif or the start of scan.
  while (off + 4 <= v.byteLength) {
    if (v.getUint8(off) !== 0xff) return none;
    const marker = v.getUint8(off + 1);
    if (marker === 0xda) return none; // SOS: no EXIF before the image data
    const len = v.getUint16(off + 2);
    if (marker === 0xe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966 /* "Exif" */) {
      return readTiff(buf, off + 10, Math.min(len - 8, v.byteLength - (off + 10)));
    }
    off += 2 + len;
  }
  return none;
}

function readTiff(buf: ArrayBuffer, base: number, size: number): ExifBits {
  const out: ExifBits = { taken: null, orientation: null };
  if (size < 8) return out;
  const v = new DataView(buf, base, size);
  const bo = v.getUint16(0);
  const le = bo === 0x4949; // "II" little-endian, "MM" big-endian
  if (!le && bo !== 0x4d4d) return out;
  if (v.getUint16(2, le) !== 0x2a) return out;
  const ifd0 = v.getUint32(4, le);
  let exifIfd = 0;
  let fallbackDate: string | null = null;
  walk(v, ifd0, le, (tag, type, count, valOff) => {
    if (tag === TAG_ORIENTATION && type === 3) out.orientation = v.getUint16(valOff, le);
    else if (tag === TAG_EXIF_IFD && type === 4) exifIfd = v.getUint32(valOff, le);
    else if (tag === TAG_DATETIME && type === 2) fallbackDate = ascii(v, valOff, count, le);
  });
  if (exifIfd)
    walk(v, exifIfd, le, (tag, type, count, valOff) => {
      if (tag === TAG_DATETIME_ORIGINAL && type === 2) out.taken = toDay(ascii(v, valOff, count, le));
    });
  if (!out.taken && fallbackDate) out.taken = toDay(fallbackDate);
  if (out.orientation != null && (out.orientation < 1 || out.orientation > 8)) out.orientation = null;
  return out;
}

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

function walk(v: DataView, ifd: number, le: boolean, each: (tag: number, type: number, count: number, valOff: number) => void): void {
  if (ifd + 2 > v.byteLength) return;
  const n = v.getUint16(ifd, le);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > v.byteLength) return;
    const tag = v.getUint16(e, le);
    const type = v.getUint16(e + 2, le);
    const count = v.getUint32(e + 4, le);
    const bytes = (TYPE_SIZE[type] ?? 1) * count;
    // Values up to 4 bytes sit in the entry itself; longer ones are pointed to.
    const valOff = bytes <= 4 ? e + 8 : v.getUint32(e + 8, le);
    if (valOff + bytes > v.byteLength) continue;
    each(tag, type, count, valOff);
  }
}

function ascii(v: DataView, off: number, count: number, _le: boolean): string {
  let s = '';
  for (let i = 0; i < count; i++) {
    const c = v.getUint8(off + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

/** "2026:09:14 16:03:22" → "2026-09-14"; anything else → null. Cameras with no clock write all zeros or spaces. */
export function toDay(s: string | null): string | null {
  if (!s) return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(s.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  if (y === '0000' || mo === '00' || d === '00') return null;
  const yy = Number(y), mm = Number(mo), dd = Number(d);
  if (yy < 1990 || yy > 2100 || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${y}-${mo}-${d}`;
}

/**
 * Build the smallest JPEG-shaped buffer that carries the given EXIF fields:
 * SOI, one APP1 segment, SOS. Enough for tests and for nothing else.
 */
export function fakeExifJpeg(opts: { taken?: string; orientation?: number; littleEndian?: boolean }): ArrayBuffer {
  const le = opts.littleEndian ?? false;
  const entries0: Array<[number, number, number, number | string]> = [];
  if (opts.orientation != null) entries0.push([TAG_ORIENTATION, 3, 1, opts.orientation]);
  const exifEntries: Array<[number, number, number, number | string]> = [];
  if (opts.taken) exifEntries.push([TAG_DATETIME_ORIGINAL, 2, opts.taken.length + 1, opts.taken]);
  const hasExif = exifEntries.length > 0;
  // Layout inside TIFF: header(8) | IFD0 | [ExifIFD] | string data
  const ifd0Size = 2 + 12 * (entries0.length + (hasExif ? 1 : 0)) + 4;
  const exifOff = 8 + ifd0Size;
  const exifSize = hasExif ? 2 + 12 * exifEntries.length + 4 : 0;
  const dataOff = exifOff + exifSize;
  const strings = exifEntries.filter((e) => e[1] === 2).map((e) => e[3] as string);
  const dataLen = strings.reduce((n, s) => n + s.length + 1, 0);
  const tiff = new ArrayBuffer(dataOff + dataLen);
  const v = new DataView(tiff);
  v.setUint16(0, le ? 0x4949 : 0x4d4d);
  v.setUint16(2, 0x2a, le);
  v.setUint32(4, 8, le);
  let dptr = dataOff;
  const writeIfd = (at: number, entries: Array<[number, number, number, number | string]>, extra?: [number, number, number, number]) => {
    const all = extra ? [...entries, extra] : entries;
    v.setUint16(at, all.length, le);
    all.forEach(([tag, type, count, val], i) => {
      const e = at + 2 + i * 12;
      v.setUint16(e, tag, le);
      v.setUint16(e + 2, type, le);
      v.setUint32(e + 4, count, le);
      if (type === 2) {
        v.setUint32(e + 8, dptr, le);
        const s = val as string;
        for (let k = 0; k < s.length; k++) v.setUint8(dptr + k, s.charCodeAt(k));
        v.setUint8(dptr + s.length, 0);
        dptr += s.length + 1;
      } else if (type === 3) v.setUint16(e + 8, val as number, le);
      else v.setUint32(e + 8, val as number, le);
    });
    v.setUint32(at + 2 + all.length * 12, 0, le);
  };
  writeIfd(8, entries0, hasExif ? [TAG_EXIF_IFD, 4, 1, exifOff] : undefined);
  if (hasExif) writeIfd(exifOff, exifEntries);
  const app1Len = 2 + 6 + tiff.byteLength;
  const out = new Uint8Array(2 + 2 + app1Len + 2);
  const o = new DataView(out.buffer);
  o.setUint16(0, 0xffd8);
  o.setUint16(2, 0xffe1);
  o.setUint16(4, app1Len);
  out.set([0x45, 0x78, 0x69, 0x66, 0, 0], 6);
  out.set(new Uint8Array(tiff), 12);
  o.setUint16(out.length - 2, 0xffda);
  return out.buffer;
}
