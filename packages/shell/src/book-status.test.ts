// T-22 (#146, W-54): the shell's interim book-status rule. A book round shows
// exactly `idle`, `starting`, `won`, and `lost`; the vendored schema still
// allows `active`, `resolving`, and `canceled` on one, so the shell refuses
// them itself, after the validator, as failing validation at `/status`, on
// every path a Snapshot reaches it: a read, an action's answer, and a typed
// error's embedded Snapshot. No test here relies on
// `valid/book-playback-resolving-placeholder` as a valid book Snapshot.

import { snapshotVectors } from "@intraverse/se-client-contracts/testing";
import { ProblemError } from "@intraverse/se-client-play-client";
import { validateSnapshot } from "@intraverse/se-client-snapshot";
import { describe, expect, it } from "vitest";

import {
  BOOK_STATUS_ISSUE,
  validateSessionProblem,
  validateSessionSnapshot,
} from "./book-status.ts";
import { bookInput } from "./fixtures/book.ts";
import { createFakePlay, ok } from "./fixtures/fake-play.ts";
import { snapshot, vectorInput } from "./fixtures/vectors.ts";
import { roundSnapshotOf, snapshotOf } from "./round-request.ts";
import { createSnapshotReader, snapshotReadOfError } from "./snapshot-read.ts";

const bookNames = Object.keys(snapshotVectors.valid).filter(name =>
  name.startsWith("book-playback-"),
);

/** A book round's input at `status`, from the `starting` fixture's round. */
const bookAt = (status: string): Record<string, unknown> => ({
  ...bookInput("starting"),
  status,
});

describe("the book-status rule (W-54)", () => {
  it.each(["active", "resolving", "canceled"])(
    "refuses a book Snapshot at %s, naming /status, though the vendored schema allows it",
    status => {
      const input = bookAt(status);
      // The validator follows the vendored schema exactly.
      expect(validateSnapshot(input).ok).toBe(true);
      expect(validateSessionSnapshot(input)).toEqual({
        ok: false,
        issues: [BOOK_STATUS_ISSUE],
      });
      expect(BOOK_STATUS_ISSUE.instancePath).toBe("/status");
    },
  );

  it.each(["idle", "starting", "won", "lost"] as const)(
    "accepts a book Snapshot at %s",
    status => {
      expect(validateSessionSnapshot(bookInput(status)).ok).toBe(true);
    },
  );

  it("takes every vendored valid book vector but the resolving placeholder", () => {
    const refused = bookNames.filter(
      name => !validateSessionSnapshot(vectorInput("valid", name)).ok,
    );
    expect(refused).toEqual(["book-playback-resolving-placeholder"]);
  });

  it("leaves a steps round at active, resolving, and canceled alone", () => {
    for (const status of ["active", "resolving", "canceled"] as const) {
      expect(validateSessionSnapshot(snapshot(status)).ok).toBe(true);
    }
  });

  it("keeps the validator's own first issue for a document that fails the schema", () => {
    const input = { ...bookAt("active"), extra: true };
    expect(validateSnapshot(input).ok).toBe(false);
    expect(validateSessionSnapshot(input)).toEqual(validateSnapshot(input));
  });

  it("refuses a typed error whose embedded Snapshot is a book round at active", () => {
    const body = vectorInput("valid", "problem-round-active");
    const steps = validateSessionProblem(body);
    expect(steps.ok).toBe(true);
    const book = { ...body, snapshot: bookAt("active") };
    expect(validateSessionProblem(book)).toEqual({
      ok: false,
      issues: [{ ...BOOK_STATUS_ISSUE, instancePath: "/snapshot/status" }],
    });
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
