// The verify API operation as the client sees it (`/verify/v1`): the route,
// checked at compile time against the types generated from the vendored verify
// API document, and `getRoundVerification` on the request layer. The answer is
// `unknown`: a round's evidence is untrusted until the consumer (the verify
// page) validates it. The call has no credential, and it is a read, so it is
// repeated as one is (`idempotent`).

import type {
  VerifyApiOperationRoutes,
  VerifyApiOperations,
  VerifyApiPaths,
} from "@intraverse/se-client-contracts";

import type { CallOptions, PlayResult } from "./operations.ts";
import type { Transport } from "./transport.ts";

/** An operation of the verify API document, by its `operationId`. */
export type VerifyOperationId = keyof VerifyApiOperations;

type DocumentPath = keyof VerifyApiPaths;

/** The document's paths all start with this; `verifyApiBaseUrl` ends with it. */
const DOCUMENT_PREFIX = "/verify/v1";

/** `P` exactly when the document serves operation `Id` at `GET` and `P`. */
type PathOf<Id extends VerifyOperationId, P extends DocumentPath> = [
  VerifyApiOperationRoutes[Id],
] extends [{ readonly path: P; readonly method: "get" }]
  ? [P] extends [VerifyApiOperationRoutes[Id]["path"]]
    ? P
    : never
  : never;

export type VerifyRoute = {
  readonly method: "GET";
  /** The path below the configured base, `{name}` marking a path parameter. */
  readonly path: string;
};

/** One operation's route; it compiles only if the document serves it so. */
export const verifyRoute = <
  Id extends VerifyOperationId,
  P extends DocumentPath,
>(
  _id: Id,
  path: PathOf<Id, P>,
): VerifyRoute => ({ method: "GET", path: path.slice(DOCUMENT_PREFIX.length) });

/** Every operation of the document, by `operationId`. */
export const VERIFY_ROUTES: Readonly<Record<VerifyOperationId, VerifyRoute>> =
  Object.freeze({
    getRoundVerification: verifyRoute(
      "getRoundVerification",
      "/verify/v1/rounds/{roundId}",
    ),
  });

/**
 * Reads a round's public evidence and its recomputation
 * (`getRoundVerification`): `GET <verifyApiBaseUrl>/rounds/{roundId}`. The
 * transport's base is `verifyApiBaseUrl`, which ends with `/verify/v1`. It
 * sends no credential. `roundId` is the round's UUIDv7 in lowercase; it is
 * percent-encoded into the path, and the caller checks its form. Resolves with
 * the body as `unknown`. A `404` (`NOT_FOUND`), `400`, `429` (`RATE_LIMITED`),
 * `500`, or `503` with a problem body rejects with a `ProblemError`; an error
 * status without one with a `ProtocolError`; no answer with a `NetworkError`.
 */
export const getRoundVerification = async (
  transport: Transport,
  roundId: string,
  options: CallOptions = {},
): Promise<PlayResult<unknown>> => {
  const route = VERIFY_ROUTES.getRoundVerification;
  const response = await transport.send({
    method: route.method,
    path: route.path.replace("{roundId}", encodeURIComponent(roundId)),
    retry: "idempotent",
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  return Object.freeze({
    body: response.body,
    receivedAtMs: response.receivedAtMs,
    clockOffsetMs: response.clockOffsetMs,
  });
};
