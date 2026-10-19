// T-9a, 9: the lobby and deposit controls (W-49e, W-49f). Each only in the
// states W-49f allows and only when its link is in the latest validated
// Snapshot; the lobby only on a listed origin; no control for a link that
// fails `new URL`, is not `https:`, or carries a username or a password; the
// anchors carry exactly W-49e's attributes; no control before the gate opens;
// and no navigation follows a poll or a timer.

import { describe, expect, it } from "vitest";

import { linkNamed, mount, STANDALONE } from "./fixtures/app.ts";
import { snapshotVector } from "./fixtures/vectors.ts";
import { messagesFor } from "./messages.ts";
import {
  lobbyLink,
  type LinkRules,
  linkPlan,
  parsedLink,
} from "./operator-links.ts";
import type { SnapshotInput } from "./round-input.ts";
import { initialState, type WrapperState } from "./wrapper-state.ts";

const m = messagesFor("en").messages;
const LOBBY = "https://luckybet.example.com/lobby";
const DEPOSIT = "https://luckybet.example.com/cashier";
const FRAMED: LinkRules = { ...STANDALONE, framed: true };

/** The initial state with nothing blocking: no Snapshot yet. */
const { blocking: _loading, ...UNBLOCKED } = initialState;

const at = (
  vector: string,
  overrides: Partial<WrapperState> = {},
): WrapperState => ({
  ...UNBLOCKED,
  snapshot: snapshotVector(vector),
  ...overrides,
});

const withLinks = (
  state: WrapperState,
  links: { readonly lobby?: string; readonly deposit?: string },
): WrapperState => {
  const snapshot = state.snapshot as SnapshotInput;
  return {
    ...state,
    snapshot: { ...snapshot, context: { ...snapshot.context, links } },
  };
};

/** Which controls `state` shows: `lobby`, `relaunch`, `deposit`. */
const shown = (state: WrapperState, rules = FRAMED): readonly string[] => {
  const plan = linkPlan(state, rules);
  return [
    ...(plan.lobby === undefined
      ? []
      : [plan.lobby.label === "action.relaunch" ? "relaunch" : "lobby"]),
    ...(plan.deposit === undefined ? [] : ["deposit"]),
  ];
};

describe("the states that offer the controls (W-49f)", () => {
  it.each<[string, WrapperState, readonly string[]]>([
    ["idle", at("coinflip-idle"), ["lobby", "deposit"]],
    [
      "a typed error at idle",
      at("coinflip-idle", {
        problem: { code: "INSUFFICIENT_FUNDS", retryable: false },
      }),
      ["lobby", "deposit"],
    ],
    ["won", at("coinflip-won"), ["lobby", "deposit"]],
    ["lost", at("coinflip-lost"), ["lobby", "deposit"]],
    ["canceled", at("coinflip-canceled"), ["lobby", "deposit"]],
    [
      "the generic error outside idle",
      at("coinflip-won", { refused: true }),
      [],
    ],
    ["starting", at("coinflip-starting"), []],
    ["active", at("coinflip-active"), []],
    ["resolving", at("coinflip-resolving-cancel"), []],
    [
      "a move not seen applied",
      at("coinflip-idle", {
        check: {
          verdict: "ready",
          outOfSync: false,
          cashOutOffered: false,
          cancel: "none",
          unconfirmed: "move",
        },
      }),
      [],
    ],
    [
      "a cancel settling",
      at("coinflip-idle", {
        check: {
          verdict: "ready",
          outOfSync: false,
          cashOutOffered: false,
          cancel: "settling",
        },
      }),
      [],
    ],
    [
      "session ended",
      at("coinflip-idle", { blocking: "session-ended" }),
      ["relaunch"],
    ],
    ["another tab", at("coinflip-idle", { blocking: "other-tab" }), ["lobby"]],
    [
      "failed verification",
      at("coinflip-active", { blocking: "verification-failed" }),
      ["lobby"],
    ],
    [
      "out of sync",
      at("coinflip-active", { blocking: "out-of-sync" }),
      ["lobby"],
    ],
    [
      "a rejected Snapshot",
      at("coinflip-idle", { blocking: "snapshot-rejected" }),
      ["lobby"],
    ],
    [
      "the connection problem",
      at("coinflip-idle", { connectionProblem: true }),
      [],
    ],
    [
      "the chain-not-independent notice, which hides nothing",
      at("coinflip-idle", { chainNotIndependent: true }),
      ["lobby", "deposit"],
    ],
    [
      "a typed error beside a won result (INSUFFICIENT_FUNDS on the next start)",
      at("coinflip-won", {
        problem: { code: "INSUFFICIENT_FUNDS", retryable: false },
      }),
      ["lobby", "deposit"],
    ],
    [
      "game not compatible",
      at("coinflip-idle", { gameIncompatible: true }),
      [],
    ],
    [
      "could not verify the chain",
      at("coinflip-active", { blocking: "chain-unverified" }),
      [],
    ],
    ["loading", at("coinflip-idle", { blocking: "loading" }), []],
    [
      "the configuration error",
      at("coinflip-idle", { blocking: "configuration-error" }),
      [],
    ],
    [
      "no browser support",
      at("coinflip-idle", { blocking: "unsupported-browser" }),
      [],
    ],
    ["no Snapshot yet", UNBLOCKED, []],
    [
      "session ended before any Snapshot",
      { ...initialState, blocking: "session-ended" },
      [],
    ],
  ])("%s", (_what, state, controls) => {
    expect(shown(state)).toEqual(controls);
  });

  it("offers nothing before the gate opens (no rules)", () => {
    expect(linkPlan(at("coinflip-idle"))).toEqual({});
  });

  it("shows a control only when its link is present", () => {
    const idle = at("coinflip-idle");
    expect(shown(withLinks(idle, {}))).toEqual([]);
    expect(shown(withLinks(idle, { deposit: DEPOSIT }))).toEqual(["deposit"]);
    expect(shown(withLinks(idle, { lobby: LOBBY }))).toEqual(["lobby"]);
  });
});

