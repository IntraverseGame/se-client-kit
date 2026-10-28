// Test-only: the Snapshots of one book round (`playback`, W-50 to W-56), built
// from the vendored `valid/book-playback-won-rtp` vector and validated. The
// vendored set has no book `idle` or `starting` vector of one round yet (T-24
// waits on them), so those are the `won` vector with its round's later fields
// removed; each is validated, so a test never reads an unvalidated document.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import { validated, vectorInput } from "./vectors.ts";

export type BookStatus = "idle" | "starting" | "won" | "lost";

/** The book vectors' round id. */
export const BOOK_ROUND_ID = "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d";

type Input = Record<string, unknown>;

const objectAt = (parent: Input, key: string): Input => {
  const value = parent[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`fixture: ${key} is not an object`);
  }
  return value as Input;
};

/**
 * A book Snapshot's input of `status`, as a test may change it before it
 * validates it: `starting` carries the bound `randomnessProof` (no secret)
 * unless `proofs` is false; `won` is the vendored vector; `lost` is it with a
 * payout of 0.
 */
export const bookInput = (
  status: BookStatus,
  options: { readonly proofs?: boolean } = {},
): Input => {
  const input = vectorInput("valid", "book-playback-won-rtp");
  const config = objectAt(input, "config");
  if (status === "won") return input;
  if (status === "lost") {
    input["status"] = "lost";
    input["payout"] = {
      value: "0",
      decimals: 2,
      unit: "EUR",
      normalized: 0,
      formatted: "€0.00",
    };
    return input;
  }
  delete input["payout"];
  delete config["draw"];
  input["status"] = status;
  if (status === "idle") {
    delete input["roundId"];
    delete input["proofs"];
    input["version"] = 1;
    return input;
  }
  input["version"] = 2;
  const proofs = objectAt(input, "proofs");
  const proof = objectAt(proofs, "randomnessProof");
  delete proofs["record"];
  delete proof["roundSecret"];
  delete proof["blockValue"];
  delete proof["blockExplorerUrl"];
  if (options.proofs === false) delete input["proofs"];
  return input;
};

/** A validated book Snapshot of `status`. */
export const bookSnapshot = (
  status: BookStatus,
  options: { readonly proofs?: boolean } = {},
): ValidSnapshot => validated(bookInput(status, options));

/** `input` with its `version` set, validated. */
export const versioned = (input: Input, version: number): ValidSnapshot =>
  validated({ ...input, version });

/** The `randomnessProof` of a book Snapshot input, to change in a test. */
export const proofOf = (input: Input): Input =>
  objectAt(objectAt(input, "proofs"), "randomnessProof");

/** The `config` of a Snapshot input, to change in a test. */
export const configOf = (input: Input): Input => objectAt(input, "config");

type Event = { index: number; type: string; data?: unknown };

/** The events of a `won` or `lost` input's draw, to change in a test. */
export const eventsOf = (input: Input): Event[] => {
  const draw = configOf(input)["draw"] as { events?: Event[] } | undefined;
  if (draw?.events === undefined) throw new TypeError("fixture: no draw");
  return draw.events;
};

/**
 * A `won` book Snapshot at `version` whose events carry `data`, in order (an
 * event past the list keeps its own). Validated: the data is JSON.
 */
export const wonWithData = (
  data: readonly unknown[],
  version = 3,
): ValidSnapshot => {
  const input = bookInput("won");
  input["version"] = version;
  for (const [index, event] of eventsOf(input).entries()) {
    if (index < data.length) event.data = data[index];
  }
  return validated(input);
};

/**
 * A valid `won` book Snapshot whose first event's `data` is then set to `data`,
 * past validation: a value the network never yields (an accessor, a cycle, a
 * value that is not JSON), which only the copy's own guard meets.
 */
export const wonWithRawData = (data: unknown): ValidSnapshot => {
  const snapshot = wonWithData([{}]);
  const config = snapshot.config as { draw?: { events: Event[] } };
  const [first] = config.draw?.events ?? [];
  if (first === undefined) throw new TypeError("fixture: no event");
  first.data = data;
  return snapshot;
};

/**
 * `data` nested `levels` objects deep (`{ n: { n: ... {} } }`), level 1
 * outermost.
 */
export const nested = (levels: number): Input => {
  let inner: Input = {};
  for (let level = 1; level < levels; level += 1) inner = { n: inner };
  return inner;
};

/** A `data` of exactly `values` values: the object, its array, and numbers. */
export const ofValues = (values: number): Input => ({
  items: Array.from({ length: values - 2 }, (_, index) => index),
});
