// The vendored Coin Flip round the round tests play (round-play.ts): what they
// read of it (its id, action key, `N`, and what the configuration pins), the
// public test key its `CreateRoundAuth` was issued for, read at run time from
// the signed-action vector and never written down, and the fake Play API's
// checks of what the Wrapper sends against the vectors: the start's
// `actionKey`, the move's `typedData`, and the cancel's `typedData` and
// signature, byte for byte.

import type { RoundPins } from "./environment-config.ts";
import type { BodyCheck } from "./fake-play-wire.ts";
import {
  signedActionSignature,
  signedActionTestKey,
  typedDataBase64,
  validVector,
} from "./vectors.ts";

/** The vendored round, `active` with `T_0` settled. */
export const ROUND_VECTOR = "coinflip-active-ready-hash";
/** The signed-action vector whose test key the round was issued for. */
export const KEY_VECTOR = "coinflip-cancel";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const at = (
  record: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, unknown>> => {
  const value = record[key];
  if (!isRecord(value)) throw new Error(`${ROUND_VECTOR}: no ${key}`);
  return value;
};

const text = (
  record: Readonly<Record<string, unknown>>,
  key: string,
): string => {
  const value = record[key];
  if (typeof value !== "string") throw new Error(`${ROUND_VECTOR}: no ${key}`);
  return value;
};

const number = (
  record: Readonly<Record<string, unknown>>,
  key: string,
): number => {
  const value = record[key];
  if (typeof value !== "number") throw new Error(`${ROUND_VECTOR}: no ${key}`);
  return value;
};

const roundInput = validVector(ROUND_VECTOR, "Snapshot").input;
const proofs = at(roundInput, "proofs");
const auth = at(proofs, "createRoundAuth");
const domain = at(auth, "domain");
const randomness = at(proofs, "randomnessProof");

/** What the round tests read of the vendored round. */
export const ROUND = {
  roundId: text(roundInput, "roundId"),
  /** The action key the round was issued for, lowercase. */
  actionKey: text(at(auth, "newRound"), "actionKey").toLowerCase(),
  blockNumber: BigInt(number(randomness, "blockNumber")),
} as const;

/** What the round configuration pins: the round's signer, domain, and source. */
export const ROUND_PINS: RoundPins = {
  signer: text(auth, "signer"),
  domain: {
    chainId: number(domain, "chainId"),
    verifyingContract: text(domain, "verifyingContract"),
  },
  source: text(randomness, "source"),
  entropyChainId: number(auth, "entropyChainId"),
};

/** The test key's bytes, for the Wrapper's key draw only. Never written down. */
export const keyDrawBytes = (): readonly number[] => {
  const key = signedActionTestKey(KEY_VECTOR);
  if (key.address.toLowerCase() !== ROUND.actionKey) {
    throw new Error(
      `${KEY_VECTOR}'s test key is not the action key ${ROUND_VECTOR} was issued for`,
    );
  }
  return [...Buffer.from(key.privateKey.replace(/^0x/u, ""), "hex")];
};

/**
 * Whether `draw` is the scripted key draw: compared with the vector's key at
 * run time, so neither is ever written down or printed.
 */
export const isScriptedKey = (draw: Uint8Array): boolean =>
  Buffer.from(draw).equals(Buffer.from(keyDrawBytes()));

const bodyOf = (body: unknown): Readonly<Record<string, unknown>> =>
  isRecord(body) ? body : {};

/**
 * The start is for the round's action key: the session's key is the scripted
 * one.
 */
export const startCheck: BodyCheck = body => {
  const key = bodyOf(body)["actionKey"];
  return typeof key === "string" && key.toLowerCase() === ROUND.actionKey
    ? undefined
    : "the start's actionKey is not the round's action key";
};

const SIGNATURE = /^0x[0-9a-f]{130}$/iu;

/** A signed action of the round with `typedData` of the `typed-data/` vector. */
const actionCheck =
  (
    what: string,
    typedDataVector: string,
    signature: (value: string) => boolean,
  ): BodyCheck =>
  body => {
    const fields = bodyOf(body);
    if (fields["roundId"] !== ROUND.roundId) return `${what}: another round`;
    if (fields["typedData"] !== typedDataBase64(typedDataVector)) {
      return `${what}: typedData is not ${typedDataVector}'s`;
    }
    const value = fields["signature"];
    if (typeof value !== "string" || !signature(value)) {
      return `${what}: the signature is not the one expected`;
    }
    return typeof fields["idempotencyKey"] === "string"
      ? undefined
      : `${what}: no idempotencyKey`;
  };

/**
 * The first move, tails: `typed-data/coinflip-pick`'s bytes (sequence 1,
 * `previous` T_0), with a 65-byte signature. The shell's own tests prove the
 * signature (no vector holds this one).
 */
export const pickCheck: BodyCheck = actionCheck(
  "the move",
  "coinflip-pick",
  value => SIGNATURE.test(value),
);

/**
 * The required cancel: `typed-data/coinflip-cancel`'s bytes and
 * `signed-action/coinflip-cancel`'s signature, byte for byte (the independent
 * signer's, with the same key and message).
 */
export const cancelCheck: BodyCheck = actionCheck(
  "the cancel",
  "coinflip-cancel",
  value =>
    value.toLowerCase() === signedActionSignature(KEY_VECTOR).toLowerCase(),
);
