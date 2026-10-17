// Test-only: the vendored signing vectors, read through the `contracts`
// test-only entry and narrowed to the fields the tests use. The file is data
// of unknown shape, so every field is checked before it is used.

import { signingVectors } from "@intraverse/se-client-contracts/testing";

import type { Address, Bytes32, Hex } from "../hex.ts";

export type Json = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const record = (value: unknown, where: string): Json => {
  if (!isRecord(value)) throw new TypeError(`${where}: not an object`);
  return value;
};

export const at = (parent: Json, key: string, where: string): unknown => {
  if (!Object.hasOwn(parent, key))
    throw new TypeError(`${where}.${key}: missing`);
  return parent[key];
};

export const text = (parent: Json, key: string, where: string): string => {
  const value = at(parent, key, where);
  if (typeof value !== "string")
    throw new TypeError(`${where}.${key}: not a string`);
  return value;
};

export const hex = (parent: Json, key: string, where: string): Hex => {
  const value = text(parent, key, where);
  if (!/^0x[0-9a-fA-F]*$/u.test(value)) {
    throw new TypeError(`${where}.${key}: not hex`);
  }
  return `0x${value.slice(2)}`;
};

export const integer = (parent: Json, key: string, where: string): number => {
  const value = at(parent, key, where);
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError(`${where}.${key}: not an integer`);
  }
  return value;
};

const bool = (parent: Json, key: string, where: string): boolean => {
  const value = at(parent, key, where);
  if (typeof value !== "boolean")
    throw new TypeError(`${where}.${key}: not a boolean`);
  return value;
};

export type SignedVector = {
  readonly digest: Bytes32;
  readonly signature: Hex;
  readonly signer: Address;
};

export type ActionVector = SignedVector & {
  readonly kind: "Action" | "CashOut";
  readonly action: string;
  readonly path: readonly number[];
  readonly sequence: number;
  readonly previous: Bytes32;
  readonly structHash: Bytes32;
};

export type NewRoundVector = {
  readonly roundId: Bytes32;
  readonly playerRef: Bytes32;
  readonly currency: Bytes32;
  readonly betAmount: string;
  readonly gameId: string;
  readonly gameVersion: string;
  readonly circuitVersion: string;
  readonly roundSecretHash: Bytes32;
  readonly randomnessTarget: Bytes32;
  readonly actionKey: Address;
  readonly payoutTermsHash: Bytes32;
};

export type TypeVector = {
  readonly encodeType: string;
  readonly typeHash: Bytes32;
};

export type SigningVectors = {
  readonly domain: {
    readonly name: string;
    readonly version: string;
    readonly chainId: number;
    readonly verifyingContract: Address;
    readonly separator: Bytes32;
  };
  readonly types: Readonly<Record<string, TypeVector>>;
  readonly roundId: Bytes32;
  readonly actionKey: Address;
  /** `newRound` as the file gives it: hex, and decimal strings for numbers. */
  readonly newRound: NewRoundVector;
  readonly created: Bytes32;
  readonly seedHash: Bytes32;
  readonly ready: Bytes32;
  readonly actions: readonly ActionVector[];
  readonly createRoundAuth: SignedVector & {
    readonly prepareWindow: number;
    readonly expiry: string;
  };
  readonly markReadyAuth: SignedVector & {
    readonly roundId: Bytes32;
    readonly seedHash: Bytes32;
    readonly expiry: string;
  };
  readonly closeRoundAuth: SignedVector & {
    readonly roundId: Bytes32;
    readonly payoutAmount: string;
    readonly expired: boolean;
    readonly resultHash: Bytes32;
    readonly lastActionHash: Bytes32;
    readonly expiry: string;
  };
  readonly draw: {
    readonly verifyingContract: Address;
    readonly separator: Bytes32;
    readonly created: Bytes32;
    readonly closed: Bytes32;
    readonly createDrawRoundAuth: SignedVector & {
      readonly drawWindow: number;
      readonly expiry: string;
      readonly structHash: Bytes32;
    };
    readonly recordDrawAuth: SignedVector & {
      readonly expiry: string;
      readonly structHash: Bytes32;
    };
  };
};

const signed = (value: Json, where: string): SignedVector => ({
  digest: hex(value, "digest", where),
  signature: hex(value, "signature", where),
  signer: hex(value, "signer", where),
});

