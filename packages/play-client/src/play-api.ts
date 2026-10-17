// The Play API document's operations as the client sees them: the wire types,
// taken from the types generated from the vendored document (no hand-written
// wire type), and each operation's method and path, checked at compile time
// against the document's literal route table (`PlayApiOperationRoutes`, read
// from its `paths`): two operations of one shape are told apart by it.

import type {
  PlayApiOperationRoutes,
  PlayApiOperations,
  PlayApiPaths,
} from "@intraverse/se-client-contracts";

/** An operation of the Play API document, by its `operationId`. */
export type PlayOperationId = keyof PlayApiOperations;

type JsonContent<T> = T extends {
  readonly content: { readonly "application/json": infer Body };
}
  ? Body
  : never;

/** The JSON request body of an operation (`never` when it takes none). */
export type PlayRequestBody<Id extends PlayOperationId> =
  PlayApiOperations[Id] extends { readonly requestBody: infer Body }
    ? JsonContent<Body>
    : never;

/** The JSON body of an operation's `200` response. */
export type PlaySuccessBody<Id extends PlayOperationId> = JsonContent<
  PlayApiOperations[Id]["responses"][200]
>;

/** `POST /play/v1/sessions:redeem`: the launch code to exchange. */
export type RedeemLaunchCodeRequest = PlayRequestBody<"redeemLaunchCode">;
/** The session and its first play token. `playToken` is a secret. */
export type RedeemLaunchCodeResponse = PlaySuccessBody<"redeemLaunchCode">;
/** The new play token. `playToken` is a secret. */
export type RefreshPlayTokenResponse = PlaySuccessBody<"refreshPlayToken">;
/** `POST /play/v1/rounds:start`: the intent's key, the bet, the action key. */
export type StartRoundRequest = PlayRequestBody<"startRound">;
/** A signed move or cash-out, passed to the engine unread. */
export type RoundActionRequest = PlayRequestBody<"continueRound">;

type DocumentPath = keyof PlayApiPaths;
type DocumentMethod = "get" | "post";

/**
 * The document's paths all start with this; the configured base
 * (`playApiBaseUrl`) ends with it, so a request's path is the rest.
 */
const DOCUMENT_PREFIX = "/play/v1";

/**
 * `P` exactly when the document serves operation `Id` at method `M` and path
 * `P` (its literal route), else `never`. Literal, not structural: a move and a
 * cash-out have one shape, and only their routes differ.
 */
type PathOf<
  Id extends PlayOperationId,
  M extends DocumentMethod,
  P extends DocumentPath,
> = [PlayApiOperationRoutes[Id]] extends [
  { readonly path: P; readonly method: M },
]
  ? [P] extends [PlayApiOperationRoutes[Id]["path"]]
    ? P
    : never
  : never;

export type PlayRoute = {
  readonly method: "GET" | "POST";
  /** The path below the configured base. */
  readonly path: string;
};

/**
 * One operation's route. It compiles only when the document serves `id` at
 * `method` and `path`, so a route cannot drift from the vendored document.
 */
export const playRoute = <
  Id extends PlayOperationId,
  M extends DocumentMethod,
  P extends DocumentPath,
>(
  _id: Id,
  method: M,
  path: PathOf<Id, M, P>,
): PlayRoute => ({
  method: method === "get" ? "GET" : "POST",
  path: path.slice(DOCUMENT_PREFIX.length),
});

/** Every operation of the document, by `operationId`. */
export const PLAY_ROUTES: Readonly<Record<PlayOperationId, PlayRoute>> =
  Object.freeze({
    redeemLaunchCode: playRoute(
      "redeemLaunchCode",
      "post",
      "/play/v1/sessions:redeem",
    ),
    refreshPlayToken: playRoute(
      "refreshPlayToken",
      "post",
      "/play/v1/sessions:refresh",
    ),
    startRound: playRoute("startRound", "post", "/play/v1/rounds:start"),
    continueRound: playRoute(
      "continueRound",
      "post",
      "/play/v1/rounds:continue",
    ),
    cashOutRound: playRoute("cashOutRound", "post", "/play/v1/rounds:cashOut"),
    getSnapshot: playRoute("getSnapshot", "get", "/play/v1/snapshot"),
  });
