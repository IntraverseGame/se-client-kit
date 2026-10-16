// The public API, listed by name: nothing else in `src/` is public. Key custody,
// the signer lock, and the transcript state are internal until the use cases
// that drive them (start, pick, cash-out) exist: the UI gets use cases, never
// a signing capability.

export { ShellError, type ShellErrorCode } from "./errors.ts";
export {
  createLogger,
  type LogFields,
  type LogLevel,
  type LogRecord,
  type LogSink,
  type Logger,
} from "./logger.ts";
export { REDACTED } from "./redaction.ts";