const action = (value: unknown, index: number): ActionVector => {
  const where = `actions[${index}]`;
  const entry = record(value, where);
  const kind = text(entry, "kind", where);
  if (kind !== "Action" && kind !== "CashOut") {
    throw new TypeError(`${where}.kind: unknown`);
  }
  const path = at(entry, "path", where);
  if (
    !Array.isArray(path) ||
    !path.every((step: unknown) => typeof step === "number")
  ) {
    throw new TypeError(`${where}.path: not a number array`);
  }
  const steps: number[] = path;
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

const parse = (input: unknown): SigningVectors => {
  const root = record(input, "vectors");
  const domain = record(at(root, "domain", "vectors"), "domain");
  const types = record(at(root, "types", "vectors"), "types");
  const newRound = record(at(root, "newRound", "vectors"), "newRound");
  const actions = at(root, "actions", "vectors");
  if (!Array.isArray(actions)) throw new TypeError("actions: not an array");
  const items: unknown[] = actions;
  const create = record(
    at(root, "createRoundAuth", "vectors"),
    "createRoundAuth",
  );
  const ready = record(at(root, "markReadyAuth", "vectors"), "markReadyAuth");
  const close = record(at(root, "closeRoundAuth", "vectors"), "closeRoundAuth");
  const draw = record(at(root, "draw", "vectors"), "draw");
  const drawDomain = record(at(draw, "domain", "draw"), "draw.domain");
  const drawCreate = record(
    at(draw, "createDrawRoundAuth", "draw"),
    "draw.createDrawRoundAuth",
  );
  const drawRecord = record(
    at(draw, "recordDrawAuth", "draw"),
    "draw.recordDrawAuth",
  );
  return {
    domain: {
      name: text(domain, "name", "domain"),
      version: text(domain, "version", "domain"),
      chainId: integer(domain, "chainId", "domain"),
      verifyingContract: hex(domain, "verifyingContract", "domain"),
      separator: hex(domain, "separator", "domain"),
    },
    types: Object.fromEntries(
      Object.entries(types).map(([name, value]) => {
        const entry = record(value, `types.${name}`);
        return [
          name,
          {
            encodeType: text(entry, "encodeType", `types.${name}`),
            typeHash: hex(entry, "typeHash", `types.${name}`),
          },
        ];
      }),
    ),
    roundId: hex(newRound, "roundId", "newRound"),
    actionKey: hex(newRound, "actionKey", "newRound"),
    newRound: {
      roundId: hex(newRound, "roundId", "newRound"),
      playerRef: hex(newRound, "playerRef", "newRound"),
      currency: hex(newRound, "currency", "newRound"),
      betAmount: text(newRound, "betAmount", "newRound"),
      gameId: text(newRound, "gameId", "newRound"),
      gameVersion: text(newRound, "gameVersion", "newRound"),
      circuitVersion: text(newRound, "circuitVersion", "newRound"),
      roundSecretHash: hex(newRound, "roundSecretHash", "newRound"),
      randomnessTarget: hex(newRound, "randomnessTarget", "newRound"),
      actionKey: hex(newRound, "actionKey", "newRound"),
      payoutTermsHash: hex(newRound, "payoutTermsHash", "newRound"),
    },
    created: hex(root, "created", "vectors"),
    seedHash: hex(root, "seedHash", "vectors"),
    ready: hex(root, "ready", "vectors"),
    actions: items.map((item, index) => action(item, index)),
    createRoundAuth: {
      ...signed(create, "createRoundAuth"),
      prepareWindow: integer(create, "prepareWindow", "createRoundAuth"),
      expiry: text(create, "expiry", "createRoundAuth"),
    },
    markReadyAuth: {
      ...signed(ready, "markReadyAuth"),
      roundId: hex(ready, "roundId", "markReadyAuth"),
      seedHash: hex(ready, "seedHash", "markReadyAuth"),
      expiry: text(ready, "expiry", "markReadyAuth"),
    },
    closeRoundAuth: {
      ...signed(close, "closeRoundAuth"),
      roundId: hex(close, "roundId", "closeRoundAuth"),
      payoutAmount: text(close, "payoutAmount", "closeRoundAuth"),
      expired: bool(close, "expired", "closeRoundAuth"),
      resultHash: hex(close, "resultHash", "closeRoundAuth"),
      lastActionHash: hex(close, "lastActionHash", "closeRoundAuth"),
      expiry: text(close, "expiry", "closeRoundAuth"),
    },
    draw: {
      verifyingContract: hex(drawDomain, "verifyingContract", "draw.domain"),
      separator: hex(drawDomain, "separator", "draw.domain"),
      created: hex(draw, "created", "draw"),
      closed: hex(draw, "closed", "draw"),
      createDrawRoundAuth: {
        ...signed(drawCreate, "draw.createDrawRoundAuth"),
        drawWindow: integer(
          drawCreate,
          "drawWindow",
          "draw.createDrawRoundAuth",
        ),
        expiry: text(drawCreate, "expiry", "draw.createDrawRoundAuth"),
        structHash: hex(drawCreate, "structHash", "draw.createDrawRoundAuth"),
      },
      recordDrawAuth: {
        ...signed(drawRecord, "draw.recordDrawAuth"),
        expiry: text(drawRecord, "expiry", "draw.recordDrawAuth"),
        structHash: hex(drawRecord, "structHash", "draw.recordDrawAuth"),
      },
    },
  };
};

export const vectors: SigningVectors = parse(signingVectors);
