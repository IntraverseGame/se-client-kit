// T-28's Wrapper half (W-16, W-57) and T-14a's single-screen focus rules at the
// component level (W-46, W-58). The status line reads "Waiting for your move
// to be confirmed." only while the shell's `RoundState.pending` is set and a
// connection problem, a typed error, or the generic error shows, never in
// normal play, and the unconfirmed state replaces it. Focus: an error that
// answers a pick in a playable frame keeps the focus in the frame; a bar
// control that goes away hands the focus to the status heading; the frame
// takes the focus once when the round the player started becomes ready, from
// a result as from `idle`, and not after a start that failed or that ended.

import type { SessionRead, ValidSnapshot } from "@intraverse/se-client-shell";
import { describe, expect, it } from "vitest";

import { buttonNamed } from "./fixtures/app.ts";
import { validSnapshot } from "./fixtures/fake-session.ts";
import { HELD, readOf, screenAfter, shownOf } from "./fixtures/screen.ts";
import {
  problemVector,
  snapshotVector,
  withFields,
} from "./fixtures/vectors.ts";
import { wired } from "./fixtures/wired.ts";
import { messagesFor } from "./messages.ts";
import type { RoundCheck, SnapshotRead } from "./round-input.ts";

const m = messagesFor("en").messages;
const PENDING: RoundCheck = { ...HELD, pending: "move" };

/** The text of the status line's detail, if any. */
const detailOf = (host: HTMLElement): string =>
  host.querySelector(".se-status .se-detail")?.textContent ?? "";

const ERRORS: readonly (readonly [string, SnapshotRead])[] = [
  ["a connection problem", { kind: "network" }],
  [
    "a typed error",
    {
      kind: "problem",
      problem: problemVector("problem-default-code-unavailable"),
    },
  ],
  ["the generic error", { kind: "refused" }],
];

describe("the waiting detail (T-28, the Wrapper's half)", () => {
  it.each(ERRORS)(
    "shows while a move is pending and %s shows, under the status in play",
    (_, error) => {
      const screen = screenAfter(readOf("coinflip-active", PENDING));
      screen.app.accept(error, "poll");
      expect(detailOf(screen.host)).toBe(m["detail.waitingMove"]);
      expect(shownOf(screen).status).toBe(m["status.active"]);
    },
  );

  it("names the cash-out when the cash-out is pending", () => {
    const screen = screenAfter(
      readOf("coinflip-active", { ...HELD, pending: "cash-out" }),
    );
    screen.app.accept({ kind: "network" }, "poll");
    expect(detailOf(screen.host)).toBe(m["detail.waitingCashOut"]);
  });

  it("never shows in normal play: a pending move with no error", () => {
    const screen = screenAfter(readOf("coinflip-active", PENDING));
    expect(detailOf(screen.host)).toBe("");
    expect(screen.host.textContent).not.toContain(m["detail.waitingMove"]);
  });

  it("never shows for an error with nothing pending", () => {
    const screen = screenAfter(readOf("coinflip-active", HELD));
    screen.app.accept({ kind: "network" }, "poll");
    expect(screen.host.textContent).not.toContain(m["detail.waitingMove"]);
  });

  it("goes once a newer Snapshot shows the move applied and clears the error", () => {
    const screen = screenAfter(readOf("coinflip-active", PENDING));
    screen.app.accept({ kind: "network" }, "poll");
    screen.app.accept(readOf("coinflip-won", HELD), "poll");
    expect(screen.host.textContent).not.toContain(m["detail.waitingMove"]);
  });

  it("the unconfirmed state replaces it", () => {
    const screen = screenAfter(
      readOf("coinflip-active", { ...PENDING, unconfirmed: "move" }),
    );
    screen.app.accept({ kind: "network" }, "poll");
    expect(shownOf(screen).status).toBe(m["state.moveUnconfirmed"]);
    expect(screen.host.textContent).not.toContain(m["detail.waitingMove"]);
  });
});

describe("the single screen's focus rules (W-46)", () => {
  it("an error that answers a pick keeps the focus in a frame that stays playable", () => {
    const screen = screenAfter(readOf("coinflip-active", HELD));
    screen.frame.focus();
    screen.app.accept({ kind: "network" }, "pick");
    expect(document.activeElement).toBe(screen.frame);
    // The same error after the player's action in the bar takes the focus.
    screen.app.accept(readOf("coinflip-active", HELD), "poll");
    const later = screenAfter(readOf("coinflip-active", HELD));
    later.app.accept({ kind: "network" }, "player");
    expect(document.activeElement?.id).toBe("se-alert-heading");
  });

  it("a bar control that goes away hands the focus to the status heading", () => {
    const screen = screenAfter(readOf("coinflip-idle"));
    const start = [...screen.host.querySelectorAll("button")].find(
      button => button.textContent === m["action.placeBet"],
    );
    start?.focus();
    expect(document.activeElement).toBe(start);
    // A poll shows the round starting: the start control is gone.
    screen.app.accept(
      readOf("coinflip-starting-bound", { ...HELD, verdict: "checking" }),
      "poll",
    );
    expect(document.activeElement?.id).toBe("se-status-heading");
  });

  it("the frame takes the focus once when the round the player started becomes ready", () => {
    const screen = screenAfter(readOf("coinflip-idle"));
    const start = [...screen.host.querySelectorAll("button")].find(
      button => button.textContent === m["action.placeBet"],
    );
    start?.focus();
    start?.click();
    const checking: RoundCheck = { ...HELD, verdict: "checking" };
    // The start's answer: its control goes, the status heading takes the focus.
    screen.app.accept(readOf("coinflip-starting-bound", checking), "player");
    expect(document.activeElement?.id).toBe("se-status-heading");
    screen.app.accept(readOf("coinflip-active", checking), "poll");
    expect(document.activeElement).not.toBe(screen.frame);
    // The poll that brings the verdict `ready`.
    screen.app.accept(readOf("coinflip-active", HELD), "poll");
    expect(document.activeElement).toBe(screen.frame);
    // Once: a later poll of the round leaves a focus moved elsewhere alone.
    screen.host.querySelector<HTMLElement>("#se-status-heading")?.focus();
    const later = snapshotVector("coinflip-active");
    screen.app.accept(
      {
        kind: "snapshot",
        snapshot: withFields(later, { version: later.version + 1 }),
        check: HELD,
      },
      "poll",
    );
    expect(document.activeElement).not.toBe(screen.frame);
  });

  it("a round the player did not start does not take the focus into the frame", () => {
    const screen = screenAfter(readOf("coinflip-active", HELD));
    expect(document.activeElement).not.toBe(screen.frame);
  });
});

