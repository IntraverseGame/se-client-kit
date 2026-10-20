// The states that replace the round (W-44) and the alert panel's errors
// (W-41 to W-43): the session ended, another tab, the configuration error,
// a rejected Snapshot, a failed verification, out of sync, a typed error with
// its `requestId`, and the connection problem; beside a failed verification,
// a cancel left to check later (W-33). The round id and the verify link
// (W-39) are built here too.

import { checkLaterView } from "./cancel-views.ts";
import {
  ALERT_HEADING_ID,
  button,
  type Builder,
  type Child,
  externalLink,
  field,
  heading,
  roundIdField,
  STATUS_HEADING_ID,
} from "./dom.ts";
import { type MessageKey, type Messages, problemMessage } from "./messages.ts";
import { verifyUrlFor } from "./verify-link.ts";
import type { Intents, ViewOptions } from "./view-options.ts";
import type { WrapperState } from "./wrapper-state.ts";

/** The non-error states that replace the round (W-44). */
export const blockingView = (
  el: Builder,
  doc: Document,
  m: Messages,
  state: WrapperState,
  intents: Intents,
): Child[] => {
  switch (state.blocking) {
    case "loading": {
      return [
        heading(
          el,
          doc,
          "h1",
          STATUS_HEADING_ID,
          m["status.loading"],
          "progress",
          m["icon.progress"],
        ),
      ];
    }
    case "session-ended": {
      // The lobby, the way to relaunch, is a control of its own (W-49f).
      return [
        heading(
          el,
          doc,
          "h1",
          STATUS_HEADING_ID,
          m["state.sessionEnded"],
          "info",
          m["icon.info"],
        ),
        el("p", { class: "se-detail" }, [m["state.sessionEndedDetail"]]),
      ];
    }
    case "other-tab": {
      return [
        heading(
          el,
          doc,
          "h1",
          STATUS_HEADING_ID,
          m["state.otherTab"],
          "info",
          m["icon.info"],
        ),
        el("p", { class: "se-detail" }, [m["state.otherTabDetail"]]),
      ];
    }
    case "unsupported-browser": {
      return [
        heading(
          el,
          doc,
          "h1",
          STATUS_HEADING_ID,
          m["state.unsupported"],
          "info",
          m["icon.info"],
        ),
        el("p", { class: "se-detail" }, [m["state.unsupportedDetail"]]),
      ];
    }
    case "verification-failed":
    case "chain-unverified": {
      return state.check?.cancel === "check-later"
        ? checkLaterView(el, doc, m, intents)
        : [];
    }
    default: {
      return [];
    }
  }
};

export const roundIdAndVerify = (
  el: Builder,
  m: Messages,
  roundId: string,
  options: ViewOptions,
  announce: (text: string) => void,
): Child[] => {
  const copy = options.intents.copyText;
  return [
    roundIdField(el, m["label.roundId"], roundId),
    el("div", { class: "se-actions" }, [
      copy !== undefined &&
        button(el, m["action.copyRoundId"], "copy-round-id", () => {
          copy(roundId).then(
            () => {
              announce(m["notice.copied"]);
              return null;
            },
            () => {
              // The clipboard refused: the round id stays visible to copy by hand.
              return null;
            },
          );
        }),
      options.verifyBaseUrl !== undefined &&
        externalLink(
          el,
          m,
          verifyUrlFor(options.verifyBaseUrl, roundId),
          "action.verify",
          "verify",
        ),
    ]),
  ];
};

export type AlertContent = {
  readonly key: string;
  readonly heading: string;
  readonly lines: readonly string[];
  readonly requestId?: string;
  readonly roundId?: string;
  readonly retry: boolean;
  /** The control's text when it is not "Try again" (a voided start, W-42). */
  readonly retryLabel?: MessageKey;
};

/**
 * A start voided or refused before any money moved (W-42). Its control reads
 * the Snapshot again, which answers `idle`, so the player starts a new round:
 * it is not labelled as a retry of the start.
 */
