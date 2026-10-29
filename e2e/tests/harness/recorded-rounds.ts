// The two real rounds the fake verify API serves besides the canned ones
// (`verify-rounds.ts`): a `won` and a `lost` Coin Flip round the backend
// recorded on its local preview stack (`recorded-rounds/README.md`), each the
// verify API's response body as recorded. With their reveals the page recomputes
// checks 5 and 7 and they match (V-12). The files are read at run time and
// never edited; a tampered round is a change of one field of a deep copy.
//
// What the page pins for them is read from the response itself, all public
// values: the signer of `createRoundAuth` (`commitment.adminSigner`), the
// registry domain (`registryChainId`, `registryAddress`), the entropy source
// and chain id (`entropy.source`, `entropy.chainId`). The fake RPC endpoints
// give block N the hash the recording carries (`entropy.value`), so check 6
// agrees with the API and check 7 runs over the recorded block hash. No private
// key is read or needed.

import { readFileSync } from "node:fs";

import type { RoundPins } from "./environment-config.ts";

type Json = Record<string, unknown>;

export type RecordedKind = "won" | "lost";

const FILES: Readonly<Record<RecordedKind, string>> = {
  won: "recorded-rounds/verify-coinflip-won.json",
  lost: "recorded-rounds/verify-coinflip-lost.json",
};

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const field = (root: Json, key: string): Json => {
  const next = root[key];
  if (!isRecord(next)) throw new TypeError(`recorded round: no ${key}`);
  return next;
};

const text = (root: Json, key: string): string => {
  const next = root[key];
  if (typeof next !== "string")
    throw new TypeError(`recorded round: no ${key}`);
  return next;
};

const whole = (root: Json, key: string): number => {
  const next = root[key];
  if (typeof next !== "number" || !Number.isSafeInteger(next)) {
    throw new TypeError(`recorded round: no ${key}`);
  }
  return next;
};

/** A deep, mutable copy of the recorded body. */
const load = (kind: RecordedKind): Json => {
  const parsed: unknown = JSON.parse(
    readFileSync(new URL(FILES[kind], import.meta.url), "utf8"),
  );
  if (!isRecord(parsed)) throw new Error(`${FILES[kind]}: not an object`);
  return parsed;
};

/** The recorded round as the verify API gave it. */
export const recordedRound = (kind: RecordedKind): Json => load(kind);

/** The recorded round's id, in its canonical (UUID) form. */
export const recordedRoundId = (kind: RecordedKind): string =>
  text(load(kind), "roundId");

/** What the configuration pins for the recordings (both share them). */
export const recordedPins = (): RoundPins => {
  const round = load("won");
  const commitment = field(round, "commitment");
  const entropy = field(round, "entropy");
  return {
    signer: text(commitment, "adminSigner"),
    domain: {
      chainId: whole(commitment, "registryChainId"),
      verifyingContract: text(commitment, "registryAddress"),
    },
    source: text(entropy, "source"),
    entropyChainId: whole(entropy, "chainId"),
  };
};

/** The recorded block N and its hash, which the fake RPC endpoints give. */
export const recordedBlock = (): {
  readonly number: bigint;
  readonly hash: string;
} => {
  const entropy = field(load("won"), "entropy");
  return {
    number: BigInt(whole(entropy, "block")),
    hash: text(entropy, "value"),
  };
};

/** What a tamper changes: the check it makes fail. */
export type RecordedTamper = "loser" | "payout" | "roundSecret";

/**
 * The recorded round with one field changed. `loser`: the API's replay names
 * the other option as the loser (`recomputed.steps[0].losers`), so check 7's
 * outcome differs from the recomputed one. `roundSecret`: another round secret,
 * which does not hash to `roundSecretHash` (check 5) and so gives another seed.
 * `payout`: one base unit more than the recorded payout, which check 7
 * recomputes from Coin Flip's terms, the bet, and the recomputed outcome.
 */
export const tamperedRecordedRound = (
  kind: RecordedKind,
  tamper: RecordedTamper,
): Json => {
  const round = load(kind);
  if (tamper === "loser") {
    const steps = field(round, "recomputed")["steps"];
    const step: unknown = Array.isArray(steps) ? steps[0] : undefined;
    if (!isRecord(step) || !Array.isArray(step["losers"])) {
      throw new Error("recorded round: no replay step");
    }
    step["losers"] = step["losers"].map((loser: unknown) =>
      loser === 0 ? 1 : 0,
    );
  } else if (tamper === "payout") {
    const payout = field(round, "payout");
    payout["amount"] = String(BigInt(text(payout, "amount")) + 1n);
  } else {
    const reveal = field(round, "reveal");
    reveal["roundSecret"] = `0x${text(reveal, "roundSecret")
      .slice(2)
      .replaceAll(/[0-9a-f]/giu, digit => (digit === "0" ? "1" : "0"))}`;
  }
  return round;
};
