// T-4b's start resend (W-22, W-36; decided in human review, 2026-10-19): a
// start whose round may exist although its answer was lost (no response, a 503
// `UNAVAILABLE` whatever its `retryable`, a bare 503, or a 500 `INTERNAL`) is
// sent once more, right away, with the same key and body, and its answer is
// read as a first answer would be. Any other failure is thrown as it was, with
// one send, and a page that lost the signer lock before the resend sends nothing
// more. A `ROUND_ACTIVE` answer to the resend and a session that ended before
// it, through the session, are in play-session-play.test.ts. Scripted Play
// API, fake locks, no clock.

import {
  NetworkError,
  ProblemError,
  ProtocolError,
} from "@intraverse/se-client-play-client";
import { describe, expect, it, vi } from "vitest";

import { ShellError } from "./errors.ts";
import { createFakeLockManager, flush } from "./fixtures/fake-locks.ts";
import { lost, ok, problem, type Responder } from "./fixtures/fake-play.ts";
import { bodyOf, type FlowSetup, setUpFlow } from "./fixtures/round-flow.ts";
import { SESSION_ID } from "./fixtures/session.ts";
import type { RoundFlow } from "./round-flow.ts";
import { startRoundFlow } from "./round-start.ts";

/** The class a thrown error is expected to be. */
type ErrorClass = abstract new (...args: never[]) => Error;

/** A 503 or a 500 with no problem body: a `ProtocolError`. */
const bare =
  (status: number): Responder =>
  request => {
    throw new ProtocolError(request, status, "unexpected response");
  };

/** Starts the set-up round with `answers` queued for `start`. */
const startWith = (
  setup: FlowSetup,
  ...answers: Responder[]
): Promise<RoundFlow> => {
  setup.play.answer("startRound", ...answers);
  return startRoundFlow(setup.options, setup.hooks);
};

/** The bodies of the `start` calls sent, in order. */
const startBodies = (setup: FlowSetup): readonly unknown[] =>
  setup.play.sent("startRound").map(request => bodyOf(request));

const MAY_BE_STORED: readonly (readonly [string, Responder])[] = [
  ["no response", lost],
  [
    "a 503 UNAVAILABLE marked retryable: true",
    problem(503, "UNAVAILABLE", true),
  ],
  ["a 503 UNAVAILABLE marked retryable: false", problem(503, "UNAVAILABLE")],
  ["a bare 503", bare(503)],
  ["a 500 INTERNAL", problem(500, "INTERNAL")],
];

