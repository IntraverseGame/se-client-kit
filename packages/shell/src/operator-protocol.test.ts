// T-9a, the closed `se.operator/1` schema (W-49b), `resize` (W-49d), and what
// the operator page can ever receive: a property test over seeded sequences of
// hellos (valid, malformed, forged), resizes, and timer moves. Every post is
// exactly `welcome` or `resize`, to the fixed origin, with nothing else.

import { describe, expect, it } from "vitest";

import { CONTROLLER_SCHEMA } from "./controller-protocol.ts";
import {
  createFakeOperator,
  HELLO,
  OPERATOR,
  OTHER,
  type Posted,
  WELCOME_POST,
} from "./fixtures/fake-operator.ts";
import { seededInts } from "./fixtures/seeded.ts";
import {
  isOperatorHello,
  MAX_RESIZE_HEIGHT,
  OPERATOR_SCHEMA,
} from "./operator-protocol.ts";

/** A message whose `field` is an accessor: reading it would run code. */
const withGetter = (): object => {
  const message = { schema: OPERATOR_SCHEMA };
  Object.defineProperty(message, "type", {
    enumerable: true,
    get: () => "hello",
  });
  return message;
};

/** Every value a valid `hello` is not (T-9a, 2). */
const NOT_HELLOS: readonly (readonly [string, unknown])[] = [
  ["a JSON string", JSON.stringify(HELLO)],
  ["an array", [OPERATOR_SCHEMA, "hello"]],
  [
    "a class instance",
    new (class Hello {
      readonly schema = OPERATOR_SCHEMA;
      readonly type = "hello";
    })(),
  ],
  ["an accessor property", withGetter()],
  ["a symbol key", { ...HELLO, [Symbol("x")]: 1 }],
  ["a missing field", { schema: OPERATOR_SCHEMA }],
  ["an extra field", { ...HELLO, origin: OPERATOR }],
  ["another schema", { ...HELLO, schema: "se.operator/2" }],
  ["se.controller/1", { ...HELLO, schema: CONTROLLER_SCHEMA }],
  ["welcome", { ...HELLO, type: "welcome" }],
  ["resize", { schema: OPERATOR_SCHEMA, type: "resize", height: 1 }],
  ["null", null],
  ["a number", 1],
];

describe("the closed schema (T-9a, 2)", () => {
  it("accepts exactly a hello, prototype-less included", () => {
    expect(isOperatorHello(HELLO)).toBe(true);
    expect(isOperatorHello(Object.assign(Object.create(null), HELLO))).toBe(
      true,
    );
  });

  it.each(NOT_HELLOS)("refuses %s, and never answers it", (_what, data) => {
    expect(isOperatorHello(data)).toBe(false);
    const op = createFakeOperator();
    void op.check();
    op.send(data);
    expect(op.channel.state()).toBe("waiting");
    expect(op.posted).toEqual([]);
  });

  it("never records a malformed hello before the check", () => {
    const op = createFakeOperator();
    for (const [, data] of NOT_HELLOS) op.send(data, { origin: OTHER });
    void op.check();
    // Nothing was recorded: the handshake waits, it is not refused.
    expect(op.channel.state()).toBe("waiting");
  });
});

/** A `resize` post as the operator page receives it. */
const resize = (height: number): unknown => ({
  message: { schema: OPERATOR_SCHEMA, type: "resize", height },
  targetOrigin: OPERATOR,
});

describe("resize (T-9a, 8)", () => {
  it("is sent only after welcome, only to the fixed origin", async () => {
    const op = createFakeOperator();
    op.channel.resize(400);
    const outcome = op.check();
    op.channel.resize(400);
    op.send(HELLO);
    await outcome;
    op.channel.resize(400);
    expect(op.posted).toEqual([WELCOME_POST, resize(400)]);
  });

  it("never sends the same value twice in a row", async () => {
    const op = createFakeOperator();
    op.send(HELLO);
    await op.check();
    for (const height of [400, 400, 399.2, 400, 401, 401]) {
      op.channel.resize(height);
    }
    expect(op.posted.slice(1)).toEqual([resize(400), resize(401)]);
  });

  it("is an integer from 1 to the bound", async () => {
    const op = createFakeOperator();
    op.send(HELLO);
    await op.check();
    for (const height of [0, -5, 20_000, MAX_RESIZE_HEIGHT, 12.1, Number.NaN]) {
      op.channel.resize(height);
    }
    op.channel.resize(Number.POSITIVE_INFINITY);
    expect(op.posted.slice(1)).toEqual([
      resize(1),
      resize(MAX_RESIZE_HEIGHT),
      resize(13),
    ]);
  });

  it("is never sent once the handshake failed", async () => {
    const op = createFakeOperator();
    const outcome = op.check();
    op.clock.advance(10_000);
    await outcome;
    op.channel.resize(400);
    expect(op.posted).toEqual([]);
  });
});

const ALLOWED_KEYS: ReadonlySet<string> = new Set(["schema", "type", "height"]);
const MESSAGES: readonly unknown[] = [
  HELLO,
  ...NOT_HELLOS.map(([, data]) => data),
];
const ORIGINS = [OPERATOR, OTHER, "null"] as const;

/**
 * One seeded sequence of hellos (valid, malformed, forged, from any source and
 * origin), resizes, timer moves, and one check; what was posted.
 */
const runSequence = (seed: number): readonly Posted[] => {
  const next = seededInts(seed);
  const op = createFakeOperator();
  const sources: readonly unknown[] = [op.parent, {}, null];
  let checked = false;
  for (let step = 0; step < 30; step += 1) {
    const move = next(5);
    if (move === 0 && !checked) {
      checked = true;
      void op.check();
    } else if (move === 1) {
      op.channel.resize(next(40_000) - 100);
    } else if (move === 2) {
      op.clock.advance(next(4000));
    } else {
      op.send(MESSAGES[next(MESSAGES.length)], {
        source: sources[next(sources.length)],
        origin: ORIGINS[next(ORIGINS.length)] ?? OPERATOR,
      });
    }
  }
  return op.posted;
};

/** `welcome`, or `resize` with an integer height, to the fixed origin only. */
const isOperatorPost = ({ message, targetOrigin }: Posted): boolean => {
  const record = message as Readonly<Record<string, unknown>>;
  const keys = Object.keys(record);
  return (
    targetOrigin === OPERATOR &&
    keys.every(key => ALLOWED_KEYS.has(key)) &&
    record["schema"] === OPERATOR_SCHEMA &&
    (record["type"] === "resize"
      ? Number.isInteger(record["height"]) && keys.length === 3
      : record["type"] === "welcome" && keys.length === 2)
  );
};

describe("what the operator page receives (T-9a, 10)", () => {
  it("over seeded sequences, only welcome and resize, to the fixed origin", () => {
    const posts = Array.from({ length: 200 }, (_, i) =>
      runSequence(i + 1),
    ).flat();
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.filter(post => !isOperatorPost(post))).toEqual([]);
  });
});
