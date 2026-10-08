import { describe, expect, it } from 'vitest';
import {
  DecryptError,
  decryptJson,
  encryptJson,
  fromBase64,
  newSalt,
  toBase64,
  type KeyCache,
} from '../../../src/data/crypto.ts';

// Real data uses 250 000 iterations (D-12); tests keep key derivation fast.
const iterations = 1000;
const value = { title: 'Ёлка и ёж', list: [1, 2.5, null], nested: { ok: true } };

describe('encryptJson / decryptJson (SEC-6, D-12)', () => {
  it('round-trips JSON with Cyrillic', async () => {
    const envelope = await encryptJson(value, 'фраза', { salt: newSalt(), iterations });
    expect(await decryptJson(envelope, 'фраза')).toEqual(value);
  });

  it('writes the envelope of the spec', async () => {
    const envelope = await encryptJson(value, 'p', { salt: newSalt(), iterations });
    expect([envelope.v, envelope.alg, envelope.kdf, envelope.iter]).toEqual([
      1,
      'AES-GCM',
      'PBKDF2-SHA256',
      iterations,
    ]);
    expect(fromBase64(envelope.iv)).toHaveLength(12);
    expect(fromBase64(envelope.salt)).toHaveLength(16);
  });

  it('refuses a wrong phrase and a damaged file', async () => {
    const envelope = await encryptJson(value, 'right', { salt: newSalt(), iterations });
    await expect(decryptJson(envelope, 'wrong')).rejects.toBeInstanceOf(DecryptError);
    const bytes = fromBase64(envelope.ciphertext);
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    const damaged = { ...envelope, ciphertext: toBase64(bytes) };
    await expect(decryptJson(damaged, 'right')).rejects.toBeInstanceOf(DecryptError);
    await expect(decryptJson({ ...envelope, iv: 'не base64' }, 'right')).rejects.toBeInstanceOf(
      DecryptError,
    );
  });

  it('derives the key once for files that share a salt', async () => {
    const keys: KeyCache = new Map();
    const salt = newSalt();
    const a = await encryptJson({ a: 1 }, 'p', { salt, iterations, keys });
    const b = await encryptJson({ b: 2 }, 'p', { salt, iterations, keys });
    expect(a.iv).not.toBe(b.iv);
    expect(await decryptJson(a, 'p', keys)).toEqual({ a: 1 });
    expect(await decryptJson(b, 'p', keys)).toEqual({ b: 2 });
    expect(keys.size).toBe(1);
  });
});

describe('base64', () => {
  it('round-trips every byte value', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });
});
