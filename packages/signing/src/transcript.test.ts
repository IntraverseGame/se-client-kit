// The transcript chain: the worked round replayed through it, and one
// signature per (round, sequence).

import { describe, expect, it, vi } from "vitest";

import { SigningError } from "./errors.ts";
import {
  actionVector,
  codeOf,
  playerSigner,
  requestOf,
  separator,
} from "./fixtures/helpers.ts";
import { vectors } from "./fixtures/vectors.ts";
import { actionGrammar } from "./grammar.ts";
import type { Bytes32 } from "./hex.ts";
import type { Signature } from "./signature.ts";
import {
  createTranscript,
  type Transcript,
  type TranscriptRequest,
} from "./transcript.ts";

type SignFn = (digest: Bytes32) => Signature;

const signer = playerSigner();

const fresh = (): Transcript =>
  createTranscript({
    domainSeparator: separator,
    round: vectors.roundId,
    initial: vectors.ready,
  });

const failing: SignFn = () => {
  throw new SigningError("signer-destroyed");
};

/**
 * Sign the first vector action with a callback that re-enters the transcript
 * with a conflicting request; report what the inner call did and what the key
 * signed.
 */
const reenter = (): {
  readonly innerCode: string | undefined;
  readonly signedDigests: readonly Bytes32[];
  readonly outer: Bytes32;
  readonly pending: Bytes32 | undefined;
} => {
  const transcript = fresh();
  const signedDigests: Bytes32[] = [];
  let innerCode: string | undefined;
  const sign: SignFn = digest => {
    innerCode = codeOf(() =>
      transcript.sign(
        { kind: "cash-out", action: "cash out", path: [] },
        inner => {
          signedDigests.push(inner);
          return signer.sign(inner);
        },
      ),
    );
    signedDigests.push(digest);
    return signer.sign(digest);
  };
  const outer = transcript.sign(requestOf(actionVector(0)), sign);
  return {
    innerCode,
    signedDigests,
    outer: outer.structHash,
    pending: transcript.pending()?.structHash,
  };
};

/**
 * Drive a transcript through a deterministic pseudo-random schedule of resends,
 * conflicting requests, and confirmations, and report how many different
 * digests the key was asked to sign at any one sequence.
 */
const interleave = (
  steps: number,
): {
  readonly maxDigestsPerSequence: number;
  readonly sequences: number;
  readonly codes: ReadonlySet<string>;
} => {
  let state = 7;
  const nextChoice = (): number => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state % 3;
  };
  const transcript = fresh();
  const signedAt = new Map<number, Set<Bytes32>>();
  const codes = new Set<string>();
  const sign: SignFn = digest => {
    const sequence = transcript.nextSequence();
    const digests = signedAt.get(sequence) ?? new Set<Bytes32>();
    digests.add(digest);
    signedAt.set(sequence, digests);
    return signer.sign(digest);
  };
  for (let step = 0; step < steps; step += 1) {
    const choice = nextChoice();
    const request: TranscriptRequest = {
      kind: "action",
      ...actionGrammar.pick([choice], transcript.nextSequence()),
    };
    codes.add(codeOf(() => transcript.sign(request, sign)) ?? "signed");
    if (choice === 0 && transcript.pending() !== undefined) {
      transcript.confirm();
    }
  }
  return {
    maxDigestsPerSequence: Math.max(
      ...[...signedAt.values()].map(set => set.size),
    ),
    sequences: signedAt.size,
    codes,
  };
};

const CONFLICTS: readonly (readonly [string, TranscriptRequest])[] = [
  [
    "another action",
    { kind: "action", action: "pick row 0 tile 1", path: [0] },
  ],
  ["another path", { kind: "action", action: "pick row 0 tile 2", path: [1] }],
  ["a cash-out", { kind: "cash-out", action: "cash out", path: [] }],
  [
    "a cash-out of the same fields",
    { kind: "cash-out", action: "pick row 0 tile 2", path: [0] },
  ],
];

