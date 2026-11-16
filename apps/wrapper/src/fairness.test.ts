// T-30, the fairness chip (W-59, RFC-005 section 3): its words per round kind
// and verdict; "Checked before play" only on a config round whose last verdict
// was `ready` (also after it ended `won`, `lost`, or `canceled`), never on a
// book round or under W-26a's degraded check; a failure ("Not verified")
// wins and stays, after the round ends and through the required cancel's
// states. The popover and the chip in the bar are fairness-view.test.ts's.

import { describe, expect, it } from "vitest";

import { chipOf } from "./fairness.ts";
import { HELD } from "./fixtures/screen.ts";
import { snapshotVector } from "./fixtures/vectors.ts";
import type { CancelState, RoundCheck, SnapshotRead } from "./round-input.ts";
import {
  acceptRead,
  initialState,
  type WrapperState,
} from "./wrapper-state.ts";

const FAILED: RoundCheck = {
  ...HELD,
  verdict: "verification-failed",
  failure: "tip-check",
  tipFailure: "hash-mismatch",
};

/** The state after reads of vectors, each with the shell's `check`. */
const after = (
  reads: readonly (readonly [string, RoundCheck?])[],
  base: Partial<WrapperState> = {},
): WrapperState =>
  reads.reduce<WrapperState>(
    (state, [name, check]) =>
      acceptRead(state, {
        kind: "snapshot",
        snapshot: snapshotVector(name),
        ...(check === undefined ? {} : { check }),
      } as SnapshotRead),
    { ...initialState, blocking: undefined, ...base } as WrapperState,
  );

const kindOf = (state: WrapperState): string | undefined => chipOf(state)?.kind;

describe("the chip's words (T-30, W-59)", () => {
  it("reads How it's checked at idle, and on a round the shell does not hold", () => {
    expect(kindOf(after([["coinflip-idle"]]))).toBe("how");
    expect(kindOf(after([["coinflip-active"]]))).toBe("how");
  });

  it("reads Checking while a config round is checked", () => {
    const checking = { ...HELD, verdict: "checking" } as const;
    expect(kindOf(after([["coinflip-starting", checking]]))).toBe("checking");
    expect(kindOf(after([["coinflip-active", checking]]))).toBe("checking");
  });

  it("reads Checked before play once ready, through resolving and every end", () => {
    for (const name of [
      "coinflip-active",
      "coinflip-resolving",
      "coinflip-won",
      "coinflip-lost",
      "coinflip-canceled",
      "coinflip-canceled-expired-no-action",
    ]) {
      expect(
        kindOf(
          after([
            ["coinflip-active", HELD],
            [name, HELD],
          ]),
        ),
      ).toBe("checked");
    }
  });

  it("reads Checked (dev) under W-26a's degraded check, never Checked before play", () => {
    const state = after([["coinflip-won", HELD]], {
      chainNotIndependent: true,
    });
    expect(kindOf(state)).toBe("dev");
  });

  it("never reads Checked on a book round: Recorded, keyed on the round's kind", () => {
    for (const name of [
      "book-lifecycle-starting-bound",
      "book-lifecycle-won",
      "book-lifecycle-lost",
    ]) {
      expect(kindOf(after([[name, HELD]]))).toBe("recorded");
      expect(kindOf(after([[name, HELD]], { chainNotIndependent: true }))).toBe(
        "recorded",
      );
    }
  });

  it("reads How it's checked, not Checking, on a round that ended before its verdict", () => {
    const checking = { ...HELD, verdict: "checking" } as const;
    expect(kindOf(after([["coinflip-canceled", checking]]))).toBe("how");
  });
});

describe("a failure wins and stays (T-30)", () => {
  const CANCELS: readonly CancelState[] = [
    "in-flight",
    "settling",
    "check-later",
    "sent",
    "ended",
    "not-taken",
  ];

  it("reads Not verified on a failed round, and after it ends", () => {
    for (const name of [
      "coinflip-active",
      "coinflip-won",
      "coinflip-lost",
      "coinflip-canceled",
    ]) {
      expect(
        kindOf(
          after([
            ["coinflip-active", FAILED],
            [name, FAILED],
          ]),
        ),
      ).toBe("not-verified");
    }
  });

  it.each(CANCELS)(
    "never reads Checked before play through the required cancel's %s",
    cancel => {
      const check = { ...FAILED, cancel };
      for (const name of [
        "coinflip-active",
        "coinflip-resolving",
        "coinflip-canceled",
        "coinflip-won",
        "coinflip-idle",
      ]) {
        const state = after([
          ["coinflip-active", FAILED],
          [name, check],
        ]);
        expect(kindOf(state)).not.toBe("checked");
        expect(kindOf(state)).not.toBe("dev");
      }
    },
  );

  it("reads Not verified after the cancel ended the round and an idle read followed", () => {
    const ended = after([
      ["coinflip-active", FAILED],
      ["coinflip-active", { ...FAILED, cancel: "ended" }],
      ["coinflip-idle"],
    ]);
    expect(kindOf(ended)).toBe("not-verified");
  });

  it("reads Not verified on a changed book round (W-52), after it ends too", () => {
    const changed: RoundCheck = {
      ...HELD,
      verdict: "verification-failed",
      failure: "changed",
    };
    expect(kindOf(after([["book-lifecycle-won", changed]]))).toBe(
      "not-verified",
    );
    expect(chipOf(after([["book-lifecycle-won", changed]]))?.failure).toBe(
      "changed",
    );
  });

  it("reads Not verified with the chain's own words on W-26a's could-not-verify", () => {
    const plan = chipOf(
      after([
        [
          "coinflip-active",
          {
            ...HELD,
            verdict: "chain-unverified",
            failure: "tip-check",
            tipFailure: "too-few-answered",
          },
        ],
      ]),
    );
    expect(plan).toMatchObject({ kind: "not-verified", chainUnverified: true });
  });
});
