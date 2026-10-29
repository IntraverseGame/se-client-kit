// T-22 (#146, book-playback.md W-54): a book round's status flow, as the
// vendored schema states it. A `playback` Snapshot shows `idle`, `starting`,
// `won`, or `lost`; one at `active`, `resolving`, or `canceled` fails
// validation with its first issue at `/status`. A `steps` round at those
// statuses is untouched. The inputs are the backend's book vectors of one
// round, with only `status` replaced.

import { snapshotVectors } from "@intraverse/se-client-contracts/testing";
import { describe, expect, it } from "vitest";

import { validatePlayProblem, validateSnapshot } from "./index.ts";
import { issuesOf } from "./test/results.ts";

const inputOf = (
  set: "valid" | "invalid",
  name: string,
): Record<string, unknown> => {
  const file = snapshotVectors[set][name] as
    | { readonly input: Record<string, unknown> }
    | undefined;
  if (file === undefined) throw new Error(`no ${set} vector ${name}`);
  return structuredClone(file.input);
};

/** The bound `starting` Snapshot of the backend's book round, at `status`. */
const bookAt = (status: string): Record<string, unknown> => ({
  ...inputOf("valid", "book-lifecycle-starting-bound"),
  status,
});

/** The inputs of every vendored valid `steps` Snapshot at `status`. */
const stepsInputsAt = (status: string): readonly unknown[] =>
  Object.keys(snapshotVectors.valid)
    .map(name => inputOf("valid", name))
    .filter(
      input => input["presentation"] === "steps" && input["status"] === status,
    );

describe("a book round's status flow (W-54)", () => {
  it.each(["active", "resolving", "canceled"])(
    "refuses a book Snapshot at %s, first at /status",
    status => {
      const issues = issuesOf(validateSnapshot(bookAt(status)));
      expect(issues[0]?.instancePath).toBe("/status");
    },
  );

  it.each([
    "book-lifecycle-idle",
    "book-lifecycle-starting-funded",
    "book-lifecycle-starting-bound",
    "book-lifecycle-lost",
  ])("accepts the backend's book round at valid/%s", name => {
    expect(issuesOf(validateSnapshot(inputOf("valid", name)))).toEqual([]);
  });

  it.each(["active", "resolving", "canceled"])(
    "rejects invalid/book-status-%s at /status",
    status => {
      const issues = issuesOf(
        validateSnapshot(inputOf("invalid", `book-status-${status}`)),
      );
      expect(issues[0]?.instancePath).toBe("/status");
    },
  );

  it("refuses a ROUND_ACTIVE problem whose embedded Snapshot is a book round at active", () => {
    const body = inputOf("valid", "problem-round-active");
    expect(issuesOf(validatePlayProblem(body))).toEqual([]);
    const issues = issuesOf(
      validatePlayProblem({ ...body, snapshot: bookAt("active") }),
    );
    expect(issues[0]?.instancePath).toBe("/snapshot/status");
  });

  it.each(["active", "resolving", "canceled"])(
    "leaves a steps round at %s to the steps rules",
    status => {
      const inputs = stepsInputsAt(status);
      expect(inputs.length).toBeGreaterThan(0);
      for (const input of inputs) {
        expect(issuesOf(validateSnapshot(input))).toEqual([]);
      }
    },
  );
});
