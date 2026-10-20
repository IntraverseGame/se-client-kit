// VT-2 (specs/verify-page.md): ShuffleDraw and StepsDerive against the fairness
// kernel's public vector sets `kernel/public/v1/shuffle-draw`,
// `kernel/public/v1/steps-derive`, and `kernel/public/v1/derive`.

import { describe, expect, it } from "vitest";

import {
  expectedNodes,
  expectedSteps,
  field,
  inputSteps,
  type KernelVector,
  pathSteps,
  vectorsOf,
} from "./fixtures/kernel-vectors.ts";
import { bytesFromHex } from "./hex.ts";
import { KernelError } from "./kernel-error.ts";
import {
  acceptDraw,
  drawLimit,
  shuffleDraw,
  stepsDerive,
} from "./steps-derive.ts";

const seedOf = (hex: string): Uint8Array => {
  const bytes = bytesFromHex(hex);
  if (bytes === undefined) throw new TypeError(`not hex: ${hex}`);
  return bytes;
};

const drawSet = vectorsOf("shuffle-draw");
const stepsSet = vectorsOf("steps-derive");
const deriveSet = vectorsOf("derive");

const errorOf = (call: () => unknown): string | undefined => {
  try {
    call();
  } catch (error) {
    if (error instanceof KernelError) return error.code;
    throw error;
  }
  return undefined;
};

/** A shuffle-draw vector's input, as ShuffleDraw takes it. */
const drawInput = (vector: KernelVector): Parameters<typeof shuffleDraw> => {
  const at = (key: string): string => field(vector.input, key, vector.id);
  return [
    at("label"),
    seedOf(at("seed")),
    BigInt(at("j")),
    BigInt(at("t")),
    BigInt(at("m")),
  ];
};

describe("kernel/public/v1/shuffle-draw", () => {
  it("has the vendored set's 37 vectors, 10 of them errors", () => {
    expect(drawSet).toHaveLength(37);
    expect(drawSet.filter(v => v.error !== undefined)).toHaveLength(10);
  });

  it.each(drawSet.filter(v => v.error === undefined).map(v => [v.id, v]))(
    "%s: the draw and the counter it was accepted at",
    (_, vector) => {
      const { u, ctr } = shuffleDraw(...drawInput(vector));
      expect({ u, ctr }).toEqual({
        u: BigInt(field(vector.expected, "u", vector.id)),
        ctr: vector.expected["acceptedAtCtr"],
      });
    },
  );

  it.each(drawSet.filter(v => v.error !== undefined).map(v => [v.id, v]))(
    "%s: refused with the vector's error",
    (_, vector) => {
      expect(errorOf(() => shuffleDraw(...drawInput(vector)))).toBe(
        vector.error,
      );
    },
  );
});

describe("shuffleDraw", () => {
  const seed = seedOf(
    "b33d4958038d5d1cfad2089458798264866da6b6576e9345a9111ebf4a48ed39",
  );

  it("refuses an m above 2^64 - 1", () => {
    expect(
      errorOf(() => shuffleDraw("steps-v1", seed, 0n, 0n, 1n << 64n)),
    ).toBe("m-out-of-range");
  });

  it("refuses a j or a t that is not a uint256 value", () => {
    for (const [j, t] of [
      [-1n, 0n],
      [0n, -1n],
      [1n << 256n, 0n],
      [0n, 1n << 256n],
    ] as const) {
      expect(() => shuffleDraw("steps-v1", seed, j, t, 3n)).toThrow(RangeError);
    }
  });

  it("gives StepsDerive's draws under the label steps-v1", () => {
    const [step] = stepsDerive(seed, [{ n: 1000, k: 3 }]);
    expect(step?.draws).toEqual(
      [0n, 1n, 2n].map(t => shuffleDraw("steps-v1", seed, 0n, t, 1000n - t).u),
    );
  });
});