/** The round the player starts from a result: another id, a later version. */
const NEXT_ROUND = "01927c5e-8b3a-7f21-9c4d-000000000002";

const nextRound = (name: string, version: number): ValidSnapshot =>
  ({
    ...validSnapshot(name),
    roundId: NEXT_ROUND,
    version,
  }) as ValidSnapshot;

/** A read of the next round, as a poll answers it. */
const nextRoundRead = (
  name: string,
  version: number,
  check: RoundCheck,
): SnapshotRead => ({
  kind: "snapshot",
  snapshot: nextRound(name, version),
  check,
});

/**
 * The UI at `from`, through the session's wiring (a start makes the call in
 * flight, W-49f, in an update that still shows the round it started from), with
 * a game frame in place and the start answered `answer`. The player presses
 * `control`, which holds the focus.
 */
const startedFrom = async (
  from: string,
  control: string,
  answer: SessionRead,
) => {
  const ui = await wired(fake => {
    fake.reads.push({ kind: "snapshot", snapshot: validSnapshot(from) });
    fake.answerStart(answer);
  });
  const frame = document.createElement("iframe");
  ui.app.gameHost().append(frame);
  const start = buttonNamed(ui.host, control);
  start?.focus();
  start?.click();
  await ui.settle();
  return { ...ui, frame };
};

const STARTS_FROM = [
  ["a result", "coinflip-won", m["action.playAgain"]],
  ["idle", "coinflip-idle", m["action.placeBet"]],
] as const;

describe("the focus into the game, through the session's wiring (W-46)", () => {
  it.each(STARTS_FROM)(
    "from %s, the frame takes it once the started round is ready",
    async (_, from, control) => {
      const screen = await startedFrom(from, control, {
        kind: "snapshot",
        snapshot: nextRound("coinflip-starting-bound", 10),
      });
      expect(document.activeElement?.id).toBe("se-status-heading");
      screen.app.accept(
        nextRoundRead("coinflip-active", 11, { ...HELD, verdict: "checking" }),
        "poll",
      );
      expect(document.activeElement).not.toBe(screen.frame);
      screen.app.accept(nextRoundRead("coinflip-active", 12, HELD), "poll");
      expect(document.activeElement).toBe(screen.frame);
      // Once: a later poll of the round leaves a focus moved elsewhere alone.
      screen.host.querySelector<HTMLElement>("#se-status-heading")?.focus();
      screen.app.accept(nextRoundRead("coinflip-active", 13, HELD), "poll");
      expect(document.activeElement).not.toBe(screen.frame);
    },
  );

  it.each(STARTS_FROM)(
    "from %s, a started round that a poll shows over leaves nothing waiting for a round",
    async (_, from, control) => {
      const screen = await startedFrom(from, control, {
        kind: "snapshot",
        snapshot: nextRound("coinflip-starting-bound", 10),
      });
      // A step round's poll stays a poll, so only the round's end decides here
      // (a book round's result counts as the player's own, poll-follow.ts).
      screen.app.accept(nextRoundRead("coinflip-canceled", 11, HELD), "poll");
      screen.host.querySelector<HTMLElement>("#se-status-heading")?.focus();
      screen.app.accept(nextRoundRead("coinflip-active", 12, HELD), "poll");
      expect(screen.frame.hasAttribute("inert")).toBe(false);
      expect(document.activeElement).not.toBe(screen.frame);
    },
  );

  const FAILS_OR_ENDS: readonly (readonly [string, SessionRead])[] = [
    [
      "a typed error",
      {
        kind: "problem",
        problem: problemVector("problem-default-code-unavailable") as Extract<
          SessionRead,
          { kind: "problem" }
        >["problem"],
      },
    ],
    ["a refusal", { kind: "refused", reason: "busy" }],
    ["a connection problem", { kind: "network" }],
    [
      "a round already over",
      { kind: "snapshot", snapshot: nextRound("coinflip-won", 10) },
    ],
  ];

  const STARTS_THAT_FAIL = STARTS_FROM.flatMap(start =>
    FAILS_OR_ENDS.map(
      answer => [start[0], answer[0], start, answer[1]] as const,
    ),
  );

  it.each(STARTS_THAT_FAIL)(
    "from %s, a start answered with %s leaves nothing waiting for a round",
    async (_from, _answer, [, from, control], answer) => {
      const screen = await startedFrom(from, control, answer);
      // A later round the player did not start this time takes no focus.
      screen.host.querySelector<HTMLElement>("#se-status-heading")?.focus();
      screen.app.accept(nextRoundRead("coinflip-active", 11, HELD), "poll");
      expect(screen.frame.hasAttribute("inert")).toBe(false);
      expect(document.activeElement).not.toBe(screen.frame);
    },
  );
});
