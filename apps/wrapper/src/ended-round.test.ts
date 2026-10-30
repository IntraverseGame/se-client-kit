// T-6 (component), W-39 and W-40: after a round ends (`won`, `lost`,
// `canceled`) the round id, a copy control, and the verify link are shown, the
// link opens with `noopener noreferrer`, and the next bet is offered beside
// them from that Snapshot's own `bet` (W-31: no separate "new round" step).
// They stay while later Snapshots arrive and through a refused start, and go
// once the round the player started from them shows.

import { describe, expect, it } from "vitest";

import {
  buttonNamed,
  linkNamed,
  mount,
  statusHeading,
} from "./fixtures/app.ts";
import { snapshotVector, withFields } from "./fixtures/vectors.ts";
import { messagesFor } from "./messages.ts";
import type { SnapshotInput } from "./round-input.ts";

const m = messagesFor("en").messages;

const rendered = (snapshot: SnapshotInput) => {
  const ui = mount();
  ui.app.accept({ kind: "snapshot", snapshot }, "poll");
  return ui;
};

/** `snapshot` rendered with the start intent wired; the starts it made. */
const startable = (snapshot: SnapshotInput) => {
  const ui = mount();
  const started: string[] = [];
  ui.app.connect({
    readSnapshot: () => Promise.resolve({ kind: "snapshot", snapshot }),
    intents: { start: bet => started.push(`${bet.value} ${bet.unit}`) },
  });
  ui.app.accept({ kind: "snapshot", snapshot }, "poll");
  return { ...ui, started };
};

describe("the round id and the verify link (W-39, W-40)", () => {
  it.each(["coinflip-won", "coinflip-lost", "coinflip-canceled"])(
    "%s shows the round id, a copy control, and the verify link",
    async name => {
      const snapshot = snapshotVector(name);
      const ui = rendered(snapshot);
      expect(ui.host.querySelector(".se-round-id")?.textContent).toBe(
        snapshot.roundId,
      );
      const link = linkNamed(ui.host, m["action.verify"]);
      expect(link?.getAttribute("href")).toBe(
        `https://verify.example/rounds/${snapshot.roundId}`,
      );
      expect(link?.getAttribute("target")).toBe("_blank");
      expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
      buttonNamed(ui.host, m["action.copyRoundId"])?.click();
      await ui.settle();
      expect(ui.copied).toEqual([snapshot.roundId]);
    },
  );

  it.each(["coinflip-idle", "coinflip-starting", "coinflip-active"])(
    "%s shows no round id panel before a round ended",
    name => {
      const ui = rendered(snapshotVector(name));
      expect(ui.host.querySelector(".se-round .se-round-id")).toBeNull();
    },
  );

  it("offers the next bet beside the result, from the ended round's Snapshot (W-31)", () => {
    for (const name of ["coinflip-won", "coinflip-lost", "coinflip-canceled"]) {
      const snapshot = snapshotVector(name);
      const ui = startable(snapshot);
      expect(statusHeading(ui.host)).toBe(m[`status.${snapshot.status}`]);
      expect(ui.host.querySelector(".se-round-id")?.textContent).toBe(
        snapshot.roundId,
      );
      expect(
        ui.host.querySelectorAll('.se-controls input[type="radio"]'),
      ).toHaveLength(snapshot.bet.suggestedBets.length);
      expect(buttonNamed(ui.host, m["action.playAgain"])).toBeDefined();
    }
  });

  it("keeps them while later Snapshots arrive, until the player starts (W-40)", () => {
    const won = snapshotVector("coinflip-won");
    const ui = startable(won);
    // The read keeps showing the ended round, later with a newer balance.
    const reread = withFields(won, { version: won.version + 1 });
    ui.app.accept({ kind: "snapshot", snapshot: reread }, "poll");
    expect(statusHeading(ui.host)).toBe(m["status.won"]);
    expect(ui.host.querySelector(".se-round-id")?.textContent).toBe(
      won.roundId,
    );
    // A round that shows before the player starts does not replace them.
    const elsewhere = withFields(snapshotVector("coinflip-starting"), {
      version: won.version + 2,
      roundId: "01927c5e-8b3a-7f21-9c4d-000000000002",
    });
    ui.app.accept({ kind: "snapshot", snapshot: elsewhere }, "poll");
    expect(ui.host.querySelector(".se-round-id")?.textContent).toBe(
      won.roundId,
    );
  });

  it("drops them once the round the player started shows, and not on a refused start", () => {
    const won = snapshotVector("coinflip-won");
    const ui = startable(won);
    buttonNamed(ui.host, m["action.playAgain"])?.click();
    expect(ui.started).toHaveLength(1);
    ui.app.accept(
      {
        kind: "problem",
        problem: { code: "INSUFFICIENT_FUNDS", retryable: false },
      },
      "player",
    );
    expect(ui.host.querySelector(".se-round-id")?.textContent).toBe(
      won.roundId,
    );
    const next = withFields(snapshotVector("coinflip-starting"), {
      version: won.version + 1,
      roundId: "01927c5e-8b3a-7f21-9c4d-000000000002",
    });
    ui.app.accept({ kind: "snapshot", snapshot: next }, "player");
    expect(ui.host.querySelector(".se-round-id")).toBeNull();
    expect(statusHeading(ui.host)).toBe(m["status.starting"]);
  });

  it("shows the new round's id once that round ends", () => {
    const won = snapshotVector("coinflip-won");
    const ui = startable(won);
    buttonNamed(ui.host, m["action.playAgain"])?.click();
    const roundId = "01927c5e-8b3a-7f21-9c4d-000000000003";
    const lost = withFields(snapshotVector("coinflip-lost"), {
      version: won.version + 3,
      roundId,
    });
    ui.app.accept({ kind: "snapshot", snapshot: lost }, "player");
    expect(ui.host.querySelector(".se-round-id")?.textContent).toBe(roundId);
  });
});
