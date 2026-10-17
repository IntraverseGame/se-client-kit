// The `typedData` field of a signed move, cash-out, or cancel: the canonical
// Protocol v1 encoding of the action's typed data (`ActionTypedData`), sent in
// base64 and passed to the engine unread (the Play API document's
// `RoundActionRequest`). The bytes are `signing`'s `encodeTypedData`, pinned
// by the vendored `typed-data` vectors; this module adapts a signed message to
// it, base64-encodes the bytes, and keeps the Play API document's limits.
//
// The encoder is a seam only for tests: the round flow uses
// `canonicalTypedData` unless a test passes another one through its test hooks
// (a fail-closed test passes one that changes the message it was given). The
// session never passes one, and no public type can carry one.

import {
  encodeTypedData,
  type PlayerMessage,
} from "@intraverse/se-client-signing";

import { ShellError } from "./errors.ts";
import type { PendingKind } from "./snapshot-reading.ts";

/** What the typedData encoder is given: the message, and which type it is. */
export type EncodableAction = {
  /**
   * `action` is `PlayerAction`, `cash-out` `PlayerCashOut`, `cancel`
   * `PlayerCancel`.
   */
  readonly kind: PendingKind;
  readonly message: PlayerMessage;
};

/**
 * The typedData encoder: the canonical bytes of an action's typed data. It must
 * be deterministic and must not keep or log what it is given. A throw refuses
 * the action, and nothing is signed for it.
 */
export type TypedDataEncoder = (action: EncodableAction) => Uint8Array;

/**
 * The canonical encoder: `signing`'s `encodeTypedData` over the message's
 * fields (the round is not part of the encoding; the request names it).
 */
export const canonicalTypedData: TypedDataEncoder = ({ kind, message }) =>
  encodeTypedData({
    kind,
    action: message.action,
    path: message.path,
    sequence: message.sequence,
    previous: message.previous,
  });

/**
 * Test-only seams of the round flows, passed as a separate argument of the
 * internal constructors (`startRoundFlow`, `createRoundFlow`,
 * `createRoundDelivery`), never through an options type: no public type names
 * them, and the session (`openPlaySession`) passes none, so production always
 * uses the canonical encoding.
 */
export type FlowTestHooks = {
  /** Another typedData encoder (a fail-closed test changes the message). */
  readonly encodeTypedData?: TypedDataEncoder;
};

/** The encoder the flow uses: the canonical one unless a test passes one. */
export const encoderOf = (hooks: FlowTestHooks = {}): TypedDataEncoder =>
  hooks.encodeTypedData ?? canonicalTypedData;

/** The Play API document's `typedData` limit, in base64 characters. */
const MAX_TYPED_DATA = 4096;

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const sextet = (value: number): string => ALPHABET.charAt(value & 0x3f);

/** RFC 4648 base64, with padding. */
export const toBase64 = (bytes: Uint8Array): string => {
  let text = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const word = (a << 16) | (b << 8) | c;
    text += sextet(word >> 18) + sextet(word >> 12);
    text += i + 1 < bytes.length ? sextet(word >> 6) : "=";
    text += i + 2 < bytes.length ? sextet(word) : "=";
  }
  return text;
};

/**
 * The `typedData` text of `action`: the encoder's bytes in base64. Throws
 * `invalid-input` when the encoder returns no bytes, or more than the Play API
 * document admits.
 */
export const typedDataOf = (
  encode: TypedDataEncoder,
  action: EncodableAction,
): string => {
  const bytes = encode(action);
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
    throw new ShellError("invalid-input");
  }
  const text = toBase64(bytes);
  if (text.length > MAX_TYPED_DATA) throw new ShellError("invalid-input");
  return text;
};
