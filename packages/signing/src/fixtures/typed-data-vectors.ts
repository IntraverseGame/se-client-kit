// Test-only: the vendored `typed-data` Snapshot vectors (the fields of a signed
// action and its canonical typedData bytes), read through the `contracts`
// test-only entry and narrowed to what the tests use.

import { snapshotVectors } from "@intraverse/se-client-contracts/testing";

import type { Bytes32, Hex } from "../hex.ts";
import type { TypedDataFields, TypedDataKind } from "../typed-data.ts";
import { at, hex, integer, type Json, record, text } from "./vectors.ts";

// The `typed-data` Snapshot vectors name `kind` by its enum number and name;
// the encoder takes the kind.
const KIND_OF_NUMBER: Readonly<Record<number, TypedDataKind>> = {
  1: "action",
  2: "cash-out",
  3: "cancel",
};

const bytes32 = (parent: Json, key: string, where: string): Bytes32 => {
  const value = hex(parent, key, where);
  if (!/^0x[0-9a-f]{64}$/u.test(value)) {
    throw new TypeError(`${where}.${key}: not 32 bytes of lowercase hex`);
  }
  return value;
};

export type TypedDataVector = {
  readonly name: string;
  /** The enum value's name, as the vector gives it. */
  readonly kindName: string;
  readonly fields: TypedDataFields;
  readonly hex: Hex;
  readonly base64: string;
};

const typedDataVector = (name: string, file: unknown): TypedDataVector => {
  const where = `typed-data/${name}`;
  const root = record(file, where);
  if (text(root, "vector", where) !== `snapshot/${where}`) {
    throw new TypeError(`${where}.vector: does not name the file`);
  }
  const fields = record(at(root, "fields", where), `${where}.fields`);
  const kind = record(at(fields, "kind", where), `${where}.fields.kind`);
  const mapped = KIND_OF_NUMBER[integer(kind, "number", `${where}.kind`)];
  if (mapped === undefined) throw new TypeError(`${where}: unknown kind`);
  const path = at(fields, "path", where);
  if (!Array.isArray(path)) throw new TypeError(`${where}.path: not a list`);
  const entries: unknown[] = path;
  const typedData = record(at(root, "typedData", where), `${where}.typedData`);
  return {
    name,
    kindName: text(kind, "name", `${where}.kind`),
    fields: {
      kind: mapped,
      action: text(fields, "action", where),
      path: entries.map(entry => {
        if (typeof entry !== "number" || !Number.isSafeInteger(entry)) {
          throw new TypeError(`${where}.path: not a list of integers`);
        }
        return entry;
      }),
      sequence: integer(fields, "sequence", where),
      previous: bytes32(fields, "previous", where),
    },
    hex: hex(typedData, "hex", `${where}.typedData`),
    base64: text(typedData, "base64", `${where}.typedData`),
  };
};

/** Every `typed-data` Snapshot vector, by file name. */
export const typedDataVectors: readonly TypedDataVector[] = Object.entries(
  snapshotVectors.typedData,
).map(([name, file]) => typedDataVector(name, file));

const readyHashOf = (name: string): Bytes32 => {
  const where = `valid/${name}`;
  const input = record(
    at(record(snapshotVectors.valid[name], where), "input", where),
    where,
  );
  const proofs = record(at(input, "proofs", where), `${where}.proofs`);
  const fairness = record(
    at(proofs, "fairnessProof", where),
    `${where}.fairnessProof`,
  );
  return bytes32(fairness, "readyHash", `${where}.fairnessProof`);
};

/** `T_0` of the Coin Flip round of `valid/coinflip-active-ready-hash`. */
export const coinflipReadyHash: Bytes32 = readyHashOf(
  "coinflip-active-ready-hash",
);
