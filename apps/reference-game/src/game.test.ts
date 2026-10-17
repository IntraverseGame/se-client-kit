// The game's controller: it says `hello` to its parent's origin only, takes a
// message only from the parent window at that origin and only when it parses,
// keeps the latest Snapshot (never a lower version), asks for one pick at a
// time, and handles every reject reason.

import { describe, expect, it } from "vitest";

import { fakeParent, PARENT_ORIGIN } from "./fixtures/parent.ts";
import {
  rejectMessage,
  SNAPSHOTS,
  snapshotMessage,
  withFields,
} from "./fixtures/snapshots.ts";
import { createGame, type GameView, type ViewCause } from "./game.ts";
import { actionMessage, helloMessage } from "./protocol.ts";

const start = (
  options: {
    readonly framed?: boolean;
    readonly parentOrigin?: string | undefined;
  } = {},
) => {
  const parent = fakeParent();
  const views: [GameView, ViewCause][] = [];
  const game = createGame({
    parent: options.framed === false ? undefined : parent.window,
    parentOrigin:
      "parentOrigin" in options ? options.parentOrigin : PARENT_ORIGIN,
    listen: parent.listen,
    onView: (view, cause) => {
      views.push([view, cause]);
    },
  });
  return { parent, game, views };
};

const roundOf = (view: GameView) => {
  if (view.kind !== "round") throw new Error(`not a round: ${view.kind}`);
  return view;
};

describe("hello", () => {
  it("says hello once, to the parent's origin only, and waits", () => {
    const { parent, game } = start();
    expect(parent.posted).toEqual([
      { message: helloMessage(), targetOrigin: PARENT_ORIGIN },
    ]);
    expect(game.view()).toEqual({ kind: "waiting" });
  });

  it("talks to nobody when it is not framed", () => {
    const { parent, game } = start({ framed: false });
    expect(parent.posted).toEqual([]);
    expect(parent.listeners()).toBe(0);
    expect(game.view()).toEqual({ kind: "unavailable", reason: "not-framed" });
  });

  it("talks to nobody when it does not know its parent's origin", () => {
    const { parent, game } = start({ parentOrigin: undefined });
    expect(parent.posted).toEqual([]);
    expect(parent.listeners()).toBe(0);
    expect(game.view()).toEqual({
      kind: "unavailable",
      reason: "no-parent-origin",
    });
    game.pick("heads");
    expect(parent.posted).toEqual([]);
  });
});

describe("origin and source checks (W-38, from the game's side)", () => {
  it("takes a Snapshot from the parent window at the parent's origin", () => {
    const { parent, game } = start();
    parent.send(snapshotMessage(SNAPSHOTS.active));
    expect(roundOf(game.view()).round.status).toBe("active");
  });

  it.each([
    ["another origin", { origin: "https://evil.example.test" }],
    ["the opaque origin", { origin: "null" }],
    ["the parent's origin with a path", { origin: `${PARENT_ORIGIN}/` }],
    ["another window", { source: {} }],
    ["no source", { source: null }],
    ["another window at the parent's origin", { source: globalThis }],
  ])("ignores a valid Snapshot from %s", (_name, from) => {
    const { parent, game, views } = start();
    parent.send(snapshotMessage(SNAPSHOTS.active), from);
    expect(game.view()).toEqual({ kind: "waiting" });
    expect(views).toHaveLength(1);
  });

  it("ignores a reject from another origin", () => {
    const { parent, game } = start();
    parent.send(snapshotMessage(SNAPSHOTS.active));
    game.pick("heads");
    parent.send(rejectMessage("pick-1", "busy"), {
      origin: "https://evil.example.test",
    });
    expect(roundOf(game.view()).pending).toBe("heads");
  });

  it("ignores a message that fails the schema, and keeps the latest Snapshot", () => {
    const { parent, game, views } = start();
    parent.send(snapshotMessage(SNAPSHOTS.active));
    parent.send(snapshotMessage(withFields(SNAPSHOTS.won, { bet: {} })));
    parent.send({ schema: "se.controller/1", type: "resize", height: 10 });
    parent.send("not a message");
    expect(roundOf(game.view()).round.status).toBe("active");
    expect(views).toHaveLength(2);
  });

  it("stops taking messages once closed", () => {
    const { parent, game } = start();
    game.close();
    parent.send(snapshotMessage(SNAPSHOTS.active));
    expect(game.view()).toEqual({ kind: "waiting" });
    expect(parent.listeners()).toBe(0);
  });
});