const VOIDED_START_CODES: ReadonlySet<string> = new Set([
  "FUNDING_UNCONFIRMED",
  "ENTROPY_UNAVAILABLE",
  "PREPARATION_TIMEOUT",
  "ROUND_VOIDED",
]);

/** The texts of the states of one round (W-44). */
const ROUND_STATE_TEXTS: Readonly<
  Record<
    "verification-failed" | "chain-unverified" | "out-of-sync",
    { readonly heading: MessageKey; readonly detail: MessageKey }
  >
> = {
  "verification-failed": {
    heading: "state.verificationFailed",
    detail: "state.verificationFailedDetail",
  },
  "chain-unverified": {
    heading: "state.chainUnverified",
    detail: "state.chainUnverifiedDetail",
  },
  "out-of-sync": {
    heading: "state.outOfSync",
    detail: "state.outOfSyncDetail",
  },
};

/** The error to show in the alert panel, if any, by priority. */
export const alertContent = (
  m: Messages,
  state: WrapperState,
): AlertContent | undefined => {
  const roundId = state.snapshot?.roundId;
  switch (state.blocking) {
    case "configuration-error": {
      return {
        key: "configuration",
        heading: m["state.configuration"],
        lines: [m["state.configurationDetail"]],
        retry: false,
      };
    }
    case "snapshot-rejected": {
      return {
        key: "rejected",
        heading: m["state.rejected"],
        lines: [m["state.rejectedDetail"]],
        retry: false,
      };
    }
    case "verification-failed":
    case "chain-unverified":
    case "out-of-sync": {
      const texts = ROUND_STATE_TEXTS[state.blocking];
      return {
        key: state.blocking,
        heading: m[texts.heading],
        lines: [m[texts.detail]],
        ...(roundId === undefined ? {} : { roundId }),
        retry: false,
      };
    }
    default: {
      break;
    }
  }
  if (state.blocking !== undefined && state.blocking !== "loading") {
    return undefined;
  }
  const { problem } = state;
  if (problem !== undefined) {
    // `INSUFFICIENT_FUNDS` at `idle` keeps the deposit control (W-49f).
    return {
      key: `problem:${problem.code}:${problem.requestId ?? ""}`,
      heading: m["error.heading"],
      lines: [problemMessage(m, problem.code)],
      ...(problem.requestId === undefined
        ? {}
        : { requestId: problem.requestId }),
      retry: problem.retryable,
      ...(VOIDED_START_CODES.has(problem.code)
        ? { retryLabel: "action.backToStart" as const }
        : {}),
    };
  }
  if (state.gameIncompatible === true) {
    return {
      key: "game-incompatible",
      heading: m["error.heading"],
      lines: [m["error.gameIncompatible"]],
      retry: false,
    };
  }
  if (state.refused === true) {
    return {
      key: "refused",
      heading: m["error.heading"],
      lines: [m["error.generic"]],
      retry: false,
    };
  }
  if (state.connectionProblem) {
    return {
      key: `connection:${String(state.offline)}`,
      heading: m["state.connection"],
      lines: [
        m["state.connectionDetail"],
        ...(state.offline ? [m["state.offline"]] : []),
      ],
      retry: false,
    };
  }
  return undefined;
};

/** The alert panel's content for an error. */
export const alertView = (
  el: Builder,
  doc: Document,
  m: Messages,
  error: AlertContent,
  options: ViewOptions,
  announce: (text: string) => void,
): Child[] => {
  const { retry } = options.intents;
  return [
    heading(
      el,
      doc,
      "h2",
      ALERT_HEADING_ID,
      error.heading,
      "error",
      m["icon.error"],
    ),
    ...error.lines.map(line => el("p", { class: "se-detail" }, [line])),
    error.requestId !== undefined &&
      field(el, m["label.requestId"], error.requestId),
    ...(error.roundId === undefined
      ? []
      : roundIdAndVerify(el, m, error.roundId, options, announce)),
    error.retry &&
      retry !== undefined &&
      button(el, m[error.retryLabel ?? "action.retry"], "retry", retry),
  ];
};
