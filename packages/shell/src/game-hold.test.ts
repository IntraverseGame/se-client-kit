// T-26 (W-38): the hold's rule, `givenToGame`, over stand-in rounds, and
// `show` handing the bridge only what the rule gives. The session-level
// behavior is play-session-hold.test.ts's and play-session-hold-rounds.test.ts's.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";
import { describe, expect, it } from "vitest";

import type { ControllerBridge } from "./controller-bridge.ts";
import { OTHER_ROUND_ID, snapshot } from "./fixtures/vectors.ts";
import { givenToGame } from "./game-hold.ts";
import { createSessionReads } from "./session-reads.ts";
import type { FlowVerdict, SessionRound } from "./session-round.ts";
import type { SnapshotReader } from "./snapshot-read.ts";

/** An absent value, read without writing `undefined` (no-useless-undefined). */
const NONE: { readonly value?: never } = {};

/** A stand-in round of the vendored `active` Snapshot's round. */
const standIn = (
  verdict: FlowVerdict["state"],
  phase: ReturnType<SessionRound["phase"]> = "open",
): SessionRound =>
  ({
    roundId: snapshot("active").roundId,
    verdict: () =>
      verdict === "failed"
        ? { state: "failed", shown: "verification-failed" }
        : { state: verdict },
    phase: () => phase,
    latest: () => snapshot("active"),
    staleRead: () => NONE.value,
    lastError: () => NONE.value,
    cancel: () => "none",
    observe: () => Promise.resolve(),
  }) as unknown as SessionRound;

const active = snapshot("active");

describe("the hold's rule, givenToGame (T-26)", () => {
  it.each([
    ["ready, in sync", standIn("ready"), true],
    ["ready, adopted", standIn("ready", "adopted"), true],
    ["ready, unopened (no signer lock)", standIn("ready", "unopened"), true],
    [
      "checking (a tip check that gave no decision)",
      standIn("checking"),
      false,
    ],
    ["failed", standIn("failed", "failed"), false],
    ["ready, out of sync", standIn("ready", "out-of-sync"), false],
    ["no round held", NONE.value, false],
  ] as const)("an active Snapshot of the round, %s: %s", (_, flow, given) => {
    expect(givenToGame(active, flow)).toBe(given);
  });

  it("holds an active Snapshot of another round, even when the held one is ready", () => {
    const other = snapshot("active", { roundId: OTHER_ROUND_ID });
    expect(givenToGame(other, standIn("ready"))).toBe(false);
  });

  it.each([
    "idle",
    "starting",
    "resolving",
    "won",
    "lost",
    "canceled",
  ] as const)("gives a %s Snapshot whatever the verdict", status => {
    expect(givenToGame(snapshot(status), standIn("checking"))).toBe(true);
    expect(givenToGame(snapshot(status), NONE.value)).toBe(true);
  });

  it("show holds a checking round's active Snapshot from the bridge, and gives it once ready", async () => {
    const sent: ValidSnapshot[] = [];
    const bridge = {
      sendSnapshot: (given: ValidSnapshot) => {
        sent.push(given);
      },
    } as unknown as ControllerBridge;
    let flow = standIn("checking");
    const reads = createSessionReads({
      reader: {
        read: () => Promise.resolve({ kind: "network" }),
        latest: () => NONE.value,
      } as SnapshotReader,
      current: () => flow,
      bridge: () => bridge,
      ended: () => false,
      onChange: () => {},
    });
    await reads.see(active);
    expect(sent).toEqual([]);
    flow = standIn("ready");
    await reads.see(active);
    expect(sent).toEqual([active]);
  });
});
