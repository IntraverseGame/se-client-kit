// The game's parser of what the Wrapper sends (`se.controller/1`, W-38): the
// two messages the Wrapper sends are taken with exactly their fields, and every
// other shape is refused, so the game renders only a well-formed allow-listed
// copy. And the two messages the game sends are exactly the protocol's.

import type { SnapshotMessage } from "@intraverse/se-client-shell/controller";
import { describe, expect, it } from "vitest";

import {
  rejectMessage,
  SNAPSHOTS,
  snapshotMessage,
  withFields,
} from "./fixtures/snapshots.ts";
import { STATUSES } from "./game-snapshot.ts";
import {
  actionMessage,
  helloMessage,
  parseWrapperMessage,
} from "./protocol.ts";

const active = SNAPSHOTS.active;

describe("what the game sends", () => {
  it("says hello with the steps presentation and all seven statuses", () => {
    expect(helloMessage()).toEqual({
      schema: "se.controller/1",
      type: "hello",
      presentations: ["steps"],
      statuses: [
        "idle",
        "starting",
        "active",
        "resolving",
        "won",
        "lost",
        "canceled",
      ],
    });
    expect(STATUSES).toHaveLength(7);
  });

  it("asks for a pick with exactly the action's fields", () => {
    expect(actionMessage("pick-1", 0, 1)).toEqual({
      schema: "se.controller/1",
      type: "action",
      id: "pick-1",
      verb: "pick",
      args: { step: 0, option: 1 },
    });
  });
});

describe("what the game takes", () => {
  it.each(Object.entries(SNAPSHOTS))(
    "takes the %s snapshot as a fresh, frozen copy",
    (_name, snapshot) => {
      const data = snapshotMessage(structuredClone(snapshot));
      const message = parseWrapperMessage(data);
      expect(message).toEqual(data);
      expect(message).not.toBe(data);
      expect(Object.isFrozen(message)).toBe(true);
      const copy = (message as SnapshotMessage).snapshot;
      expect(Object.isFrozen(copy.config.steps[0])).toBe(true);
      expect(copy).not.toBe(data["snapshot"]);
    },
  );

  it.each(["not_legal", "not_active", "busy", "invalid"] as const)(
    "takes a reject for %s",
    reason => {
      expect(parseWrapperMessage(rejectMessage("pick-1", reason))).toEqual(
        rejectMessage("pick-1", reason),
      );
    },
  );

  it("takes a Snapshot with a theme appearance and a mobile device", () => {
    const snapshot = withFields(active, {
      context: {
        language: "en",
        device: "mobile",
        theme: { appearance: "dark" },
      },
    });
    expect(parseWrapperMessage(snapshotMessage(snapshot))).toEqual(
      snapshotMessage(snapshot),
    );
  });
});

class Message {
  readonly schema = "se.controller/1";
  readonly type = "reject";
  readonly id = "pick-1";
  readonly reason = "busy";
}

const withAccessor = (): object => {
  const data = rejectMessage("pick-1", "busy");
  Object.defineProperty(data, "reason", {
    get: () => "busy",
    enumerable: true,
  });
  return data;
};

const step = (fields: Record<string, unknown>): Record<string, unknown> =>
  withFields(active, {
    config: {
      kind: "steps",
      steps: [{ ...active.config.steps[0], ...fields }],
    },
  });

/** The active Snapshot with `change` applied to a copy of its coin step. */
const changedStep = (
  change: (step: Record<string, unknown>) => void,
): Record<string, unknown> => {
  const coin: Record<string, unknown> = { ...active.config.steps[0] };
  change(coin);
  return withFields(active, { config: { kind: "steps", steps: [coin] } });
};

/** The active Snapshot with `steps` as its config's steps. */
const withSteps = (steps: unknown): Record<string, unknown> =>
  withFields(active, { config: { kind: "steps", steps } });

const accessor = (value: unknown): PropertyDescriptor => ({
  get: () => value,
  enumerable: true,
});

