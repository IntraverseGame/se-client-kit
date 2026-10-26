// The few facts the preview specs read from a Snapshot response and the verify
// API's answer (RFC-002): amounts are `bigint`, never `number`; a body that is
// not what is needed reads as `undefined`; and a payout of the Snapshot and the
// verify API agree when the base units and the currency are the same.

import { expect, test } from "../harness/worker-browser.ts";
import {
  payoutsAgree,
  playTokenOf,
  snapshotFacts,
  verificationFacts,
} from "../preview-support/preview-snapshots.ts";

const ROUND = "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d";

test.describe("the facts of a Snapshot", () => {
  test("reads the version, status, round id, and payout as a bigint", () => {
    expect(
      snapshotFacts({
        version: 4,
        status: "won",
        roundId: ROUND,
        payout: {
          value: "194",
          decimals: 2,
          unit: "EUR",
          normalized: 1.94,
          formatted: "€1.94",
        },
      }),
    ).toEqual({
      version: 4,
      status: "won",
      roundId: ROUND,
      payout: { value: 194n, unit: "EUR", formatted: "€1.94" },
    });
  });

  test("keeps an amount above Number.MAX_SAFE_INTEGER exact", () => {
    const value =
      "115792089237316195423570985008687907853269984665640564039457584007913129639935";
    const facts = snapshotFacts({
      version: 1,
      status: "won",
      payout: { value, unit: "EUR", formatted: "x" },
    });
    expect(facts?.payout?.value).toBe(BigInt(value));
    expect(typeof facts?.payout?.value).toBe("bigint");
  });

  test("reads a Snapshot without a round id or a payout", () => {
    expect(snapshotFacts({ version: 1, status: "idle" })).toEqual({
      version: 1,
      status: "idle",
      roundId: undefined,
      payout: undefined,
    });
  });

  test("reads nothing from a body that is not a Snapshot", () => {
    for (const body of [
      null,
      "x",
      [],
      {},
      { version: "1", status: "won" },
      { version: 1.5, status: "won" },
      { version: 1 },
    ]) {
      expect(snapshotFacts(body)).toBeUndefined();
    }
  });

  test("ignores a payout that is malformed", () => {
    for (const payout of [
      { value: 194, unit: "EUR", formatted: "x" },
      { value: "01", unit: "EUR", formatted: "x" },
      { value: "-1", unit: "EUR", formatted: "x" },
      { value: "1", formatted: "x" },
      "194",
    ]) {
      expect(
        snapshotFacts({ version: 1, status: "won", payout })?.payout,
      ).toBeUndefined();
    }
  });
});

test.describe("the facts of a verification", () => {
  test("reads the status and the payout amount as a bigint", () => {
    expect(
      verificationFacts({
        roundId: ROUND,
        status: "won",
        payout: { amount: "194", currency: "EUR", decimals: 2 },
      }),
    ).toEqual({
      roundId: ROUND,
      status: "won",
      payout: { amount: 194n, currency: "EUR" },
    });
  });

  test("reads an answer with no payout, and refuses a malformed one", () => {
    expect(verificationFacts({ roundId: ROUND, status: "active" })).toEqual({
      roundId: ROUND,
      status: "active",
      payout: undefined,
    });
    expect(
      verificationFacts({
        roundId: ROUND,
        status: "won",
        payout: { amount: 1 },
      }),
    ).toBeUndefined();
    expect(verificationFacts({ status: "won" })).toBeUndefined();
    expect(verificationFacts(null)).toBeUndefined();
  });
});

test.describe("the play token", () => {
  test("is read from a redeem answer and from nothing else", () => {
    expect(playTokenOf({ playToken: "pt_x", sessionId: "s" })).toBe("pt_x");
    expect(playTokenOf({ playToken: 1 })).toBeUndefined();
    expect(playTokenOf(null)).toBeUndefined();
  });
});

test.describe("payouts that agree", () => {
  const snapshot = { value: 194n, unit: "EUR", formatted: "€1.94" };

  test("agree on the same base units and currency", () => {
    expect(
      payoutsAgree({
        snapshot,
        verification: { amount: 194n, currency: "EUR" },
      }),
    ).toBe(true);
  });

  test("disagree on another amount or currency", () => {
    expect(
      payoutsAgree({
        snapshot,
        verification: { amount: 195n, currency: "EUR" },
      }),
    ).toBe(false);
    expect(
      payoutsAgree({
        snapshot,
        verification: { amount: 194n, currency: "USD" },
      }),
    ).toBe(false);
  });

  test("count an absent payout as zero on both sides", () => {
    expect(payoutsAgree({ snapshot: undefined, verification: undefined })).toBe(
      true,
    );
    expect(
      payoutsAgree({
        snapshot: { ...snapshot, value: 0n },
        verification: undefined,
      }),
    ).toBe(true);
    expect(
      payoutsAgree({
        snapshot: undefined,
        verification: { amount: 0n, currency: "EUR" },
      }),
    ).toBe(true);
    expect(payoutsAgree({ snapshot, verification: undefined })).toBe(false);
    expect(
      payoutsAgree({
        snapshot: undefined,
        verification: { amount: 1n, currency: "EUR" },
      }),
    ).toBe(false);
  });
});
