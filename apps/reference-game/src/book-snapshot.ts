// The game's copy of a `playback` Snapshot (a book round, W-38's `playback`
// allow-list), checked field by field before the game renders it. It is read
// like the `steps` copy (game-snapshot.ts): own data properties of plain
// objects and dense arrays only, and a missing required field, a field outside
// the list, or a bad value refuses the whole Snapshot. The result is a fresh,
// frozen copy.
//
// A book round shows four statuses (W-54): `idle`, `starting`, `won`, and
// `lost`; a copy in any other status is refused. `config.draw` is taken only on
// `won` and `lost`, and a `won` or `lost` copy without it is well formed. Every
// event has a `type`, and its `data` is absent or a JSON object (the backend,
// 2026-10-28). The `data` is copied as JSON data, within the bounds W-38 sets
// on the Wrapper's copy: at most 32 levels deep (the `data` object is level 1)
// and at most 10 000 values over every event of the Snapshot. Each object of it
// is created with a null prototype and its members are defined as data
// properties, so an own `__proto__` key is a member like any other.

import type {
  GameBookDraw,
  GameBookEvent,
  GameEventData,
  GameJsonValue,
  GamePlaybackSnapshot,
  RoundStatus,
} from "@intraverse/se-client-shell/controller";

import { parseContext } from "./game-snapshot.ts";
import {
  arrayItems,
  hasFields,
  isIndex,
  isMultiplier,
  oneOf,
  plainFields,
} from "./plain-data.ts";

/** The statuses a book round shows (W-54). */
export type BookStatus = Extract<
  RoundStatus,
  "idle" | "starting" | "won" | "lost"
>;

export const BOOK_STATUSES: readonly BookStatus[] = Object.freeze([
  "idle",
  "starting",
  "won",
  "lost",
]);

/** The statuses whose copy may carry the draw. */
const DRAWN_STATUSES: readonly BookStatus[] = Object.freeze(["won", "lost"]);

/** How deep an event's `data` may nest: the `data` object is level 1. */
const DATA_MAX_DEPTH = 32;

/** How many values (objects, arrays, primitives) every event's `data` may hold. */
const DATA_MAX_VALUES = 10_000;

/** A string of 1 to 64 characters, counted in code points as the schema does. */
const isName = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const length = Array.from(value).length;
  return length >= 1 && length <= 64;
};

