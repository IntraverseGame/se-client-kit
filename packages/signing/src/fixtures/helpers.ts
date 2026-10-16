// Test-only helpers shared by the test files.

import { SigningError, type SigningErrorCode } from "../errors.ts";
import type { Bytes32 } from "../hex.ts";
import {
  type Domain,
  domainSeparator,
  hashPlayerAction,
  hashPlayerCashOut,
  type PlayerMessage,
} from "../messages.ts";
import { createSigner, type Signer } from "../signer.ts";
import type { TranscriptRequest } from "../transcript.ts";
import { ENGINE_KEY, PLAYER_KEY, scriptedRandom } from "./keys.ts";
import { type ActionVector, vectors } from "./vectors.ts";

/**
 * The `code` of the `SigningError` that `run` throws, or undefined when it does
 * not throw.
 */
export const codeOf = (run: () => unknown): SigningErrorCode | undefined => {
  try {
    run();
  } catch (error) {
    if (error instanceof SigningError) return error.code;
    throw error;
  }
  return undefined;
};

/** What `run` throws; fails when it does not throw. */
export const caught = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
};

export const domain: Domain = {
  name: vectors.domain.name,
  version: vectors.domain.version,
  chainId: BigInt(vectors.domain.chainId),
  verifyingContract: vectors.domain.verifyingContract,
};

export const separator: Bytes32 = domainSeparator(domain);

export const drawSeparator: Bytes32 = domainSeparator({
  ...domain,
  verifyingContract: vectors.draw.verifyingContract,
});

export const playerSigner = (): Signer =>
  createSigner({ random: scriptedRandom(PLAYER_KEY) });

export const engineSigner = (): Signer =>
  createSigner({ random: scriptedRandom(ENGINE_KEY) });

export const actionVector = (index: number): ActionVector => {
  const vector = vectors.actions[index];
  if (vector === undefined) throw new Error(`no action vector ${index}`);
  return vector;
};

export const messageOf = (vector: ActionVector): PlayerMessage => ({
  action: vector.action,
  path: vector.path,
  sequence: vector.sequence,
  round: vectors.roundId,
  previous: vector.previous,
});

/**
 * The struct hash of a vector's message, as `PlayerAction` or `PlayerCashOut`
 * by its kind.
 */
export const structHashOf = (vector: ActionVector): Bytes32 =>
  vector.kind === "Action"
    ? hashPlayerAction(messageOf(vector))
    : hashPlayerCashOut(messageOf(vector));

export const requestOf = (vector: ActionVector): TranscriptRequest => ({
  kind: vector.kind === "Action" ? "action" : "cash-out",
  action: vector.action,
  path: vector.path,
});

/** Replace the byte at `index` of a hex signature. */
export const withByte = (
  signature: string,
  index: number,
  byte: number,
): string =>
  `${signature.slice(0, 2 + index * 2)}${byte.toString(16).padStart(2, "0")}${signature.slice(4 + index * 2)}`;
