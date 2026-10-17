// T-8: W-26's checks 4 (the signature, `recover-mismatch`) and 5 (the ready
// evidence, `ready-mismatch`, and `missing` for a `readyHash` still absent at
// `active`). Checks 1 to 3 are in create-round-auth.test.ts.

import { describe, expect, it } from "vitest";

import { checkReady } from "./create-round-auth.ts";
import {
  asStarting,
  issueRound,
  type IssueOptions,
  registryKey,
  ROUND_DOMAIN,
  type RoundParts,
} from "./fixtures/round-auth.ts";
import { checked, HASH, highS, refused } from "./fixtures/round-edits.ts";

describe("check 4, signature (recover-mismatch)", () => {
  it.each<[string, (parts: RoundParts) => void]>([
    ["playerRef", p => (p.newRound["playerRef"] = HASH)],
    ["gameId", p => (p.newRound["gameId"] = 2)],
    ["gameVersion", p => (p.newRound["gameVersion"] = 2)],
    ["circuitVersion", p => (p.newRound["circuitVersion"] = 1)],
    ["payoutTermsHash", p => (p.newRound["payoutTermsHash"] = HASH)],
    ["prepareWindow", p => (p.auth["prepareWindow"] = 121)],
    ["expiry", p => (p.auth["expiry"] = "1800000601")],
  ])("refuses a %s changed after signing", (_, after) => {
    expect(checked({ after })).toEqual(refused("recover-mismatch"));
  });

  it("refuses a signature by another key than the pinned signer", () => {
    expect(checked({ signWith: registryKey() })).toEqual(
      refused("recover-mismatch"),
    );
  });

  it("refuses a high-s signature that recovers to the pinned signer", () => {
    const options: IssueOptions = {
      after: p => (p.auth["signature"] = highS(p.auth["signature"])),
    };
    expect(checked(options)).toEqual(refused("recover-mismatch"));
  });

  it("refuses a round signed under another domain than the one it claims", () => {
    // Check 2 passes (the claimed domain is the pinned one); the digest is
    // built with the pinned domain, so the signature recovers to another key.
    const options: IssueOptions = {
      before: p => {
        const domain = p.auth["domain"] as Record<string, unknown>;
        domain["verifyingContract"] = `0x${"d5".repeat(20)}`;
      },
      after: p => {
        const domain = p.auth["domain"] as Record<string, unknown>;
        domain["verifyingContract"] = ROUND_DOMAIN.verifyingContract;
      },
    };
    expect(checked(options)).toEqual(refused("recover-mismatch"));
  });
});

describe("check 5, ready evidence (ready-mismatch)", () => {
  it("refuses a readyHash other than keccak256(abi.encode(created, seedHash))", () => {
    const round = issueRound({
      after: p => (p.fairnessProof["readyHash"] = HASH),
    });
    expect(checkReady(round.created, round.snapshot)).toEqual(
      refused("ready-mismatch"),
    );
  });

  it("refuses a seedHash the readyHash was not computed from", () => {
    const round = issueRound({
      after: p => (p.fairnessProof["seedHash"] = HASH),
    });
    expect(checkReady(round.created, round.snapshot)).toEqual(
      refused("ready-mismatch"),
    );
  });

  it("waits while starting without a readyHash", () => {
    const round = issueRound({
      after: p => {
        asStarting(p);
        delete p.proofs["fairnessProof"];
      },
    });
    expect(checkReady(round.created, round.snapshot)).toEqual({
      status: "waiting",
    });
  });

  it("refuses a readyHash still absent once the round is active (missing)", () => {
    const round = issueRound({
      after: p => delete p.fairnessProof["readyHash"],
    });
    expect(checkReady(round.created, round.snapshot)).toEqual(
      refused("missing"),
    );
  });
});
