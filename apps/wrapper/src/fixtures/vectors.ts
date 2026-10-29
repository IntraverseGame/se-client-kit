// Test-only: the golden Snapshot vectors, read through the `contracts`
// test-only entry. They are valid by T-5 (the `snapshot` package replays them
// with its validator), so they stand for what the session hands the UI after
// validation (W-28). Each is typed by the contract's own `Snapshot` or
// `PlayProblem` type, and assigning it to the UI's input types proves those are
// a subset of the contract.

import type { PlayProblem, Snapshot } from "@intraverse/se-client-contracts";
import { snapshotVectors } from "@intraverse/se-client-contracts/testing";

import type { ProblemInput, SnapshotInput } from "../round-input.ts";

type VectorFile = {
  readonly definition: string;
  readonly input: unknown;
};

const isVectorFile = (value: unknown): value is VectorFile =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Record<string, unknown>)["definition"] === "string" &&
  Object.hasOwn(value, "input");

const fileOf = (name: string): VectorFile => {
  const file = snapshotVectors.valid[name];
  if (!isVectorFile(file)) {
    throw new TypeError(`no valid vector ${name}`);
  }
  return file;
};

const namesOf = (definition: string): readonly string[] =>
  Object.keys(snapshotVectors.valid).filter(
    name => fileOf(name).definition === definition,
  );

/** The names of every `valid/` vector of a Snapshot. */
export const SNAPSHOT_VECTORS: readonly string[] = namesOf("Snapshot");

/** The names of every `valid/` vector of a typed error. */
export const PROBLEM_VECTORS: readonly string[] = namesOf("PlayProblem");

/** A valid Snapshot vector, typed by the contract, as the UI receives it. */
export const snapshotVector = (name: string): SnapshotInput => {
  const file = fileOf(name);
  if (file.definition !== "Snapshot") {
    throw new TypeError(`${name} is not a Snapshot vector`);
  }
  // Valid by T-5; the contract type is assigned to the UI's input type.
  const snapshot: Snapshot = structuredClone(file.input) as Snapshot;
  const input: SnapshotInput = snapshot;
  return input;
};

/** A valid typed-error vector, typed by the contract, as the UI receives it. */
export const problemVector = (name: string): ProblemInput => {
  const file = fileOf(name);
  if (file.definition !== "PlayProblem") {
    throw new TypeError(`${name} is not a PlayProblem vector`);
  }
  const problem: PlayProblem = structuredClone(file.input) as PlayProblem;
  const input: ProblemInput = problem;
  return input;
};

/** A Snapshot vector with fields replaced (the result is not revalidated). */
export const withFields = (
  snapshot: SnapshotInput,
  fields: Partial<SnapshotInput>,
): SnapshotInput => ({ ...snapshot, ...fields });
