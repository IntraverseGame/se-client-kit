// The Play API client: one function per operation of the vendored Play API
// document (`/play/v1`), on the request layer.

export type { RequestDescription } from "./errors.ts";
export { newIntent, type Intent, type RandomUuid } from "./idempotency.ts";
export { NetworkError, type NetworkFailure } from "./network-error.ts";
export {
  cashOutRound,
  continueRound,
  getSnapshot,
  redeemLaunchCode,
  refreshPlayToken,
  startRound,
  type AuthorizedCallOptions,
  type CallOptions,
  type PlayResult,
  type RedeemCallOptions,
  type RefreshCallOptions,
  type Seal,
  type Sealed,
} from "./operations.ts";
export type {
  AbortControllerLike,
  AbortSignalLike,
  CancelSignal,
  Clock,
  FetchLike,
  HeadersLike,
  RequestInitLike,
  ResponseLike,
  TimerHandle,
} from "./platform.ts";
export {
  PLAY_ROUTES,
  type PlayOperationId,
  type PlayRequestBody,
  type PlayRoute,
  type PlaySuccessBody,
  type RedeemLaunchCodeRequest,
  type RedeemLaunchCodeResponse,
  type RefreshPlayTokenResponse,
  type RoundActionRequest,
  type StartRoundRequest,
} from "./play-api.ts";
export { ProblemError } from "./problem-error.ts";
export {
  SESSION_ENDING_CODES,
  endsSession,
  readProblem,
  type ProblemSummary,
} from "./problem.ts";
export { ProtocolError, type PlayClientError } from "./protocol-error.ts";
export {
  DEFAULT_RETRY_CONFIG,
  backoffDelayMs,
  isRepeatable,
  type RetryClass,
  type RetryConfig,
} from "./retry.ts";
export {
  DEFAULT_REFRESH_CONFIG,
  DEFAULT_REFRESH_FRACTION,
  DEFAULT_REFRESH_MARGIN_MS,
  clockOffsetMs,
  isExpired,
  localDeadlineMs,
  parseDeadline,
  refreshAtMs,
  singleFlight,
  type RefreshConfig,
  type TokenDeadline,
} from "./token-schedule.ts";
export {
  DEFAULT_REQUEST_TIMEOUT_MS,
  bearerAuthorization,
  createTransport,
  type Authorization,
  type HttpMethod,
  type PlayRequest,
  type PlayResponse,
  type Transport,
  type TransportOptions,
} from "./transport.ts";
