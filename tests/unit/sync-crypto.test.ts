import { describe, it, expect } from 'vitest';
import { newVaultKey, parseVaultKey, deriveKeys, tokenHash, seal, open, sealJson, openJson, packPhoto, unpackPhoto, pairingUrl } from '$lib/sync/crypto';

describe('vault keys', () => {
  it('are six groups of five from an unambiguous alphabet, and parse back from how people write them', () => {
    const k = newVaultKey();
    expect(k).toMatch(/^([A-HJKMNP-TV-Z2-9]{5}-){5}[A-HJKMNP-TV-Z2-9]{5}$/);
    expect(parseVaultKey(k.toLowerCase().replace(/-/g, ' '))).toBe(k);
    expect(parseVaultKey(pairingUrl(k))).toBe(k);
    expect(parseVaultKey(k.slice(1))).toBeNull();
    expect(parseVaultKey(k.replace(/^./, 'O'))).toBeNull(); // O is not in the alphabet
    expect(newVaultKey()).not.toBe(newVaultKey());
  });
  it('derive the same id, token and encryption key on every device, and nothing about one from another', async () => {
    const k = newVaultKey();
    const a = await deriveKeys(k), b = await deriveKeys(k.toLowerCase());
    expect(a.id).toBe(b.id);
    expect(a.token).toBe(b.token);
    expect(a.id).toHaveLength(26);
    expect(a.token).toHaveLength(64);
    const other = await deriveKeys(newVaultKey());
    expect(other.id).not.toBe(a.id);
    // the server keeps only a hash of the token
    expect(await tokenHash(a.token)).toBe(await tokenHash(b.token));
    expect(await tokenHash(a.token)).not.toBe(a.token);
  });
});

describe('sealing', () => {
  it('round-trips, refuses the wrong key, the wrong purpose, the wrong vault, and tampering', async () => {
    const a = await deriveKeys(newVaultKey());
    const b = await deriveKeys(newVaultKey());
    const blob = await sealJson(a, 'log', { changes: [{ t: '1', kind: 'accession', id: '2026-0001', field: 'notes', value: 'sulks' }] });
    expect(blob[0]).toBe(1);
    expect(await openJson(a, 'log', blob)).toEqual({ changes: [{ t: '1', kind: 'accession', id: '2026-0001', field: 'notes', value: 'sulks' }] });
    await expect(openJson(b, 'log', blob)).rejects.toThrow(/wrong vault key/);
    await expect(openJson(a, 'photo', blob)).rejects.toThrow(/wrong vault key/);
    const tampered = new Uint8Array(blob);
    tampered[tampered.length - 1] ^= 1;
    await expect(openJson(a, 'log', tampered)).rejects.toThrow();
    // two seals of the same plaintext differ (fresh iv)
    expect(Buffer.from(await sealJson(a, 'log', { x: 1 })).equals(Buffer.from(await sealJson(a, 'log', { x: 1 })))).toBe(false);
  });
  it('photos travel as one blob', async () => {
    const a = await deriveKeys(newVaultKey());
    const full = new Uint8Array([1, 2, 3, 4, 5]), thumb = new Uint8Array([9, 8]);
    const sealed = await seal(a, 'photo', packPhoto(full, thumb));
    const back = unpackPhoto(await open(a, 'photo', sealed));
    expect([...back.full]).toEqual([1, 2, 3, 4, 5]);
    expect([...back.thumb]).toEqual([9, 8]);
  });
});
