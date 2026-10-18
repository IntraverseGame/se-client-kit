// The Snapshot vectors the fake Play API answers with. This module is the e2e
// suite's only importer of the test-only entry of the `contracts` package: the
// suite is development-only, and nothing here reaches a bundle.
//
// A `valid/` vector is a document the vendored `se.snapshot/1` schema accepts
// (the `snapshot` package's T-5 replay proves it), and the Play API document's
// `Snapshot` and `PlayProblem` components are generated from that schema, so a
// body taken from one is a body the document allows. Only `valid/` vectors are
// served, except through `invalidVector`, the one answer of W-28's rejected
// Snapshot: a body the document does not allow, on purpose.
//
// It also reads the action vectors of the vendored Coin Flip round
// (`typed-data/`, `signed-action/`), whose bytes the Wrapper must send, and the
// public test key of the signed-action vector (`signedActionTestKey`), which
// the round tests give the seeded random source so that the session's key is
// that vector's (round-play.ts). The key is read here at run time only and is
// never copied into a file (AGENTS.md).

import { snapshotVectors } from "@intraverse/se-client-contracts/testing";

/** The definition a vector is an instance of, in the Play API document. */
export type VectorDefinition = "PlayProblem" | "Snapshot";

export type ValidVector = {
  readonly name: string;
  readonly definition: VectorDefinition;
  /** The document itself, as vendored. */
  readonly input: Readonly<Record<string, unknown>>;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isDefinition = (value: unknown): value is VectorDefinition =>
  value === "PlayProblem" || value === "Snapshot";

/**
 * The `valid/` vector `name`, checked to be an instance of `definition`. Throws
 * on an unknown name, a vector that is not `expected: "valid"`, or a vector of
 * another definition, so a test cannot serve a body the document does not allow
 * at that place.
 */
export const validVector = (
  name: string,
  definition: VectorDefinition,
): ValidVector => {
  const file: unknown = snapshotVectors.valid[name];
  if (!isRecord(file)) {
    throw new Error(`no valid/ Snapshot vector named "${name}"`);
  }
  const { definition: actual, expected, input } = file;
  if (expected !== "valid" || !isDefinition(actual) || !isRecord(input)) {
    throw new Error(`vector "${name}" is not a valid Snapshot or PlayProblem`);
  }
  if (actual !== definition) {
    throw new Error(
      `vector "${name}" is a ${actual}, not the ${definition} this answer needs`,
    );
  }
  return { name, definition: actual, input };
};

/** The names of the `valid/` vectors of one definition. */
export const validVectorNames = (
  definition: VectorDefinition,
): readonly string[] =>
  Object.entries(snapshotVectors.valid)
    .filter(([, file]) => isRecord(file) && file["definition"] === definition)
    .map(([name]) => name);

/**
 * The `invalid/` vector `name`, a Snapshot the schema refuses: only for the
 * answer that tests W-28's rejected Snapshot.
 */
export const invalidVector = (name: string): ValidVector["input"] => {
  const file: unknown = snapshotVectors.invalid[name];
  if (
    !isRecord(file) ||
    file["expected"] !== "invalid" ||
    file["definition"] !== "Snapshot" ||
    !isRecord(file["input"])
  ) {
    throw new Error(`no invalid/ Snapshot vector named "${name}"`);
  }
  return file["input"];
};

const fieldOf = (
  record: Readonly<Record<string, unknown>>,
  key: string,
  where: string,
): Readonly<Record<string, unknown>> => {
  const value = record[key];
  if (!isRecord(value)) throw new Error(`${where}: no ${key}`);
  return value;
};

const textOf = (
  record: Readonly<Record<string, unknown>>,
  key: string,
  where: string,
): string => {
  const value = record[key];
  if (typeof value !== "string") throw new Error(`${where}: no ${key}`);
  return value;
};

/** The base64 `typedData` of the `typed-data/` vector `name`. */
export const typedDataBase64 = (name: string): string => {
  const file: unknown = snapshotVectors.typedData[name];
  if (!isRecord(file)) throw new Error(`no typed-data/ vector named "${name}"`);
  return textOf(fieldOf(file, "typedData", name), "base64", name);
};

const signedAction = (name: string): Readonly<Record<string, unknown>> => {
  const file: unknown = snapshotVectors.signedAction[name];
  if (!isRecord(file)) {
    throw new Error(`no signed-action/ vector named "${name}"`);
  }
  return file;
};

/** The signature of the `signed-action/` vector `name`, as `0x` hex. */
export const signedActionSignature = (name: string): string =>
  textOf(fieldOf(signedAction(name), "signature", name), "hex", name);

/**
 * The public test key the `signed-action/` vector `name` was signed with, and
 * its address. Public by design and test-only: it holds nothing. Read at run
 * time only; never copy it into a file.
 */
export const signedActionTestKey = (
  name: string,
): { readonly privateKey: string; readonly address: string } => {
  const key = fieldOf(signedAction(name), "testKey", name);
  return {
    privateKey: textOf(key, "privateKey", name),
    address: textOf(key, "address", name),
  };
};
