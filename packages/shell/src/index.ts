// The public API, listed by name: nothing else in `src/` is public. The chain
// configuration's validation is public because the Wrapper applies W-26a's
// boot rule before it starts; the RPC call and transport types are public
// because the Wrapper supplies the transport (it owns `fetch` and the Content
// Security Policy). The game bridge and the `se.controller/1` message types are
// public because the Wrapper mounts the game iframe and owns the window it
// talks through; the bridge holds no secret and no signing capability, and gets
// the pick use case injected. The operator channel and the `se.operator/1`
// message types are public for the same reason: the Wrapper routes the parent
// window's messages to it and awaits its handshake before it opens the
// session; it holds no secret and posts only `welcome` and `resize`. The
// Snapshot reader is public because the Wrapper UI renders only Snapshots and
// typed errors the shell validated (W-28, W-42); it returns data, never a key,
// a token, or a signing capability.
//
// The session (`openPlaySession`) is the UI's way to play: it opens the
// session from the launch code, holds the play token and the key, and gives
// use cases (read, start, cash-out, mounting the game with the session's pick
// use case) and read-only state. Key custody, the signer lock, the transcript
// state, the tip check, the round flows, and the pick use case stay internal:
// the UI gets use cases, never a signing capability, and no public type
// carries the round flows' test-only typedData encoder.

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
export type { CancelState } from "./cancel-state.ts";
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
  type GameBookDraw,
  type GameBookEvent,
  type GameEventData,
  type GameJsonValue,
  type GameMessage,
  type GamePlaybackSnapshot,
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
  createOperatorChannel,
  HANDSHAKE_TIMEOUT_MS,
  type HandshakeOutcome,
  type HandshakeRefusal,
  type OperatorChannel,
  type OperatorChannelState,
  type OperatorCheck,
  type OperatorMessageEvent,
  type OperatorWindow,
} from "./operator-channel.ts";
export {
  MAX_RESIZE_HEIGHT,
  OPERATOR_SCHEMA,
  type OperatorBoundMessage,
  type OperatorHello,
  type ResizeMessage,
  type WelcomeMessage,
} from "./operator-protocol.ts";
export type { BindMode, FailReason } from "./chain-decision.ts";
export {
  discardLaunchCode,
  MAX_LAUNCH_CODE_LENGTH,
  takeLaunchCode,
  type LaunchHistory,
  type LaunchLocation,
} from "./launch-code.ts";
export { openPlaySession } from "./play-session.ts";
export type { PlaySessionOptions, SessionParts } from "./session-options.ts";
export type {
  GameMount,
  GameMountOptions,
  PlaySession,
  RoundState,
  SessionOpening,
  SessionRead,
} from "./session-types.ts";
export type { Bet } from "./round-start.ts";
export type {
  Clock,
  FetchLike,
  RefreshConfig,
  TimerHandle,
} from "@intraverse/se-client-play-client";
export { isRoundOver, type RoundEnd } from "./snapshot-reading.ts";
export {
  createLogger,
  type LogFields,
  type LogLevel,
  type LogRecord,
  type LogSink,
  type Logger,
} from "./logger.ts";
export { REDACTED, type LaunchCode } from "./redaction.ts";
export type { BlockTag, RpcCall, RpcTransport } from "./rpc-transport.ts";
export {
  createSnapshotReader,
  type SnapshotRead,
  type SnapshotReader,
  type SnapshotReaderOptions,
  type ValidPlayProblem,
  type ValidSnapshot,
} from "./snapshot-read.ts";
