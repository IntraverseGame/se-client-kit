// base58 as Solana writes a 32-byte value (a block's `blockhash`, a genesis
// hash): Bitcoin's alphabet, written here because the kit takes no Solana or
// base58 library (RFC-007 section 5, ADR-013, ADR-001). Only the page decodes;
// the shell compares genesis hashes as strings.

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** The lengths of the base58 text of any 32 bytes. */
const MIN_LENGTH = 32;
const MAX_LENGTH = 44;
const BYTES = 32;

/**
 * Whether `text` has the shape of a 32-byte value in base58: a string of 32 to
 * 44 characters, every one from the alphabet. It does not decode it.
 */
export const isBase58Text = (text: unknown): text is string =>
  typeof text === "string" &&
  text.length >= MIN_LENGTH &&
  text.length <= MAX_LENGTH &&
  [...text].every(character => ALPHABET.includes(character));

/**
 * The 32 bytes `text` encodes, or `undefined`, never throwing. The text is
 * refused before any arithmetic unless it is 32 to 44 characters, all from the
 * alphabet; each leading `1` is one zero byte and the rest is a base-58
 * integer, written big-endian with no leading zero byte; anything that is not
 * exactly 32 bytes is refused. The encoding of 32 bytes is then unique, so
 * equal texts and equal bytes are the same test.
 */
export const decodeBase58Bytes32 = (text: unknown): Uint8Array | undefined => {
  if (!isBase58Text(text)) return undefined;
  let zeros = 0;
  while (zeros < text.length && text[zeros] === "1") zeros += 1;
  let value = 0n;
  for (const character of text.slice(zeros)) {
    value = value * 58n + BigInt(ALPHABET.indexOf(character));
  }
  const digits: number[] = [];
  for (; value > 0n; value /= 256n) digits.push(Number(value % 256n));
  if (zeros + digits.length !== BYTES) return undefined;
  const bytes = new Uint8Array(BYTES);
  bytes.set(digits.toReversed(), zeros);
  return bytes;
};
