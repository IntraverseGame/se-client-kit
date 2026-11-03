// V-3b at the round's verdict: `verifyRound` end to end under `earlierPins`. The
// vector's own pair plays the earlier pair, and a canceled round leaves check 3
// as the only check that can tell the cases apart.

import { describe, expect, it } from "vitest";

import type { VerifyConfig } from "./environment-config.ts";
import {
  at,
  chainDeps,
  configFor,
  configWithEarlier,
  evidenceOf,
  type Pinned,
  ROUND_ID,
  RPC_URLS,
  signatureVector,
  validSnapshot,
} from "./fixtures/rounds.ts";
import type { RoundReport } from "./round-report.ts";
import { verifyRound } from "./verify-round.ts";

const SIGNED = signatureVector("create-round-auth-accept").pinned;
const OTHER: Pinned = {
  chainId: 127,
  verifyingContract: "0xd5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5",
  signer: "0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e",
};
const THIRD_SIGNER: Pinned["signer"] =
  "0x4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f";
const NAMES_CHECK_3 = { kind: "mismatch", failed: [3] };

const canceled = (): Record<string, unknown> => {
  const snapshot = validSnapshot("coinflip-active-ready-hash");
  snapshot["status"] = "canceled";
  return snapshot;
};

const run = async (
  config: VerifyConfig,
  snapshot: unknown = canceled(),
): Promise<RoundReport> =>
  verifyRound(
    chainDeps(
      Object.fromEntries(
        RPC_URLS.map(url => [url, { hash: `0x${"ab".repeat(32)}` }]),
      ),
    ),
    config,
    await evidenceOf(snapshot),
    ROUND_ID,
  );

describe("the verdict under earlierPins", () => {
  it("is the same under an earlier pair as under the current one", async () => {
    const earlier = await run(configWithEarlier(OTHER, [SIGNED]));
    const current = await run(configFor(SIGNED));
    expect(earlier.verdict).toEqual({ kind: "matches" });
    expect(earlier.verdict).toEqual(current.verdict);
  });

  it.each<[string, Pinned, Pinned]>([
    [
      "the current domain with an earlier signer",
      { ...SIGNED, signer: OTHER.signer },
      { ...OTHER, signer: SIGNED.signer },
    ],
    [
      "an earlier domain with the current signer",
      { ...OTHER, signer: SIGNED.signer },
      { ...SIGNED, signer: OTHER.signer },
    ],
  ])(
    "is a mismatch naming check 3 for a validly signed mix of %s",
    async (_, current, earlier) => {
      const report = await run(configWithEarlier(current, [earlier]));
      expect(report.verdict).toEqual(NAMES_CHECK_3);
    },
  );

  it("is a mismatch naming check 3 for a listed pair that recovers to another signer", async () => {
    const snapshot = canceled();
    at(snapshot, "proofs.createRoundAuth")["signer"] = THIRD_SIGNER;
    const listed = { ...SIGNED, signer: THIRD_SIGNER };
    const report = await run(configWithEarlier(OTHER, [listed]), snapshot);
    expect(report.verdict).toEqual(NAMES_CHECK_3);
  });
});
