// The redacting logger (W-4, W-41, and the Wrapper's Observability section).
// A line is an event name and a closed set of request fields: the method, the
// path, the status, the `requestId`, and a `code`. There is no free text, no
// header, no body, and no document, so a secret has nowhere to go. Every value
// is checked at run time as well, since a caller can get around a type: a
// value that is not of its field's shape is printed as `[redacted]`.

import { REDACTED } from "./redaction.ts";

/** The Wrapper's console shows `warn` and above only. */
export type LogLevel = "warn" | "error";

/** What a log line may carry about a request or a failure. */
export type LogFields = {
  /** The HTTP method, in capitals. */
  readonly method?: string;
  /** The request path, absolute, without a query string or a fragment. */
  readonly path?: string;
  /** The HTTP status. */
  readonly status?: number;
  /** The problem's `requestId`, so support can find the call. */
  readonly requestId?: string;
  /** A typed `code` (a problem's, or an error's). */
  readonly code?: string;
  /**
   * An error: only its `name` and its string `code` are kept, never its
   * message, stack, or other fields.
   */
  readonly cause?: unknown;
};

/** One line, as the sink receives it: plain, frozen, and safe to print. */
export type LogRecord = {
  readonly level: LogLevel;
  readonly event: string;
  readonly method?: string;
  readonly path?: string;
  /** `[redacted]` when the given status was not an HTTP status. */
  readonly status?: number | typeof REDACTED;
  readonly requestId?: string;
  readonly code?: string;
  readonly causeName?: string;
  readonly causeCode?: string;
};

/** Where lines go: the Wrapper passes one that writes to the console. */
export type LogSink = (record: LogRecord) => void;

export type Logger = {
  readonly warn: (event: string, fields?: LogFields) => void;
  readonly error: (event: string, fields?: LogFields) => void;
};

// An event is a fixed name such as `session.lock-held-elsewhere`.
const EVENT = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const METHOD = /^[A-Z]{1,16}$/u;
// A path is printable ASCII without spaces, `?`, or `#`.
const PATH = /^\/[!-"$->@-~]{0,255}$/u;
// A `requestId`, a `code`, or an error's `name`: a short token.
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MIN_STATUS = 100;
const MAX_STATUS = 599;

const matching = (value: unknown, pattern: RegExp): string =>
  typeof value === "string" && pattern.test(value) ? value : REDACTED;

const statusOf = (value: unknown): number | typeof REDACTED =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= MIN_STATUS &&
  value <= MAX_STATUS
    ? value
    : REDACTED;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

// Reads one property of a value that may be hostile: a throwing getter or proxy
// trap yields nothing rather than an exception from the logger.
const read = (value: unknown, key: string): unknown => {
  try {
    return isRecord(value) ? value[key] : undefined;
  } catch {
    return undefined;
  }
};

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const toRecord = (
  level: LogLevel,
  event: unknown,
  fields: LogFields | undefined,
): LogRecord => {
  const record: Mutable<LogRecord> = { level, event: matching(event, EVENT) };
  const method = read(fields, "method");
  const path = read(fields, "path");
  const status = read(fields, "status");
  const requestId = read(fields, "requestId");
  const code = read(fields, "code");
  const cause = read(fields, "cause");
  if (method !== undefined) record.method = matching(method, METHOD);
  if (path !== undefined) record.path = matching(path, PATH);
  if (status !== undefined) record.status = statusOf(status);
  if (requestId !== undefined) record.requestId = matching(requestId, TOKEN);
  if (code !== undefined) record.code = matching(code, TOKEN);
  if (cause !== undefined) {
    record.causeName = matching(read(cause, "name"), TOKEN);
    const causeCode = read(cause, "code");
    if (causeCode !== undefined) record.causeCode = matching(causeCode, TOKEN);
  }
  return Object.freeze(record);
};

/**
 * A logger that hands `sink` only redacted, closed records. A sink that throws
 * is ignored: logging never breaks the shell.
 */
export const createLogger = (sink: LogSink): Logger => {
  const emit = (
    level: LogLevel,
    event: string,
    fields: LogFields | undefined,
  ): void => {
    try {
      sink(toRecord(level, event, fields));
    } catch {
      // A failing sink loses the line; nothing else depends on it.
    }
  };
  return Object.freeze({
    warn: (event: string, fields?: LogFields): void => {
      emit("warn", event, fields);
    },
    error: (event: string, fields?: LogFields): void => {
      emit("error", event, fields);
    },
  });
};
