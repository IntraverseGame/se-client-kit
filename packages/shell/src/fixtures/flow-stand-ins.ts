// Test-only: what a round flow test injects: tip-check decisions, and a
// recording typedData encoder that gives the canonical bytes (`signing`'s
// `encodeTypedData`) and keeps what it was given.

import { type ChainDecision, decideChain } from "../chain-decision.ts";
import type { TipCheckFailure, TipCheckRecord } from "../tip-check.ts";
import {
  canonicalTypedData,
  type EncodableAction,
  type TypedDataEncoder,
} from "../typed-data.ts";

export type { ChainDecision };

const tipRecord = (failure?: TipCheckFailure): TipCheckRecord =>
  Object.freeze({
    source: "ethereum:block",
    passed: failure === undefined,
    ...(failure === undefined ? {} : { failure }),
    tipCheck: "independent",
    tip: 21000100n,
    low: 21000100n,
    tipLagMargin: 2n,
    chainId: 1n,
    answers: Object.freeze([]),
  });

const BIND = { mode: "future", blockNumber: 21000123n } as const;

/** The tip check passed. */
export const TIP_PASSED: ChainDecision = decideChain(tipRecord(), BIND);

/** The endpoints disagreed: the tip check failed. */
export const TIP_FAILED: ChainDecision = decideChain(
  tipRecord("hash-mismatch"),
  BIND,
);

/** The canonical encoder, recording what it was given. */
export const recordingEncoder = (): TypedDataEncoder & {
  readonly calls: () => readonly EncodableAction[];
} => {
  const calls: EncodableAction[] = [];
  const encode = (action: EncodableAction): Uint8Array => {
    calls.push(action);
    return canonicalTypedData(action);
  };
  return Object.assign(encode, { calls: () => calls });
};
