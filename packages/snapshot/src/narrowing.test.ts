import {
  type Hash32,
  type RoundId,
  type Snapshot,
  snapshotSchema,
  type StepConfig,
} from "@intraverse/se-client-contracts";
import { snapshotVectors } from "@intraverse/se-client-contracts/testing";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  isPlaybackPresentation,
  isStepsPresentation,
  type RetryableErrorCode,
  type ValidPlayProblem,
  type ValidSnapshot,
  validatePlayProblem,
  validateSnapshot,
} from "./index.ts";
import { accepted } from "./test/results.ts";

const inputOf = (name: string): unknown =>
  (snapshotVectors.valid[name] as { readonly input: unknown }).input;

const snapshotOf = (name: string): ValidSnapshot =>
  accepted(validateSnapshot(inputOf(name)));

const problemOf = (name: string): ValidPlayProblem =>
  accepted(validatePlayProblem(inputOf(name)));

/** What a renderer reads per status; the switch must cover all seven. */
const describeStatus = (snapshot: ValidSnapshot): string => {
  switch (snapshot.status) {
    case "idle": {
      expectTypeOf(snapshot.roundId).toEqualTypeOf<undefined>();
      expectTypeOf(snapshot.proofs).toEqualTypeOf<undefined>();
      expectTypeOf(snapshot.payout).toEqualTypeOf<undefined>();
      return "idle";
    }
    case "starting": {
      expectTypeOf(snapshot.roundId).toEqualTypeOf<RoundId>();
      expectTypeOf(snapshot.step).toEqualTypeOf<undefined>();
      expectTypeOf(snapshot.payout).toEqualTypeOf<undefined>();
      return `starting ${snapshot.roundId}`;
    }
    case "active":
    case "resolving": {
      expectTypeOf(snapshot.closeReason).toEqualTypeOf<undefined>();
      expectTypeOf(snapshot.payout).toEqualTypeOf<undefined>();
      return `${snapshot.status} ${snapshot.proofs.randomnessProof.roundSecretHash}`;
    }
    case "won":
    case "lost": {
      expectTypeOf(
        snapshot.proofs.randomnessProof.roundSecret,
      ).toEqualTypeOf<Hash32>();
      // The schema allows `payout` here (optional, so it may be absent).
      expectTypeOf(snapshot.payout).toEqualTypeOf<Snapshot["payout"]>();
      return `${snapshot.status} ${snapshot.proofs.randomnessProof.roundSecret}`;
    }
    case "canceled": {
      expectTypeOf(snapshot.payout).toEqualTypeOf<undefined>();
      return `canceled ${snapshot.roundId}`;
    }
    default: {
      expectTypeOf(snapshot).toBeNever();
      return "unreachable";
    }
  }
};

const revealedSecret = (snapshot: ValidSnapshot): Hash32 | undefined => {
  if (snapshot.status !== "won") {
    return undefined;
  }
  return snapshot.proofs.randomnessProof.roundSecret;
};

const stepCount = (snapshot: ValidSnapshot): number | undefined => {
  if (!isStepsPresentation(snapshot)) {
    return undefined;
  }
  expectTypeOf(snapshot.config).toEqualTypeOf<StepConfig>();
  return snapshot.config.steps.length;
};

const bookModel = (snapshot: ValidSnapshot): string | undefined => {
  if (!isPlaybackPresentation(snapshot)) {
    return undefined;
  }
  expectTypeOf(snapshot.model).toEqualTypeOf<"book">();
  expectTypeOf(snapshot.config.kind).toEqualTypeOf<"book">();
  return snapshot.config.kind;
};

/** The schema of the Snapshot a ROUND_ACTIVE error carries. */
const resumable = (problem: ValidPlayProblem): string | undefined => {
  if (problem.code !== "ROUND_ACTIVE") {
    expectTypeOf(problem.snapshot).toEqualTypeOf<undefined>();
    return undefined;
  }
  return problem.snapshot.schema;
};

