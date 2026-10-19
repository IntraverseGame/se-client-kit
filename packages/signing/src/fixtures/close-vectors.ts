// Test-only: the `closes` and `payoutTerms` of the vendored signing vectors
// (contracts release 1.0.0), read through the `contracts` test-only entry and
// narrowed to the fields the tests use. Every field is checked before it is
// used.

import { signingVectors } from "@intraverse/se-client-contracts/testing";

import type { Bytes32 } from "../hex.ts";
import {
  type ActionVector,
  at,
  bool,
  hex,
  integer,
  type Json,
  type NewRoundVector,
  record,
  type SignedVector,
  signed,
  text,
} from "./vectors.ts";

/** A step of a round: like an `ActionVector`, and `Cancel` too. */
export type CloseActionVector = Omit<ActionVector, "kind"> & {
  readonly kind: "Action" | "CashOut" | "Cancel";
};

type CloseBase = {
  readonly scenario: string;
  /** The registry call that ends the round. */
  readonly function: string;
  /** The name of the `payoutTerms` entry the round's terms hash comes from. */
  readonly terms: string;
  readonly newRound: NewRoundVector;
  readonly created: Bytes32;
  readonly seedHash: Bytes32;
  readonly ready: Bytes32;
  readonly actions: readonly CloseActionVector[];
  readonly lastActionHash: Bytes32;
};

/** A round that ended with a result and a `closed` hash. */
export type EndedRound = CloseBase & {
  readonly result: {
    readonly payoutAmount: string;
    readonly expired: boolean;
    readonly resultHash: Bytes32;
  };
  readonly closed: Bytes32;
  /** The admin's authorization, for `closeRound` only. */
  readonly closeRoundAuth?: SignedVector & {
    readonly expiry: string;
    readonly structHash: Bytes32;
  };
};

/** A round the player canceled: `canceled` instead of a result. */
export type CanceledRound = CloseBase & { readonly canceled: Bytes32 };

export type CloseVector = EndedRound | CanceledRound;

/** A named `payoutTerms` entry: only its name and `hashPayoutTerms` hash. */
export type PayoutTermsVector = {
  readonly name: string;
  readonly hash: Bytes32;
};

const list = (parent: Json, key: string, where: string): unknown[] => {
  const value = at(parent, key, where);
  if (!Array.isArray(value)) throw new TypeError(`${where}.${key}: not a list`);
  const items: unknown[] = value;
  return items;
};

const closeAction = (value: unknown, where: string): CloseActionVector => {
  const entry = record(value, where);
  const kind = text(entry, "kind", where);
  if (kind !== "Action" && kind !== "CashOut" && kind !== "Cancel") {
    throw new TypeError(`${where}.kind: unknown`);
  }
  const path = list(entry, "path", where);
  const steps = path.map(step => {
    if (typeof step !== "number") throw new TypeError(`${where}.path: bad`);
    return step;
  });
  return {
    ...signed(entry, where),
    kind,
    action: text(entry, "action", where),
    path: steps,
    sequence: integer(entry, "sequence", where),
    previous: hex(entry, "previous", where),
    structHash: hex(entry, "structHash", where),
  };
};

const newRoundOf = (newRound: Json, where: string): NewRoundVector => ({
  roundId: hex(newRound, "roundId", where),
  playerRef: hex(newRound, "playerRef", where),
  currency: hex(newRound, "currency", where),
  betAmount: text(newRound, "betAmount", where),
  gameId: text(newRound, "gameId", where),
  gameVersion: text(newRound, "gameVersion", where),
  circuitVersion: text(newRound, "circuitVersion", where),
  roundSecretHash: hex(newRound, "roundSecretHash", where),
  randomnessTarget: hex(newRound, "randomnessTarget", where),
  actionKey: hex(newRound, "actionKey", where),
  payoutTermsHash: hex(newRound, "payoutTermsHash", where),
});

const baseOf = (entry: Json, where: string): CloseBase => ({
  scenario: text(entry, "scenario", where),
  function: text(entry, "function", where),
  terms: text(entry, "terms", where),
  newRound: newRoundOf(
    record(at(entry, "newRound", where), `${where}.newRound`),
    `${where}.newRound`,
  ),
  created: hex(entry, "created", where),
  seedHash: hex(entry, "seedHash", where),
  ready: hex(entry, "ready", where),
  actions: list(entry, "actions", where).map((item, i) =>
    closeAction(item, `${where}.actions[${i}]`),
  ),
  lastActionHash: hex(entry, "lastActionHash", where),
});

const endedOf = (entry: Json, where: string): EndedRound => {
  const result = record(at(entry, "result", where), `${where}.result`);
  const auth = entry["closeRoundAuth"];
  const authWhere = `${where}.closeRoundAuth`;
  const authEntry = auth === undefined ? undefined : record(auth, authWhere);
  return {
    ...baseOf(entry, where),
    result: {
      payoutAmount: text(result, "payoutAmount", `${where}.result`),
      expired: bool(result, "expired", `${where}.result`),
      resultHash: hex(result, "resultHash", `${where}.result`),
    },
    closed: hex(entry, "closed", where),
    ...(authEntry === undefined
      ? {}
      : {
          closeRoundAuth: {
            ...signed(authEntry, authWhere),
            expiry: text(authEntry, "expiry", authWhere),
            structHash: hex(authEntry, "structHash", authWhere),
          },
        }),
  };
};

const closeOf = (value: unknown, index: number): CloseVector => {
  const where = `closes[${index}]`;
  const entry = record(value, where);
  return entry["canceled"] === undefined
    ? endedOf(entry, where)
    : { ...baseOf(entry, where), canceled: hex(entry, "canceled", where) };
};

const termsOf = (value: unknown, index: number): PayoutTermsVector => {
  const where = `payoutTerms[${index}]`;
  const entry = record(value, where);
  return { name: text(entry, "name", where), hash: hex(entry, "hash", where) };
};

const root = record(signingVectors, "vectors");

export const closes: readonly CloseVector[] = list(
  root,
  "closes",
  "vectors",
).map((item, index) => closeOf(item, index));

export const payoutTerms: readonly PayoutTermsVector[] = list(
  root,
  "payoutTerms",
  "vectors",
).map((item, index) => termsOf(item, index));
