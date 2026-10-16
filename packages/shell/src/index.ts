// The public API, listed by name: nothing else in `src/` is public. Key custody,
// the signer lock, and the transcript state are internal until the use cases
// that drive them (start, pick, cash-out) exist: the UI gets use cases, never
// a signing capability. The chain configuration's validation is public because
// the Wrapper applies W-26a's boot rule before it starts; the RPC call and
// transport types are public because the Wrapper supplies the transport (it
// owns `fetch` and the Content Security Policy). The tip check and its decision
// stay internal until the start flow that acts on them exists.

export {
  DEFAULT_MIN_RPC_QUORUM,
  validateChainConfig,
  type ChainConfig,
  type ChainConfigIssue,
  type ChainConfigIssueCode,
  type ChainConfigResult,
  type Environment,
  type SourceConfig,
} from "./chain-config.ts";
export type { RpcEndpoint } from "./config-fields.ts";
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
export type { BlockTag, RpcCall, RpcTransport } from "./rpc-transport.ts";