describe("the URL rule and the lobby's origin (W-49e)", () => {
  it.each([
    "not a url",
    "http://luckybet.example.com/lobby",
    "javascript:alert(1)",
    "https://user@luckybet.example.com/lobby",
    "https://:secret@luckybet.example.com/lobby",
    "data:text/html,x",
  ])("refuses %s", link => {
    expect(parsedLink(link)).toBeUndefined();
    expect(
      shown(withLinks(at("coinflip-idle"), { lobby: link, deposit: link })),
    ).toEqual([]);
  });

  it("uses the parsed URL's href", () => {
    expect(parsedLink("HTTPS://LuckyBet.example.com/a b")?.href).toBe(
      "https://luckybet.example.com/a%20b",
    );
  });

  it("shows the lobby only on a listed origin; the deposit on any https: origin", () => {
    const elsewhere = withLinks(at("coinflip-idle"), {
      lobby: "https://other.example/lobby",
      deposit: "https://payments.example/pay",
    });
    expect(shown(elsewhere)).toEqual(["deposit"]);
    expect(
      lobbyLink(
        "https://luckybet.example.com:8443/lobby",
        FRAMED.operatorOrigins,
      ),
    ).toBeUndefined();
  });
});

/** The UI at `idle`, its gate open with `rules`. */
const idleUi = (rules: LinkRules): ReturnType<typeof mount> => {
  const ui = mount(undefined, rules);
  ui.app.accept(
    { kind: "snapshot", snapshot: snapshotVector("coinflip-idle") },
    "poll",
  );
  return ui;
};

/** An anchor's attributes, but for its class and focus key. */
const attributes = (anchor: Element | undefined): Record<string, string> =>
  Object.fromEntries(
    [...(anchor?.attributes ?? [])]
      .filter(
        attribute =>
          attribute.name !== "class" && attribute.name !== "data-focus-key",
      )
      .map(attribute => [attribute.name, attribute.value]),
  );

describe("the anchors (W-49e)", () => {
  it("framed: the lobby targets the top-level window, the deposit a new one", () => {
    const ui = idleUi(FRAMED);
    expect(attributes(linkNamed(ui.host, m["action.lobby"]))).toEqual({
      href: LOBBY,
      target: "_top",
      rel: "noreferrer",
      referrerpolicy: "no-referrer",
    });
    expect(attributes(linkNamed(ui.host, m["action.deposit"]))).toEqual({
      href: DEPOSIT,
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });

  it("standalone: the lobby navigates the Wrapper's own window", () => {
    const ui = idleUi(STANDALONE);
    expect(attributes(linkNamed(ui.host, m["action.lobby"]))).toEqual({
      href: LOBBY,
      rel: "noreferrer",
      referrerpolicy: "no-referrer",
    });
  });

  it("no navigation follows a poll or a timer", async () => {
    const before = globalThis.location.href;
    const ui = idleUi(FRAMED);
    ui.connect();
    ui.answers.push({
      kind: "snapshot",
      snapshot: snapshotVector("coinflip-won"),
    });
    await ui.step(30_000);
    expect(globalThis.location.href).toBe(before);
  });
});
