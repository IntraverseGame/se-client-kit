// T-41 (RFC-007 section 3): a Solana source's tip check reuses W-26b's failure
// codes, so the player's labels for its failures are W-48's, unchanged: the
// same "could not verify the chain" and "this round failed verification"
// states, and the same detail per failure. A Solana source never gives
// `hash-unavailable` or `hash-mismatch`.

import { describe, expect, it } from "vitest";

import { failureText } from "./fairness-view.ts";
import type { ChipPlan } from "./fairness.ts";
import { messagesFor } from "./messages.ts";

const m = messagesFor("en").messages;

type TipFailure = NonNullable<ChipPlan["tipFailure"]>;

const labels = (tipFailure: TipFailure): readonly string[] =>
  failureText(m, {
    kind: "not-verified",
    game: "config",
    failure: "tip-check",
    tipFailure,
  });

describe("the labels of a Solana source's tip check failures (W-48)", () => {
  it.each([
    ["chain-id-mismatch", "A chain endpoint is on another chain."],
    ["too-few-answered", "Too few chain endpoints answered."],
    ["chain-id-unavailable", "A chain endpoint gave no chain id."],
    ["lagging", "A chain endpoint is too far behind."],
    ["bind", "The round's randomness block does not fit the chain's tip."],
    ["unknown-source", "No endpoint is set up for the round's chain."],
  ] as const)("labels %s as before", (tipFailure, detail) => {
    expect(labels(tipFailure)).toEqual(["The chain check failed.", detail]);
  });

  it("keeps the two states' texts", () => {
    expect(m["state.chainUnverified"]).toBe("Could not verify the chain");
    expect(m["state.verificationFailed"]).toBe(
      "This round failed verification",
    );
  });
});
