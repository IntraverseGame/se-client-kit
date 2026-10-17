// The round flows' tip check, as the session wires it (W-26, W-26b): the tip
// check over the configuration's endpoints for the round's entropy source,
// through the Wrapper's JSON-RPC transport, decided with the bind rule. `N` is
// the Snapshot's `proofs.randomnessProof.blockNumber`; the bind's mode is the
// session's provisional input (no vendored contract carries it yet).

import type { Clock } from "@intraverse/se-client-play-client";
import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import type { ChainConfig } from "./chain-config.ts";
import {
  type BindMode,
  type ChainDecision,
  decideChain,
} from "./chain-decision.ts";
import { ShellError } from "./errors.ts";
import type { RpcTransport } from "./rpc-transport.ts";
import { runTipCheck } from "./tip-check.ts";

export type SessionTipOptions = {
  readonly config: ChainConfig;
  readonly rpc: RpcTransport;
  readonly clock: Clock;
  readonly bindMode: BindMode;
};

/**
 * The tip check of a round's Snapshot. A Snapshot without
 * `proofs.randomnessProof` is `invalid-input` (the round flow calls it only
 * with one); a rejection leaves the verdict `checking`, so nothing is signed.
 */
export const sessionTipCheck =
  (options: SessionTipOptions) =>
  async (snapshot: ValidSnapshot): Promise<ChainDecision> => {
    const proof = snapshot.proofs?.randomnessProof;
    if (proof === undefined) throw new ShellError("invalid-input");
    const record = await runTipCheck({
      config: options.config,
      source: proof.source,
      transport: options.rpc,
      clock: options.clock,
    });
    return decideChain(record, {
      mode: options.bindMode,
      blockNumber: BigInt(proof.blockNumber),
    });
  };
