// The game's `playback` copy of a validated book Snapshot (W-38, RFC-003;
// book-playback.md W-50 to W-56): built field by field from the allow-list,
// never by removing fields. A book event's `data` is a member the schema
// leaves open (its shape is the math package's), so it is copied as a deep
// copy of its JSON value, read from own data properties only, so the game gets
// data and no object of the Wrapper's:
//
// - every JSON object of the copy has a null prototype, and each member is set
//   with `Object.defineProperty` (a data property, enumerable, writable,
//   configurable), so an own `__proto__` key is copied as a member and never
//   changes a prototype; a JSON array is copied as an array of copies;
// - the copy is bounded: nesting at most `MAX_DATA_DEPTH` levels (an event's
//   `data` is level 1; an object or array inside a level-n container is at
//   level n + 1; a string, number, `true`, `false`, or `null` adds no level),
//   and at most `MAX_DATA_VALUES` values (objects, arrays, and primitives,
//   counted over every event's `data` of the Snapshot);
// - a `data` that breaks a bound, or that cannot be read as JSON data (an
//   accessor, a symbol key, a sparse array, a cycle, a non-finite number, a
//   value of another type, a proxy that throws), fails the whole copy: the
//   Snapshot is not forwarded (fail closed).

import {
  isPlaybackPresentation,
  type ValidSnapshot,
} from "@intraverse/se-client-snapshot";

import type {
  GameBookDraw,
  GameBookEvent,
  GameEventData,
  GameJsonValue,
  GamePlaybackSnapshot,
} from "./controller-protocol.ts";

/** The deepest nesting of an event's `data` (the `data` object is level 1). */
export const MAX_DATA_DEPTH = 32;

/** The most values copied over every event's `data` of one Snapshot. */
export const MAX_DATA_VALUES = 10_000;

/** Thrown inside the copy only; never leaves this module. */
class CopyRefused extends Error {}

const refuse = (): never => {
  throw new CopyRefused("the data cannot be copied");
};

/** How many values the copy of one Snapshot has used so far. */
type Budget = { used: number };

const take = (budget: Budget): void => {
  budget.used += 1;
  if (budget.used > MAX_DATA_VALUES) refuse();
};

const setMember = (target: object, key: string, value: unknown): void => {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
};

/** The own data properties of a plain object, in order; refuses anything else. */
const ownMembers = (value: object): [string, unknown][] => {
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) refuse();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(descriptors).length > 0) refuse();
  return Object.entries(descriptors).map(([key, descriptor]) =>
    "value" in descriptor ? [key, descriptor.value] : refuse(),
  );
};

/** The items of a dense array with no other own member; refuses anything else. */
const ownItems = (value: readonly unknown[]): unknown[] => {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) refuse();
  const items: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[index];
    if (descriptor === undefined || !("value" in descriptor)) return refuse();
    items.push(descriptor.value);
  }
  return items;
};

const copyValue = (
  value: unknown,
  depth: number,
  budget: Budget,
  path: Set<object>,
): GameJsonValue => {
  take(budget);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : refuse();
  }
  if (typeof value !== "object") return refuse();
  // A container: one level deeper than the container that holds it.
  if (depth > MAX_DATA_DEPTH || path.has(value)) refuse();
  path.add(value);
  try {
    if (Array.isArray(value)) {
      return ownItems(value).map(item =>
        copyValue(item, depth + 1, budget, path),
      );
    }
    return copyObject(value, depth, budget, path);
  } finally {
    path.delete(value);
  }
};

const copyObject = (
  value: object,
  depth: number,
  budget: Budget,
  path: Set<object>,
): GameEventData => {
  const copy = Object.create(null) as Record<string, GameJsonValue>;
  for (const [key, member] of ownMembers(value)) {
    setMember(copy, key, copyValue(member, depth + 1, budget, path));
  }
  return copy;
};

/** An event's `data`: a JSON object at level 1. */
const copyData = (data: unknown, budget: Budget): GameEventData => {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return refuse();
  }
  const copied = copyValue(data, 1, budget, new Set());
  return copied as GameEventData;
};

const copyEvent = (
  event: {
    readonly index: number;
    readonly type: string;
    readonly data?: unknown;
  },
  budget: Budget,
): GameBookEvent =>
  Object.freeze({
    index: event.index,
    type: event.type,
    ...(event.data === undefined ? {} : { data: copyData(event.data, budget) }),
  });

const copyDraw = (
  draw: NonNullable<
    Extract<ValidSnapshot["config"], { readonly kind: "book" }>["draw"]
  >,
  budget: Budget,
): GameBookDraw =>
  Object.freeze({
    index: draw.index,
    payoutMultiplier: draw.payoutMultiplier,
    events: Object.freeze(draw.events.map(event => copyEvent(event, budget))),
  });

/** What building a `playback` copy gave. */
export type PlaybackCopy =
  | { readonly ok: true; readonly copy: GamePlaybackSnapshot }
  /** The copy failed closed: the Snapshot is not forwarded. */
  | { readonly ok: false };

const FAILED: PlaybackCopy = Object.freeze({ ok: false });

/**
 * The game's `playback` copy of a validated book Snapshot (W-38), or a failure
 * that closes it. Called only with a `playback` Snapshot.
 */
export const toPlaybackCopy = (snapshot: ValidSnapshot): PlaybackCopy => {
  if (!isPlaybackPresentation(snapshot)) return FAILED;
  const { config } = snapshot;
  const budget: Budget = { used: 0 };
  let draw: GameBookDraw | undefined;
  try {
    draw =
      config.draw === undefined ? undefined : copyDraw(config.draw, budget);
  } catch {
    // A bound broken, or a value that is not JSON data (a proxy or a getter
    // that throws while it is read included): the copy fails closed.
    return FAILED;
  }
  const { appearance } = snapshot.context.theme;
  const copy: GamePlaybackSnapshot = Object.freeze({
    version: snapshot.version,
    presentation: "playback",
    status: snapshot.status,
    ...(snapshot.closeReason === undefined
      ? {}
      : { closeReason: snapshot.closeReason }),
    ...(snapshot.roundId === undefined ? {} : { roundId: snapshot.roundId }),
    context: Object.freeze({
      language: snapshot.context.language,
      device: snapshot.context.device,
      theme: Object.freeze(appearance === undefined ? {} : { appearance }),
    }),
    config: Object.freeze({
      kind: "book",
      model: config.model,
      ...(draw === undefined ? {} : { draw }),
    }),
  });
  return Object.freeze({ ok: true, copy });
};