describe("kernel/public/v1/steps-derive", () => {
  it("has the vendored set's 24 vectors, 7 of them errors", () => {
    expect(stepsSet).toHaveLength(24);
    expect(stepsSet.filter(v => v.error !== undefined)).toHaveLength(7);
  });

  it.each(stepsSet.filter(v => v.error === undefined).map(v => [v.id, v]))(
    "%s: the losers, the draws, and the accepted counters",
    (_, vector) => {
      const seed = seedOf(field(vector.input, "seed", vector.id));
      const derived = stepsDerive(seed, inputSteps(vector));
      expect(
        derived.map(step => ({
          losers: [...step.losers],
          draws: [...step.draws],
          acceptedAtCtr: [...step.acceptedAtCtr],
        })),
      ).toEqual(expectedSteps(vector));
    },
  );

  it.each(stepsSet.filter(v => v.error !== undefined).map(v => [v.id, v]))(
    "%s: refused with the vector's error",
    (_, vector) => {
      const seed = seedOf(field(vector.input, "seed", vector.id));
      expect(errorOf(() => stepsDerive(seed, inputSteps(vector)))).toBe(
        vector.error,
      );
    },
  );
});

describe("kernel/public/v1/derive", () => {
  it("has the vendored set's 9 vectors", () => {
    expect(deriveSet).toHaveLength(9);
  });

  it.each(deriveSet.map(v => [v.id, v]))(
    "%s: the losers and counters of each step along the path",
    (_, vector) => {
      const seed = seedOf(field(vector.input, "seed", vector.id));
      const { nodes, steps } = pathSteps(vector);
      expect(nodes).toEqual(expectedNodes(vector));
      const expected = expectedSteps(vector).map(step => ({
        losers: step.losers,
        acceptedAtCtr: step.acceptedAtCtr,
      }));
      const derived = stepsDerive(seed, steps);
      expect(
        derived.map(step => ({
          losers: [...step.losers],
          acceptedAtCtr: [...step.acceptedAtCtr],
        })),
      ).toEqual(expected);
      // Step j depends only on (seed, j, n_j, k_j): the path's prefix up to j
      // derives the same step j.
      steps.forEach((_step, j) => {
        expect(stepsDerive(seed, steps.slice(0, j + 1))[j]).toEqual(derived[j]);
      });
    },
  );
});

describe("stepsDerive", () => {
  const seed = seedOf(
    "b33d4958038d5d1cfad2089458798264866da6b6576e9345a9111ebf4a48ed39",
  );

  it("refuses an n or a k that is not a whole number", () => {
    for (const n of [Number.NaN, 2.5, Infinity, -1]) {
      expect(errorOf(() => stepsDerive(seed, [{ n, k: 0 }]))).toBe(
        "n-out-of-range",
      );
    }
    for (const k of [Number.NaN, 0.5, -1]) {
      expect(errorOf(() => stepsDerive(seed, [{ n: 2, k }]))).toBe(
        "k-out-of-range",
      );
    }
  });

  it("leaves the seed unchanged", () => {
    const copy = Uint8Array.from(seed);
    stepsDerive(copy, [{ n: 4, k: 2 }]);
    expect(copy).toEqual(seed);
  });
});

// ShuffleDraw's rejection rule, which `kernel/public/v1/shuffle-draw` states
// (limit = 2^256 - (2^256 mod m)). Every vendored vector accepts at counter 0,
// so no vector exercises a rejection: these cases do.
describe("the draw limit", () => {
  const TWO_256 = 1n << 256n;

  it("is 2^256 when m divides 2^256 (m = 1, m = 2^32)", () => {
    expect(drawLimit(1n)).toBe(TWO_256);
    expect(drawLimit(1n << 32n)).toBe(TWO_256);
  });

  it("is 2^256 - 1 for m = 3, the remainder of 2^256 by 3 being 1", () => {
    expect(drawLimit(3n)).toBe(TWO_256 - 1n);
  });

  it("rejects a hash at or above the limit and accepts one below it", () => {
    expect(acceptDraw(TWO_256 - 1n, 3n)).toBeUndefined();
    expect(acceptDraw(TWO_256 - 2n, 3n)).toBe((TWO_256 - 2n) % 3n);
    expect(acceptDraw(TWO_256 - 1n, 1n << 32n)).toBe((1n << 32n) - 1n);
    expect(acceptDraw(0n, 1n)).toBe(0n);
  });
});
