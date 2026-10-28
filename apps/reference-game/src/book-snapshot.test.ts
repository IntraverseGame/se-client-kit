// The game's parser of a `playback` copy (a book round, W-38's `playback`
// allow-list): the four statuses a book round shows are taken as fresh, frozen
// copies with exactly the allow-listed fields; an event's `data` is copied as
// JSON data; and every other shape is refused, so the game renders only a
// well-formed copy.

import type {
  GamePlaybackSnapshot,
  SnapshotMessage,
} from "@intraverse/se-client-shell/controller";
import { describe, expect, it } from "vitest";

import { parsePlaybackSnapshot } from "./book-snapshot.ts";
import {
  BOOK,
  WON_DRAW,
  withDraw,
  withEvents,
  withoutDraw,
} from "./fixtures/book-playback.ts";
import {
  SNAPSHOTS,
  snapshotMessage,
  withFields,
} from "./fixtures/snapshots.ts";
import { parseWrapperMessage } from "./protocol.ts";

const won = BOOK.won;

/** The copy of `snapshot`, as the game takes it from a `snapshot` message. */
const parsed = (snapshot: unknown): GamePlaybackSnapshot | undefined => {
  const message = parseWrapperMessage(snapshotMessage(snapshot));
  return (message as SnapshotMessage | undefined)?.snapshot as
    | GamePlaybackSnapshot
    | undefined;
};

/** `data` nested `levels` deep: `{ a: { a: ... { a: 1 } } }`. */
const nested = (levels: number): unknown => {
  let value: unknown = 1;
  for (let level = 0; level < levels; level += 1) value = { a: value };
  return value;
};

/** `snapshot` with `fields` replaced, for one test's variation. */
const withBook = (
  snapshot: GamePlaybackSnapshot,
  fields: Readonly<Record<string, unknown>>,
): Record<string, unknown> => ({ ...snapshot, ...fields });

/** A three-item array with a hole at 1. */
const sparse = (): unknown[] => {
  const items: unknown[] = [1, 2, 3];
  Reflect.deleteProperty(items, 1);
  return items;
};

/** An event whose data is an object (1 value) with one array of `items` items. */
const listEvent = (index: number, items: number) => ({
  index,
  type: "t",
  data: { list: Array.from({ length: items }, () => 0) },
});

/** The won copy with one event, `fields` over a well-formed one. */
const event = (fields: Record<string, unknown>): unknown =>
  withEvents([{ index: 0, type: "reveal", ...fields }]);

/** The won copy with one event that lacks `name`. */
const eventWithout = (name: string): unknown => {
  const fields: Record<string, unknown> = { index: 0, type: "reveal" };
  Reflect.deleteProperty(fields, name);
  return withEvents([fields]);
};

const withAccessor = (target: object, key: PropertyKey): object => {
  Object.defineProperty(target, key, {
    get: () => 1,
    enumerable: true,
    configurable: true,
  });
  return target;
};

describe("what the game takes on a book round", () => {
  it.each(Object.entries(BOOK))(
    "takes the %s copy as a fresh, frozen copy",
    (_name, snapshot) => {
      const data = structuredClone(snapshot);
      const copy = parsed(data);
      expect(copy).toEqual(snapshot);
      expect(copy).not.toBe(data);
      expect(Object.isFrozen(copy)).toBe(true);
      expect(Object.isFrozen(copy?.config)).toBe(true);
      expect(Object.isFrozen(copy?.context)).toBe(true);
    },
  );

  it("takes the won copy's draw and events as frozen copies", () => {
    const data = structuredClone(won);
    const copy = parsed(data);
    const draw = copy?.config.draw;
    expect(draw).toEqual(WON_DRAW);
    expect(draw).not.toBe(data.config.draw);
    expect(Object.isFrozen(draw)).toBe(true);
    expect(Object.isFrozen(draw?.events)).toBe(true);
    expect(Object.isFrozen(draw?.events[0])).toBe(true);
    expect(Object.isFrozen(draw?.events[0]?.data)).toBe(true);
    expect(draw?.events[0]?.data).not.toBe(data.config.draw?.events[0]?.data);
    expect(draw?.events[1]).toEqual({ index: 1, type: "win" });
    expect(draw?.events[1]).not.toHaveProperty("data");
  });

  it.each(["won", "lost"] as const)(
    "takes a %s copy without config.draw: the schema makes it optional",
    status => {
      const snapshot = withoutDraw(BOOK[status]);
      expect(parsed(snapshot)).toEqual(snapshot);
    },
  );

  it("takes an event's data as a deep copy of its JSON value", () => {
    const data = {
      text: "<img src=x onerror=alert(1)>",
      count: 3,
      ratio: -0.5,
      flags: [true, false, null],
      nested: { list: [{ deep: "x" }], empty: {} },
    };
    const copy = parsed(withEvents([{ index: 0, type: "t", data }]));
    const first = copy?.config.draw?.events[0];
    expect(first?.data).toEqual(data);
    expect(Object.isFrozen(first?.data?.["flags"])).toBe(true);
    expect(Object.isFrozen(first?.data?.["nested"])).toBe(true);
  });

  it("copies an own __proto__ key as a member, never as a prototype", () => {
    const data = JSON.parse('{"__proto__": {"polluted": true}, "a": 1}');
    const copy = parsed(withEvents([{ index: 0, type: "t", data }]));
    const copied = copy?.config.draw?.events[0]?.data;
    expect(copied).toBeDefined();
    expect(Object.getPrototypeOf(copied)).toBeNull();
    expect(Object.getOwnPropertyNames(copied)).toEqual(["__proto__", "a"]);
    expect(copied).not.toHaveProperty("polluted");
  });

  it("takes data 32 levels deep, and refuses one level more", () => {
    expect(
      parsed(withEvents([{ index: 0, type: "t", data: nested(32) }])),
    ).toBeDefined();
    expect(
      parsed(withEvents([{ index: 0, type: "t", data: nested(33) }])),
    ).toBeUndefined();
  });

  it("takes 10 000 data values over every event, and refuses one more", () => {
    // 2 events: 2 objects + 2 arrays + the items.
    expect(
      parsed(withEvents([listEvent(0, 4998), listEvent(1, 4998)])),
    ).toBeDefined();
    expect(
      parsed(withEvents([listEvent(0, 4998), listEvent(1, 4999)])),
    ).toBeUndefined();
  });

  it("does not run a getter of the data", () => {
    let ran = false;
    const data = {};
    Object.defineProperty(data, "a", {
      get: () => {
        ran = true;
        return 1;
      },
      enumerable: true,
    });
    expect(parsed(withEvents([{ index: 0, type: "t", data }]))).toBeUndefined();
    expect(ran).toBe(false);
  });
});

