// Test-only: the round a session's tests start: the vendored `active` round
// issued again for the key a session draws from `recordingRandom(1)` (so
// W-26 passes), and RPC endpoints that all agree on its chain, with `N` at
// the tip. The same round with three steps can cash out.

import { createSigner } from "@intraverse/se-client-signing";
import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import { roundIdBytes32 } from "../bytes32-text.ts";
import type { RpcTransport } from "../rpc-transport.ts";
import { type IssuedRound, issueRound } from "./round-auth.ts";
import { reread } from "./round-edits.ts";
import { THREE_STEPS } from "./round-flow.ts";
import { recordingRandom } from "./seeded.ts";
import { OTHER_ROUND_ID } from "./vectors.ts";

/** The action key a session opened with `recordingRandom(1)` draws. */
export const sessionAddress = (): string =>
  createSigner({ random: recordingRandom(1) }).address.toLowerCase();

export const issued: IssuedRound = issueRound({
  before: p => {
    p.newRound["actionKey"] = sessionAddress();
  },
});

/** Another round (`OTHER_ROUND_ID`) issued for the session's key. */
export const issuedOther: IssuedRound = issueRound({
  before: p => {
    p.newRound["actionKey"] = sessionAddress();
    p.input["roundId"] = OTHER_ROUND_ID;
    p.newRound["roundId"] = roundIdBytes32(OTHER_ROUND_ID);
  },
});

/** The same round with three steps of three options: one that can cash out. */
export const issuedSteps: IssuedRound = issueRound({
  before: p => {
    p.newRound["actionKey"] = sessionAddress();
    (p.input["config"] as Record<string, unknown>)["steps"] =
      structuredClone(THREE_STEPS);
  },
});

/** The three-step round `active` at `step`. */
export const stepsAt = (step: number): ValidSnapshot =>
  reread(issuedSteps.snapshot, p => {
    p.input["step"] = step;
  });

const blockNumber = BigInt(
  issued.snapshot.proofs?.randomnessProof?.blockNumber ?? 0,
);

/**
 * Each endpoint answers its own hash for `N`: the tip check fails with `T_0`
 * settled, so the round's cancel is required (W-26).
 */
export const disagreeingRpc: RpcTransport = (endpoint, call) =>
  Promise.resolve(
    call.method === "eth_chainId"
      ? "0x1"
      : {
          number: `0x${blockNumber.toString(16)}`,
          hash: `0x${(endpoint.provider === "p1" ? "cd" : "ef").repeat(32)}`,
        },
  );

/** Every endpoint agrees on the round's chain, with `N` at the tip. */
export const agreeingRpc: RpcTransport = (_endpoint, call) =>
  Promise.resolve(
    call.method === "eth_chainId"
      ? "0x1"
      : {
          number: `0x${blockNumber.toString(16)}`,
          hash: `0x${"cd".repeat(32)}`,
        },
  );
