// VT-14, Solana rounds end to end (RFC-007 section 4): with an EVM and a Solana
// source in one document, a round of each reads only its own source's
// endpoints with its own kind's calls; and a Solana book round's value carried
// through check 7's seed. The book round is synthetic, its seed computed from
// the fake chain's value: no vendored vector carries a Solana seed.

import { describe, expect, it } from "vitest";

import { checkBlock } from "./block-check.ts";
import { BOOK_ROUND_ID, checkOf } from "./fixtures/book-run.ts";
import { evidenceOf, RPC_URLS, validSnapshot } from "./fixtures/rounds.ts";
import { URLS } from "./fixtures/solana-read.ts";
import {
  both,
  mixedConfig,
  mixedDeps,
  solanaBook,
  solanaEvidence,
} from "./fixtures/solana-round.ts";
import {
  agreeing,
  skipping,
  type SolanaScript,
  solanaFake,
  VALUE_A,
  VALUE_B,
} from "./fixtures/solana-rpc.ts";
import { verifyRound } from "./verify-round.ts";

describe("an evm and a solana source in one document", () => {
  it("reads a solana round from its own endpoints with Solana's calls", async () => {
    const { deps, calls } = mixedDeps();
    const { agreed } = await checkBlock(
      deps,
      mixedConfig,
      await solanaEvidence("won"),
    );
    expect(agreed).toBe(VALUE_A.hex);
    expect(calls.toSorted()).toEqual(
      URLS.flatMap(url => [`${url} getBlock`, `${url} getGenesisHash`]),
    );
  });

  it("reads an evm round from its own endpoints with EVM's calls", async () => {
    const { deps, calls } = mixedDeps();
    const evidence = await evidenceOf(
      validSnapshot("coinflip-active-ready-hash"),
    );
    const { agreed, result } = await checkBlock(deps, mixedConfig, evidence);
    expect(agreed).toBe(VALUE_B.hex);
    expect(result.details?.map(d => d.label)).toEqual([
      "p0: chain id",
      "p0: block hash",
      "p1: chain id",
      "p1: block hash",
    ]);
    expect(calls.toSorted()).toEqual(
      RPC_URLS.flatMap(url => [
        `${url} eth_chainId`,
        `${url} eth_getBlockByNumber`,
      ]),
    );
  });
});

describe("a solana book round through check 7", () => {
  it.each<[string, SolanaScript]>([
    ["a block at N", agreeing(VALUE_A.base58)],
    ["N skipped", skipping(VALUE_A.base58, -32_009)],
  ])(
    "recomputes the seed from the decoded value: %s reaches V-8's book reason",
    async (_name, script) => {
      const f = solanaFake(both(script));
      const report = await verifyRound(
        f.deps,
        mixedConfig,
        await solanaBook(VALUE_A.hex),
        BOOK_ROUND_ID,
      );
      expect(checkOf(report, 6).status).toBe("matches");
      expect(checkOf(report, 7).status).toBe("matches");
      expect(report.verdict).toEqual({
        kind: "not-recomputable",
        reason: "book-draw",
      });
    },
  );

  it("fails check 6 when the chain's value is not the one the seed was made from", async () => {
    const f = solanaFake(both(agreeing(VALUE_B.base58)));
    const report = await verifyRound(
      f.deps,
      mixedConfig,
      await solanaBook(VALUE_A.hex),
      BOOK_ROUND_ID,
    );
    expect(checkOf(report, 6).status).toBe("mismatch");
    expect(report.verdict.kind).toBe("mismatch");
  });
});
