// The Solana tip check's readers of untrusted JSON-RPC results (W-26b; RFC-007
// section 3): a genesis hash and a final slot. Anything that is not exactly
// one is no answer. The shell compares genesis hashes as strings and never
// decodes base58.

// The base58 alphabet (Bitcoin's 58 characters), 32 to 44 of them: the
// lengths of the base58 text of any 32 bytes.
const BASE58_ALPHABET = /^[1-9A-HJ-NP-Za-km-z]+$/u;
const MIN_HASH_LENGTH = 32;
const MAX_HASH_LENGTH = 44;

// Reads a genesis hash from an untrusted `result`: a string of 32 to 44
// characters of the base58 alphabet, kept as it is. Its length is checked
// before its characters, so the work is bounded.
export const readGenesisHash = (value: unknown): string | undefined =>
  typeof value === "string" &&
  value.length >= MIN_HASH_LENGTH &&
  value.length <= MAX_HASH_LENGTH &&
  BASE58_ALPHABET.test(value)
    ? value
    : undefined;

// Reads a final slot from an untrusted `result`: a JSON number that is a
// non-negative safe integer. Anything else (a string, a negative, a fraction,
// a number above 2^53 - 1) is no answer.
export const readSlot = (value: unknown): bigint | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? BigInt(value)
    : undefined;
