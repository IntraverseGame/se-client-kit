// Test-only: the fairness kernel's public vectors (kernelVersion 1), read
// through the `contracts` test-only entry and narrowed to the fields the tests
// use. The files are data of unknown shape, so every field is checked.

import { kernelVectors } from "@intraverse/se-client-contracts/testing";

type Json = Readonly<Record<string, unknown>>;

const record = (value: unknown, where: string): Json => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${where}: not an object`);
  }
  return value as Json;
};

const list = (value: unknown, where: string): readonly unknown[] => {
  if (!Array.isArray(value)) throw new TypeError(`${where}: not an array`);
  return value;
};

const text = (value: unknown, where: string): string => {
  if (typeof value !== "string") throw new TypeError(`${where}: not a string`);
  return value;
};

const whole = (value: unknown, where: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError(`${where}: not a whole number`);
  }
  return value;
};

const numbers = (value: unknown, where: string): number[] =>
  list(value, where).map((entry, i) => whole(entry, `${where}[${String(i)}]`));

export type KernelVector = {
  readonly id: string;
  readonly input: Json;
  /** `expected.error`, when the vector expects one. */
  readonly error: string | undefined;
  readonly expected: Json;
};

/**
 * The vectors of one set, by the set's file name: `seed`, `shuffle-draw`,
 * `steps-derive`, `derive`, `round-secret-hash`, ... (the catalog's keys).
 */
export const vectorsOf = (set: string): KernelVector[] => {
  const file = record(kernelVectors.v1[set], set);
  if (file["kernelVersion"] !== 1) throw new TypeError(`${set}: not kernel 1`);
  if (file["set"] !== `kernel/public/v1/${set}`) {
    throw new TypeError(`${set}: another set`);
  }
  return list(file["vectors"], set).map((entry, i) => {
    const where = `${set}[${String(i)}]`;
    const vector = record(entry, where);
    const expected = record(vector["expected"], `${where}.expected`);
    const { error } = expected;
    return {
      id: text(vector["vector"], `${where}.vector`),
      input: record(vector["input"], `${where}.input`),
      error: error === undefined ? undefined : text(error, `${where}.error`),
      expected,
    };
  });
};

export const field = (parent: Json, key: string, where: string): string =>
  text(parent[key], `${where}.${key}`);

export type ExpectedStep = {
  readonly losers: number[];
  readonly draws: bigint[] | undefined;
  readonly acceptedAtCtr: number[];
};

/** `expected.steps`: losers, the draws (decimal text) when given, counters. */
export const expectedSteps = (vector: KernelVector): ExpectedStep[] =>
  list(vector.expected["steps"], `${vector.id}.steps`).map((entry, j) => {
    const where = `${vector.id}.steps[${String(j)}]`;
    const step = record(entry, where);
    const { draws } = step;
    return {
      losers: numbers(step["losers"], `${where}.losers`),
      draws:
        draws === undefined
          ? undefined
          : list(draws, `${where}.draws`).map(d =>
              BigInt(text(d, `${where}.draws`)),
            ),
      acceptedAtCtr: numbers(step["acceptedAtCtr"], `${where}.acceptedAtCtr`),
    };
  });

/** `input.steps` of a steps-derive vector: each step's `(n, k)`. */
export const inputSteps = (
  vector: KernelVector,
): { readonly n: number; readonly k: number }[] =>
  list(vector.input["steps"], `${vector.id}.input.steps`).map((entry, j) => {
    const where = `${vector.id}.input.steps[${String(j)}]`;
    const step = record(entry, where);
    return {
      n: whole(step["n"], `${where}.n`),
      k: whole(step["k"], `${where}.k`),
    };
  });

/**
 * A derive vector's path as steps: node `path[j]`'s `(options, losers)` is step
 * `j`'s `(n, k)`, and the node ids the expected steps name.
 */
export const pathSteps = (
  vector: KernelVector,
): { readonly nodes: number[]; readonly steps: { n: number; k: number }[] } => {
  const where = `${vector.id}.input`;
  const nodes = list(
    record(vector.input["terms"], `${where}.terms`)["nodes"],
    `${where}.terms.nodes`,
  ).map((entry, i) => record(entry, `${where}.terms.nodes[${String(i)}]`));
  const path = numbers(vector.input["path"], `${where}.path`);
  return {
    nodes: path,
    steps: path.map(id => {
      const node = nodes[id];
      if (node === undefined)
        throw new TypeError(`${where}: no node ${String(id)}`);
      return {
        n: whole(node["options"], `${where}.node.options`),
        k: whole(node["losers"], `${where}.node.losers`),
      };
    }),
  };
};

/** The node id of each expected step of a derive vector. */
export const expectedNodes = (vector: KernelVector): number[] =>
  list(vector.expected["steps"], `${vector.id}.steps`).map((entry, j) =>
    whole(record(entry, `${vector.id}.steps[${String(j)}]`)["node"], "node"),
  );
