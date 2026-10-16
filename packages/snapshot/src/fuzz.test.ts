// Property tests: the validators never throw, on arbitrary JSON and on
// one-change mutations of every vector, and their results are well formed. The
// random source is seeded, so every run checks the same inputs.

import { snapshotVectors } from "@intraverse/se-client-contracts/testing";
import { describe, expect, it } from "vitest";

import {
  type ValidationResult,
  validateAmountRequest,
  validatePlayProblem,
  validateSnapshot,
} from "./index.ts";
import { arbitraryJson, mutateJson, seededRandom } from "./test/arbitrary.ts";

const VALIDATORS = [
  validateSnapshot,
  validatePlayProblem,
  validateAmountRequest,
] as const;

const ITERATIONS = 2000;

const POINTER = /^(?:\/(?:[^~/]|~[01])*)*$/u;

type Tally = { accepted: number; rejected: number };

const tally = (): Tally => ({ accepted: 0, rejected: 0 });

/**
 * Runs every validator, checks the properties every result must have, and
 * counts the outcomes.
 */
const checkAll = (input: unknown, counts: Tally): void => {
  const before = JSON.stringify(input);
  for (const validate of VALIDATORS) {
    let result: ValidationResult<unknown> | undefined;
    expect(() => {
      result = validate(input);
    }).not.toThrow();
    if (result === undefined) {
      throw new Error("the validator returned nothing");
    }
    if (result.ok) {
      counts.accepted += 1;
      expect(result.value).toBe(input);
    } else {
      counts.rejected += 1;
      for (const issue of result.issues) {
        expect(issue.instancePath).toMatch(POINTER);
        expect(issue.schemaPath).toMatch(POINTER);
        // JSON input never reaches the fail-closed paths.
        expect(["unsupported", "evaluation"]).not.toContain(issue.keyword);
      }
    }
    // Deterministic.
    expect(validate(input)).toEqual(result);
  }
  // The input is not modified.
  expect(JSON.stringify(input)).toBe(before);
};

const documents = [
  ...Object.values(snapshotVectors.valid),
  ...Object.values(snapshotVectors.invalid),
].map(file => (file as { readonly input: unknown }).input);

describe("validators on arbitrary input", () => {
  it("never throw on arbitrary JSON values", () => {
    const random = seededRandom(0x5e_ed_00_01);
    const counts = tally();
    for (let index = 0; index < ITERATIONS; index += 1) {
      checkAll(arbitraryJson(random), counts);
    }
    expect(counts.accepted + counts.rejected).toBe(ITERATIONS * 3);
    expect(counts.rejected).toBeGreaterThan(0);
  });

  it("never throw on one-change mutations of the vectors", () => {
    const random = seededRandom(0x5e_ed_00_02);
    const counts = tally();
    for (let index = 0; index < ITERATIONS; index += 1) {
      const document = documents[index % documents.length];
      checkAll(mutateJson(random, document), counts);
    }
    // The mutations reach both outcomes, so they exercise the deep rules.
    expect(counts.accepted).toBeGreaterThan(0);
    expect(counts.rejected).toBeGreaterThan(0);
  });

  it("never throw on chains of mutations of the vectors", () => {
    const random = seededRandom(0x5e_ed_00_03);
    const counts = tally();
    for (let index = 0; index < ITERATIONS / 4; index += 1) {
      let document = documents[index % documents.length];
      for (let step = 0; step < 8; step += 1) {
        document = mutateJson(random, document);
      }
      checkAll(document, counts);
    }
    expect(counts.accepted + counts.rejected).toBe((ITERATIONS / 4) * 3);
  });

  it("never throw on deep or large JSON", () => {
    let deep: unknown = "x";
    for (let index = 0; index < 100_000; index += 1) {
      deep = [deep];
    }
    // Too deep for JSON.stringify, so `checkAll` cannot compare it; the
    // validators only descend where the schema does.
    for (const input of [
      deep,
      { context: { view: { nested: deep } } },
      { roundId: "0".repeat(1_000_000), bet: { suggestedBets: deep } },
    ]) {
      for (const validate of VALIDATORS) {
        expect(validate(input).ok).toBe(false);
      }
    }
    const counts = tally();
    checkAll(JSON.parse('{"__proto__": {"schema": "se.snapshot/1"}}'), counts);
    expect(counts).toEqual({ accepted: 0, rejected: 3 });
  });
});

describe("validators on values that are not JSON", () => {
  const hostile: Record<string, unknown> = {
    undefined,
    "a function": () => 1,
    "a symbol": Symbol("s"),
    "a bigint": 1n,
    "NaN and infinities": {
      version: Number.NaN,
      step: Number.POSITIVE_INFINITY,
    },
    "a throwing getter": Object.defineProperty({}, "schema", {
      enumerable: true,
      get: () => {
        throw new Error("getter");
      },
    }),
    "a throwing proxy": new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error("ownKeys");
        },
      },
    ),
    "a cycle": (() => {
      const cycle: Record<string, unknown> = { schema: "se.snapshot/1" };
      cycle["context"] = cycle;
      return cycle;
    })(),
  };

  it.each(Object.entries(hostile))(
    "rejects %s without throwing",
    (_name, input) => {
      for (const validate of VALIDATORS) {
        let result: ValidationResult<unknown> | undefined;
        expect(() => {
          result = validate(input);
        }).not.toThrow();
        expect(result?.ok).toBe(false);
      }
    },
  );
});
