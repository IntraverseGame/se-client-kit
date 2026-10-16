// The request layer of the Play API client. The operations (redeem, refresh,
// start, continue, cash-out, the Snapshot read) join it once the Play API
// document is vendored in `contracts`, with their wire types generated from it.

export type { RequestDescription } from "./errors.ts";
export { newIntent, type Intent, type RandomUuid } from "./idempotency.ts";
export { NetworkError, type NetworkFailure } from "./network-error.ts";
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
