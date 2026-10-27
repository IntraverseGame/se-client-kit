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

/**
 * A signed action of the round `roundId` with `typedData` of the `typed-data/`
 * vector.
 */
const actionCheck =
  (
    what: string,
    roundId: string,
    typedDataVector: string,
    signature: (value: string) => boolean,
  ): BodyCheck =>
  body => {
    const fields = bodyOf(body);
    if (fields["roundId"] !== roundId) return `${what}: another round`;
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
  ROUND.roundId,
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
  ROUND.roundId,
  "coinflip-cancel",
  value =>
    value.toLowerCase() === signedActionSignature(KEY_VECTOR).toLowerCase(),
);

/**
 * The vendored Cash or Crash `[3,3,4]` round played to a cash-out (T-12): one
 * round on one signed chain, `active` at step 0 with `T_0` settled, `active`
 * after the first pick survived (`T_1`), and `won` by the cash-out (`T_2`) with
 * its payout. The `resolving` Snapshot of the same round is not answered: the
 * Play API answers `resolving` only to a cancel.
 */
export const CASH_OR_CRASH = {
  step0: "cashorcrash-cash-out-active-step0",
  step1: "cashorcrash-cash-out-active-step1",
  won: "cashorcrash-cash-out-won",
  /** The signed-action vector of the cash-out. */
  cashOut: "cashorcrash-cash-out",
} as const;

const cashOrCrashInput = validVector(CASH_OR_CRASH.step0, "Snapshot").input;

/** The Cash or Crash round's id. */
export const CASH_OR_CRASH_ROUND_ID = text(cashOrCrashInput, "roundId");

/**
 * The vendored Cash or Crash `[3,3,4]` round played through its last row
 * (T-12): one round on one signed chain, `active` at steps 0, 1, and 2 with
 * `T_0` settled, each step after a pick that survived (`T_1`, `T_2`), and `won`
 * by the last pick (`T_3`) with its payout. Nothing is signed after the last
 * pick, so no vector of this round holds a cash-out or a signature.
 */
export const LAST_ROW = {
  step0: "cashorcrash-last-row-active-step0",
  step1: "cashorcrash-last-row-active-step1",
  step2: "cashorcrash-last-row-active-step2",
  won: "cashorcrash-last-row-won",
} as const;

const lastRowInput = validVector(LAST_ROW.step0, "Snapshot").input;

/** The last-row round's id. */
export const LAST_ROW_ROUND_ID = text(lastRowInput, "roundId");

/**
 * What the round tests reuse from the Coin Flip round, as the Snapshot `input`
 * has it: the key draw (its action key), the configuration (its signer, domain,
 * entropy source, and entropy chain id), and the fake RPC endpoints' tip (its
 * randomness block). The names of the values that differ.
 */
const mismatchesWithCoinFlip = (
  input: Readonly<Record<string, unknown>>,
): readonly string[] => {
  const roundProofs = at(input, "proofs");
  const roundAuth = at(roundProofs, "createRoundAuth");
  const roundRandomness = at(roundProofs, "randomnessProof");
  const checks: readonly (readonly [string, boolean])[] = [
    [
      "actionKey",
      text(at(roundAuth, "newRound"), "actionKey").toLowerCase() ===
        ROUND.actionKey,
    ],
    ["signer", text(roundAuth, "signer") === ROUND_PINS.signer],
    [
      "domain",
      JSON.stringify(at(roundAuth, "domain")) === JSON.stringify(domain),
    ],
    ["source", text(roundRandomness, "source") === ROUND_PINS.source],
    [
      "entropyChainId",
      number(roundAuth, "entropyChainId") === ROUND_PINS.entropyChainId,
    ],
    [
      "blockNumber",
      BigInt(number(roundRandomness, "blockNumber")) === ROUND.blockNumber,
    ],
  ];
  return checks.filter(([, same]) => !same).map(([name]) => name);
};

// The round tests' key draw, configuration, and fake RPC endpoints are the Coin
// Flip round's, so each Cash or Crash round must agree with it on every value
// they read; checked once, when the module loads.
for (const [name, input] of [
  [CASH_OR_CRASH.step0, cashOrCrashInput],
  [LAST_ROW.step0, lastRowInput],
] as const) {
  const mismatches = mismatchesWithCoinFlip(input);
  if (mismatches.length > 0) {
    throw new Error(
      `${name} differs from ${ROUND_VECTOR} in ${mismatches.join(", ")}: the round tests cannot play it with the Coin Flip round's key, configuration, and RPC tip`,
    );
  }
}

/**
 * The first pick, row 0 tile 2: `typed-data/cashorcrash-pick`'s bytes (sequence
 * 1, `previous` T_0), with a 65-byte signature. No vector holds this signature;
 * the shell's own tests prove it.
 */
export const cashOrCrashPickCheck: BodyCheck = actionCheck(
  "the pick",
  CASH_OR_CRASH_ROUND_ID,
  "cashorcrash-pick",
  value => SIGNATURE.test(value),
);

/**
 * The cash-out after that pick: `typed-data/cashorcrash-cash-out`'s bytes
 * (sequence 2, `previous` T_1) and `signed-action/cashorcrash-cash-out`'s
 * signature, byte for byte (the independent signer's, with the same key and
 * message).
 */
export const cashOutCheck: BodyCheck = actionCheck(
  "the cash-out",
  CASH_OR_CRASH_ROUND_ID,
  "cashorcrash-cash-out",
  value =>
    value.toLowerCase() ===
    signedActionSignature(CASH_OR_CRASH.cashOut).toLowerCase(),
);

/**
 * A pick of the last-row round: the bytes of
 * `typed-data/cashorcrash-last-row-pick-row<row>` (sequence `row + 1`,
 * `previous` T_0 for row 0, else the struct hash of the pick before it), with a
 * 65-byte signature. No vector holds these signatures; the shell's own tests
 * prove them.
 */
export const lastRowPickCheck = (row: 0 | 1 | 2): BodyCheck =>
  actionCheck(
    `the pick on row ${String(row)}`,
    LAST_ROW_ROUND_ID,
    `cashorcrash-last-row-pick-row${String(row)}`,
    value => SIGNATURE.test(value),
  );
