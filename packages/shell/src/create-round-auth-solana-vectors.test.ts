import { describe, expect, it } from "vitest";

import {
  checkCreateRoundAuth,
  checkReady,
  type CheckReason,
} from "./create-round-auth.ts";
import {
  configFor,
  ROUND_DOMAIN,
  ROUND_REQUEST,
  ROUND_SIGNER,
  vendoredRound,
} from "./fixtures/round-auth.ts";
import { createdOf } from "./fixtures/round-edits.ts";
import { record, validated, vectorInput } from "./fixtures/vectors.ts";

const PINNED = { ...ROUND_DOMAIN, signer: ROUND_SIGNER };

const ROUNDS = [
  {
    vector: "coinflip-won-solana",
    slot: 381_000_100,
    readyHash:
      "0x5d900ad791b5f499f41ec30c1f289ab53adad52a460770c7108be3d3c72e2fb8",
  },
  {
    vector: "coinflip-won-solana-skipped-slot",
    slot: 381_000_200,
    readyHash:
      "0xa70b58a5a5e5fde9b9b642cb591c89815ef93b857d6cbd39873f3332927f47f0",
  },
] as const;

const refusedAs = (reason: CheckReason): unknown => ({
  status: "refused",
  reason,
});

describe.each(ROUNDS)(
  "the vendored Solana round $vector",
  ({ vector, slot, readyHash }) => {
    const snapshot = (): ReturnType<typeof validated> =>
      validated(vectorInput("valid", vector));

    it("names the solana source, cluster 101, and its slot", () => {
      const { proofs } = snapshot();
      expect(proofs?.randomnessProof.source).toBe("solana");
      expect(proofs?.randomnessProof.blockNumber).toBe(slot);
      expect(proofs?.createRoundAuth?.entropyChainId).toBe(101);
    });

    it("passes checks 1 to 4 under a solana source on cluster 101", () => {
      const check = checkCreateRoundAuth(
        configFor(PINNED, { solana: 101 }),
        ROUND_REQUEST,
        snapshot(),
      );
      expect(check.status).toBe("passed");
    });

    it("is refused under another registry signer", () => {
      expect(
        checkCreateRoundAuth(
          configFor(
            { ...PINNED, signer: `0x${"ab".repeat(20)}` },
            { solana: 101 },
          ),
          ROUND_REQUEST,
          snapshot(),
        ),
      ).toEqual(refusedAs("pinned-mismatch"));
    });

    it("settles T_0 as the readyHash the e2e harness lays over its active round", () => {
      const issued = record(vectorInput("valid", vector)["proofs"], vector);
      const active = vendoredRound(parts => {
        parts.input["roundId"] = vectorInput("valid", vector)["roundId"];
        parts.randomnessProof["source"] = "solana";
        parts.randomnessProof["blockNumber"] = slot;
        parts.proofs["createRoundAuth"] = issued["createRoundAuth"];
        parts.fairnessProof["readyHash"] = readyHash;
      });
      const auth = checkCreateRoundAuth(
        configFor(PINNED, { solana: 101 }),
        ROUND_REQUEST,
        active,
      );
      expect(checkReady(createdOf(auth), active)).toEqual({
        status: "settled",
        initial: readyHash,
      });
    });
  },
);
