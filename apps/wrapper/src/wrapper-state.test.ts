// The UI state's transitions: the Snapshot version rule (W-29), the ended
// round kept until the player acts (W-40), the typed errors' routing (W-42),
// and which blocking states (W-44) later answers may lift.

import { describe, expect, it } from "vitest";

import { snapshotVector, withFields } from "./fixtures/vectors.ts";
import {
  acceptProblem,
  acceptRead,
  acceptSnapshot,
  block,
  clearProblem,
  initialState,
  startNewRound,
  type WrapperState,
} from "./wrapper-state.ts";

const active = snapshotVector("coinflip-active");
const won = snapshotVector("coinflip-won");

const withRound = (): WrapperState => acceptSnapshot(initialState, active);

describe("acceptSnapshot (W-29)", () => {
  it("leaves loading on the first Snapshot", () => {
    const state = withRound();
    expect(state.blocking).toBeUndefined();
    expect(state.snapshot).toBe(active);
  });

  it("ignores a lower version and an equal one", () => {
    const state = acceptSnapshot(withRound(), won);
    expect(acceptSnapshot(state, active)).toBe(state);
    expect(
      acceptSnapshot(state, withFields(active, { version: won.version })),
    ).toBe(state);
  });

  it("clears the connection problem on any answer, also a stale one", () => {
    const offline = acceptRead(acceptSnapshot(withRound(), won), {
      kind: "network",
    });
    expect(offline.connectionProblem).toBe(true);
    expect(acceptSnapshot(offline, active).connectionProblem).toBe(false);
  });

  it("keeps the ended round across later Snapshots (W-40)", () => {
    const ended = acceptSnapshot(withRound(), won);
    expect(ended.endedRound).toEqual({ roundId: won.roundId, status: "won" });
    const later = acceptSnapshot(
      ended,
      withFields(snapshotVector("coinflip-idle"), { version: won.version + 1 }),
    );
    expect(later.endedRound).toEqual(ended.endedRound);
    expect(startNewRound(later).endedRound).toBeUndefined();
  });
});

describe("acceptProblem (W-42)", () => {
  it.each(["SESSION_EXPIRED", "SESSION_REVOKED", "UNAUTHENTICATED"])(
    "%s ends the session",
    code => {
      expect(
        acceptProblem(withRound(), { code, retryable: false }).blocking,
      ).toBe("session-ended");
    },
  );

  it("routes STALE_ACTION to out of sync", () => {
    expect(
      acceptProblem(withRound(), { code: "STALE_ACTION", retryable: false })
        .blocking,
    ).toBe("out-of-sync");
  });

  it("keeps any other code beside the round, and clears it on request", () => {
    const state = acceptProblem(withRound(), {
      code: "INTERNAL",
      retryable: true,
    });
    expect(state.problem?.code).toBe("INTERNAL");
    expect(state.snapshot).toBe(active);
    expect(clearProblem(state).problem).toBeUndefined();
    expect("problem" in clearProblem(state)).toBe(false);
  });
});

describe("blocking states (W-44)", () => {
  it.each(["configuration-error", "session-ended", "other-tab"] as const)(
    "%s is final: no later answer replaces it",
    final => {
      const state = block(withRound(), final);
      expect(acceptSnapshot(state, won)).toBe(state);
      expect(acceptRead(state, { kind: "network" })).toBe(state);
      expect(acceptRead(state, { kind: "rejected" })).toBe(state);
      expect(block(state, "out-of-sync")).toBe(state);
      expect(acceptProblem(state, { code: "INTERNAL", retryable: false })).toBe(
        state,
      );
    },
  );

  it.each(["verification-failed", "out-of-sync"] as const)(
    "%s holds until the round ends or another starts",
    roundState => {
      const state = block(withRound(), roundState);
      const resolving = withFields(snapshotVector("coinflip-resolving"), {
        version: active.version + 1,
      });
      expect(acceptSnapshot(state, resolving).blocking).toBe(roundState);
      expect(acceptSnapshot(state, won).blocking).toBeUndefined();
      expect(startNewRound(state).blocking).toBeUndefined();
    },
  );

  it("lifts a rejected Snapshot with the next valid one", () => {
    const state = acceptRead(withRound(), { kind: "rejected" });
    expect(state.blocking).toBe("snapshot-rejected");
    expect(acceptSnapshot(state, won).blocking).toBeUndefined();
  });
});
