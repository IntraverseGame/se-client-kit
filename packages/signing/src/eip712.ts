// The fixed-type EIP-712 encoder. It knows only the field types the kit's
// messages use (no nested structs, no arbitrary typed data): `string`,
// `uint8[]`, `bytes32`, `bool`, `address`, and `uintN`. Every value is checked
// against its type before it is encoded; nothing is truncated or coerced.

import { keccak_256 } from "@noble/hashes/sha3.js";
import { concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { SigningError } from "./errors.ts";
import { type Bytes32, decodeHex, encodeHex } from "./hex.ts";

/**
 * A wide unsigned integer field (`uint128`, `uint256`): a `bigint` or a
 * canonical decimal string (no sign, no leading zero), never a `number`.
 */
export type UintValue = bigint | string;

type UintType = "uint8" | "uint32" | "uint40" | "uint128" | "uint256";

export type FieldType =
  | "string"
  | "uint8[]"
  | "bytes32"
  | "bool"
  | "address"
  | UintType;

export type Field = { readonly name: string; readonly type: FieldType };

export type StructType = {
  readonly name: string;
  readonly fields: readonly Field[];
};

const WORD = 32;
const DECIMAL = /^(?:0|[1-9][0-9]*)$/u;
// With the `u` flag a well-formed surrogate pair is one code point, so this
// matches only a lone surrogate, which UTF-8 cannot encode faithfully.
const LONE_SURROGATE = /\p{Cs}/u;

const BITS: Readonly<Record<UintType, number>> = {
  uint8: 8,
  uint32: 32,
  uint40: 40,
  uint128: 128,
  uint256: 256,
};

const invalid = (): SigningError => new SigningError("invalid-input");

// The widest field that takes a JS `number` (a sequence, a window, an index).
// A wider field (an amount, a chain id, an expiry) takes a `bigint` or a
// decimal string only, so an amount is never a `number`.
const MAX_NUMBER_BITS = 40;

const toBigInt = (value: unknown, bits: number): bigint => {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && DECIMAL.test(value)) return BigInt(value);
  if (
    typeof value === "number" &&
    bits <= MAX_NUMBER_BITS &&
    Number.isSafeInteger(value)
  ) {
    return BigInt(value);
  }
  throw invalid();
};

const uintWord = (value: unknown, bits: number): Uint8Array => {
  const n = toBigInt(value, bits);
  if (n < 0n || n >= 1n << BigInt(bits)) throw invalid();
  const word = new Uint8Array(WORD);
  let rest = n;
  for (let i = WORD - 1; i >= 0 && rest > 0n; i -= 1) {
    word[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return word;
};

const stringBytes = (value: unknown): Uint8Array => {
  if (typeof value !== "string" || LONE_SURROGATE.test(value)) throw invalid();
  return utf8ToBytes(value);
};

const uint8ArrayHash = (value: unknown): Uint8Array => {
  if (!Array.isArray(value)) throw invalid();
  const items: unknown[] = value;
  // A number field here is a small index, never an amount.
  for (const item of items) {
    if (typeof item !== "number") throw invalid();
  }
  return keccak_256(concatBytes(...items.map(item => uintWord(item, 8))));
};

const encodeField = (type: FieldType, value: unknown): Uint8Array => {
  switch (type) {
    case "string":
      return keccak_256(stringBytes(value));
    case "uint8[]":
      return uint8ArrayHash(value);
    case "bytes32":
      return decodeHex(value, WORD);
    case "bool":
      if (typeof value !== "boolean") throw invalid();
      return uintWord(value ? 1n : 0n, 8);
    case "address": {
      const word = new Uint8Array(WORD);
      word.set(decodeHex(value, 20), WORD - 20);
      return word;
    }
    default:
      // The remaining types are the unsigned integers.
      return uintWord(value, BITS[type]);
  }
};

/**
 * `Name(type1 name1,type2 name2,...)`, the EIP-712 `encodeType` of a struct
 * without nested structs.
 */
export const encodeType = (struct: StructType): string =>
  `${struct.name}(${struct.fields.map(f => `${f.type} ${f.name}`).join(",")})`;

/** `keccak256(encodeType(struct))`. */
export const typeHash = (struct: StructType): Bytes32 =>
  encodeHex(keccak_256(utf8ToBytes(encodeType(struct))));

/**
 * `hashStruct(s) = keccak256(typeHash ‖ encodeData(s))`. Every field of the
 * type must be present in `values`; a field not of the type is refused.
 */
export const hashStructBytes = (
  struct: StructType,
  values: Readonly<Record<string, unknown>>,
): Uint8Array => {
  const names = new Set(struct.fields.map(f => f.name));
  for (const key of Object.keys(values)) {
    if (!names.has(key)) throw invalid();
  }
  const words = struct.fields.map(field => {
    if (!Object.hasOwn(values, field.name)) throw invalid();
    return encodeField(field.type, values[field.name]);
  });
  return keccak_256(
    concatBytes(keccak_256(utf8ToBytes(encodeType(struct))), ...words),
  );
};

export const hashStruct = (
  struct: StructType,
  values: Readonly<Record<string, unknown>>,
): Bytes32 => encodeHex(hashStructBytes(struct, values));

/** The EIP-712 digest `keccak256(0x1901 ‖ domainSeparator ‖ structHash)`. */
export const typedDataDigest = (
  domainSeparator: Bytes32,
  structHash: Bytes32,
): Bytes32 =>
  encodeHex(
    keccak_256(
      concatBytes(
        Uint8Array.of(0x19, 0x01),
        decodeHex(domainSeparator, WORD),
        decodeHex(structHash, WORD),
      ),
    ),
  );
