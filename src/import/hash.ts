/** SHA-256 of a file's bytes, hex (DATA-8): the same file is recognised when it is loaded again. */
export async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}
