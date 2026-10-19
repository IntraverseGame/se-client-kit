// The lobby and deposit controls (W-49e, W-49f, ADR-006): navigations, not
// messages. Each is an anchor the player activates, built only from the
// latest validated Snapshot's `context.links`; never from a message, a URL
// parameter, or the game, and never followed by script. A link shows a
// control only in the states W-49f allows and only when it passes the URL
// rule; the lobby also only on `operatorOrigins`, since it replaces the
// operator's page. The Wrapper never builds or guesses a URL.

import type { Builder, Child } from "./dom.ts";
import type { Messages } from "./messages.ts";
import type { WrapperState } from "./wrapper-state.ts";

/** What the controls depend on besides the state, fixed once the gate opens. */
export type LinkRules = {
  /** The Wrapper is framed (after `welcome`): the lobby targets `_top`. */
  readonly framed: boolean;
  /** The configuration's `operatorOrigins`: the lobby's origin must be one. */
  readonly operatorOrigins: readonly string[];
};

/** Which controls a state offers (W-49f). */
type Offer = {
  /** `relaunch`: the session ended, and the lobby is the way to relaunch. */
  readonly lobby: "lobby" | "relaunch" | undefined;
  readonly deposit: boolean;
};

const NONE: Offer = { lobby: undefined, deposit: false };
const BOTH: Offer = { lobby: "lobby", deposit: true };
const LOBBY_ONLY: Offer = { lobby: "lobby", deposit: false };

/** The W-44 states that offer the lobby only, from the latest Snapshot. */
const LOBBY_ONLY_STATES: ReadonlySet<string> = new Set([
  "other-tab",
  "verification-failed",
  "out-of-sync",
  "snapshot-rejected",
]);

/** Cancel states with a signed action not yet seen applied (W-15, W-25). */
const CANCEL_PENDING: ReadonlySet<string> = new Set([
  "in-flight",
  "settling",
  "check-later",
]);

/**
 * W-49f's table. Leaving ends the session, so no control is offered while a
 * round runs or an action is not seen applied, nor in a state the table does
 * not list (loading, the configuration error, and any later one included).
 */
export const offerOf = (state: WrapperState): Offer => {
  if (state.blocking === "session-ended") {
    return { lobby: "relaunch", deposit: false };
  }
  if (state.blocking !== undefined) {
    return LOBBY_ONLY_STATES.has(state.blocking) ? LOBBY_ONLY : NONE;
  }
  const { snapshot, check } = state;
  // The "chain check not independent" indicator is a development notice for
  // the whole session, not a state: it hides nothing (W-49f).
  if (
    snapshot === undefined ||
    state.connectionProblem ||
    state.gameIncompatible === true ||
    check?.unconfirmed !== undefined ||
    (check !== undefined && CANCEL_PENDING.has(check.cancel))
  ) {
    return NONE;
  }
  switch (snapshot.status) {
    case "idle": {
      // A typed error or the generic one shown at `idle` keeps both (W-42).
      return BOTH;
    }
    case "won":
    case "lost":
    case "canceled": {
      // The generic error (the shell's `refused`) outside `idle` offers none;
      // a typed error beside the result keeps both (W-49f).
      return state.refused === true ? NONE : BOTH;
    }
    default: {
      return NONE;
    }
  }
};

/**
 * The URL rule (W-49e): a link that parses with `new URL`, is `https:`, and
 * carries no username or password; `undefined` otherwise.
 */
export const parsedLink = (link: string | undefined): URL | undefined => {
  if (link === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return undefined;
  }
  return url.protocol === "https:" && url.username === "" && url.password === ""
    ? url
    : undefined;
};

/** The lobby's URL: the URL rule, and its origin on `operatorOrigins`. */
export const lobbyLink = (
  link: string | undefined,
  operatorOrigins: readonly string[],
): URL | undefined => {
  const url = parsedLink(link);
  return url !== undefined && operatorOrigins.includes(url.origin)
    ? url
    : undefined;
};

/** The controls to show: each one's checked URL and label. */
export type LinkPlan = {
  readonly lobby?: {
    readonly href: string;
    readonly label: "action.lobby" | "action.relaunch";
    /** Framed, the player's click navigates the operator's page (`_top`). */
    readonly top: boolean;
  };
  readonly deposit?: string;
};

/**
 * The lobby and deposit controls the state offers, if any: none before the gate
 * opens (no rules), and none while a start or cash-out call is in flight
 * (`calling`, W-49f), since leaving would end the session before its answer.
 */
export const linkPlan = (
  state: WrapperState,
  rules?: LinkRules,
  calling = false,
): LinkPlan => {
  if (rules === undefined || calling) return {};
  const offer = offerOf(state);
  const links = state.snapshot?.context.links;
  const lobby =
    offer.lobby === undefined
      ? undefined
      : lobbyLink(links?.lobby, rules.operatorOrigins);
  const deposit = offer.deposit ? parsedLink(links?.deposit) : undefined;
  return {
    ...(lobby === undefined || offer.lobby === undefined
      ? {}
      : {
          lobby: {
            href: lobby.href,
            label:
              offer.lobby === "relaunch" ? "action.relaunch" : "action.lobby",
            top: rules.framed,
          },
        }),
    ...(deposit === undefined ? {} : { deposit: deposit.href }),
  };
};

/** The anchors of a plan, with exactly W-49e's attributes. */
export const linkView = (el: Builder, m: Messages, plan: LinkPlan): Child[] => [
  plan.lobby !== undefined &&
    el(
      "a",
      {
        class: "se-link",
        href: plan.lobby.href,
        ...(plan.lobby.top ? { target: "_top" } : {}),
        rel: "noreferrer",
        referrerpolicy: "no-referrer",
        "data-focus-key": "lobby",
      },
      [m[plan.lobby.label]],
    ),
  plan.deposit !== undefined &&
    el(
      "a",
      {
        class: "se-link",
        href: plan.deposit,
        target: "_blank",
        rel: "noopener noreferrer",
        "data-focus-key": "deposit",
      },
      [
        m["action.deposit"],
        " ",
        el("span", { class: "se-visually-hidden" }, [
          m["notice.opensInNewTab"],
        ]),
      ],
    ),
];
