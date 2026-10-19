// Hexadecimal text and bytes, for the kernel's inputs and outputs. The
// evidence's `Hash32` is `0x` and 64 lowercase digits (the Snapshot schema's
// `Hash32`); the kernel's own vectors write bytes as bare hex.

/** `0x`-prefixed lowercase hexadecimal text: the Snapshot schema's `Hash32`. */
export type Hash32 = `0x${string}`;

const BARE_HEX = /^(?:[0-9a-f]{2})*$/u;

/**
 * The bytes of bare lowercase hex of any even length (`""` is no bytes), or
 * `undefined` for anything else: an odd length, a `0x` prefix, upper case.
 */
export const bytesFromHex = (text: string): Uint8Array | undefined => {
  if (!BARE_HEX.test(text)) return undefined;
  const bytes = new Uint8Array(text.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

/** The bytes of `0x`-prefixed lowercase hex, or `undefined` for anything else. */
export const bytesFromHash = (text: string): Uint8Array | undefined =>
  text.startsWith("0x") ? bytesFromHex(text.slice(2)) : undefined;

/** Bare lowercase hex of `bytes`. */
export const hexFromBytes = (bytes: Uint8Array): string =>
  Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");

/** `bytes` as `0x`-prefixed lowercase hex, the evidence's spelling. */
export const hashFromBytes = (bytes: Uint8Array): Hash32 =>
  `0x${hexFromBytes(bytes)}`;
