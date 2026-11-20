import { describe, expect, it } from "vitest";

import { decideChain } from "./chain-decision.ts";
import {
  ENTROPY_CHAIN_ID,
  endpoints,
  SOURCE,
} from "./fixtures/chain-config.ts";
import {
  createFakeRpc,
  createManualClock,
  runScripted,
} from "./fixtures/fake-rpc.ts";
import { issueRound, ROUND_REQUEST } from "./fixtures/round-auth.ts";
import { ROUND_ID } from "./fixtures/vectors.ts";
import { createRoundVerification } from "./round-verification.ts";
import { runTipCheck } from "./tip-check.ts";

const WITH_SOLANA = {
  rpcEndpoints: { [SOURCE]: endpoints(2), solana: endpoints(2) },
  entropyChainKind: { [SOURCE]: "evm", solana: "solana" },
  entropyChainId: { [SOURCE]: ENTROPY_CHAIN_ID, solana: 101 },
  tipLagMargin: { [SOURCE]: 2, solana: 64 },
};

const SCRIPTS = { p1: { final: 100n }, p2: { final: 100n } };

const solanaCheck = () =>
  runScripted({ scripts: SCRIPTS, source: "solana", config: WITH_SOLANA });

describe("the tip check of a solana source, before the Solana reader", () => {
  it("makes no call and fails closed, recording why", async () => {
    const { result, rpc } = await solanaCheck();
    expect(rpc.calls()).toEqual([]);
    expect(result).toEqual({
      source: "solana",
      passed: false,
      failure: "unsupported-chain-kind",
      tipCheck: "independent",
      tip: null,
      low: null,
      tipLagMargin: 64n,
      chainId: 101n,
      answers: [],
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each(["tip", "future"] as const)(
    "is decided as could not verify the chain under a %s bind",
    async mode => {
      const { result } = await solanaCheck();
      expect(decideChain(result, { mode, blockNumber: 1n })).toEqual({
        verdict: "fail",
        reason: "chain-unverified",
        failure: "unsupported-chain-kind",
        record: result,
      });
    },
  );

  it("requires the cancel of a round keyed solana once T_0 is settled (W-26)", async () => {
    // The round is signed for source `solana` on cluster 101, and its
    // configuration pins that source with kind `solana`, so W-26's checks 1
    // to 5 pass on it and only its own tip check fails.
    const round = issueRound({
      before: p => {
        p.randomnessProof["source"] = "solana";
        p.auth["entropyChainId"] = 101;
      },
      chains: { solana: 101 },
    });
    expect(round.config.sources["solana"]?.kind).toBe("solana");
    const verification = createRoundVerification({
      config: round.config,
      roundId: ROUND_ID,
      request: ROUND_REQUEST,
    });
    expect(verification.observe(round.snapshot)).toEqual({ state: "checking" });
    const rpc = createFakeRpc(SCRIPTS);
    const result = await runTipCheck({
      config: round.config,
      source: "solana",
      transport: rpc.transport,
      clock: createManualClock(),
    });
    expect(rpc.calls()).toEqual([]);
    expect(result.failure).toBe("unsupported-chain-kind");
    expect(
      verification.observeTip(
        decideChain(result, { mode: "tip", blockNumber: 1n }),
      ),
    ).toEqual({
      state: "failed",
      failure: "tip-check",
      tipFailure: "unsupported-chain-kind",
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
