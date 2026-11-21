// The request bodies the fake Play API accepts, by operation, as the vendored
// document defines them: each body's fields, required or optional. Each table
// is checked against the document's generated request type at compile time
// (every field listed, none added, each one's optionality as the type has
// it), so a document change breaks the fake instead of loosening it. The
// document decodes bodies strictly: an unknown field, a missing required one,
// or a body on an operation that takes none is a 400. The start's
// `keyDelegation`, a closed object the document allows as `null`, is decoded
// as strictly (T-43): `null`, or an object of exactly its fields.

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
    grantId: "optional",
    keyDelegation: "optional",
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
  listGrants: undefined,
};

type KeyDelegationRequest = NonNullable<
  PlayRequestBody<"startRound">["keyDelegation"]
>;

/** The fields of the start's `keyDelegation`, as the document's type has them. */
export const KEY_DELEGATION_SHAPE: Presence<KeyDelegationRequest> = {
  wallet: "required",
  expiry: "required",
  noticeHash: "required",
  signature: "required",
};

type Shape = Readonly<Record<string, string>>;

/**
 * The object fields decoded as strictly as their body, by operation: each
 * field's own shape. The document allows each one as `null`.
 */
const NESTED_SHAPES: {
  readonly [Id in PlayOperationId]?: Readonly<Record<string, Shape>>;
} = { startRound: { keyDelegation: KEY_DELEGATION_SHAPE } };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Whether `value` is an object of exactly `shape`'s fields. */
const fits = (
  shape: Shape,
  value: unknown,
): value is Readonly<Record<string, unknown>> => {
  if (!isRecord(value)) return false;
  const known = Object.keys(value).every(key => Object.hasOwn(shape, key));
  const complete = Object.entries(shape).every(
    ([key, presence]) => presence === "optional" || Object.hasOwn(value, key),
  );
  return known && complete;
};

/** Whether `body` is a body the document accepts for operation `id`. */
export const isAcceptedBody = (id: PlayOperationId, body: unknown): boolean => {
  const shape: Shape | undefined = REQUEST_SHAPES[id];
  if (shape === undefined) return body === undefined;
  if (!fits(shape, body)) return false;
  return Object.entries(NESTED_SHAPES[id] ?? {}).every(
    ([key, nested]) =>
      !Object.hasOwn(body, key) ||
      body[key] === null ||
      fits(nested, body[key]),
  );
};
