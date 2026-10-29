// VT-1b and VT-2 (specs/verify-page.md): checks 5 and 7 of a Coin Flip round,
// built from the fairness kernel's public vectors (the reference block value,
// secret, and seed of `kernel/public/v1/seed`, that secret's commitment from
// `kernel/public/v1/round-secret-hash`, and Coin Flip's (2, 1) at step
// 0 from the n = 2, k = 1 chain of `kernel/public/v1/derive`), each with a
// passing case and its failures; and the kernel version they are keyed on.

import { keccak256 } from "@intraverse/se-client-signing";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type CommitmentEvidence,
  checkCommitments,
  checkSeedAndOutcome,
  type KernelCheck,
  type OutcomeEvidence,
} from "./fairness-checks.ts";
import { expectedSteps, field, vectorsOf } from "./fixtures/kernel-vectors.ts";
import type { Hash32 } from "./hex.ts";

vi.mock("@intraverse/se-client-signing", async importOriginal => {
  const actual = await importOriginal<{
    keccak256: (data: Uint8Array) => Uint8Array;
  }>();
  return {
    ...actual,
    keccak256: vi.fn<(data: Uint8Array) => Uint8Array>(actual.keccak256),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(keccak256).mockClear();
});

const vector = (set: string, id: string) => {
  const found = vectorsOf(set).find(v => v.id === `kernel/public/v1/${id}`);
  if (found === undefined) throw new TypeError(`no vector ${id}`);
  return found;
};

const hash = (hex: string): Hash32 => `0x${hex}`;

const reference = vector("seed", "seed/reference");
const swapped = vector("seed", "seed/swapped");
const BLOCK_VALUE = hash(field(reference.input, "blockValue", reference.id));
const ROUND_SECRET = hash(field(reference.input, "secret", reference.id));
const SEED = hash(field(reference.expected, "seed", reference.id));
const SEED_HASH = hash(field(reference.expected, "seedHash", reference.id));
// The reference secret's commitment, from `kernel/public/v1/round-secret-hash`.
const commitment = vector("round-secret-hash", "round-secret-hash/reference");
if (
  field(commitment.input, "secret", commitment.id) !==
  field(reference.input, "secret", reference.id)
)
  throw new TypeError("the commitment vector names another secret");
const ROUND_SECRET_HASH = hash(
  field(commitment.expected, "roundSecretHash", commitment.id),
);

// Coin Flip's losing index for the reference seed: step 0 of the chain of
// n = 2, k = 1 nodes, from the reference seed.
const chain = vector("derive", "derive/deepest-chain-25");
const LOSING = expectedSteps(chain)[0]?.losers[0] ?? -1;
const WINNING_PICK = 1 - LOSING;

/** Flip the last hex digit of a hash. */
const tamper = (value: Hash32): Hash32 =>
  `${value.slice(0, -1)}${value.endsWith("0") ? "1" : "0"}` as Hash32;

/** The names a check compared, or its kind when it compared nothing. */
const compared = (check: KernelCheck): string[] =>
  check.kind === "recomputed"
    ? check.comparisons.map(c => c.name)
    : [check.kind];

const failed = (check: KernelCheck): string[] =>
  check.kind === "recomputed"
    ? check.comparisons.filter(c => !c.matches).map(c => c.name)
    : [check.kind];

const COMMITMENTS: CommitmentEvidence = {
  roundSecretHash: ROUND_SECRET_HASH,
  roundSecret: ROUND_SECRET,
  seedHash: SEED_HASH,
  seed: SEED,
};

// Coin Flip's terms, a bet, and its payout, from `kernel/public/v1/coin-flip-payout`.
const pays = vector("coin-flip-payout", "coin-flip-payout/b1000000");
const terms = pays.input["terms"] as Record<string, unknown>;
const EUR = { decimals: 2, currency: "EUR" };

const WON: OutcomeEvidence = {
  blockValue: BLOCK_VALUE,
  roundSecret: ROUND_SECRET,
  seed: SEED,
  status: "won",
  selectedIndex: WINNING_PICK,
  losingIndex: LOSING,
  bet: { value: BigInt(field(pays.input, "bet", pays.id)), ...EUR },
  payoutTerms: {
    houseEdgeWad: String(terms["houseEdgeWad"]),
    maxMultiplierMilli: Number(terms["maxMultiplierMilli"]),
  },
  payout: "19400 EUR",
};

describe("the vectors behind the cases", () => {
  it("are the reference seed's, with Coin Flip's (2, 1) at step 0", () => {
    expect(chain.input["seed"]).toBe(SEED.slice(2));
    expect([0, 1]).toContain(LOSING);
  });
});

describe("check 5: commitment and reveal", () => {
  it("matches the reference reveals and their commitments", async () => {
    const check = await checkCommitments(1, COMMITMENTS);
    expect(check).toMatchObject({ kind: "recomputed", matches: true });
    expect(failed(check)).toEqual([]);
  });

  it("fails a roundSecretHash that is not SHA-256(roundSecret)", async () => {
    const check = await checkCommitments(1, {
      ...COMMITMENTS,
      roundSecretHash: tamper(ROUND_SECRET_HASH),
    });
    expect(check).toMatchObject({ kind: "recomputed", matches: false });
    expect(failed(check)).toEqual(["roundSecretHash"]);
  });

  it("fails a seedHash that is not SHA-256(seed), or another seed", async () => {
    const badHash = await checkCommitments(1, {
      ...COMMITMENTS,
      seedHash: tamper(SEED_HASH),
    });
    expect(failed(badHash)).toEqual(["seedHash"]);
    const otherSeed = await checkCommitments(1, {
      ...COMMITMENTS,
      seed: hash(field(swapped.expected, "seed", swapped.id)),
    });
    expect(failed(otherSeed)).toEqual(["seedHash"]);
  });

  it("refuses a reveal that is not 0x-prefixed lowercase hex", async () => {
    const check = await checkCommitments(1, {
      ...COMMITMENTS,
      roundSecret: SEED.toUpperCase().replace("0X", "0x") as Hash32,
    });
    expect(check).toEqual({
      kind: "refused",
      name: "roundSecret",
      error: "not-hex",
    });
  });

  it("refuses a reveal that is not 32 bytes", async () => {
    expect(
      await checkCommitments(1, {
        ...COMMITMENTS,
        seed: SEED.slice(0, -2) as Hash32,
      }),
    ).toEqual({ kind: "refused", name: "seed", error: "seed-length" });
  });
});

describe("check 7: seed and outcome", () => {
  it("matches a won round and a lost round", async () => {
    const won = await checkSeedAndOutcome(1, WON);
    expect(won).toMatchObject({
      kind: "recomputed",
      matches: true,
      values: { seed: SEED, losingIndex: String(LOSING) },
    });
    expect(compared(won)).toEqual(["seed", "losingIndex", "status", "payout"]);
    const lost = await checkSeedAndOutcome(1, {
      ...WON,
      status: "lost",
      selectedIndex: LOSING,
      payout: "0 EUR",
    });
    expect(lost).toMatchObject({ kind: "recomputed", matches: true });
  });

  it("fails a revealed seed that does not follow from the block and the secret", async () => {
    expect(
      failed(await checkSeedAndOutcome(1, { ...WON, seed: tamper(SEED) })),
    ).toEqual(["seed"]);
    // The order matters: the secret first gives another seed.
    const reversed = await checkSeedAndOutcome(1, {
      ...WON,
      blockValue: ROUND_SECRET,
      roundSecret: BLOCK_VALUE,
    });
    expect(failed(reversed)).toContain("seed");
  });

  it("fails a losing index that is not the derived one", async () => {
    const check = await checkSeedAndOutcome(1, {
      ...WON,
      losingIndex: WINNING_PICK,
    });
    expect(failed(check)).toEqual(["losingIndex"]);
  });

  it("fails a status that does not follow from the pick", async () => {
    expect(
      failed(await checkSeedAndOutcome(1, { ...WON, status: "lost" })),
    ).toEqual(["status"]);
    // The payout follows the recomputed outcome (a loss pays 0), not the status.
    expect(
      failed(await checkSeedAndOutcome(1, { ...WON, selectedIndex: LOSING })),
    ).toEqual(["status", "payout"]);
  });

  it.each([2, -1, 0.5, Number.NaN])(
    "fails the status of a pick of %s, outside Coin Flip's [0, 2)",
    async pick => {
      const check = await checkSeedAndOutcome(1, {
        ...WON,
        selectedIndex: pick,
      });
      expect(failed(check)).toEqual(["status", "payout"]);
      expect(check).toMatchObject({
        comparisons: expect.arrayContaining([
          expect.objectContaining({ name: "status", recomputed: undefined }),
        ]),
      });
    },
  );

  it("fails an ended round without its pick or its losing index", async () => {
    const { selectedIndex: _pick, ...noPick } = WON;
    expect(failed(await checkSeedAndOutcome(1, noPick))).toEqual([
      "status",
      "payout",
    ]);
    const { losingIndex: _losing, ...noLosing } = WON;
    expect(failed(await checkSeedAndOutcome(1, noLosing))).toEqual([
      "losingIndex",
    ]);
  });

  it("recomputes a canceled round's seed and losing index, with no status to compare", async () => {
    const { selectedIndex: _pick, losingIndex: _losing, ...rest } = WON;
    const check = await checkSeedAndOutcome(1, { ...rest, status: "canceled" });
    expect(check).toMatchObject({
      kind: "recomputed",
      matches: true,
      values: { seed: SEED, losingIndex: String(LOSING) },
    });
    expect(compared(check)).toEqual(["seed"]);
    const withIndex = await checkSeedAndOutcome(1, {
      ...rest,
      status: "canceled",
      losingIndex: WINNING_PICK,
    });
    expect(failed(withIndex)).toEqual(["losingIndex"]);
  });

  it("refuses a block value that is not 32 bytes", async () => {
    expect(
      await checkSeedAndOutcome(1, {
        ...WON,
        blockValue: BLOCK_VALUE.slice(0, -2) as Hash32,
      }),
    ).toEqual({
      kind: "refused",
      name: "blockValue",
      error: "block-value-length",
    });
  });
});

describe("the kernel version (V-12a)", () => {
  it("runs kernel 1's derivations", async () => {
    const digest = vi.spyOn(crypto.subtle, "digest");
    await checkSeedAndOutcome(1, WON);
    expect(digest).toHaveBeenCalled();
    expect(vi.mocked(keccak256)).toHaveBeenCalled();
  });

  it.each([0, 2, -1, 1.5, Number.NaN])(
    "is not recomputable under kernel version %s, and runs no derivation",
    async version => {
      const digest = vi.spyOn(crypto.subtle, "digest");
      expect(await checkCommitments(version, COMMITMENTS)).toEqual({
        kind: "not-recomputable",
        kernelVersion: version,
      });
      expect(await checkSeedAndOutcome(version, WON)).toEqual({
        kind: "not-recomputable",
        kernelVersion: version,
      });
      expect(digest).not.toHaveBeenCalled();
      expect(vi.mocked(keccak256)).not.toHaveBeenCalled();
    },
  );
});
