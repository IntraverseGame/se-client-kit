// The states that replace the round (W-44) and the alert panel's errors
// (W-41 to W-43): the session ended, another tab, the configuration error,
// a rejected Snapshot, a failed verification, out of sync, a typed error with
// its `requestId`, and the connection problem. The round id and the verify
// link (W-39) are built here too.

import {
  ALERT_HEADING_ID,
  button,
  type Builder,
  type Child,
  externalLink,
  field,
  heading,
  STATUS_HEADING_ID,
} from "./dom.ts";
import { type Messages, problemMessage } from "./messages.ts";
import { verifyUrlFor } from "./verify-link.ts";
import type { ViewOptions } from "./view-options.ts";
import type { WrapperState } from "./wrapper-state.ts";

/** The non-error states that replace the round (W-44). */
export const blockingView = (
  el: Builder,
  doc: Document,
  m: Messages,
  state: WrapperState,
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
      const lobby = state.snapshot?.context.links?.lobby;
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
        lobby !== undefined &&
          externalLink(el, m, lobby, "action.lobby", "lobby"),
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
    el("p", { class: "se-field" }, [
      el("span", { class: "se-field__label" }, [m["label.roundId"]]),
      " ",
      el("code", { class: "se-round-id" }, [roundId]),
    ]),
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
  readonly deposit?: string;
  readonly retry: boolean;
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
    case "out-of-sync": {
      const failed = state.blocking === "verification-failed";
      return {
        key: state.blocking,
        heading: failed ? m["state.verificationFailed"] : m["state.outOfSync"],
        lines: [
          failed
            ? m["state.verificationFailedDetail"]
            : m["state.outOfSyncDetail"],
        ],
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
    const deposit = state.snapshot?.context.links?.deposit;
    return {
      key: `problem:${problem.code}:${problem.requestId ?? ""}`,
      heading: m["error.heading"],
      lines: [problemMessage(m, problem.code)],
      ...(problem.requestId === undefined
        ? {}
        : { requestId: problem.requestId }),
      ...(problem.code === "INSUFFICIENT_FUNDS" && deposit !== undefined
        ? { deposit }
        : {}),
      retry: problem.retryable,
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
    error.deposit !== undefined &&
      externalLink(el, m, error.deposit, "action.deposit", "deposit"),
    error.retry &&
      retry !== undefined &&
      button(el, m["action.retry"], "retry", retry),
  ];
};
