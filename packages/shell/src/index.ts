// The public API, listed by name: nothing else in `src/` is public. Key custody,
// the signer lock, and the transcript state are internal until the use cases
// that drive them (start, pick, cash-out) exist: the UI gets use cases, never
// a signing capability. The chain configuration's validation is public because
// the Wrapper applies W-26a's boot rule before it starts; the RPC call and
// transport types are public because the Wrapper supplies the transport (it
// owns `fetch` and the Content Security Policy). The tip check and its decision
// stay internal until the start flow that acts on them exists. The game bridge
// and the `se.controller/1` message types are public because the Wrapper mounts
// the game iframe and owns the window it talks through; the bridge holds no
// secret and no signing capability, and gets the pick use case injected. The
// Snapshot reader is public because the Wrapper UI renders only Snapshots and
// typed errors the shell validated (W-28, W-42); it returns data, never a key,
// a token, or a signing capability. The round flows (start, move, cash-out,
// the required cancel) and the pick use case stay internal until the Wrapper
// wires them.

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
export {
  createControllerBridge,
  type ControllerBridge,
  type ControllerBridgeOptions,
  type ControllerBridgeResult,
  type ControllerBridgeState,
  type ControllerMountRefusal,
  type GameFrame,
  type GameMessageEvent,
  type ListenForMessages,
  type PickOutcome,
  type PickUseCase,
} from "./controller-bridge.ts";
export {
  CONTROLLER_SCHEMA,
  ROUND_STATUSES,
  type ActionMessage,
  type GameMessage,
  type GameSnapshot,
  type GameStep,
  type HelloMessage,
  type Pick,
  type Presentation,
  type RejectMessage,
  type RejectReason,
  type RoundStatus,
  type SnapshotMessage,
  type WrapperMessage,
} from "./controller-protocol.ts";
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
export {
  createSnapshotReader,
  type SnapshotRead,
  type SnapshotReader,
  type SnapshotReaderOptions,
  type ValidPlayProblem,
  type ValidSnapshot,
} from "./snapshot-read.ts";
