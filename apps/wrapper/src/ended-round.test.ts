// T-6 (component), W-39 and W-40: after a round ends (`won`, `lost`,
// `canceled`) the round id, a copy control, and the verify link are shown, the
// link opens with `noopener noreferrer`, and the next bet is offered beside
// them from that Snapshot's own `bet` (W-31: no separate "new round" step).
// They stay while later Snapshots arrive and through a refused start, and go
// once the round the player started from them shows. The round line shows the
// round id shortened to "…" and its last eight characters, with the full id
// as its title and as the text an assistive technology reads (W-57).

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

/** The full round id the round line names (its title; W-57 shortens the view). */
const fullRoundId = (host: ParentNode): string | null | undefined =>
  host.querySelector(".se-round-id")?.getAttribute("title");

/** The text an assistive technology reads: what is not `aria-hidden`. */
const spokenText = (element: Element): string =>
  [...element.childNodes]
    .map(node =>
      node instanceof Element
        ? node.getAttribute("aria-hidden") === "true"
          ? ""
          : spokenText(node)
        : (node.textContent ?? ""),
    )
    .join("");

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
      expect(fullRoundId(ui.host)).toBe(snapshot.roundId);
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

  it("shows the round id shortened, names it in full, and copies it in full (W-57)", async () => {
    const snapshot = snapshotVector("coinflip-won");
    const roundId = String(snapshot.roundId);
    expect(roundId.length).toBeGreaterThan(8);
    const ui = rendered(snapshot);
    const id = ui.host.querySelector(".se-round .se-round-id") as Element;
    expect(id).not.toBeNull();
    // Shown: "…" and the last eight characters.
    const shown = id.querySelector('[aria-hidden="true"]');
    expect(shown?.textContent).toBe(`…${roundId.slice(-8)}`);
    // Read by an assistive technology, and its title: the full id.
    expect(spokenText(id)).toBe(roundId);
    expect(id.querySelector(".se-visually-hidden")?.textContent).toBe(roundId);
    expect(id.getAttribute("title")).toBe(roundId);
    // Copied: the full id.
    buttonNamed(ui.host, m["action.copyRoundId"])?.click();
    await ui.settle();
    expect(ui.copied).toEqual([roundId]);
  });

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
      expect(fullRoundId(ui.host)).toBe(snapshot.roundId);
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
    expect(fullRoundId(ui.host)).toBe(won.roundId);
    // A round that shows before the player starts does not replace them.
    const elsewhere = withFields(snapshotVector("coinflip-starting"), {
      version: won.version + 2,
      roundId: "01927c5e-8b3a-7f21-9c4d-000000000002",
    });
    ui.app.accept({ kind: "snapshot", snapshot: elsewhere }, "poll");
    expect(fullRoundId(ui.host)).toBe(won.roundId);
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
    expect(fullRoundId(ui.host)).toBe(won.roundId);
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
    expect(fullRoundId(ui.host)).toBe(roundId);
  });
});
