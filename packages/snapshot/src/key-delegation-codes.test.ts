// T-51 (specs/wrapper.md, RFC-006 slice S2): the Play API problem codes of a
// refused key delegation are in the synced schema's closed `ErrorCode` list,
// so a problem carrying one validates (W-28). The input is the backend's
// `valid/problem-insufficient-funds` vector (a 422, not retryable, as the
// start answers a bad delegation) with only `code` replaced.

import { snapshotVectors } from "@intraverse/se-client-contracts/testing";
import { describe, expect, it } from "vitest";

import { validatePlayProblem } from "./index.ts";
import { issuesOf, valueOf } from "./test/results.ts";

const problemWith = (code: string): Record<string, unknown> => {
  const file = snapshotVectors.valid["problem-insufficient-funds"] as
    | { readonly input: Record<string, unknown> }
    | undefined;
  if (file === undefined) throw new Error("no problem-insufficient-funds");
  return { ...structuredClone(file.input), code };
};

describe("the key-delegation problem codes", () => {
  it.each([
    "KEY_DELEGATION_INVALID",
    "KEY_DELEGATION_EXPIRED",
    "KEY_DELEGATION_NOTICE_UNKNOWN",
  ])("accept a problem with code %s", code => {
    const problem = problemWith(code);
    const result = validatePlayProblem(problem);
    expect(issuesOf(result)).toEqual([]);
    expect(valueOf(result)).toBe(problem);
  });

  it("still refuse a code outside the closed list, at /code", () => {
    const issues = issuesOf(
      validatePlayProblem(problemWith("KEY_DELEGATION_REVOKED")),
    );
    expect(issues[0]?.instancePath).toBe("/code");
  });
});