describe("what the game refuses without running a getter", () => {
  it("refuses an accessor on an optional field, which would read as absent", () => {
    const snapshot = changedStep(coin => {
      Object.defineProperty(coin, "selectedIndex", accessor(1));
    });
    expect(parseWrapperMessage(snapshotMessage(snapshot))).toBeUndefined();
  });

  it("refuses an accessor on an optional Snapshot field", () => {
    const snapshot = withFields(active, {});
    Object.defineProperty(snapshot, "closeReason", accessor("expired"));
    expect(parseWrapperMessage(snapshotMessage(snapshot))).toBeUndefined();
  });

  it("refuses a step that is an accessor item", () => {
    const steps: unknown[] = [];
    Object.defineProperty(steps, 0, accessor(active.config.steps[0]));
    expect(
      parseWrapperMessage(snapshotMessage(withSteps(steps))),
    ).toBeUndefined();
  });

  it("refuses sparse steps, and steps with an extra property", () => {
    const sparse: unknown[] = [];
    sparse[1] = active.config.steps[0];
    expect(
      parseWrapperMessage(snapshotMessage(withSteps(sparse))),
    ).toBeUndefined();
    const extra = Object.assign([active.config.steps[0]], { extra: 1 });
    expect(
      parseWrapperMessage(snapshotMessage(withSteps(extra))),
    ).toBeUndefined();
  });
});

describe("what the game refuses (schema refusal)", () => {
  it.each<[string, unknown]>([
    ["a JSON text", JSON.stringify(rejectMessage("pick-1", "busy"))],
    ["an array", [rejectMessage("pick-1", "busy")]],
    ["null", null],
    ["a class instance", new Message()],
    ["an accessor property", withAccessor()],
    ["a symbol key", { ...rejectMessage("pick-1", "busy"), [Symbol("x")]: 1 }],
    [
      "a proxy that throws",
      new Proxy(
        {},
        {
          getPrototypeOf: () => {
            throw new Error("trap");
          },
        },
      ),
    ],
    [
      "another schema",
      { ...rejectMessage("pick-1", "busy"), schema: "se.controller/2" },
    ],
    ["an unknown type", { ...rejectMessage("pick-1", "busy"), type: "resize" }],
    ["a game message", { ...helloMessage() }],
    [
      "a missing field",
      { schema: "se.controller/1", type: "reject", id: "pick-1" },
    ],
    ["an extra field", { ...rejectMessage("pick-1", "busy"), message: "no" }],
    ["a reason outside the list", rejectMessage("pick-1", "denied" as "busy")],
    ["an id that is too long", rejectMessage("x".repeat(65), "busy")],
    ["an id with a bad character", rejectMessage("pick 1", "busy")],
    [
      "a snapshot message with an extra field",
      { ...snapshotMessage(active), id: "x" },
    ],
    ["a snapshot that is not an object", snapshotMessage("active")],
  ])("refuses %s", (_name, data) => {
    expect(parseWrapperMessage(data)).toBeUndefined();
  });

  it.each<[string, unknown]>([
    ["an se.snapshot/1 field", withFields(active, { bet: { value: "1" } })],
    ["proofs", withFields(active, { proofs: {} })],
    ["an undefined version", withFields(active, { version: undefined })],
    ["a negative version", withFields(active, { version: -1 })],
    ["a fractional version", withFields(active, { version: 1.5 })],
    [
      "the playback presentation",
      withFields(active, { presentation: "playback" }),
    ],
    ["an unknown status", withFields(active, { status: "paused" })],
    [
      "a close reason other than expired",
      withFields(active, { closeReason: "voided" }),
    ],
    ["a non-string round id", withFields(active, { roundId: 7 })],
    ["a negative step", withFields(active, { step: -1 })],
    [
      "a non-finite multiplier",
      withFields(active, { currentMultiplier: Number.NaN }),
    ],
    [
      "a context field outside the list",
      withFields(active, {
        context: { ...active.context, sessionId: "ses_1" },
      }),
    ],
    [
      "a theme palette",
      withFields(active, {
        context: { ...active.context, theme: { colorPalette: {} } },
      }),
    ],
    [
      "an unknown appearance",
      withFields(active, {
        context: { ...active.context, theme: { appearance: "sepia" } },
      }),
    ],
    [
      "an unknown device",
      withFields(active, { context: { ...active.context, device: "tv" } }),
    ],
    [
      "another config kind",
      withFields(active, { config: { kind: "playback", steps: [] } }),
    ],
    [
      "steps that are not an array",
      withFields(active, { config: { kind: "steps", steps: {} } }),
    ],
    ["a step with an extra field", step({ tileStyle: "x" })],
    ["a step with no options", step({ optionCount: 0 })],
    ["a selected index out of range", step({ selectedIndex: 2 })],
    ["a losing index out of range", step({ losingIndex: 2 })],
    [
      "a non-finite step multiplier",
      step({ multiplier: Number.POSITIVE_INFINITY }),
    ],
  ])("refuses a snapshot with %s", (_name, snapshot) => {
    expect(parseWrapperMessage(snapshotMessage(snapshot))).toBeUndefined();
  });
});
