/**
 * Encryption of the data files (SEC-6, D-12): AES-GCM 256 with a key derived by PBKDF2-SHA-256 from
 * the shared access phrase. WebCrypto only, so the same module runs in the browser and in Node
 * scripts (seed-demo, the admin of stage 2).
 */

export const KDF_ITERATIONS = 250_000;

export type Envelope = {
  v: 1;
  alg: 'AES-GCM';
  kdf: 'PBKDF2-SHA256';
  iter: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

/** The phrase does not fit, or the file is damaged — AES-GCM cannot tell the two apart. */
export class DecryptError extends Error {
  constructor() {
    super('код доступа не подходит или файл данных повреждён');
    this.name = 'DecryptError';
  }
}

/** Derived keys by (iterations, salt, phrase): a weak CPU derives a key once per write (D-12). */
export type KeyCache = Map<string, Promise<CryptoKey>>;

const subtle = () => globalThis.crypto.subtle;

export function newSalt(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(16));
}

function deriveKey(
  phrase: string,
  salt: Uint8Array,
  iterations: number,
  keys?: KeyCache,
): Promise<CryptoKey> {
  const id = `${iterations}|${toBase64(salt)}|${phrase}`;
  const cached = keys?.get(id);
  if (cached) return cached;
  const key = (async () => {
    const material = await subtle().importKey(
      'raw',
      new TextEncoder().encode(phrase),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    return subtle().deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: bytes(salt), iterations },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  })();
  keys?.set(id, key);
  return key;
}

export async function encryptJson(
  value: unknown,
  phrase: string,
  opts: { salt: Uint8Array; iterations?: number; keys?: KeyCache },
): Promise<Envelope> {
  const iterations = opts.iterations ?? KDF_ITERATIONS;
  const key = await deriveKey(phrase, opts.salt, iterations, opts.keys);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const cipher = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, plain));
  return {
    v: 1,
    alg: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iter: iterations,
    salt: toBase64(opts.salt),
    iv: toBase64(iv),
    ciphertext: toBase64(cipher),
  };
}

export async function decryptJson(
  envelope: Envelope,
  phrase: string,
  keys?: KeyCache,
): Promise<unknown> {
  let plain: ArrayBuffer;
  try {
    const key = await deriveKey(phrase, fromBase64(envelope.salt), envelope.iter, keys);
    plain = await subtle().decrypt(
      { name: 'AES-GCM', iv: bytes(fromBase64(envelope.iv)) },
      key,
      bytes(fromBase64(envelope.ciphertext)),
    );
  } catch {
    throw new DecryptError();
  }
  return JSON.parse(new TextDecoder().decode(plain));
}

/** A copy on a fresh ArrayBuffer — what WebCrypto's BufferSource type accepts. */
function bytes(view: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(view);
}

export function toBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i += 0x8000)
    binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const data = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
  return data;
}
