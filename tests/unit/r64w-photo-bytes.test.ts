/**
 * Round sixty-four, agent W: Safari's engine in a Private Browsing window refuses a Blob in IndexedDB ("Error preparing
 * Blob/File data to be stored in object store"), and a photograph could not be added. The vault now keeps it as bytes
 * there, and reads it back as Blobs; a write that fails both ways is still the first error. On a real (in-memory)
 * IndexedDB, with the refusal stood in.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { putPhotoBlobs, getPhotoBlobs, deletePhotoBlobs } from '$lib/db/vault';

const jpeg = (n: number) => new Blob([new Uint8Array([0xff, 0xd8, n, 0xff, 0xd9])], { type: 'image/jpeg' });
const bytes = async (b: Blob) => [...new Uint8Array(await b.arrayBuffer())];
const realPut = IDBObjectStore.prototype.put;
/** WebKit's refusal: a value carrying a Blob is not stored. */
const refuseBlobs = (also: (v: unknown) => boolean = () => false) =>
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, v: unknown, k?: IDBValidKey) {
    const blobby = !!v && typeof v === 'object' && Object.values(v as Record<string, unknown>).some((x) => x instanceof Blob);
    if (blobby || also(v)) throw new DOMException('Error preparing Blob/File data to be stored in object store', 'UnknownError');
    return realPut.call(this, v, k);
  });
afterEach(() => vi.restoreAllMocks());

describe('a photograph where the browser refuses a Blob in its database', () => {
  it('is kept as bytes and read back as the same JPEGs, with their type (base: the write failed and the photograph was lost)', async () => {
    refuseBlobs();
    await putPhotoBlobs({ id: 'p1', blob: jpeg(1), thumb: jpeg(2) });
    const got = await getPhotoBlobs('p1');
    expect(got?.blob).toBeInstanceOf(Blob);
    expect(got?.blob.type).toBe('image/jpeg');
    expect(await bytes(got!.blob)).toEqual([0xff, 0xd8, 1, 0xff, 0xd9]);
    expect(await bytes(got!.thumb)).toEqual([0xff, 0xd8, 2, 0xff, 0xd9]);
    await deletePhotoBlobs('p1');
    expect(await getPhotoBlobs('p1')).toBeUndefined();
  });
  it('a write refused both ways is the first error, not taken as stored', async () => {
    refuseBlobs(() => true);
    await expect(putPhotoBlobs({ id: 'p2', blob: jpeg(3), thumb: jpeg(4) })).rejects.toThrow('Error preparing Blob/File data');
    vi.restoreAllMocks();
    expect(await getPhotoBlobs('p2')).toBeUndefined();
  });
});
