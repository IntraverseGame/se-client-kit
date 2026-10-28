// The game's side of `se.controller/1` (specs/wrapper/the-game-iframe-and-the-
// controller-boundary.md, W-38). The types come from shell's type-only subpath,
// so nothing of the shell runs here; the values the game needs at run time (the
// schema name, the statuses it declares) are its own.
//
// What the Wrapper sends is untrusted until it is parsed: a message is read only
// through the own data properties of a plain object (never a getter), every
// field is checked, and a message with a missing or extra field, an unknown
// `type`, or a bad value is refused (`undefined`). A parsed message is a fresh,
// frozen copy, never the object that arrived.

import type {
  ActionMessage,
  HelloMessage,
  RejectMessage,
  RejectReason,
  SnapshotMessage,
  WrapperMessage,
} from "@intraverse/se-client-shell/controller";

import { parsePlaybackSnapshot } from "./book-snapshot.ts";
import { parseGameSnapshot, STATUSES } from "./game-snapshot.ts";
import { type Fields, hasFields, oneOf, plainFields } from "./plain-data.ts";

/** The protocol's name and version, carried by every message. */
export const SCHEMA: HelloMessage["schema"] = "se.controller/1";

const REJECT_REASONS: readonly RejectReason[] = Object.freeze([
  "not_legal",
  "not_active",
  "busy",
  "invalid",
]);

/** 1 to 64 characters from `[A-Za-z0-9_-]`, as the protocol says. */
const ACTION_ID = /^[A-Za-z0-9_-]{1,64}$/u;

/**
 * The game's `hello`: both presentations (the `steps` rounds and the book
 * slot's `playback`) and all seven statuses.
 */
export const helloMessage = (): HelloMessage =>
  Object.freeze({
    schema: SCHEMA,
    type: "hello",
    presentations: Object.freeze(["steps", "playback"] as const),
    statuses: STATUSES,
  });

/** A pick request for `option` of `step`, under the game's own `id`. */
export const actionMessage = (
  id: string,
  step: number,
  option: number,
): ActionMessage =>
  Object.freeze({
    schema: SCHEMA,
    type: "action",
    id,
    verb: "pick",
    args: Object.freeze({ step, option }),
  });

const parseSnapshotMessage = (fields: Fields): SnapshotMessage | undefined => {
  if (!hasFields(fields, ["schema", "type", "snapshot"])) return undefined;
  const data = fields.get("snapshot");
  // Each parser takes its own presentation only, so at most one succeeds.
  const snapshot = parseGameSnapshot(data) ?? parsePlaybackSnapshot(data);
  return snapshot === undefined
    ? undefined
    : Object.freeze({ schema: SCHEMA, type: "snapshot", snapshot });
};

const parseRejectMessage = (fields: Fields): RejectMessage | undefined => {
  if (!hasFields(fields, ["schema", "type", "id", "reason"])) return undefined;
  const id = fields.get("id");
  const reason = fields.get("reason");
  if (typeof id !== "string" || !ACTION_ID.test(id)) return undefined;
  if (!oneOf(reason, REJECT_REASONS)) return undefined;
  return Object.freeze({ schema: SCHEMA, type: "reject", id, reason });
};

/**
 * Parses a message from the Wrapper against `se.controller/1`: a `snapshot` or
 * a `reject` with exactly its fields, each well formed, or `undefined`.
 */
export const parseWrapperMessage = (
  data: unknown,
): WrapperMessage | undefined => {
  const fields = plainFields(data);
  if (fields === undefined || fields.get("schema") !== SCHEMA) return undefined;
  switch (fields.get("type")) {
    case "snapshot": {
      return parseSnapshotMessage(fields);
    }
    case "reject": {
      return parseRejectMessage(fields);
    }
    default: {
      return undefined;
    }
  }
};