describe("createTranscript", () => {
  it("starts at T_0 and sequence 1 with nothing pending", () => {
    const transcript = fresh();
    expect(transcript.last()).toBe(vectors.ready);
    expect(transcript.nextSequence()).toBe(1);
    expect(transcript.pending()).toBeUndefined();
  });

  it("replays the worked round: sequence, previous, T, and signature per step", () => {
    const transcript = fresh();
    const entries = vectors.actions.map(vector => {
      const entry = transcript.sign(requestOf(vector), signer.sign);
      transcript.confirm();
      return { entry, last: transcript.last() };
    });
    expect(
      entries.map(({ entry, last }) => ({
        sequence: entry.message.sequence,
        previous: entry.message.previous,
        round: entry.message.round,
        structHash: entry.structHash,
        digest: entry.digest,
        signature: entry.signature,
        last,
      })),
    ).toEqual(
      vectors.actions.map(vector => ({
        sequence: vector.sequence,
        previous: vector.previous,
        round: vectors.roundId,
        structHash: vector.structHash,
        digest: vector.digest,
        signature: vector.signature,
        last: vector.structHash,
      })),
    );
    expect(transcript.nextSequence()).toBe(vectors.actions.length + 1);
  });

  it("builds the worked round's action text and path from the grammar", () => {
    expect(
      vectors.actions.map(vector => ({
        action: vector.action,
        path: vector.path,
      })),
    ).toEqual([
      actionGrammar.pick([0], 2),
      actionGrammar.pick([0, 1], 2),
      actionGrammar.pick([0, 1, 2], 2),
      actionGrammar.cashOut([0, 1, 2]),
    ]);
  });

  it("returns the same signed entry, without signing again, for a resend", () => {
    const transcript = fresh();
    const sign = vi.fn<SignFn>(signer.sign);
    const first = transcript.sign(requestOf(actionVector(0)), sign);
    expect(transcript.sign(requestOf(actionVector(0)), sign)).toBe(first);
    expect(sign).toHaveBeenCalledTimes(1);
    expect(transcript.nextSequence()).toBe(1);
  });

  it.each(CONFLICTS)(
    "refuses %s at a sequence that is already signed",
    (_name, other) => {
      const transcript = fresh();
      const sign = vi.fn<SignFn>(signer.sign);
      transcript.sign(requestOf(actionVector(0)), sign);
      expect(codeOf(() => transcript.sign(other, sign))).toBe("equivocation");
      expect(sign).toHaveBeenCalledTimes(1);
    },
  );

  it("never signs two different messages at one sequence under random interleavings", () => {
    const result = interleave(300);
    expect(result.maxDigestsPerSequence).toBe(1);
    expect(result.sequences).toBeGreaterThan(10);
    expect([...result.codes].toSorted()).toEqual(["equivocation", "signed"]);
  });

  it("refuses a conflicting request made from inside the sign callback", () => {
    const result = reenter();
    expect(result.innerCode).toBe("equivocation");
    expect(result.signedDigests).toEqual([actionVector(0).digest]);
    expect(result.outer).toBe(actionVector(0).structHash);
    expect(result.pending).toBe(actionVector(0).structHash);
  });

  it("refuses to confirm when nothing is pending", () => {
    expect(codeOf(() => fresh().confirm())).toBe("nothing-pending");
  });

  it("records nothing when signing throws", () => {
    const transcript = fresh();
    expect(
      codeOf(() => transcript.sign(requestOf(actionVector(0)), failing)),
    ).toBe("signer-destroyed");
    expect(transcript.pending()).toBeUndefined();
    expect(
      transcript.sign(requestOf(actionVector(0)), signer.sign).signature,
    ).toBe(actionVector(0).signature);
  });

  it.each([
    [
      "domain separator",
      {
        domainSeparator: "0x12",
        round: vectors.roundId,
        initial: vectors.ready,
      },
    ],
    [
      "round",
      { domainSeparator: separator, round: "0x12", initial: vectors.ready },
    ],
    [
      "initial T",
      { domainSeparator: separator, round: vectors.roundId, initial: "0x12" },
    ],
  ] as const)("refuses a malformed %s", (_name, options) => {
    expect(codeOf(() => createTranscript(options))).toBe("invalid-input");
  });

  it("keeps a signed entry immutable", () => {
    const entry = fresh().sign(requestOf(actionVector(0)), signer.sign);
    expect([
      Object.isFrozen(entry),
      Object.isFrozen(entry.message),
      Object.isFrozen(entry.message.path),
    ]).toEqual([true, true, true]);
  });
});
