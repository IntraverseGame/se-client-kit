// T-40 (RFC-007 section 3): a `solana` source is read, never refused without
// asking an endpoint. When its endpoints are silent the check fails as
// `too-few-answered`, decided "could not verify the chain" under either bind,
// and a round keyed `solana` then requires its cancel once `T_0` is settled;
// an `evm` source beside it is read as before.

import { describe, expect, it } from "vitest";

import { decideChain } from "./chain-decision.ts";
import {
  ENTROPY_CHAIN_ID,
  endpoints,
  SOURCE,
} from "./fixtures/chain-config.ts";
import { runScripted } from "./fixtures/fake-rpc.ts";
import {
  issueSolanaRound,
  runSolanaScripted,
  SILENT_ROUND_ENDPOINTS,
} from "./fixtures/fake-solana-rpc.ts";
import { ROUND_REQUEST } from "./fixtures/round-auth.ts";
import { ROUND_ID } from "./fixtures/vectors.ts";
import { createRoundVerification } from "./round-verification.ts";

const WITH_SOLANA = {
  rpcEndpoints: { [SOURCE]: endpoints(2), solana: endpoints(2) },
  entropyChainKind: { [SOURCE]: "evm", solana: "solana" },
  entropyChainId: { [SOURCE]: ENTROPY_CHAIN_ID, solana: 101 },
  tipLagMargin: { [SOURCE]: 2, solana: 64 },
};

const SCRIPTS = { p1: { final: 100n }, p2: { final: 100n } };

const solanaCheck = () =>
  runSolanaScripted({ scripts: SILENT_ROUND_ENDPOINTS, config: WITH_SOLANA });

describe("the tip check of a solana source whose endpoints are silent", () => {
  it.each(["tip", "future"] as const)(
    "is decided as could not verify the chain under a %s bind",
    async mode => {
      const { result } = await solanaCheck();
      expect(decideChain(result, { mode, blockNumber: 1n })).toEqual({
        verdict: "fail",
        reason: "chain-unverified",
        failure: "too-few-answered",
        record: result,
      });
    },
  );

  it("requires the cancel of a round keyed solana once T_0 is settled (W-26)", async () => {
    // The round is signed for source `solana` on cluster 101, and its
    // configuration pins that source with kind `solana`, so W-26's checks 1
    // to 5 pass on it and only its own tip check fails.
    const round = issueSolanaRound();
    expect(round.config.sources["solana"]?.kind).toBe("solana");
    const verification = createRoundVerification({
      config: round.config,
      roundId: ROUND_ID,
      request: ROUND_REQUEST,
    });
    expect(verification.observe(round.snapshot)).toEqual({ state: "checking" });
    const { result, rpc } = await runSolanaScripted({
      scripts: SILENT_ROUND_ENDPOINTS,
      validated: round.config,
    });
    expect(rpc.calls()).toHaveLength(4);
    expect(
      rpc
        .calls()
        .map(c => `${c.endpoint.provider} ${c.call.method}`)
        .toSorted(),
    ).toEqual([
      "p1 getGenesisHash",
      "p1 getSlot",
      "p2 getGenesisHash",
      "p2 getSlot",
    ]);
    expect(result.failure).toBe("too-few-answered");
    expect(
      verification.observeTip(
        decideChain(result, { mode: "tip", blockNumber: 1n }),
      ),
    ).toEqual({
      state: "failed",
      failure: "tip-check",
      tipFailure: "too-few-answered",
      shown: "chain-unverified",
      initial: round.initial,
      cancel: true,
    });
  });

  it("reads an evm source beside it as before", async () => {
    const { result, rpc } = await runScripted({
      scripts: SCRIPTS,
      config: WITH_SOLANA,
    });
    expect(result.passed).toBe(true);
    expect(rpc.calls().map(c => c.call.method)).toEqual([
      "eth_chainId",
      "eth_chainId",
      "eth_getBlockByNumber",
      "eth_getBlockByNumber",
      "eth_getBlockByNumber",
      "eth_getBlockByNumber",
    ]);
  });
});