const retryableOf = (problem: ValidPlayProblem): boolean => {
  switch (problem.code) {
    case "ENTROPY_UNAVAILABLE": {
      expectTypeOf(problem.retryable).toEqualTypeOf<true>();
      return problem.retryable;
    }
    case "INSUFFICIENT_FUNDS":
    case "ROUND_ACTIVE": {
      expectTypeOf(problem.retryable).toEqualTypeOf<false>();
      return problem.retryable;
    }
    case "UNAVAILABLE": {
      expectTypeOf(problem.retryable).toEqualTypeOf<boolean>();
      return problem.retryable;
    }
    default: {
      return problem.retryable;
    }
  }
};

describe("narrowing by status", () => {
  it.each(
    Object.keys(snapshotVectors.valid).filter(
      name => !/^(?:amount-request|problem)-/u.test(name),
    ),
  )("narrows valid/%s", name => {
    const snapshot = snapshotOf(name);
    expect(describeStatus(snapshot).startsWith(snapshot.status)).toBe(true);
  });

  it("reads the revealed secret of a won round", () => {
    expect(revealedSecret(snapshotOf("coinflip-won"))).toMatch(
      /^0x[0-9a-f]{64}$/u,
    );
    expect(revealedSecret(snapshotOf("coinflip-active"))).toBeUndefined();
  });
});

describe("narrowing by presentation", () => {
  it("narrows a steps Snapshot to its StepConfig", () => {
    const snapshot = snapshotOf("cashorcrash-active-row2");
    expect(isStepsPresentation(snapshot)).toBe(true);
    expect(isPlaybackPresentation(snapshot)).toBe(false);
    expect(stepCount(snapshot)).toBe(3);
  });

  it("narrows a playback Snapshot to a book round", () => {
    const snapshot = snapshotOf("book-playback-won-placeholder");
    expect(isPlaybackPresentation(snapshot)).toBe(true);
    expect(isStepsPresentation(snapshot)).toBe(false);
    expect(bookModel(snapshot)).toBe("book");
  });
});

describe("narrowing the typed error", () => {
  it("gives ROUND_ACTIVE its validated Snapshot", () => {
    expect(resumable(problemOf("problem-round-active"))).toBe("se.snapshot/1");
    expect(resumable(problemOf("problem-insufficient-funds"))).toBeUndefined();
  });

  it("types retryable from the code", () => {
    expect(retryableOf(problemOf("problem-entropy-unavailable"))).toBe(true);
    expect(retryableOf(problemOf("problem-insufficient-funds"))).toBe(false);
    expect(retryableOf(problemOf("problem-round-active"))).toBe(false);
    expect(retryableOf(problemOf("problem-default-code-unavailable"))).toBe(
      true,
    );
    expect(retryableOf(problemOf("problem-redeem-unavailable"))).toBe(false);
  });
});

/** The retryable codes, spelled once more so the test can compare them. */
const RETRYABLE_CODES = [
  "ENTROPY_UNAVAILABLE",
  "FUNDING_UNCONFIRMED",
  "LANE_LIMIT",
  "PREPARATION_TIMEOUT",
  "ROUND_VOIDED",
  "UNAVAILABLE",
] as const satisfies readonly RetryableErrorCode[];

/** Follows a path of object keys and array indexes through unknown data. */
const pathIn = (data: unknown, path: readonly (string | number)[]): unknown =>
  path.reduce<unknown>(
    (node, key) =>
      typeof node === "object" && node !== null
        ? (node as Record<string | number, unknown>)[key]
        : undefined,
    data,
  );

describe("RetryableErrorCode", () => {
  it("covers the whole union with the tuple", () => {
    expectTypeOf<RetryableErrorCode>().toEqualTypeOf<
      (typeof RETRYABLE_CODES)[number]
    >();
  });

  it("matches the schema's retryable codes", () => {
    const fromSchema = pathIn(snapshotSchema, [
      "$defs",
      "PlayProblem",
      "allOf",
      0,
      "if",
      "properties",
      "code",
      "enum",
    ]);
    expect(Array.isArray(fromSchema)).toBe(true);
    expect([...(fromSchema as unknown[])].map(String).toSorted()).toEqual([
      ...RETRYABLE_CODES,
    ]);
  });
});
