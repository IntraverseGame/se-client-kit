// T-6 (component): every `valid/` Snapshot renders without error and in the
// state W-31's status table gives, with no read of a field the UI does not
// list; `closeReason` is shown beside the status (W-33); `won` shows no
// credit wait (W-32); the round id, the verify link, and the next bet after a
// round ends are ended-round.test.ts's (W-39, W-40). Money is the Snapshot's
// `formatted` (W-34, W-48).

import { describe, expect, it } from "vitest";

import { allText, buttonNamed, mount, statusHeading } from "./fixtures/app.ts";
import { SNAPSHOT_VECTORS, snapshotVector } from "./fixtures/vectors.ts";
import { messagesFor } from "./messages.ts";
import type { RoundStatus, SnapshotInput } from "./round-input.ts";

const m = messagesFor("en").messages;

const HEADING: Readonly<Record<RoundStatus, string>> = {
  idle: m["status.idle"],
  starting: m["status.starting"],
  active: m["status.active"],
  resolving: m["status.resolving"],
  won: m["status.won"],
  lost: m["status.lost"],
  canceled: m["status.canceled"],
};

/** The top-level fields the UI may read (its input type, round-input.ts). */
const READABLE: ReadonlySet<string> = new Set([
  "version",
  "status",
  "closeReason",
  "roundId",
  "context",
  "bet",
  "currentMultiplier",
  "payout",
  // A book round's RTP line (W-56): only `config.rtp.decimal` below it.
  "presentation",
  "config",
]);

/** Of `config`, the UI reads only a book round's `rtp.decimal` (W-56). */
const CONFIG_READABLE: ReadonlySet<string> = new Set([
  "config",
  "config.rtp",
  "config.rtp.decimal",
]);

/**
 * A deep proxy of `value` that records the path of every property read, with
 * array indices written as `[]`.
 */
const recording = <T extends object>(
  value: T,
  reads: Set<string>,
  path = "",
): T =>
  new Proxy(value, {
    get: (target, key, receiver) => {
      const result: unknown = Reflect.get(target, key, receiver);
      if (typeof key !== "string") {
        return result;
      }
      const segment = /^\d+$/u.test(key) ? "[]" : key;
      const next = path === "" ? segment : `${path}.${segment}`;
      reads.add(next);
      return typeof result === "object" && result !== null
        ? recording(result, reads, next)
        : result;
    },
  });

const topLevelOf = (path: string): string => path.split(".")[0] ?? "";

const rendered = (snapshot: SnapshotInput) => {
  const ui = mount();
  ui.app.accept({ kind: "snapshot", snapshot }, "poll");
  return ui;
};

const statusOfVector = (name: string): RoundStatus =>
  snapshotVector(name).status;

describe("every valid Snapshot vector (T-6, AC3)", () => {
  it("covers all seven statuses", () => {
    expect(new Set(SNAPSHOT_VECTORS.map(name => statusOfVector(name)))).toEqual(
      new Set(Object.keys(HEADING)),
    );
  });

  it.each(SNAPSHOT_VECTORS)("%s renders in its status's state", name => {
    const snapshot = snapshotVector(name);
    const ui = rendered(snapshot);
    expect(statusHeading(ui.host)).toBe(HEADING[snapshot.status]);
    expect(allText(ui.host)).toContain(snapshot.bet.balance.formatted);
  });

  it.each(SNAPSHOT_VECTORS)("%s reads no field the UI does not list", name => {
    const reads = new Set<string>();
    rendered(recording(snapshotVector(name), reads));
    const topLevel = [...reads].map(path => topLevelOf(path));
    expect(topLevel.filter(field => !READABLE.has(field))).toEqual([]);
    // Never the draw, the packageHash, or `rtp.fraction` (W-54, W-56).
    expect(
      [...reads]
        .filter(path => path.startsWith("config"))
        .filter(path => !CONFIG_READABLE.has(path)),
    ).toEqual([]);
    // Display-only numbers are never read (W-34).
    expect([...reads].filter(path => path.endsWith(".normalized"))).toEqual([]);
  });
});

describe("status details (W-31 to W-33)", () => {
  it("shows closeReason expired beside a canceled status", () => {
    const ui = rendered(snapshotVector("coinflip-canceled-expired-no-action"));
    expect(statusHeading(ui.host)).toBe(m["status.canceled"]);
    expect(allText(ui.host)).toContain(m["detail.canceled"]);
    expect(allText(ui.host)).toContain(m["detail.expired"]);
  });

  it("shows closeReason expired beside a won status", () => {
    const ui = rendered(snapshotVector("cashorcrash-won-expired"));
    expect(statusHeading(ui.host)).toBe(m["status.won"]);
    expect(allText(ui.host)).toContain(m["detail.expired"]);
  });

  it("does not show the expiry words without closeReason", () => {
    const ui = rendered(snapshotVector("coinflip-canceled"));
    expect(allText(ui.host)).not.toContain(m["detail.expired"]);
  });

  it("shows won as final, with no credit wait or progress", () => {
    const ui = rendered(snapshotVector("coinflip-won"));
    expect(allText(ui.host)).not.toMatch(/credit|waiting|pending/iu);
    expect(ui.host.querySelector(".se-icon--progress")).toBeNull();
  });

  it("shows the multiplier of an active round, for display", () => {
    const ui = rendered(snapshotVector("cashorcrash-active-row2"));
    expect(allText(ui.host)).toContain(m["label.multiplier"]);
  });

  it("offers no input while starting or resolving", () => {
    for (const name of ["coinflip-starting", "coinflip-resolving"]) {
      const ui = rendered(snapshotVector(name));
      expect(ui.host.querySelectorAll("button, input")).toHaveLength(0);
    }
  });

  it("shows the bet selector with the balance when idle", () => {
    const ui = rendered(snapshotVector("coinflip-idle"));
    const radios = [
      ...ui.host.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    ];
    expect(radios).toHaveLength(3);
    expect(radios.map(radio => radio.checked)).toEqual([true, false, false]);
    expect(ui.host.querySelector("legend")?.textContent).toBe(m["label.bet"]);
    expect(allText(ui.host)).toContain(`${m["label.balance"]} €100.00`);
  });

  it("starts with the selected bet's Amount fields when start is wired", () => {
    const ui = mount();
    const started: string[] = [];
    ui.app.connect({
      readSnapshot: () =>
        Promise.resolve({
          kind: "snapshot",
          snapshot: snapshotVector("coinflip-idle"),
        }),
      intents: { start: bet => started.push(`${bet.value} ${bet.unit}`) },
    });
    ui.app.accept(
      { kind: "snapshot", snapshot: snapshotVector("coinflip-idle") },
      "poll",
    );
    const radios = ui.host.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    );
    radios[1]?.click();
    buttonNamed(ui.host, m["action.start"])?.click();
    expect(started).toEqual(["500 EUR"]);
  });
});

describe("stale responses (W-29)", () => {
  it("ignores a Snapshot whose version is lower than the last accepted", () => {
    const won = snapshotVector("coinflip-won");
    const ui = rendered(won);
    const older = snapshotVector("coinflip-resolving");
    expect(older.version).toBeLessThan(won.version);
    ui.app.accept({ kind: "snapshot", snapshot: older }, "poll");
    expect(statusHeading(ui.host)).toBe(m["status.won"]);
  });
});
