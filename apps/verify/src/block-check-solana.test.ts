import { describe, expect, it } from "vitest";

import { checkBlock } from "./block-check.ts";
import { fake } from "./chain-read-fake.ts";
import { accepted, environmentDocument } from "./fixtures/environment.ts";
import {
  configFor,
  evidenceOf,
  ROUND_ID,
  RPC_URLS,
  signatureVector,
  validSnapshot,
} from "./fixtures/rounds.ts";
import type { RoundEvidence } from "./round-evidence.ts";
import { waitsForEnd } from "./round-report.ts";
import { verifyRound } from "./verify-round.ts";

const solanaSources = accepted(
  environmentDocument({
    rpcEndpoints: {
      solana: RPC_URLS.map((url, i) => ({ provider: `p${String(i)}`, url })),
    },
    entropyChainKind: { solana: "solana" },
    entropyChainId: { solana: 101 },
    tipLagMargin: { solana: 64 },
  }),
).sources;

const config = configFor(signatureVector("create-round-auth-accept").pinned, {
  sources: solanaSources,
});

const solanaEvidence = async (status: string): Promise<RoundEvidence> => {
  const snapshot = validSnapshot("coinflip-active-ready-hash");
  snapshot["status"] = status;
  const evidence = await evidenceOf(snapshot);
  if (evidence.randomnessProof === undefined) {
    throw new TypeError("the snapshot carries no randomness proof");
  }
  return {
    ...evidence,
    randomnessProof: { ...evidence.randomnessProof, source: "solana" },
  };
};

const answering = () =>
  fake(Object.fromEntries(RPC_URLS.map(url => [url, {}])));

describe("check 6 of a solana source, before the Solana reader", () => {
  it("asks no endpoint and could not be verified, with why", async () => {
    const f = answering();
    const { result, agreed } = await checkBlock(
      f.deps,
      config,
      await solanaEvidence("active"),
    );
    expect(f.requests).toEqual([]);
    expect(agreed).toBeUndefined();
    expect(result).toEqual({
      id: 6,
      title: "Block N",
      status: "unverified",
      comparisons: [],
      note: "This page cannot read a Solana entropy chain yet; no endpoint was asked.",
      details: [],
      chainFailure: "unsupported-chain-kind",
    });
  });

  it("does not wait for the end of a round still running", async () => {
    const f = answering();
    const { result } = await checkBlock(
      f.deps,
      config,
      await solanaEvidence("active"),
    );
    expect(waitsForEnd(result)).toEqual(result);
  });

  it("never lets an ended round pass, and check 7 never matches", async () => {
    const f = answering();
    const report = await verifyRound(
      f.deps,
      config,
      await solanaEvidence("won"),
      ROUND_ID,
    );
    expect(f.requests).toEqual([]);
    expect(report.verdict.kind).not.toBe("matches");
    expect(report.checks.find(c => c.id === 6)?.status).toBe("unverified");
    expect(report.checks.find(c => c.id === 7)?.status).not.toBe("matches");
  });
});
