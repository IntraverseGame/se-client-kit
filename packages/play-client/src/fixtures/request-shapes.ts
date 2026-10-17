// The request bodies the fake Play API accepts, by operation, as the vendored
// document defines them: each body's fields, required or optional. Each table
// is checked against the document's generated request type at compile time
// (every field listed, none added, each one's optionality as the type has
// it), so a document change breaks the fake instead of loosening it. The
// document decodes bodies strictly: an unknown field, a missing required one,
// or a body on an operation that takes none is a 400.

import type { PlayOperationId, PlayRequestBody } from "../play-api.ts";

type Presence<T> = {
  readonly [K in keyof T]-?: undefined extends T[K] ? "optional" : "required";
};

/** The fields of each operation's body; `undefined` for one that takes none. */
export type RequestShapes = {
  readonly [Id in PlayOperationId]: [PlayRequestBody<Id>] extends [never]
    ? undefined
    : Presence<PlayRequestBody<Id>>;
};

// Every table is an object literal in place, so the compiler's excess-property
// check refuses a field the document's type does not have.
export const REQUEST_SHAPES: RequestShapes = {
  redeemLaunchCode: { launchCode: "required" },
  refreshPlayToken: undefined,
  startRound: {
    idempotencyKey: "required",
    bet: "required",
    actionKey: "required",
    shape: "optional",
  },
  continueRound: {
    idempotencyKey: "required",
    roundId: "required",
    typedData: "required",
    signature: "required",
  },
  cashOutRound: {
    idempotencyKey: "required",
    roundId: "required",
    typedData: "required",
    signature: "required",
  },
  cancelRound: {
    idempotencyKey: "required",
    roundId: "required",
    typedData: "required",
    signature: "required",
  },
  getSnapshot: undefined,
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Whether `body` is a body the document accepts for operation `id`. */
export const isAcceptedBody = (id: PlayOperationId, body: unknown): boolean => {
  const shape: Readonly<Record<string, string>> | undefined =
    REQUEST_SHAPES[id];
  if (shape === undefined) return body === undefined;
  if (!isRecord(body)) return false;
  const known = Object.keys(body).every(key => Object.hasOwn(shape, key));
  const complete = Object.entries(shape).every(
    ([key, presence]) => presence === "optional" || Object.hasOwn(body, key),
  );
  return known && complete;
};
