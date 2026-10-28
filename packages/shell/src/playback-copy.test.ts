// T-23 (#146, W-38, RFC-003): the game's `playback` copy of a book round.
// Built field by field from the allow-list (no proof, `packageHash`, RTP,
// payout, or amount); an event's `data` is a deep plain copy whose objects
// have a null prototype and whose members are data properties, bounded at 32
// levels and 10 000 values over the Snapshot, and data that breaks a bound or
// is not JSON data fails the copy. Forwarding is controller-playback.test.ts's.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";
import { describe, expect, it } from "vitest";

import type { GamePlaybackSnapshot } from "./controller-protocol.ts";
import {
  bookInput,
  bookSnapshot,
  configOf,
  nested,
  ofValues,
  wonWithData,
  wonWithRawData,
} from "./fixtures/book.ts";
import { snapshot, validated } from "./fixtures/vectors.ts";
import {
  MAX_DATA_DEPTH,
  MAX_DATA_VALUES,
  toPlaybackCopy,
} from "./playback-copy.ts";

type Data = Record<string, unknown>;

/** The copy of `value`, or a thrown error when it failed. */
const copyOf = (value: ValidSnapshot): GamePlaybackSnapshot => {
  const result = toPlaybackCopy(value);
  if (!result.ok) throw new Error("the copy failed");
  return result.copy;
};

const firstData = (copy: GamePlaybackSnapshot): unknown =>
  copy.config.draw?.events[0]?.data;

describe("the playback copy (W-38)", () => {
  it("holds exactly the allow-listed fields of a won book round", () => {
    expect(copyOf(bookSnapshot("won"))).toEqual({
      version: 3,
      presentation: "playback",
      status: "won",
      roundId: "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d",
      context: {
        language: "de",
        device: "mobile",
        theme: { appearance: "dark" },
      },
      config: {
        kind: "book",
        model: "base",
        draw: {
          index: 41,
          payoutMultiplier: 1.94,
          events: [
            { index: 0, type: "reveal", data: { side: "heads" } },
            { index: 1, type: "win" },
          ],
        },
      },
    });
  });

  it("carries no draw before the result, and none on a won round without one", () => {
    expect(copyOf(bookSnapshot("starting")).config).toEqual({
      kind: "book",
      model: "base",
    });
    const input = bookInput("won");
    delete configOf(input)["draw"];
    const copy = copyOf(validated(input));
    expect(copy.status).toBe("won");
    expect(copy.config).toEqual({ kind: "book", model: "base" });
  });

  it("leaves out the packageHash, the RTP, the payout, the proofs, and every amount", () => {
    const text = JSON.stringify(copyOf(bookSnapshot("won")));
    for (const absent of [
      "packageHash",
      "rtp",
      "0.9600",
      "24/25",
      'payout"',
      "€",
      "proofs",
      "0x",
      "ses_",
      "luckybet",
      "bet",
    ]) {
      expect(text).not.toContain(absent);
    }
  });

  it("is no copy of a steps Snapshot", () => {
    expect(toPlaybackCopy(snapshot("active"))).toEqual({ ok: false });
  });
});

describe("an event's data, deep-copied (W-38)", () => {
  it("is a plain copy: every object has a null prototype and data members", () => {
    const source = { a: { b: [1, "x", true, null, { c: 2 }] } };
    const data = firstData(copyOf(wonWithData([source]))) as Data;
    expect(data).toEqual(source);
    expect(data).not.toBe(source);
    expect(Object.getPrototypeOf(data)).toBeNull();
    const a = data["a"] as Data;
    expect(Object.getPrototypeOf(a)).toBeNull();
    const items = a["b"] as unknown[];
    expect(Array.isArray(items)).toBe(true);
    expect(Object.getPrototypeOf(items[4])).toBeNull();
    expect(Object.getOwnPropertyDescriptor(data, "a")).toEqual({
      value: a,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  });

  it("copies an own __proto__ key as a member and changes no prototype", () => {
    const source: unknown = JSON.parse(
      '{"__proto__": {"polluted": true}, "side": "heads"}',
    );
    const data = firstData(copyOf(wonWithData([source]))) as Data;
    expect(Object.getPrototypeOf(data)).toBeNull();
    expect(Object.hasOwn(data, "__proto__")).toBe(true);
    expect(data["__proto__"]).toEqual({ polluted: true });
    expect((data as { polluted?: unknown }).polluted).toBeUndefined();
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
  });

  it(`copies data ${MAX_DATA_DEPTH} levels deep, and not ${MAX_DATA_DEPTH + 1}`, () => {
    expect(MAX_DATA_DEPTH).toBe(32);
    const deepest = copyOf(wonWithData([nested(32)]));
    expect(firstData(deepest)).toEqual(nested(32));
    expect(toPlaybackCopy(wonWithData([nested(33)]))).toEqual({ ok: false });
  });

  it(`copies ${MAX_DATA_VALUES} values, and not ${MAX_DATA_VALUES + 1}`, () => {
    expect(MAX_DATA_VALUES).toBe(10_000);
    const most = copyOf(wonWithData([ofValues(10_000)]));
    expect(firstData(most)).toEqual(ofValues(10_000));
    expect(toPlaybackCopy(wonWithData([ofValues(10_001)]))).toEqual({
      ok: false,
    });
  });

  it("counts the values over every event's data of the Snapshot", () => {
    const half = toPlaybackCopy(wonWithData([ofValues(5000), ofValues(5000)]));
    expect(half.ok).toBe(true);
    const over = wonWithData([ofValues(5000), ofValues(5001)]);
    expect(toPlaybackCopy(over)).toEqual({ ok: false });
  });

  const cycle: Data = {};
  cycle["self"] = cycle;
  const accessorItem: unknown[] = [1];
  Object.defineProperty(accessorItem, 0, { get: () => 1, enumerable: true });
  const sparse: unknown[] = [];
  sparse[2] = 1;
  it.each<[string, unknown]>([
    ["a cycle", cycle],
    [
      "an accessor",
      Object.defineProperty({}, "x", { get: () => 1, enumerable: true }),
    ],
    ["a symbol key", { [Symbol("s")]: 1 }],
    ["a sparse array", { sparse }],
    ["a non-finite number", { n: Number.NaN }],
    ["a function", { f: () => 1 }],
    ["undefined", { u: undefined }],
    ["a bigint", { b: 1n }],
    ["a class instance", new Map()],
    ["an array", [1]],
    ["a string", "text"],
    [
      "a proxy that throws",
      new Proxy(
        {},
        {
          ownKeys: () => {
            throw new Error("trap");
          },
        },
      ),
    ],
    ["an accessor on an array index", { list: accessorItem }],
  ])("fails on data that holds %s, which is not JSON data", (_, data) => {
    expect(toPlaybackCopy(wonWithRawData(data))).toEqual({ ok: false });
  });

  it("copies a shared object twice, which is no cycle", () => {
    const shared = { v: 1 };
    const data = firstData(
      copyOf(wonWithData([{ a: shared, b: shared }])),
    ) as Data;
    expect(data).toEqual({ a: { v: 1 }, b: { v: 1 } });
  });
});
