/**
 * Round ninety-nine (docs/REVIEW-ROUND-99.md, D3): the vault's synchronous AES-256-GCM is the standard one. It gives NIST's
 * answers (The Galois/Counter Mode of Operation, McGrew and Viega, test cases 13 to 16: AES-256, a 96-bit IV, no data,
 * one zero block, four blocks, and three and a half blocks with AAD); it agrees with WebCrypto both ways on random keys,
 * IVs, AAD and lengths from 0 to 300 bytes (WebCrypto opens what it sealed and it opens what WebCrypto sealed); and it
 * refuses a value changed by one bit, its AAD changed, or another key, returning nothing.
 *
 * On e89438b: src/lib/crypto/aes-gcm.ts did not exist; every case FAILED.
 */
import { describe, it, expect } from 'vitest';
import { gcmSeal, gcmOpen, GcmOpenError } from '../../src/lib/crypto/aes-gcm';

const hex = (s: string) => Uint8Array.from((s.match(/../g) ?? []).map((b) => parseInt(b, 16)));
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const K = 'feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308';
const P = 'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b391aafd255';
const C = '522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662898015ad';

describe('r99a: AES-256-GCM, synchronous', () => {
  it("NIST's test cases 13 to 16", () => {
    const z = new Uint8Array(32), iv0 = new Uint8Array(12);
    expect(toHex(gcmSeal(z, iv0, new Uint8Array(0)))).toBe('530f8afbc74536b9a963b4f1c4cb738b');
    expect(toHex(gcmSeal(z, iv0, new Uint8Array(16)))).toBe('cea7403d4d606b6e074ec5d3baf39d18' + 'd0d1c8a799996bf0265b98b5d48ab919');
    expect(toHex(gcmSeal(hex(K), hex('cafebabefacedbaddecaf888'), hex(P)))).toBe(C + 'b094dac5d93471bdec1a502270e3cc6c');
    const p16 = hex(P).subarray(0, 60), a16 = hex('feedfacedeadbeeffeedfacedeadbeefabaddad2');
    expect(toHex(gcmSeal(hex(K), hex('cafebabefacedbaddecaf888'), p16, a16))).toBe(C.slice(0, 120) + '76fc6ece0f4e1768cddf8853bb2d551b');
    expect(toHex(gcmOpen(hex(K), hex('cafebabefacedbaddecaf888'), hex(C.slice(0, 120) + '76fc6ece0f4e1768cddf8853bb2d551b'), a16))).toBe(P.slice(0, 120));
  });

  it('agrees with WebCrypto both ways, 400 random cases', async () => {
    for (let n = 0; n < 400; n++) {
      const key = crypto.getRandomValues(new Uint8Array(32)), iv = crypto.getRandomValues(new Uint8Array(12));
      const plain = crypto.getRandomValues(new Uint8Array(n % 301));
      const aad = crypto.getRandomValues(new Uint8Array((n * 7) % 41));
      const k = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt', 'decrypt']);
      const theirs = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, k, plain));
      const ours = gcmSeal(key, iv, plain, aad);
      expect(toHex(ours)).toBe(toHex(theirs));
      expect(toHex(gcmOpen(key, iv, theirs, aad))).toBe(toHex(plain));
      expect(toHex(new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad }, k, ours as BufferSource)))).toBe(toHex(plain));
    }
  });

  it('refuses a changed bit, other AAD, another key', () => {
    const key = crypto.getRandomValues(new Uint8Array(32)), iv = crypto.getRandomValues(new Uint8Array(12));
    const s = gcmSeal(key, iv, new TextEncoder().encode('Copiapoa cinerea, from seed'), new TextEncoder().encode('c\u0000t1'));
    for (const i of [0, 5, s.length - 1]) {
      const bad = s.slice(); bad[i] ^= 1;
      expect(() => gcmOpen(key, iv, bad, new TextEncoder().encode('c\u0000t1'))).toThrow(GcmOpenError);
    }
    expect(() => gcmOpen(key, iv, s, new TextEncoder().encode('c\u0000t2'))).toThrow(GcmOpenError);
    expect(() => gcmOpen(crypto.getRandomValues(new Uint8Array(32)), iv, s, new TextEncoder().encode('c\u0000t1'))).toThrow(GcmOpenError);
    expect(() => gcmOpen(key, iv, s.subarray(0, 10))).toThrow(GcmOpenError);
  });
});
