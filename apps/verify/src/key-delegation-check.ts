// Check 9 (V-22): the round's key delegation, recomputed with `signing` and
// `contracts`' runtime entry. The notice's text hashes to `noticeHash`; the
// signature over the `KeyDelegation` of `noticeHash`, `actionKey`, `sessionId`
// and `expiry` recovers to `wallet` and is the canonical form; `actionKey` is
// the one the round's signed `newRound` names; `expiry` is after `acceptedAt`;
// and the notice is in the page's own list, looked up by hash, `retired`
// entries included. Hex values compare as bytes (`sameHex`), the times as
// integers, the notice's id and text exactly, as the shell's check does
// (W-72). A value `signing` refuses is a mismatch naming the field, never an
// exception. Pure: no clock, no fetch.

import { keyDelegationNotices } from "@intraverse/se-client-contracts";
import {
  type Address,
  type Bytes32,
  type KeyDelegationNotice,
  noticeHash,
  readKeyDelegationNotices,
  recoverKeyDelegation,
  sameHex,
} from "@intraverse/se-client-signing";

import { type CheckResult, settled } from "./check-result.ts";
import type { Comparison } from "./fairness-checks.ts";
import { MESSAGES as M } from "./messages.ts";
import type {
  KeyDelegationEvidence,
  NewRoundEvidence,
} from "./round-evidence.ts";

let published: readonly KeyDelegationNotice[] | undefined;

/** The page's own list of notices, read once, when first needed. */
export const publishedNotices = (): readonly KeyDelegationNotice[] => {
  published ??= readKeyDelegationNotices(keyDelegationNotices);
  return published;
};

const labelled = (
  name: string,
  recomputed: string | undefined,
  evidence: string,
  matches: boolean,
  labels: Comparison["labels"],
): Comparison => ({ name, recomputed, evidence, matches, labels });

/** Two hex values compared as the bytes they decode to. */
const byBytes = (
  name: string,
  recomputed: string | undefined,
  evidence: string,
  labels: Comparison["labels"],
): Comparison =>
  labelled(
    name,
    recomputed,
    evidence,
    recomputed !== undefined && sameHex(recomputed, evidence),
    labels,
  );

const PUBLISHED = M["delegation.published"];

/** Item 1: the Keccak-256 of the notice's exact UTF-8 bytes. */
const noticeItem = (d: KeyDelegationEvidence): Comparison => {
  let hash: string | undefined;
  try {
    hash = noticeHash(d.notice);
  } catch {
    // A lone surrogate: `signing` refuses the text, so nothing is recomputed.
  }
  return byBytes("noticeHash", hash, d.noticeHash, {
    recomputed: M["delegation.hashOfNotice"],
    evidence: PUBLISHED,
  });
};

/** Item 2: the signer, and the signature in the canonical form it returns. */
const signerItems = (d: KeyDelegationEvidence): readonly Comparison[] => {
  let recovered: { wallet: string; signature: string } | undefined;
  try {
    recovered = recoverKeyDelegation(
      {
        noticeHash: d.noticeHash as Bytes32,
        actionKey: d.actionKey as Address,
        sessionId: d.sessionId as Bytes32,
        expiry: d.expiry,
      },
      d.signature,
    );
  } catch {
    // A `v` `signing` does not take, an `s` or `r` out of range, or a
    // signature that recovers to the zero address: nothing is recovered.
  }
  return [
    byBytes("wallet", recovered?.wallet.toLowerCase(), d.wallet, {
      recomputed: M["delegation.recovered"],
      evidence: PUBLISHED,
    }),
    byBytes("signature", recovered?.signature, d.signature, {
      recomputed: M["delegation.canonical"],
      evidence: PUBLISHED,
    }),
  ];
};

/** Item 5: the notice in the page's list by hash, or `undefined`. */
const listedNotice = (
  d: KeyDelegationEvidence,
  notices: readonly KeyDelegationNotice[],
): KeyDelegationNotice | undefined =>
  notices.find(notice => sameHex(notice.noticeHash, d.noticeHash));

const listItems = (
  d: KeyDelegationEvidence,
  listed: KeyDelegationNotice,
): readonly Comparison[] => {
  const labels = {
    recomputed: M["delegation.list"],
    evidence: PUBLISHED,
  };
  return [
    labelled(
      "noticeId",
      listed.id,
      d.noticeId,
      listed.id === d.noticeId,
      labels,
    ),
    labelled("notice", listed.text, d.notice, listed.text === d.notice, labels),
  ];
};

/**
 * The fields `signing` refused, in item order: the notice for item 1 (nothing
 * is hashed) and the signature for item 2 (nothing is recovered).
 */
const refusedFields = (
  hashed: Comparison,
  signer: readonly Comparison[],
): readonly string[] => [
  ...(hashed.recomputed === undefined ? ["notice"] : []),
  ...(signer.some(c => c.recomputed === undefined) ? ["signature"] : []),
];

/**
 * Check 9 of a config round that carries `delegation`. `newRound` is the
 * round's decoded `newRound`, absent before the round is bound: item 3 then
 * fails on an ended round and waits on one that has not ended (A-2), while the
 * other items still run. `notices` is the page's list (a test passes its own).
 */
export const checkKeyDelegation = (
  delegation: KeyDelegationEvidence,
  newRound: NewRoundEvidence | undefined,
  ended: boolean,
  notices: readonly KeyDelegationNotice[] = publishedNotices(),
): CheckResult => {
  const listed = listedNotice(delegation, notices);
  const unchecked: string[] = [];
  const keyItem: Comparison[] =
    newRound === undefined && !ended
      ? []
      : [
          byBytes("actionKey", newRound?.actionKey, delegation.actionKey, {
            recomputed: M["delegation.newRound"],
            evidence: PUBLISHED,
          }),
        ];
  if (keyItem.length === 0) unchecked.push(M["delegation.waitsItem"]);
  if (listed === undefined) unchecked.push(M["delegation.unlistedItem"]);
  const hashed = noticeItem(delegation);
  const signer = signerItems(delegation);
  const comparisons = [
    hashed,
    ...signer,
    ...keyItem,
    labelled(
      M["delegation.expiryAfter"],
      String(delegation.expiry),
      String(delegation.acceptedAt),
      delegation.expiry > delegation.acceptedAt,
      {
        recomputed: "expiry",
        evidence: `acceptedAt (${M["delegation.asGiven"]})`,
      },
    ),
    ...(listed === undefined ? [] : listItems(delegation, listed)),
  ];
  const refused = refusedFields(hashed, signer);
  // "A value was refused (notice)." or "Values were refused (notice, ...).".
  const refusedNote =
    refused.length === 1
      ? M["delegation.refused"]
      : M["delegation.refusedMany"];
  return settled(9, comparisons, {
    ...(refused.length === 0
      ? {}
      : { note: `${refusedNote} (${refused.join(", ")}).` }),
    delegation: {
      wallet: delegation.wallet,
      notice: delegation.notice,
      noticeId: delegation.noticeId,
      listed: listed?.status ?? "unlisted",
      expiry: delegation.expiry,
      acceptedAt: delegation.acceptedAt,
      unchecked,
    },
  });
};
