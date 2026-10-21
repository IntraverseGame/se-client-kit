// The abort signal passes through `verifyRound` and `checkBlock` to the chain
// read (V-5, V-12): an aborted run has no report, so no check is reported
// failed and no round is called unverified.

import { describe, expect, it, vi } from "vitest";

import { fake } from "./chain-read-fake.ts";
import type * as FairnessChecks from "./fairness-checks.ts";
import {
  at,
  configFor,
  evidenceOf,
  ROUND_ID,
  RPC_URLS,
  signatureVector,
  validSnapshot,
} from "./fixtures/rounds.ts";
import { verifyRound } from "./verify-round.ts";

// Runs inside `checkCommitments`, the first await of the recompute; a test sets
// it to abort there. No timer is involved.
const hook = vi.hoisted(() => ({
  onCommitments: undefined as (() => void) | undefined,
}));

vi.mock("./fairness-checks.ts", async importOriginal => {
  const original = await importOriginal<typeof FairnessChecks>();
  return {
    ...original,
    checkCommitments: (
      ...args: Parameters<typeof original.checkCommitments>
    ) => {
      hook.onCommitments?.();
      return original.checkCommitments(...args);
    },
  };
});

const config = configFor(signatureVector("create-round-auth-accept").pinned);
const evidence = () => evidenceOf(validSnapshot("coinflip-active-ready-hash"));

const parked = () =>
  fake(Object.fromEntries(RPC_URLS.map(url => [url, { park: true }])));

describe("verifyRound with an abort signal", () => {
  it("ends the chain requests and rejects with an AbortError", async () => {
    const f = parked();
    const controller = new AbortController();
    const run = verifyRound(
      f.deps,
      config,
      await evidence(),
      ROUND_ID,
      controller.signal,
    );
    expect(f.requests.length).toBeGreaterThan(0);
    expect(f.signals.every(s => s?.aborted === false)).toBe(true);
    controller.abort();
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(f.signals.every(s => s?.aborted === true)).toBe(true);
  });

  it("sends no chain request when the signal is already aborted", async () => {
    const f = parked();
    const controller = new AbortController();
    controller.abort();
    await expect(
      verifyRound(
        f.deps,
        config,
        await evidence(),
        ROUND_ID,
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(f.requests).toHaveLength(0);
  });

  it("rejects when the abort lands during the recompute, with no report", async () => {
    const hash = `0x${"cd".repeat(32)}`;
    const snapshot = validSnapshot("coinflip-active-ready-hash");
    snapshot["status"] = "won";
    at(snapshot, "proofs.randomnessProof")["roundSecret"] = hash;
    at(snapshot, "proofs.fairnessProof")["seed"] = hash;
    const f = fake({});
    const controller = new AbortController();
    let reached = false;
    hook.onCommitments = () => {
      reached = true;
      controller.abort();
    };
    try {
      await expect(
        verifyRound(
          f.deps,
          config,
          await evidenceOf(snapshot),
          ROUND_ID,
          controller.signal,
        ),
      ).rejects.toMatchObject({ name: "AbortError" });
    } finally {
      hook.onCommitments = undefined;
    }
    expect(reached).toBe(true);
  });
});
