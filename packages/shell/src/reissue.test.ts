// W-26's re-issue: a later read whose `proofs.createRoundAuth` differs from
// the round's first, field by field after validation.

import { describe, expect, it } from "vitest";

import {
  asStarting,
  type RoundParts,
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

  it("is false for a read that carries none", () => {
    const starting = vendoredRound(p => {
      asStarting(p);
      delete p.input["proofs"];
    });
    expect(isReissue(first, starting)).toBe(false);
  });
});
