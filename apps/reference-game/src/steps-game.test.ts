// The controller on a `steps` round that is not Coin Flip (Cash or Crash
// `[3,3,4]`): one pick at a time, named by the row's `index` and the tile, held
// until a newer Snapshot or its own reject answers, and refused when the round
// takes no pick, on another row, or for a tile the row does not have.

import { describe, expect, it } from "vitest";

import { CASH_OR_CRASH } from "./fixtures/cash-or-crash.ts";
import { fakeParent, PARENT_ORIGIN } from "./fixtures/parent.ts";
import {
  rejectMessage,
  SNAPSHOTS,
  snapshotMessage,
} from "./fixtures/snapshots.ts";
import { createGame, type GameView } from "./game.ts";
import { actionMessage } from "./protocol.ts";

/** The views are not read here: the tests read `game.view()`. */
const ignoreView = (): void => {
  // Nothing to do.
};

const start = () => {
  const parent = fakeParent();
  const game = createGame({
    parent: parent.window,
    parentOrigin: PARENT_ORIGIN,
    listen: parent.listen,
    onView: ignoreView,
  });
  return { parent, game };
};

const stepsOf = (view: GameView) => {
  if (view.kind !== "steps") throw new Error(`not steps: ${view.kind}`);
  return view;
};

describe("a steps round", () => {
  it("is shown as rows, not as Coin Flip", () => {
    const { parent, game } = start();
    parent.send(snapshotMessage(CASH_OR_CRASH.active));
    expect(stepsOf(game.view()).round.steps).toHaveLength(3);
    expect(stepsOf(game.view()).pending).toBeUndefined();
  });

  it("keeps Coin Flip's one step of two options as Coin Flip", () => {
    const { parent, game } = start();
    parent.send(snapshotMessage(SNAPSHOTS.active));
    expect(game.view().kind).toBe("round");
  });

  it("asks for the tile of the row being played and holds further picks", () => {
    const { parent, game } = start();
    parent.send(snapshotMessage(CASH_OR_CRASH.active));
    game.pickTile(1, 0);
    expect(parent.posted.at(-1)).toEqual({
      message: actionMessage("pick-1", 1, 0),
      targetOrigin: PARENT_ORIGIN,
    });
    expect(stepsOf(game.view()).pending).toEqual({ step: 1, option: 0 });
    game.pickTile(1, 2);
    expect(parent.posted).toHaveLength(2);
  });

  it("is answered by a newer Snapshot", () => {
    const { parent, game } = start();
    parent.send(snapshotMessage(CASH_OR_CRASH.active));
    game.pickTile(1, 0);
    parent.send(snapshotMessage(CASH_OR_CRASH.resolving));
    expect(stepsOf(game.view()).pending).toBeUndefined();
  });

  it.each(["not_legal", "not_active", "busy", "invalid"] as const)(
    "is answered by its own reject: %s",
    reason => {
      const { parent, game } = start();
      parent.send(snapshotMessage(CASH_OR_CRASH.active));
      game.pickTile(1, 0);
      parent.send(rejectMessage("pick-1", reason));
      expect(stepsOf(game.view())).toMatchObject({
        pending: undefined,
        rejected: reason,
      });
      game.pickTile(1, 1);
      expect(parent.posted).toHaveLength(3);
    },
  );

  it("ignores a reject for another id", () => {
    const { parent, game } = start();
    parent.send(snapshotMessage(CASH_OR_CRASH.active));
    game.pickTile(1, 0);
    parent.send(rejectMessage("pick-9", "busy"));
    expect(stepsOf(game.view()).pending).toEqual({ step: 1, option: 0 });
  });

  it.each<[string, number, number]>([
    ["a row that is not the one being played", 0, 0],
    ["a row it does not have", 7, 0],
    ["a tile the row does not have", 1, 3],
  ])("sends nothing for %s", (_name, step, option) => {
    const { parent, game } = start();
    parent.send(snapshotMessage(CASH_OR_CRASH.active));
    game.pickTile(step, option);
    expect(parent.posted).toHaveLength(1);
  });

  it.each(["idle", "resolving", "lost", "wonByCashOut"] as const)(
    "sends nothing while the round is %s",
    name => {
      const { parent, game } = start();
      parent.send(snapshotMessage(CASH_OR_CRASH[name]));
      game.pickTile(1, 0);
      game.pickTile(2, 0);
      expect(parent.posted).toHaveLength(1);
    },
  );

  it("never goes back to an older Snapshot", () => {
    const { parent, game } = start();
    parent.send(snapshotMessage(CASH_OR_CRASH.lost));
    parent.send(snapshotMessage(CASH_OR_CRASH.active));
    expect(stepsOf(game.view()).round.status).toBe("lost");
  });

  it("drops a pending pick when the Snapshot is Coin Flip again", () => {
    const { parent, game } = start();
    parent.send(snapshotMessage(CASH_OR_CRASH.active));
    game.pickTile(1, 0);
    parent.send(snapshotMessage({ ...SNAPSHOTS.active, version: 9 }));
    expect(game.view().kind).toBe("round");
    game.pick("heads");
    expect(parent.posted.at(-1)?.message).toMatchObject({
      args: { step: 0, option: 0 },
    });
  });

  it("shows a round with no rows as unsupported and takes no pick", () => {
    const { parent, game } = start();
    parent.send(
      snapshotMessage({
        ...CASH_OR_CRASH.active,
        config: { kind: "steps", steps: [] },
      }),
    );
    expect(game.view()).toEqual({ kind: "unsupported" });
    game.pickTile(1, 0);
    expect(parent.posted).toHaveLength(1);
  });
});
