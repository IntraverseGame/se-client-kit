// The verify API's `keyDelegation` (`KeyDelegationEvidence` of the vendored
// document, V-22): the player's wallet's signature of the round's action key,
// validated by the readers of `verify-readers.ts`. The expiry and `acceptedAt`
// are times, read as safe integers, never amounts. Pure; check 9
// (`key-delegation-check.ts`) recomputes it.

import type { KeyDelegationEvidence } from "./round-evidence.ts";
import {
  Bad,
  int,
  nested,
  NOTICE_MAX_LENGTH,
  PATTERN,
  type Read,
  shape,
  text,
} from "./verify-readers.ts";

/** The notice: 1 to 512 characters, counted as code points (JSON Schema's). */
const notice = (v: unknown): Read<string> => {
  // A code point is at most two UTF-16 units: a longer text is refused before
  // it is split into code points.
  if (typeof v !== "string" || v.length > 2 * NOTICE_MAX_LENGTH) return Bad;
  const length = [...v].length;
  return length >= 1 && length <= NOTICE_MAX_LENGTH ? v : Bad;
};

/**
 * `KeyDelegationEvidence.domain`'s fields and their readers (closed; held to
 * the document).
 */
export const KEY_DELEGATION_DOMAIN_FIELDS = {
  name: (v: unknown) => text(v, PATTERN.delegationName),
  version: (v: unknown) => text(v, PATTERN.delegationVersion),
};
const domain = nested(s => shape(s, KEY_DELEGATION_DOMAIN_FIELDS));

/**
 * `KeyDelegationEvidence`'s fields and their readers (closed; held to the
 * document).
 */
export const KEY_DELEGATION_FIELDS = {
  wallet: (v: unknown) => text(v, PATTERN.address),
  actionKey: (v: unknown) => text(v, PATTERN.address),
  sessionId: (v: unknown) => text(v, PATTERN.hex32),
  expiry: (v: unknown) => int(v, 1),
  noticeId: (v: unknown) => text(v, PATTERN.noticeId),
  noticeHash: (v: unknown) => text(v, PATTERN.hex32),
  notice,
  signature: (v: unknown) => text(v, PATTERN.signature),
  domain,
  acceptedAt: (v: unknown) => int(v, 1),
};
export const keyDelegation = nested((s): Read<KeyDelegationEvidence> => {
  const read = shape(s, KEY_DELEGATION_FIELDS);
  if (read === Bad) return Bad;
  // The domain is the document's constant: validated, not kept.
  const { domain: _fixed, ...evidence } = read;
  return evidence;
});