describe("a start whose round may exist is sent once more (W-22, W-36)", () => {
  it.each(MAY_BE_STORED)(
    "after %s: the same key and body, and one flow for the stored round",
    async (_name, first) => {
      const setup = await setUpFlow();
      const onFlow = vi.fn<(flow: RoundFlow) => void>();
      setup.play.answer("startRound", first, ok(setup.issued.snapshot));
      const flow = await startRoundFlow(
        { ...setup.options, onFlow },
        setup.hooks,
      );
      const bodies = startBodies(setup);
      expect(bodies).toHaveLength(2);
      expect(bodies[1]).toEqual(bodies[0]);
      expect(bodies[0]).toMatchObject({
        idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      });
      expect(onFlow).toHaveBeenCalledTimes(1);
      expect(onFlow).toHaveBeenCalledWith(flow);
      expect(flow.roundId).toBe(setup.issued.snapshot.roundId);
      expect(flow.latest()).toEqual(setup.issued.snapshot);
      expect(flow.verdict()).toEqual({
        state: "ready",
        initial: setup.issued.initial,
      });
    },
  );

  it.each<readonly [string, Responder, Responder, ErrorClass, object]>([
    [
      "no response, then a 503",
      lost,
      problem(503, "UNAVAILABLE", true),
      ProblemError,
      { problem: { status: 503, code: "UNAVAILABLE" } },
    ],
    [
      "a 500 INTERNAL, then no response",
      problem(500, "INTERNAL"),
      lost,
      NetworkError,
      {},
    ],
    [
      "a bare 503, then a ROUND_ACTIVE",
      bare(503),
      problem(409, "ROUND_ACTIVE"),
      ProblemError,
      { problem: { status: 409, code: "ROUND_ACTIVE" } },
    ],
  ])(
    "after %s: the resend's failure is thrown, and nothing is sent a third time",
    async (_name, first, second, kind, shape) => {
      const setup = await setUpFlow();
      const onFlow = vi.fn<(flow: RoundFlow) => void>();
      setup.play.answer("startRound", first, second);
      const thrown = await startRoundFlow(
        { ...setup.options, onFlow },
        setup.hooks,
      ).catch((error: unknown) => error);
      expect(thrown).toBeInstanceOf(kind);
      expect(thrown).toMatchObject(shape);
      expect(setup.play.sent("startRound")).toHaveLength(2);
      expect(onFlow).not.toHaveBeenCalled();
    },
  );

  it("checks the lock again: a page that lost it before the resend sends nothing more", async () => {
    const locks = createFakeLockManager();
    const setup = await setUpFlow({ session: { locks } });
    const onFlow = vi.fn<(flow: RoundFlow) => void>();
    // The first answer is lost, and the lock is taken while it is on its way.
    const lostWithTheLock: Responder = async request => {
      locks.steal(`se:signer:${SESSION_ID}`);
      await flush();
      return lost(request);
    };
    setup.play.answer("startRound", lostWithTheLock, ok(setup.issued.snapshot));
    await expect(
      startRoundFlow({ ...setup.options, onFlow }, setup.hooks),
    ).rejects.toMatchObject({ code: "lock-not-held" });
    expect(setup.play.sent("startRound")).toHaveLength(1);
    expect(onFlow).not.toHaveBeenCalled();
  });

  it("holds an ended round answered to the resend as a first answer would be", async () => {
    const first = await setUpFlow();
    const ended = first.closed("won", 1);
    const today = await startWith(first, ok(ended));
    const setup = await setUpFlow();
    const flow = await startWith(setup, lost, ok(setup.closed("won", 1)));
    expect(setup.play.sent("startRound")).toHaveLength(2);
    expect(flow.latest()).toEqual(ended);
    expect(flow.over()).toBe(today.over());
    expect(flow.verdict()).toEqual(today.verdict());
    expect(flow.phase()).toBe(today.phase());
    expect(flow.evidence()).toEqual(today.evidence());
  });
});

describe("any other failed start is thrown, with one send", () => {
  it.each<readonly [string, Responder, ErrorClass, object]>([
    [
      "a 500 of another code",
      problem(500, "UNKNOWN"),
      ProblemError,
      { problem: { status: 500, code: "UNKNOWN" } },
    ],
    ["a bare 500", bare(500), ProtocolError, { status: 500 }],
    [
      "a 400",
      problem(400, "INVALID_ARGUMENT"),
      ProblemError,
      { problem: { status: 400 } },
    ],
    [
      "a ROUND_ACTIVE 409",
      problem(409, "ROUND_ACTIVE"),
      ProblemError,
      { problem: { status: 409, code: "ROUND_ACTIVE" } },
    ],
    [
      "a CONFLICT 409",
      problem(409, "CONFLICT"),
      ProblemError,
      { problem: { status: 409, code: "CONFLICT" } },
    ],
    [
      "a 422",
      problem(422, "FAILED_PRECONDITION"),
      ProblemError,
      { problem: { status: 422 } },
    ],
    [
      "a 503 FUNDING_UNCONFIRMED (a new key is the player's choice)",
      problem(503, "FUNDING_UNCONFIRMED", true),
      ProblemError,
      { problem: { status: 503, code: "FUNDING_UNCONFIRMED" } },
    ],
    [
      "a 503 ENTROPY_UNAVAILABLE",
      problem(503, "ENTROPY_UNAVAILABLE", true),
      ProblemError,
      { problem: { status: 503, code: "ENTROPY_UNAVAILABLE" } },
    ],
    [
      "an answer that is not a Snapshot of a round",
      ok({ status: "active" }),
      ShellError,
      { code: "snapshot-rejected" },
    ],
  ])("%s", async (_name, first, kind, shape) => {
    const setup = await setUpFlow();
    const thrown = await startWith(setup, first).catch(
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(kind);
    expect(thrown).toMatchObject(shape);
    expect(setup.play.sent("startRound")).toHaveLength(1);
  });
});