describe("what the game refuses on a book round", () => {
  const cycle: Record<string, unknown> = {};
  cycle["self"] = cycle;

  it.each<[string, unknown]>([
    ["an extra field", withBook(BOOK.idle, { bet: {} })],
    ["proofs", withBook(won, { proofs: {} })],
    ["a payout", withBook(won, { payout: { value: "194" } })],
    ["a steps field", withBook(BOOK.idle, { step: 0 })],
    ["status active", withBook(BOOK.starting, { status: "active" })],
    ["status resolving", withBook(BOOK.starting, { status: "resolving" })],
    ["status canceled", withBook(BOOK.starting, { status: "canceled" })],
    ["an unknown status", withBook(BOOK.idle, { status: "paused" })],
    ["a draw on idle", withDraw(BOOK.idle, WON_DRAW)],
    ["a draw on starting", withDraw(BOOK.starting, WON_DRAW)],
    [
      "a packageHash",
      withBook(won, {
        config: { ...won.config, packageHash: "0xaa" },
      }),
    ],
    ["an rtp", withBook(won, { config: { ...won.config, rtp: {} } })],
    [
      "another config kind",
      withBook(BOOK.idle, {
        config: { kind: "steps", model: "base" },
      }),
    ],
    [
      "an empty model",
      withBook(BOOK.idle, { config: { kind: "book", model: "" } }),
    ],
    [
      "a model of 65 characters",
      withBook(BOOK.idle, {
        config: { kind: "book", model: "m".repeat(65) },
      }),
    ],
    ["no model", withBook(BOOK.idle, { config: { kind: "book" } })],
    ["a draw with an extra field", withDraw(won, { ...WON_DRAW, payout: "1" })],
    [
      "a draw with no events",
      withDraw(won, { index: 41, payoutMultiplier: 1 }),
    ],
    ["a negative draw index", withDraw(won, { ...WON_DRAW, index: -1 })],
    ["a fractional draw index", withDraw(won, { ...WON_DRAW, index: 1.5 })],
    [
      "a negative payout multiplier",
      withDraw(won, { ...WON_DRAW, payoutMultiplier: -1 }),
    ],
    [
      "a non-finite payout multiplier",
      withDraw(won, { ...WON_DRAW, payoutMultiplier: Number.NaN }),
    ],
    ["events that are not an array", withEvents({})],
    ["a sparse events array", withEvents(sparse())],
    ["an event without a type", eventWithout("type")],
    ["an event without an index", eventWithout("index")],
    ["an event with an empty type", event({ type: "" })],
    ["an event with a type of 65 characters", event({ type: "t".repeat(65) })],
    ["an event with a non-string type", event({ type: 7 })],
    ["an event with a negative index", event({ index: -1 })],
    ["an event with an extra field", event({ payout: "1" })],
    ["an event whose data is an array", event({ data: [1, 2] })],
    ["an event whose data is a string", event({ data: "x" })],
    ["an event whose data is null", event({ data: null })],
    ["an event whose data is a number", event({ data: 1 })],
    ["an event whose data is undefined", event({ data: undefined })],
    ["data holding undefined", event({ data: { a: undefined } })],
    ["data holding NaN", event({ data: { a: Number.NaN } })],
    ["data holding Infinity", event({ data: { a: Number.POSITIVE_INFINITY } })],
    ["data holding a bigint", event({ data: { a: 1n } })],
    ["data holding a Date", event({ data: { a: new Date(0) } })],
    ["data holding a Map", event({ data: { a: new Map() } })],
    ["data holding a cycle", event({ data: cycle })],
    ["data with an accessor", event({ data: withAccessor({}, "a") })],
    [
      "data with an accessor item",
      event({ data: { list: withAccessor([1], 0) } }),
    ],
    ["data with a sparse array", event({ data: { list: sparse() } })],
    ["data with a symbol key", event({ data: { [Symbol("s")]: 1 } })],
  ])("refuses a playback copy with %s", (_name, snapshot) => {
    expect(parsePlaybackSnapshot(snapshot)).toBeUndefined();
    expect(parseWrapperMessage(snapshotMessage(snapshot))).toBeUndefined();
  });

  it("refuses a steps copy that says it is playback", () => {
    expect(
      parsed(withFields(SNAPSHOTS.active, { presentation: "playback" })),
    ).toBeUndefined();
  });

  it("refuses a playback copy that says it is steps", () => {
    expect(parsed({ ...won, presentation: "steps" })).toBeUndefined();
  });
});
