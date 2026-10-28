// The type-only entry of the controller protocol `se.controller/1`
// (`@intraverse/se-client-shell/controller`), for a game: the message types and
// the game's copy of a Snapshot, and nothing else. It holds no runtime code, so
// importing it (with `import type`) adds nothing to a game's bundle, and none of
// these types reaches a key, a token, a signature, or a shell internal.

export type {
  ActionMessage,
  GameBookDraw,
  GameBookEvent,
  GameEventData,
  GameJsonValue,
  GameMessage,
  GamePlaybackSnapshot,
  GameSnapshot,
  GameStep,
  HelloMessage,
  Pick,
  Presentation,
  RejectMessage,
  RejectReason,
  RoundStatus,
  SnapshotMessage,
  WrapperMessage,
} from "./controller-protocol.ts";
