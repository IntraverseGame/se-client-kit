// Test-only: a round whose tip check failed, so its cancel is required, and
// the Snapshots the settling tests answer with (W-25, W-35).

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";
import { expect } from "vitest";

import type { RoundFlow } from "../round-flow.ts";
import { ok } from "./fake-play.ts";
import { TIP_FAILED } from "./flow-stand-ins.ts";
import { type FlowSetup, setUpFlow, startFlow } from "./round-flow.ts";
import { OTHER_ROUND_ID } from "./vectors.ts";

/** Starts a round whose tip check failed, so its cancel is required. */
export const cancelRound = async (
  script: (setup: FlowSetup) => void,
): Promise<{ readonly setup: FlowSetup; readonly flow: RoundFlow }> => {
  const setup = await setUpFlow({ tip: TIP_FAILED });
  script(setup);
  return { setup, flow: await startFlow(setup) };
};

export const canceled = (s: FlowSetup): ValidSnapshot =>
  s.closed("canceled", 0);
export const resolving = (s: FlowSetup): ValidSnapshot =>
  s.read(p => (p.input["status"] = "resolving"));
export const otherRound = (s: FlowSetup, status = "active"): ValidSnapshot =>
  s.read(p => {
    p.input["status"] = status;
    p.input["roundId"] = OTHER_ROUND_ID;
  });

/**
 * The round is not over: its latest Snapshot is the one before the cancel
 * (`active`) or a `resolving` read, and the transcript state is still failed,
 * not closed.
 */
export const notOver = (flow: RoundFlow): void => {
  expect(["active", "resolving"]).toContain(flow.latest().status);
  expect(flow.phase()).toBe("failed");
};

/** Sends reads through `refresh` until `count` reads were sent in all. */
export const readUntil = async (
  setup: FlowSetup,
  flow: RoundFlow,
  count: number,
): Promise<void> => {
  if (setup.play.sent("getSnapshot").length >= count) return;
  setup.play.answer("getSnapshot", ok(resolving(setup)));
  await flow.refresh();
  await readUntil(setup, flow, count);
};

/** Lets queued microtasks run until `done` holds (no clock). */
export const until = async (
  done: () => boolean,
  turns = 100,
): Promise<void> => {
  if (done() || turns === 0) return;
  await Promise.resolve();
  await until(done, turns - 1);
};

/** The final outcomes of a cancel (W-25): each is the round's result. */
export const RESULTS: readonly [
  string,
  (s: FlowSetup) => ValidSnapshot,
  string,
][] = [
  ["won", s => s.closed("won", 1), "won"],
  ["lost", s => s.closed("lost", 1), "lost"],
  ["canceled", s => s.closed("canceled", 0), "canceled"],
  [
    "canceled with closeReason expired",
    s => s.closed("canceled", 0, "expired"),
    "canceled",
  ],
];
