// T-5 (specs/wrapper.md): every `valid/` vector validates and every `invalid/`
// vector fails at its `failsAt` pointer. Every `signature/` vector is a valid
// Snapshot; its verdict belongs to the shell's W-26 checks, not to this
// package. The vectors come from the contracts package's test-only entry, as
// copied from the backend; they are never regenerated from this code.

import { snapshotVectors } from "@intraverse/se-client-contracts/testing";
import { describe, expect, it } from "vitest";

import {
  type ValidationResult,
  validateAmountRequest,
  validatePlayProblem,
  validateSnapshot,
} from "./index.ts";
import { issuesOf, valueOf } from "./test/results.ts";

type Vector = {
  readonly vector: string;
  readonly definition: "Snapshot" | "PlayProblem" | "AmountRequest";
  readonly expected: "valid" | "invalid";
  readonly failsAt?: string;
  readonly input: unknown;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Reads a vector file, failing loudly on a shape this runner does not know. */
const readVector = (name: string, file: unknown): Vector => {
  if (
    !isRecord(file) ||
    typeof file["vector"] !== "string" ||
    !["Snapshot", "PlayProblem", "AmountRequest"].includes(
      String(file["definition"]),
    ) ||
    !["valid", "invalid"].includes(String(file["expected"])) ||
    !Object.hasOwn(file, "input") ||
    (file["failsAt"] !== undefined && typeof file["failsAt"] !== "string")
  ) {
    throw new Error(`vector ${name}: unknown vector file shape`);
  }
  return file as Vector;
};

const validators: Record<
  Vector["definition"],
  (input: unknown) => ValidationResult<unknown>
> = {
  Snapshot: validateSnapshot,
  PlayProblem: validatePlayProblem,
  AmountRequest: validateAmountRequest,
};

const run = (vector: Vector): ValidationResult<unknown> =>
  validators[vector.definition](vector.input);

const valid = Object.entries(snapshotVectors.valid).map(([name, file]) => ({
  name,
  vector: readVector(name, file),
}));
const invalid = Object.entries(snapshotVectors.invalid).map(([name, file]) => ({
  name,
  vector: readVector(name, file),
}));

const signature = Object.entries(snapshotVectors.signature).map(
  ([name, file]) => ({ name, vector: readVector(name, file) }),
);

describe("Snapshot vectors", () => {
  it("has vectors in every set", () => {
    expect(valid.length).toBeGreaterThan(0);
    expect(invalid.length).toBeGreaterThan(0);
    expect(signature.length).toBeGreaterThan(0);
  });

  it("files every vector under the set its expectation names", () => {
    expect(valid.every(v => v.vector.expected === "valid")).toBe(true);
    expect(invalid.every(v => v.vector.expected === "invalid")).toBe(true);
    expect(invalid.every(v => typeof v.vector.failsAt === "string")).toBe(true);
    expect(signature.every(v => v.vector.expected === "valid")).toBe(true);
  });

  it.each(valid)("accepts valid/$name", ({ vector }) => {
    const result = run(vector);
    expect(issuesOf(result)).toEqual([]);
    expect(valueOf(result)).toBe(vector.input);
  });

  it.each(invalid)("rejects invalid/$name at its failsAt", ({ vector }) => {
    const issues = issuesOf(run(vector));
    // The first failure, which the Wrapper logs (W-28), is the vector's.
    expect(issues[0]?.instancePath).toBe(vector.failsAt);
    expect(issues.map(issue => issue.keyword)).not.toContain("unsupported");
  });

  it.each(signature)("accepts signature/$name as a Snapshot", ({ vector }) => {
    expect(vector.definition).toBe("Snapshot");
    const result = run(vector);
    expect(issuesOf(result)).toEqual([]);
    expect(valueOf(result)).toBe(vector.input);
  });

  it("includes the pattern-trailing-newline case", () => {
    expect(invalid.map(v => v.name)).toContain("pattern-trailing-newline");
  });
});