describe("Snapshots", () => {
  it("never goes back to a lower version (W-29)", () => {
    const { parent, game } = start();
    parent.send(snapshotMessage(SNAPSHOTS.resolving));
    parent.send(snapshotMessage(SNAPSHOTS.active));
    expect(roundOf(game.view()).round.status).toBe("resolving");
  });

  it("shows that a Snapshot is not Coin Flip", () => {
    const { parent, game } = start();
    const twoSteps = withFields(SNAPSHOTS.active, {
      config: {
        kind: "steps",
        steps: [
          { index: 0, optionCount: 2, multiplier: 1.5 },
          { index: 1, optionCount: 2, multiplier: 3 },
        ],
      },
    });
    parent.send(snapshotMessage(twoSteps));
    expect(game.view()).toEqual({ kind: "unsupported" });
    game.pick("heads");
    expect(parent.posted).toHaveLength(1);
  });

  it.each(Object.entries(SNAPSHOTS))(
    "shows the %s Snapshot",
    (_name, snapshot) => {
      const { parent, game } = start();
      parent.send(snapshotMessage(snapshot));
      expect(roundOf(game.view()).round.status).toBe(snapshot.status);
    },
  );
});

describe("a pick", () => {
  it("asks the parent for the pick, to its origin only", () => {
    const { parent, game } = start();
    parent.send(snapshotMessage(SNAPSHOTS.active));
    game.pick("tails");
    expect(parent.posted.at(-1)).toEqual({
      message: actionMessage("pick-1", 0, 1),
      targetOrigin: PARENT_ORIGIN,
    });
    expect(roundOf(game.view()).pending).toBe("tails");
  });

  it("asks for one pick at a time", () => {
    const { parent, game } = start();
    parent.send(snapshotMessage(SNAPSHOTS.active));
    game.pick("heads");
    game.pick("tails");
    expect(parent.posted).toHaveLength(2);
  });

  it.each([
    "idle",
    "starting",
    "resolving",
    "won",
    "lost",
    "canceled",
  ] as const)("asks for nothing while the round is %s", status => {
    const { parent, game } = start();
    parent.send(snapshotMessage(SNAPSHOTS[status]));
    game.pick("heads");
    expect(parent.posted).toHaveLength(1);
  });

  it("asks for nothing before a Snapshot", () => {
    const { parent, game } = start();
    game.pick("heads");
    expect(parent.posted).toHaveLength(1);
  });

  it("asks for nothing on an active Snapshot with no current step", () => {
    const { parent, game } = start();
    parent.send(
      snapshotMessage(withFields(SNAPSHOTS.active, { step: undefined })),
    );
    game.pick("heads");
    expect(parent.posted).toHaveLength(1);
  });

  it("is answered by the next Snapshot, which shows it", () => {
    const { parent, game, views } = start();
    parent.send(snapshotMessage(SNAPSHOTS.active));
    game.pick("tails");
    parent.send(snapshotMessage(SNAPSHOTS.resolving));
    const view = roundOf(game.view());
    expect(view.pending).toBeUndefined();
    expect(view.round.call).toBe("tails");
    expect(views.at(-1)?.[1]).toBe("answered");
  });

  it("is not answered by a Snapshot of the same version", () => {
    const { parent, game } = start();
    parent.send(snapshotMessage(SNAPSHOTS.active));
    game.pick("tails");
    parent.send(snapshotMessage(SNAPSHOTS.active));
    expect(roundOf(game.view()).pending).toBe("tails");
  });

  it.each(["not_legal", "not_active", "busy", "invalid"] as const)(
    "handles reject: %s, and can pick again",
    reason => {
      const { parent, game, views } = start();
      parent.send(snapshotMessage(SNAPSHOTS.active));
      game.pick("heads");
      parent.send(rejectMessage("pick-1", reason));
      const view = roundOf(game.view());
      expect(view.pending).toBeUndefined();
      expect(view.rejected).toBe(reason);
      expect(views.at(-1)?.[1]).toBe("answered");
      game.pick("tails");
      expect(parent.posted.at(-1)?.message).toEqual(
        actionMessage("pick-2", 0, 1),
      );
      expect(roundOf(game.view()).rejected).toBeUndefined();
    },
  );

  it("ignores a reject for a pick it did not ask for", () => {
    const { parent, game } = start();
    parent.send(snapshotMessage(SNAPSHOTS.active));
    parent.send(rejectMessage("pick-1", "busy"));
    expect(roundOf(game.view()).rejected).toBeUndefined();
    game.pick("heads");
    parent.send(rejectMessage("pick-9", "busy"));
    expect(roundOf(game.view()).pending).toBe("heads");
  });

  it("forgets a reject once a newer Snapshot arrives", () => {
    const { parent, game } = start();
    parent.send(snapshotMessage(SNAPSHOTS.active));
    game.pick("heads");
    parent.send(rejectMessage("pick-1", "not_active"));
    parent.send(snapshotMessage(SNAPSHOTS.canceled));
    expect(roundOf(game.view()).rejected).toBeUndefined();
  });
});
