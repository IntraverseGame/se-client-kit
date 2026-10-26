// What the fake Play API knows of the vendored Play API document (`/play/v1`),
// all of it held to the document's generated types at compile time: each
// operation's route, the statuses its responses list, and the fields of its
// request body. A change of the document breaks this module instead of
// loosening the fake.

import type {
  PlayApiOperationRoutes,
  PlayApiOperations,
} from "@intraverse/se-client-contracts";

export type PlayOperationId = keyof PlayApiOperationRoutes &
  keyof PlayApiOperations;

/**
 * Every operation's literal path and method, as the document's `paths` list
 * them.
 */
export const PLAY_ROUTES: PlayApiOperationRoutes = {
  redeemLaunchCode: { path: "/play/v1/sessions:redeem", method: "post" },
  refreshPlayToken: { path: "/play/v1/sessions:refresh", method: "post" },
  startRound: { path: "/play/v1/rounds:start", method: "post" },
  continueRound: { path: "/play/v1/rounds:continue", method: "post" },
  cashOutRound: { path: "/play/v1/rounds:cashOut", method: "post" },
  cancelRound: { path: "/play/v1/rounds:cancel", method: "post" },
  getSnapshot: { path: "/play/v1/snapshot", method: "get" },
  listGrants: { path: "/play/v1/grants", method: "get" },
};

export const PLAY_OPERATIONS = Object.keys(
  PLAY_ROUTES,
) as readonly PlayOperationId[];

/** The statuses an operation's responses list in the document. */
export type ListedStatus<Id extends PlayOperationId> = Extract<
  keyof PlayApiOperations[Id]["responses"],
  number
>;

type ListedStatuses = {
  readonly [Id in PlayOperationId]: readonly ListedStatus<Id>[];
};

/**
 * Each operation's listed statuses at run time. Every element is checked to be
 * listed; `MissingListedStatus` below checks that none is left out.
 */
export const LISTED_STATUSES = {
  redeemLaunchCode: [200, 400, 401, 500, 503],
  refreshPlayToken: [200, 401, 404, 500, 503],
  startRound: [200, 400, 401, 404, 409, 422, 500, 503],
  continueRound: [200, 400, 401, 404, 409, 422, 500, 503],
  cashOutRound: [200, 400, 401, 404, 409, 422, 500, 503],
  cancelRound: [200, 400, 401, 404, 422, 500, 503],
  getSnapshot: [200, 401, 404, 422, 500, 503],
  listGrants: [200, 400, 401, 404, 500, 503],
} as const satisfies ListedStatuses;

/** A status the document lists that `LISTED_STATUSES` leaves out: `never`. */
export type MissingListedStatus = {
  readonly [Id in PlayOperationId]: Exclude<
    ListedStatus<Id>,
    (typeof LISTED_STATUSES)[Id][number]
  >;
}[PlayOperationId];

/** Compiles only while `MissingListedStatus` is `never`. */
export const LISTED_STATUSES_COMPLETE: [MissingListedStatus] extends [never]
  ? true
  : MissingListedStatus = true;

/** An operation whose responses do not list 500: `never`. */
export type OperationWithout500 = {
  readonly [Id in PlayOperationId]: 500 extends ListedStatus<Id> ? never : Id;
}[PlayOperationId];

/**
 * Compiles only while every operation lists 500, so the fake's `INTERNAL`
 * fallback can never send a status an operation does not list.
 */
export const INTERNAL_LISTED_EVERYWHERE: [OperationWithout500] extends [never]
  ? true
  : OperationWithout500 = true;

export const isListedStatus = (id: PlayOperationId, status: number): boolean =>
  (LISTED_STATUSES[id] as readonly number[]).includes(status);

/** The JSON body an operation takes, or `never` for one that takes none. */
export type PlayRequestBody<Id extends PlayOperationId> =
  PlayApiOperations[Id] extends {
    readonly requestBody: {
      readonly content: { readonly "application/json": infer Body };
    };
  }
    ? Body
    : never;

/** The JSON body of an operation's 200 response. */
export type PlaySuccessBody<Id extends PlayOperationId> =
  PlayApiOperations[Id]["responses"] extends {
    readonly 200: {
      readonly content: { readonly "application/json": infer Body };
    };
  }
    ? Body
    : never;

type Presence<T> = {
  readonly [K in keyof T]-?: undefined extends T[K] ? "optional" : "required";
};

type RequestShapes = {
  readonly [Id in PlayOperationId]: [PlayRequestBody<Id>] extends [never]
    ? undefined
    : Presence<PlayRequestBody<Id>>;
};

// Object literals in place, so the excess-property check refuses a field the
// document's type does not have, and a missing one does not compile.
const REQUEST_SHAPES: RequestShapes = {
  redeemLaunchCode: { launchCode: "required" },
  refreshPlayToken: undefined,
  startRound: {
    idempotencyKey: "required",
    bet: "required",
    actionKey: "required",
    shape: "optional",
    grantId: "optional",
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

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Whether `body` is one the document accepts for operation `id`: the document
 * decodes bodies strictly, so an unknown field, a missing required one, or a
 * body on an operation that takes none is a 400. Field values are not checked
 * against their patterns.
 */
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

/** The operations whose 200 body is a Snapshot. */
export type SnapshotOperationId = Exclude<
  PlayOperationId,
  "redeemLaunchCode" | "refreshPlayToken"
>;

export const isSnapshotOperation = (
  id: PlayOperationId,
): id is SnapshotOperationId =>
  id !== "redeemLaunchCode" && id !== "refreshPlayToken";
