// The bar in the states that replace the round (W-44, W-57), and the alert
// line's errors that do not stop the round (W-41 to W-43): a typed error with
// its `requestId`, the generic error, and the connection problem. The states
// that stop the round show on the stage's cover (stage-plan.ts); beside a
// failed verification the bar keeps a cancel left to check later (W-33). The
// round id and the verify link (W-39) are round-id-view.ts's.

import { checkLaterView } from "./cancel-views.ts";
import {
  type DelegationAction,
  delegationActions,
  delegationAlert,
} from "./delegation-alert.ts";
import {
  ALERT_HEADING_ID,
  type BarParts,
  button,
  type Builder,
  type Child,
  EMPTY_BAR,
  field,
  heading,
  STATUS_HEADING_ID,
} from "./dom.ts";
import { type MessageKey, type Messages, problemMessage } from "./messages.ts";
import { roundIdAndVerify } from "./round-id-view.ts";
import type { DelegationView, ViewOptions } from "./view-options.ts";
import { isFinal, type WrapperState } from "./wrapper-state.ts";

/**
 * The bar's slots in a state the stage's cover shows (W-44, W-57): the cancel
 * left to check later ("still resolving — contact support" and "check again"),
 * "Resolving" while the required cancel settles on a `resolving` read, and the
 * round id with the verify link where the table gives them (out of sync, check
 * later). The cover itself is stage-plan.ts's.
 */
export const blockingView = (
  el: Builder,
  doc: Document,
  m: Messages,
  state: WrapperState,
  options: ViewOptions,
  announce: (text: string) => void,
): BarParts => {
  const roundId = state.snapshot?.roundId;
  const roundLine = (): Child[] =>
    roundId === undefined
      ? []
      : roundIdAndVerify(el, m, roundId, options, announce);
  switch (state.blocking) {
    case "verification-failed":
    case "chain-unverified": {
      const cancel = state.check?.cancel;
      if (cancel === "check-later") {
        return {
          ...checkLaterView(el, doc, m, options.intents),
          round: roundLine(),
        };
      }
      return (cancel === "in-flight" || cancel === "settling") &&
        state.snapshot?.status === "resolving"
        ? {
            ...EMPTY_BAR,
            status: [
              heading(
                el,
                doc,
                "h1",
                STATUS_HEADING_ID,
                m["status.resolving"],
                "progress",
                m["icon.progress"],
              ),
            ],
          }
        : EMPTY_BAR;
    }
    case "out-of-sync": {
      return { ...EMPTY_BAR, round: roundLine() };
    }
    default: {
      return EMPTY_BAR;
    }
  }
};

export type AlertContent = {
  readonly key: string;
  readonly heading: string;
  readonly lines: readonly string[];
  readonly requestId?: string;
  readonly retry: boolean;
  /** The control's text when it is not "Try again" (a voided start, W-42). */
  readonly retryLabel?: MessageKey;
  /** The wallet delegation's controls (W-71). */
  readonly actions?: readonly DelegationAction[];
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

/**
 * The error the bar's alert line shows, if any (W-41 to W-43, W-69, W-71): a
 * refused delegated start, a typed error (with "Continue without a wallet" when
 * it refused a delegated start), the generic error, a failed delegation
 * attempt, or the connection problem, by priority. None in a final state, where
 * nothing more is shown but the cover (W-44).
 */
export const alertContent = (
  m: Messages,
  state: WrapperState,
  delegation?: DelegationView,
): AlertContent | undefined => {
  if (isFinal(state)) return undefined;
  const { problem } = state;
  const ofDelegation = delegationAlert(m, delegation, problem);
  if (delegation?.alert?.kind === "refused" && ofDelegation !== undefined) {
    return ofDelegation;
  }
  if (problem !== undefined) {
    const other = delegation?.otherRefusal === problem;
    // `INSUFFICIENT_FUNDS` at `idle` keeps the deposit control (W-49f).
    return {
      key: `problem:${problem.code}:${problem.requestId ?? ""}:${String(other)}`,
      heading: m["error.heading"],
      lines: [problemMessage(m, problem.code)],
      ...(problem.requestId === undefined
        ? {}
        : { requestId: problem.requestId }),
      // No `KEY_DELEGATION_*` code is retried as it is (W-71).
      retry: problem.retryable && !problem.code.startsWith("KEY_DELEGATION_"),
      ...(VOIDED_START_CODES.has(problem.code)
        ? { retryLabel: "action.backToStart" as const }
        : {}),
      ...(other ? { actions: ["continueWithoutWallet"] as const } : {}),
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
  if (ofDelegation !== undefined) return ofDelegation;
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

/**
 * The alert line's content for an error. `plain` when a cover state owns the
 * page's alert region (W-57): the same text and icon, but not the alert's
 * heading, so the focus never goes to it.
 */
export const alertView = (
  el: Builder,
  doc: Document,
  m: Messages,
  error: AlertContent,
  options: ViewOptions,
  plain = false,
): Child[] => {
  const { retry } = options.intents;
  return [
    heading(
      el,
      doc,
      "h2",
      plain ? "" : ALERT_HEADING_ID,
      error.heading,
      "error",
      m["icon.error"],
    ),
    ...error.lines.map(line => el("p", { class: "se-detail" }, [line])),
    error.requestId !== undefined &&
      field(el, m["label.requestId"], error.requestId),
    error.retry &&
      retry !== undefined &&
      button(el, m[error.retryLabel ?? "action.retry"], "retry", retry),
    ...delegationActions(el, m, error.actions, options.delegation),
  ];
};

export { roundIdAndVerify };
