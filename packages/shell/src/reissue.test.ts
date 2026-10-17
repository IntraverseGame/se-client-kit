// W-26's re-issue: a later read whose `proofs.createRoundAuth` differs from
// the round's first, field by field after validation.

import { describe, expect, it } from "vitest";

import { checkCreateRoundAuth } from "./create-round-auth.ts";
import {
  asStarting,
  issueRound,
  type RoundParts,
  ROUND_REQUEST,
  vendoredRound,
} from "./fixtures/round-auth.ts";
import { authOf, HASH } from "./fixtures/round-edits.ts";
import { isReissue } from "./reissue.ts";

describe("isReissue", () => {
  const first = authOf(vendoredRound());

  it("is false for the same object on a later read", () => {
    expect(isReissue(first, vendoredRound())).toBe(false);
  });

  it.each<[string, (parts: RoundParts) => void]>([
    ["expiry", p => (p.auth["expiry"] = "1800000601")],
    ["newRound.playerRef", p => (p.newRound["playerRef"] = HASH)],
    [
      "domain.verifyingContract",
      p =>
        ((p.auth["domain"] as Record<string, unknown>)["verifyingContract"] =
          `0x${"d5".repeat(20)}`),
    ],
  ])("is true when %s differs", (_, edit) => {
    expect(isReissue(first, vendoredRound(edit))).toBe(true);
  });

  it("is true for a second object that passes the checks on its own", () => {
    const issued = issueRound();
    const firstIssued = authOf(issued.snapshot);
    const second = issueRound({
      before: p => (p.auth["expiry"] = "1800000601"),
    });
    expect(
      checkCreateRoundAuth(issued.config, ROUND_REQUEST, second.snapshot)
        .status,
    ).toBe("passed");
    expect(isReissue(firstIssued, second.snapshot)).toBe(true);
    expect(isReissue(firstIssued, issued.snapshot)).toBe(false);
  });

  it("is false for a read that carries none", () => {
    const starting = vendoredRound(p => {
      asStarting(p);
      delete p.input["proofs"];
    });
    expect(isReissue(first, starting)).toBe(false);
  });
});
