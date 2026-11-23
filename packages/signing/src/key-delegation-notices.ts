// The `key-delegation/v1` notices list (RFC-006): the consent texts a wallet
// may sign, each with its hash and status. Its callers take the document from
// `contracts`' runtime entry (`keyDelegationNotices`, of unknown shape, since
// `contracts` holds no logic) and read it here. Choosing a notice by status, or
// looking one up by hash, is the caller's.

import { stringBytes } from "./eip712.ts";
import { SigningError } from "./errors.ts";
import type { Bytes32 } from "./hex.ts";
import { noticeHash } from "./key-delegation.ts";

/** Where a notice stands in the backend's legal review. */
export type NoticeStatus = "pending" | "approved" | "retired";

/** One entry of the notices list, its hash checked against its text. */
export type KeyDelegationNotice = {
  readonly id: string;
  /** The exact text the wallet shows and signs. */
  readonly text: string;
  /** The Keccak-256 of the text's UTF-8 bytes, the list's `keccak256`. */
  readonly noticeHash: Bytes32;
  readonly status: NoticeStatus;
};

const VERSION = 1;
const MAX_TEXT_BYTES = 512;
const ID = /^[a-z0-9-]{1,64}$/u;
const HASH = /^0x[0-9a-f]{64}$/u;
// Control and format characters (the bidi controls, the zero-width marks, the
// byte-order mark among them) and the line and paragraph separators: a wallet
// must show exactly the bytes that are hashed.
const HIDDEN = /[\p{Cc}\p{Cf}\u2028\u2029]/u;
const STATUSES: ReadonlySet<string> = new Set([
  "pending",
  "approved",
  "retired",
]);

const invalid = (): SigningError => new SigningError("invalid-input");

const isNoticeStatus = (value: unknown): value is NoticeStatus =>
  typeof value === "string" && STATUSES.has(value);

const isPlainObject = (
  value: unknown,
): value is Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/** A plain object with exactly `keys`, in any order. */
const exactly = (
  value: unknown,
  keys: readonly string[],
): Readonly<Record<string, unknown>> => {
  if (!isPlainObject(value)) throw invalid();
  const own = Object.keys(value);
  if (
    own.length !== keys.length ||
    !keys.every(key => Object.hasOwn(value, key))
  )
    throw invalid();
  return value;
};

const noticeOf = (value: unknown): KeyDelegationNotice => {
  const entry = exactly(value, ["id", "text", "keccak256", "status"]);
  const { id, text, keccak256, status } = entry;
  if (typeof id !== "string" || !ID.test(id)) throw invalid();
  if (typeof text !== "string") throw invalid();
  // `stringBytes` refuses a lone surrogate.
  const bytes = stringBytes(text).length;
  if (bytes === 0 || bytes > MAX_TEXT_BYTES || HIDDEN.test(text))
    throw invalid();
  if (typeof keccak256 !== "string" || !HASH.test(keccak256)) throw invalid();
  if (keccak256 !== noticeHash(text)) throw invalid();
  if (!isNoticeStatus(status)) throw invalid();
  return Object.freeze({
    id,
    text,
    noticeHash: `0x${keccak256.slice(2)}`,
    status,
  });
};

/**
 * Reads the `key-delegation/v1` notices document: a plain object of exactly
 * `version` (1) and `notices`, each entry exactly `id`, `text`, `keccak256`
 * (the text's hash, lowercase), and `status`, with no `id` and no hash
 * repeated. Returns a frozen array in the list's order; anything else is
 * `invalid-input`, naming no value.
 */
export const readKeyDelegationNotices = (
  value: unknown,
): readonly KeyDelegationNotice[] => {
  const document = exactly(value, ["version", "notices"]);
  if (document["version"] !== VERSION) throw invalid();
  const list = document["notices"];
  if (!Array.isArray(list)) throw invalid();
  const entries: unknown[] = list;
  const notices = entries.map(entry => noticeOf(entry));
  const ids = new Set(notices.map(notice => notice.id));
  const hashes = new Set(notices.map(notice => notice.noticeHash));
  if (ids.size !== notices.length || hashes.size !== notices.length)
    throw invalid();
  return Object.freeze(notices);
};
