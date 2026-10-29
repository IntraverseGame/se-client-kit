// T-22 (#146, W-54): a book round shows exactly `idle`, `starting`, `won`, and
// `lost`. The vendored schema refuses a `playback` Snapshot at `active`,
// `resolving`, or `canceled`, so the `snapshot` validator does, with its first
// issue at `/status`, and the shell, which validates every Snapshot with it,
// refuses one as failing validation (W-28) on every path a Snapshot reaches
// it: a read, an action's answer, and a typed error's embedded Snapshot. The
// shell has no book-status rule of its own.

import { snapshotVectors } from "@intraverse/se-client-contracts/testing";
import { ProblemError } from "@intraverse/se-client-play-client";
import {
  validatePlayProblem,
  validateSnapshot,
} from "@intraverse/se-client-snapshot";
import { describe, expect, it } from "vitest";

import { bookInput } from "./fixtures/book.ts";
import { createFakePlay, ok } from "./fixtures/fake-play.ts";
import { snapshot, vectorInput } from "./fixtures/vectors.ts";
import { roundSnapshotOf, snapshotOf } from "./round-request.ts";
import { createSnapshotReader, snapshotReadOfError } from "./snapshot-read.ts";

/** Every vendored valid Snapshot vector of a book round. */
const bookNames = Object.keys(snapshotVectors.valid).filter(
  name => vectorInput("valid", name)["presentation"] === "playback",
);

/** A book round's input at `status`, from the `starting` fixture's round. */
const bookAt = (status: string): Record<string, unknown> => ({
  ...bookInput("starting"),
  status,
});

/** The first issue's location of a rejection; none for an acceptance. */
const firstIssueAt = (
  result:
    | ReturnType<typeof validateSnapshot>
    | ReturnType<typeof validatePlayProblem>,
): string | undefined =>
  result.ok ? undefined : result.issues[0].instancePath;

describe("the book status flow, from the validator (W-54)", () => {
  it.each(["active", "resolving", "canceled"])(
    "the validator refuses a book Snapshot at %s, naming /status",
    status => {
      expect(firstIssueAt(validateSnapshot(bookAt(status)))).toBe("/status");
    },
  );

  it.each(["idle", "starting", "won", "lost"] as const)(
    "accepts a book Snapshot at %s",
    status => {
      expect(() => snapshotOf(bookInput(status))).not.toThrow();
    },
  );

  it("takes every vendored valid book vector", () => {
    expect(bookNames.length).toBeGreaterThanOrEqual(7);
    for (const name of bookNames) {
      expect(() => snapshotOf(vectorInput("valid", name))).not.toThrow();
    }
  });

  it("leaves a steps round at active, resolving, and canceled alone", () => {
    for (const status of ["active", "resolving", "canceled"] as const) {
      expect(() => snapshotOf(snapshot(status))).not.toThrow();
    }
  });

  it("the validator refuses a typed error whose embedded Snapshot is a book round at active", () => {
    const body = vectorInput("valid", "problem-round-active");
    expect(validatePlayProblem(body).ok).toBe(true);
    const result = validatePlayProblem({ ...body, snapshot: bookAt("active") });
    expect(firstIssueAt(result)).toBe("/snapshot/status");
  });
});

describe("on every path a Snapshot reaches the shell", () => {
  it("a read of a book round at resolving is rejected (W-28)", async () => {
    const play = createFakePlay();
    play.answer("getSnapshot", ok(bookAt("resolving")));
    const reader = createSnapshotReader({
      transport: play.transport,
      authorization: () => "Bearer t",
    });
    expect(await reader.read()).toEqual({ kind: "rejected" });
    expect(reader.latest()).toBeUndefined();
  });

  it("an action's answer that is a book round at canceled is snapshot-rejected", () => {
    const rejected = "the response is not a valid Snapshot of the round";
    expect(() => snapshotOf(bookAt("canceled"))).toThrow(rejected);
    expect(() => roundSnapshotOf(bookAt("active"))).toThrow(rejected);
  });

  it("a ROUND_ACTIVE problem embedding a book round at active is rejected", () => {
    const body = {
      ...vectorInput("valid", "problem-round-active"),
      snapshot: bookAt("active"),
    };
    const error = new ProblemError(
      { method: "POST", path: "/rounds:start" },
      { status: 409, code: "ROUND_ACTIVE", retryable: false },
      body,
    );
    expect(snapshotReadOfError(error)).toEqual({ kind: "rejected" });
  });
});
