// The request layer of the Play API client. The operations (redeem, refresh,
// start, continue, cash-out, the Snapshot read) join it once the Play API
// document is vendored in `contracts`, with their wire types generated from it.

import type { RequestDescription } from "./errors.ts";
import { newIntent, type Intent, type RandomUuid } from "./idempotency.ts";
import { NetworkError, type NetworkFailure } from "./network-error.ts";
import type {
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
import { ProblemError } from "./problem-error.ts";
import {
  SESSION_ENDING_CODES,
  endsSession,
  readProblem,
  type ProblemSummary,
} from "./problem.ts";
import { ProtocolError, type PlayClientError } from "./protocol-error.ts";
import {
  DEFAULT_RETRY_CONFIG,
  backoffDelayMs,
  isRepeatable,
  type RetryClass,
  type RetryConfig,
} from "./retry.ts";
import {
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
import {
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

export {
  DEFAULT_REFRESH_CONFIG,
  DEFAULT_REFRESH_FRACTION,
  DEFAULT_REFRESH_MARGIN_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_RETRY_CONFIG,
  NetworkError,
  ProblemError,
  ProtocolError,
  SESSION_ENDING_CODES,
  backoffDelayMs,
  bearerAuthorization,
  clockOffsetMs,
  createTransport,
  endsSession,
  isExpired,
  isRepeatable,
  localDeadlineMs,
  newIntent,
  parseDeadline,
  readProblem,
  refreshAtMs,
  singleFlight,
};

export type {
  AbortControllerLike,
  AbortSignalLike,
  Authorization,
  CancelSignal,
  Clock,
  FetchLike,
  HeadersLike,
  HttpMethod,
  Intent,
  NetworkFailure,
  PlayClientError,
  PlayRequest,
  PlayResponse,
  ProblemSummary,
  RandomUuid,
  RefreshConfig,
  RequestDescription,
  RequestInitLike,
  ResponseLike,
  RetryClass,
  RetryConfig,
  TimerHandle,
  TokenDeadline,
  Transport,
  TransportOptions,
};
