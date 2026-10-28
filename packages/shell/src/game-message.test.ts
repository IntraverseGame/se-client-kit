// T-9, the closed message set (W-38): what the parser accepts from the game.

import { describe, expect, it } from "vitest";

import { CONTROLLER_SCHEMA, ROUND_STATUSES } from "./controller-protocol.ts";
import { action, HELLO } from "./fixtures/fake-game.ts";
import {
  isCompatible,
  type ParsedGameMessage,
  parseGameMessage,
} from "./game-message.ts";

const kind = (data: unknown): string => parseGameMessage(data).kind;

describe("parseGameMessage", () => {
  it("accepts a hello and an action with exactly their fields", () => {
    expect(parseGameMessage(HELLO)).toEqual({ kind: "hello", message: HELLO });
    expect(parseGameMessage(action("a-1_Z", 1, 2))).toEqual({
      kind: "action",
      message: action("a-1_Z", 1, 2),
    });
  });

  it("ignores anything that is not a plain object", () => {
    for (const data of [
      JSON.stringify(HELLO),
      undefined,
      null,
      7,
      true,
      [HELLO],
      new (class Message {
        public readonly schema = CONTROLLER_SCHEMA;
        public readonly type = "hello";
      })(),
    ]) {
      expect(kind(data)).toBe("ignored");
    }
  });

  it("ignores another schema, an unknown type, and the Wrapper's own types", () => {
    for (const data of [
      { ...HELLO, schema: "se.controller/2" },
      { ...HELLO, schema: undefined },
      { schema: CONTROLLER_SCHEMA, type: "resize" },
      { schema: CONTROLLER_SCHEMA, type: "lobby" },
      { schema: CONTROLLER_SCHEMA, type: "deposit" },
      { schema: CONTROLLER_SCHEMA, type: "snapshot", snapshot: {} },
      { schema: CONTROLLER_SCHEMA, type: "reject", id: "a", reason: "busy" },
      { schema: CONTROLLER_SCHEMA, type: "HELLO" },
    ]) {
      expect(kind(data)).toBe("ignored");
    }
  });

  it("ignores a hello with a missing, extra, or malformed field", () => {
    const { presentations: _p, ...noPresentations } = HELLO;
    for (const data of [
      noPresentations,
      { ...HELLO, token: "x" },
      { ...HELLO, presentations: [] },
      { ...HELLO, presentations: ["steps", "steps"] },
      { ...HELLO, presentations: ["steps", "native"] },
      { ...HELLO, presentations: "steps" },
      { ...HELLO, statuses: [] },
      { ...HELLO, statuses: ["idle", "idle"] },
      { ...HELLO, statuses: ["idle", "paused"] },
      { ...HELLO, statuses: [1] },
      { ...HELLO, statuses: Object.assign(["idle"], { extra: 1 }) },
    ]) {
      expect(kind(data)).toBe("ignored");
    }
  });

  it("ignores an action whose envelope or id is not well formed", () => {
    const { verb: _v, ...noVerb } = action("a", 0, 0);
    for (const data of [
      noVerb,
      { ...action("a", 0, 0), extra: 1 },
      action("", 0, 0),
      action("x".repeat(65), 0, 0),
      action("has space", 0, 0),
      action("a.b", 0, 0),
      { ...action("a", 0, 0), id: 7 },
    ]) {
      expect(kind(data)).toBe("ignored");
    }
    expect(kind(action("x".repeat(64), 0, 0))).toBe("action");
  });

  it("marks a well-formed action with a bad verb or args as invalid", () => {
    for (const data of [
      { ...action("a", 0, 0), verb: "cashOut" },
      { ...action("a", 0, 0), verb: "cancel" },
      { ...action("a", 0, 0), args: { step: 0 } },
      { ...action("a", 0, 0), args: { step: 0, option: 0, path: [] } },
      { ...action("a", 0, 0), args: { step: -1, option: 0 } },
      { ...action("a", 0, 0), args: { step: 0, option: 1.5 } },
      { ...action("a", 0, 0), args: { step: 0, option: "1" } },
      { ...action("a", 0, 0), args: { step: 2 ** 53, option: 0 } },
      { ...action("a", 0, 0), args: [0, 0] },
      { ...action("a", 0, 0), args: null },
    ]) {
      expect(parseGameMessage(data)).toEqual({
        kind: "invalid-action",
        id: "a",
      });
    }
  });

  it("never runs the game's code: an accessor or a symbol key is not plain", () => {
    let ran = false;
    const getter = Object.defineProperty({ ...HELLO }, "statuses", {
      enumerable: true,
      get: (): unknown => {
        ran = true;
        return HELLO.statuses;
      },
    });
    expect(kind(getter)).toBe("ignored");
    expect(kind({ ...HELLO, [Symbol("x")]: 1 })).toBe("ignored");
    const throwing = new Proxy(
      {},
      {
        getPrototypeOf: (): never => {
          throw new Error("hostile");
        },
      },
    );
    expect(kind(throwing)).toBe("ignored");
    expect(ran).toBe(false);
  });
});

/** Whether a hello with these lists is compatible; undefined if malformed. */
const compatible = (
  presentations: readonly string[],
  statuses: readonly string[],
): boolean | undefined => {
  const parsed: ParsedGameMessage = parseGameMessage({
    ...HELLO,
    presentations,
    statuses,
  });
  return parsed.kind === "hello" ? isCompatible(parsed.message) : undefined;
};

describe("isCompatible", () => {
  // RFC-003 (#146): all seven statuses and at least one presentation; `steps`
  // is no longer required.
  it("needs all seven statuses and a presentation", () => {
    expect(compatible(["steps"], ROUND_STATUSES)).toBe(true);
    expect(compatible(["playback", "steps"], ROUND_STATUSES.toReversed())).toBe(
      true,
    );
    expect(compatible(["playback"], ROUND_STATUSES)).toBe(true);
    expect(compatible(["steps"], ROUND_STATUSES.slice(0, 6))).toBe(false);
    expect(compatible(["playback"], ROUND_STATUSES.slice(1))).toBe(false);
    // An empty list is not a hello at all.
    expect(compatible([], ROUND_STATUSES)).toBeUndefined();
  });
});
