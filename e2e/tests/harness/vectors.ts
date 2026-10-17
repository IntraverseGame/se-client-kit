// The Snapshot vectors the fake Play API answers with. This module is the e2e
// suite's only importer of the test-only entry of the `contracts` package: the
// suite is development-only, and nothing here reaches a bundle.
//
// A `valid/` vector is a document the vendored `se.snapshot/1` schema accepts
// (the `snapshot` package's T-5 replay proves it), and the Play API document's
// `Snapshot` and `PlayProblem` components are generated from that schema, so a
// body taken from one is a body the document allows. Only `valid/` vectors are
// served; an `invalid/` vector is never a response.

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
