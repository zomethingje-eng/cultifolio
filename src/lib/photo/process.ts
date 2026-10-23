/**
 * Camera or file → what the vault stores: a full-size JPEG with the long
 * edge at 1600 px, a 320 px thumbnail, the pixel size, the day it was taken,
 * and a content hash. Everything happens in the browser; the original never
 * leaves the device and is not kept.
 *
 * Orientation: modern browsers apply EXIF orientation when decoding into an
 * <img>, and drawImage() from that element draws it the right way up, so the
 * stored JPEG needs no orientation tag and viewers never have to guess.
 */
import { readExif } from './exif';
import { localDate } from '$core/dates';

export const FULL_EDGE = 1600;
export const THUMB_EDGE = 320;
export const JPEG_Q = 0.85;

export interface Processed {
  blob: Blob;
  thumb: Blob;
  w: number;
  h: number;
  bytes: number;
  taken: string | null;
  sha: string;
}

/** Scale a box so its long edge is at most `edge`, never enlarging. */
export function fit(w: number, h: number, edge: number): { w: number; h: number } {
  const long = Math.max(w, h);
  if (long <= edge) return { w, h };
  const s = edge / long;
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

export async function processImage(file: Blob, opts: { fullEdge?: number; thumbEdge?: number } = {}): Promise<Processed> {
  const fullEdge = opts.fullEdge ?? FULL_EDGE;
  const thumbEdge = opts.thumbEdge ?? THUMB_EDGE;
  // EXIF from the head of the file only; a 12 MB phone photo needs no full read for this.
  let taken: string | null = null;
  try {
    taken = readExif(await file.slice(0, 256 * 1024).arrayBuffer()).taken;
  } catch {
    taken = null;
  }
  const img = await decode(file).catch((e: Error) => { throw new Error(unreadableWords(file, e.message)); });
  const full = fit(img.naturalWidth, img.naturalHeight, fullEdge);
  const blob = await draw(img, full.w, full.h);
  const t = fit(full.w, full.h, thumbEdge);
  const thumb = await draw(img, t.w, t.h);
  const sha = await sha256(blob);
  return { blob, thumb, w: full.w, h: full.h, bytes: blob.size, taken, sha };
}

/**
 * What is said of a file the browser could not draw, with its name, and for a HEIC photograph the way forward (round
 * eighty-one; the phone review's 9): an iPhone's own picker hands a HEIC over as a JPEG, so this meets a grower choosing an
 * iPhone's photograph on Android or a computer, where "That file is not an image this browser can read." said neither which
 * file nor what to do.
 */
export function unreadableWords(file: Blob & { name?: string }, said = 'That file is not an image this browser can read.'): string {
  const name = typeof file.name === 'string' && file.name.trim() ? file.name.trim() : null;
  const heic = /^image\/hei[cf](-sequence)?$/i.test(file.type) || (!!name && /\.hei[cf]$/i.test(name));
  if (heic) return `${name ?? 'That photograph'} is a HEIC photograph, which this browser cannot read. On an iPhone, choose it from Photos, which hands it over as a JPEG; elsewhere, save it as a JPEG first and choose that.`;
  if (!name) return said;
  return said.replace(/^That file/, name);
}

function decode(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (!img.naturalWidth) reject(new Error('That file did not decode as an image.'));
      else resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file is not an image this browser can read.'));
    };
    img.src = url;
  });
}

function draw(img: HTMLImageElement, w: number, h: number): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return Promise.reject(new Error('no canvas'));
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', JPEG_Q));
}

export async function sha256(b: Blob): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', await b.arrayBuffer());
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('');
}

export const today = () => localDate();
