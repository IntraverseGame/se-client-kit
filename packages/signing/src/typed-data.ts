// The `typedData` bytes of a signed move, cash-out, or cancel: the canonical
// Protocol v1 encoding of `ActionTypedData`, which the Play API passes to the
// engine as is. It is the deterministic protobuf wire encoding of five fields,
// written in field-number order. Only an empty path is left out as a default;
// an empty action and a sequence of 0 are refused instead (fail closed: the
// transcript starts at 1 and every action has text):
//
//   1 kind      varint, 1 = action, 2 = cash-out, 3 = cancel (0 is never written)
//   2 action    length-delimited UTF-8, not empty
//   3 path      packed varints, each a `uint8`; a cancel has no path
//   4 sequence  varint, a `uint32` from 1
//   5 previous  length-delimited, exactly 32 bytes
//
// The tags and every byte are pinned by the vendored `typed-data` Snapshot
// vectors (specs/client-kit/the-cryptography.md). The round is not part of it:
// the request names the round.

import { concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { SigningError } from "./errors.ts";
import { type Bytes32, decodeHex } from "./hex.ts";

/** Which signed message the typed data is for. */
export type TypedDataKind = "action" | "cash-out" | "cancel";

/** The fields of `ActionTypedData`: a signed message without its round. */
export type TypedDataFields = {
  readonly kind: TypedDataKind;
  readonly action: string;
  /** Each entry is an integer in 0..255; empty for a cancel. */
  readonly path: readonly number[];
  /** An integer in 1..2^32-1: the transcript starts at 1. */
  readonly sequence: number;
  readonly previous: Bytes32;
};

// The enum values of `kind`. 0 is the unspecified value and is never written.
const KIND_NUMBER: Readonly<Record<TypedDataKind, number>> = {
  action: 1,
  "cash-out": 2,
  cancel: 3,
};

// A tag is `(field number << 3) | wire type`: 0 for a varint, 2 for a
// length-delimited value.
const TAG_KIND = 0x08;
const TAG_ACTION = 0x12;
const TAG_PATH = 0x1a;
const TAG_SEQUENCE = 0x20;
const TAG_PREVIOUS = 0x2a;

const PREVIOUS_LENGTH = 32;
const MAX_UINT8 = 0xff;
const MAX_UINT32 = 0xff_ff_ff_ff;

// With the `u` flag a well-formed surrogate pair is one code point, so this
// matches only a lone surrogate, which UTF-8 cannot encode faithfully.
const LONE_SURROGATE = /\p{Cs}/u;

const invalid = (): SigningError => new SigningError("invalid-input");

const isUint = (value: unknown, max: number): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= max;

/** The base-128 varint of a `uint32`, least significant group first. */
const varint = (value: number): number[] => {
  const out: number[] = [];
  let rest = value;
  while (rest >= 0x80) {
    out.push((rest % 0x80) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  out.push(rest);
  return out;
};

const lengthDelimited = (tag: number, body: Uint8Array): Uint8Array =>
  concatBytes(Uint8Array.of(tag, ...varint(body.length)), body);

const kindNumber = (kind: unknown): number => {
  if (typeof kind !== "string" || !Object.hasOwn(KIND_NUMBER, kind)) {
    throw invalid();
  }
  return KIND_NUMBER[kind as TypedDataKind];
};

const actionBytes = (action: unknown): Uint8Array => {
  if (
    typeof action !== "string" ||
    action === "" ||
    LONE_SURROGATE.test(action)
  ) {
    throw invalid();
  }
  return utf8ToBytes(action);
};

const pathBytes = (path: unknown): Uint8Array => {
  if (!Array.isArray(path)) throw invalid();
  const entries: unknown[] = path;
  const out: number[] = [];
  for (const entry of entries) {
    if (!isUint(entry, MAX_UINT8)) throw invalid();
    out.push(...varint(entry));
  }
  return Uint8Array.from(out);
};

/**
 * The canonical `typedData` bytes of a signed action. Deterministic: the same
 * fields always give the same bytes. Throws `SigningError` `invalid-input` for
 * fields that are not an object, an unknown kind, an action that is empty or
 * not well-formed text, a path entry outside `uint8`, a cancel with a path, a
 * sequence of 0 or outside `uint32`, or a `previous` that is not 32 bytes of
 * hex.
 */
export const encodeTypedData = (fields: TypedDataFields): Uint8Array => {
  const given: unknown = fields;
  if (typeof given !== "object" || given === null) throw invalid();
  const { kind, action, path, sequence, previous } = fields;
  const kindValue = kindNumber(kind);
  const actionValue = actionBytes(action);
  const pathValue = pathBytes(path);
  if (kind === "cancel" && pathValue.length > 0) throw invalid();
  if (!isUint(sequence, MAX_UINT32) || sequence === 0) throw invalid();
  const previousValue = decodeHex(previous, PREVIOUS_LENGTH);

  const parts: Uint8Array[] = [
    Uint8Array.of(TAG_KIND, ...varint(kindValue)),
    lengthDelimited(TAG_ACTION, actionValue),
  ];
  if (pathValue.length > 0) parts.push(lengthDelimited(TAG_PATH, pathValue));
  parts.push(
    Uint8Array.of(TAG_SEQUENCE, ...varint(sequence)),
    lengthDelimited(TAG_PREVIOUS, previousValue),
  );
  return concatBytes(...parts);
};
