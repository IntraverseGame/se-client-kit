// The Wrapper UI's read-only Snapshot use case (W-28, W-42, W-43): only what
// passed validation reaches the UI, and nothing secret is in what it returns.

import {
  NetworkError,
  ProblemError,
  ProtocolError,
} from "@intraverse/se-client-play-client";
import { describe, expect, it } from "vitest";

import { createFakePlay, lost, ok } from "./fixtures/fake-play.ts";
import { snapshot, vectorInput } from "./fixtures/vectors.ts";
import { REDACTED } from "./redaction.ts";
import {
  createSnapshotReader,
  snapshotReadOf,
  snapshotReadOfError,
} from "./snapshot-read.ts";

const REQUEST = { method: "GET", path: "/play/v1/snapshot" } as const;

const problemError = (body: unknown): ProblemError =>
  new ProblemError(
    REQUEST,
    { status: 422, code: "INSUFFICIENT_FUNDS", retryable: false },
    body,
  );

describe("snapshotReadOf", () => {
  it("passes a valid Snapshot and rejects anything else", () => {
    const active = snapshot("active");
    expect(snapshotReadOf(active)).toEqual({
      kind: "snapshot",
      snapshot: active,
    });
    expect(snapshotReadOf({ status: "active" })).toEqual({ kind: "rejected" });
  });
});

describe("snapshotReadOfError", () => {
  it("gives a typed problem only when its body validates", () => {
    const body = vectorInput("valid", "problem-insufficient-funds");
    expect(snapshotReadOfError(problemError(body))).toEqual({
      kind: "problem",
      problem: body,
    });
    expect(snapshotReadOfError(problemError({ code: "X" }))).toEqual({
      kind: "rejected",
    });
  });

  it("classifies a lost response and a protocol mismatch", () => {
    expect(snapshotReadOfError(new NetworkError(REQUEST, "timeout"))).toEqual({
      kind: "network",
    });
    expect(
      snapshotReadOfError(new ProtocolError(REQUEST, 200, "not JSON")),
    ).toEqual({ kind: "rejected" });
  });

  it("rethrows what is not a Play API client error", () => {
    expect(() => snapshotReadOfError(new TypeError("bug"))).toThrow("bug");
  });
});

describe("createSnapshotReader", () => {
  it("reads the Snapshot, keeps the latest validated one, and prints nothing", async () => {
    const play = createFakePlay();
    const first = snapshot("active", { step: 1 });
    play.answer("getSnapshot", ok(first), ok({ broken: true }), lost);
    const reader = createSnapshotReader({
      transport: play.transport,
      authorization: () => "Bearer placeholder",
    });
    expect(reader.latest()).toBeUndefined();
    expect(await reader.read()).toEqual({ kind: "snapshot", snapshot: first });
    expect(await reader.read()).toEqual({ kind: "rejected" });
    expect(await reader.read()).toEqual({ kind: "network" });
    expect(reader.latest()).toBe(first);
    expect(String(reader)).toBe(REDACTED);
    expect(Object.keys(reader).toSorted()).toEqual(["latest", "read"]);
  });
});
