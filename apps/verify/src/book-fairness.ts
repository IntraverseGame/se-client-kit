// Checks 5 and 7 of a book round (specs/verify-page.md, V-19), keyed on the
// round's kernel version (V-12a) through the same kernel code as a config
// round's: check 5 is the round secret's commitment, and the seed's only when
// the body carries a `seedHash`; check 7 is the seed alone (a book round's
// outcome is its draw, check 8, which the page does not recompute).

import {
  compare,
  decode,
  recompute,
  type KernelCheck,
} from "./fairness-checks.ts";
import { type Hash32, hashFromBytes } from "./hex.ts";

/** A book round's check 5 evidence (V-19): `seedHash` only when it has one. */
export type BookCommitmentEvidence = {
  /** `commitment.roundSecretHash`. */
  readonly roundSecretHash: Hash32;
  /** `reveal.roundSecret`. */
  readonly roundSecret: Hash32;
  /** `seedHash`, which a book round carries only by exception, with its seed. */
  readonly seedCommitment?:
    | { readonly seedHash: Hash32; readonly seed: Hash32 }
    | undefined;
};

/**
 * Check 5 of a book round (V-19): `roundSecretHash = SHA-256(roundSecret)`, the
 * same rule and code as a config round's, and `seedHash = SHA-256(seed)` only
 * when the body carries a `seedHash`.
 */
export const checkBookCommitments = (
  kernelVersion: number,
  evidence: BookCommitmentEvidence,
): Promise<KernelCheck> =>
  recompute(kernelVersion, async kernel => {
    const secret = decode("roundSecret", evidence.roundSecret);
    const values: Record<string, string> = {
      roundSecretHash: hashFromBytes(await kernel.roundSecretHash(secret)),
    };
    const comparisons = [
      compare(
        "roundSecretHash",
        values["roundSecretHash"],
        evidence.roundSecretHash,
      ),
    ];
    const { seedCommitment } = evidence;
    if (seedCommitment !== undefined) {
      const seed = decode("seed", seedCommitment.seed);
      values["seedHash"] = hashFromBytes(await kernel.seedHash(seed));
      comparisons.push(
        compare("seedHash", values["seedHash"], seedCommitment.seedHash),
      );
    }
    return { comparisons, values };
  });

/** A book round's check 7 evidence (V-19): block N, the secret, the seed. */
export type SeedEvidence = {
  /** Block N's hash, the one check 6 agreed on, never the API's. */
  readonly blockValue: Hash32;
  readonly roundSecret: Hash32;
  /** `reveal.seed`, the revealed seed. */
  readonly seed: Hash32;
};

/**
 * Check 7 of a book round (V-19): the seed is Seed(blockValue, roundSecret) and
 * equals the revealed seed. The outcome half of a config round's check 7
 * (StepsDerive and the pick) does not apply: a book round's outcome is its draw
 * (check 8).
 */
export const checkSeed = (
  kernelVersion: number,
  evidence: SeedEvidence,
): Promise<KernelCheck> =>
  recompute(kernelVersion, async kernel => {
    const blockValue = decode("blockValue", evidence.blockValue);
    const secret = decode("roundSecret", evidence.roundSecret);
    const seed = hashFromBytes(await kernel.seed(blockValue, secret));
    return {
      comparisons: [compare("seed", seed, evidence.seed)],
      values: { seed },
    };
  });