/** A frozen object with a null prototype and `members` as data properties. */
const dataObject = (
  members: readonly (readonly [string, GameJsonValue])[],
): GameEventData => {
  const target: Record<string, GameJsonValue> = Object.create(null);
  for (const [name, member] of members) {
    Object.defineProperty(target, name, {
      value: member,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return Object.freeze(target);
};

const isDataObject = (
  value: GameJsonValue | undefined,
): value is GameEventData =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Reads the events' `data` of one Snapshot as JSON data, counting every value
 * against the Snapshot's bound. `undefined` refuses the copy.
 */
const dataReader = (): ((value: unknown) => GameEventData | undefined) => {
  let values = 0;

  const readValue = (
    value: unknown,
    level: number,
  ): GameJsonValue | undefined => {
    values += 1;
    if (values > DATA_MAX_VALUES) return undefined;
    if (
      value === null ||
      typeof value === "boolean" ||
      typeof value === "string"
    ) {
      return value;
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : undefined;
    }
    // A container deeper than the bound (a cycle included) is refused.
    if (typeof value !== "object" || level > DATA_MAX_DEPTH) return undefined;
    if (Array.isArray(value)) {
      const items = arrayItems(value);
      if (items === undefined) return undefined;
      const copies: GameJsonValue[] = [];
      for (const item of items) {
        const copied = readValue(item, level + 1);
        if (copied === undefined) return undefined;
        copies.push(copied);
      }
      return Object.freeze(copies);
    }
    const fields = plainFields(value);
    if (fields === undefined) return undefined;
    const members: (readonly [string, GameJsonValue])[] = [];
    for (const [name, member] of fields) {
      const copied = readValue(member, level + 1);
      if (copied === undefined) return undefined;
      members.push([name, copied]);
    }
    return dataObject(members);
  };

  // An event's `data` is an object: never an array, a string, or `null`.
  return (value: unknown): GameEventData | undefined => {
    if (plainFields(value) === undefined) return undefined;
    const copied = readValue(value, 1);
    return isDataObject(copied) ? copied : undefined;
  };
};

const parseEvent = (
  value: unknown,
  readData: (value: unknown) => GameEventData | undefined,
): GameBookEvent | undefined => {
  const fields = plainFields(value);
  if (fields === undefined || !hasFields(fields, ["index", "type"], ["data"])) {
    return undefined;
  }
  const index = fields.get("index");
  const type = fields.get("type");
  if (!isIndex(index) || !isName(type)) return undefined;
  if (!fields.has("data")) return Object.freeze({ index, type });
  const data = readData(fields.get("data"));
  return data === undefined ? undefined : Object.freeze({ index, type, data });
};

const parseDraw = (value: unknown): GameBookDraw | undefined => {
  const fields = plainFields(value);
  if (
    fields === undefined ||
    !hasFields(fields, ["index", "payoutMultiplier", "events"])
  ) {
    return undefined;
  }
  const index = fields.get("index");
  const payoutMultiplier = fields.get("payoutMultiplier");
  const items = arrayItems(fields.get("events"));
  if (
    !isIndex(index) ||
    !isMultiplier(payoutMultiplier) ||
    items === undefined
  ) {
    return undefined;
  }
  const readData = dataReader();
  const events: GameBookEvent[] = [];
  for (const item of items) {
    const event = parseEvent(item, readData);
    if (event === undefined) return undefined;
    events.push(event);
  }
  return Object.freeze({
    index,
    payoutMultiplier,
    events: Object.freeze(events),
  });
};

const parseConfig = (
  value: unknown,
  status: BookStatus,
): GamePlaybackSnapshot["config"] | undefined => {
  const fields = plainFields(value);
  if (fields === undefined || !hasFields(fields, ["kind", "model"], ["draw"])) {
    return undefined;
  }
  const model = fields.get("model");
  if (fields.get("kind") !== "book" || !isName(model)) return undefined;
  if (!fields.has("draw")) return Object.freeze({ kind: "book", model });
  // The draw closes the round: a copy that carries it in another status is
  // malformed.
  if (!DRAWN_STATUSES.includes(status)) return undefined;
  const draw = parseDraw(fields.get("draw"));
  return draw === undefined
    ? undefined
    : Object.freeze({ kind: "book", model, draw });
};

const SNAPSHOT_REQUIRED = [
  "version",
  "presentation",
  "status",
  "context",
  "config",
] as const;
const SNAPSHOT_OPTIONAL = ["closeReason", "roundId"] as const;

/** The game's copy of a `playback` Snapshot, checked field by field. */
export const parsePlaybackSnapshot = (
  value: unknown,
): GamePlaybackSnapshot | undefined => {
  const fields = plainFields(value);
  if (
    fields === undefined ||
    !hasFields(fields, SNAPSHOT_REQUIRED, SNAPSHOT_OPTIONAL) ||
    fields.get("presentation") !== "playback"
  ) {
    return undefined;
  }
  const version = fields.get("version");
  const status = fields.get("status");
  const closeReason = fields.get("closeReason");
  const roundId = fields.get("roundId");
  if (
    !isIndex(version) ||
    !oneOf(status, BOOK_STATUSES) ||
    (closeReason !== undefined && closeReason !== "expired") ||
    (roundId !== undefined && typeof roundId !== "string")
  ) {
    return undefined;
  }
  const context = parseContext(fields.get("context"));
  const config = parseConfig(fields.get("config"), status);
  if (context === undefined || config === undefined) return undefined;
  return Object.freeze({
    version,
    presentation: "playback",
    status,
    ...(closeReason === undefined ? {} : { closeReason }),
    ...(roundId === undefined ? {} : { roundId }),
    context,
    config,
  });
};
