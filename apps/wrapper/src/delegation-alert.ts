// The wallet delegation in the bar's alert line (W-69, W-71): a failed
// attempt's label, then "You can play on without a wallet."; a refused
// delegated start's line and its code's label, with "Sign again" and "Continue
// without" (the start control held until the player chooses), a failed "Sign
// again" attempt's label first; and "Continue without a wallet" beside any
// other refusal of a delegated start. The alert follows the shell's delegation
// state, never the problem's code. It never shows the wallet's own message, a
// code, or an address.

import { button, type Builder, type Child } from "./dom.ts";
import type { MessageKey, Messages } from "./messages.ts";
import type { ProblemInput } from "./round-input.ts";
import type { DelegationAlert, DelegationView } from "./view-options.ts";

/** A control the alert line offers for the delegation. */
export type DelegationAction =
  | "signAgain"
  | "continueWithout"
  | "continueWithoutWallet";

/** The parts of the alert line's content the delegation gives. */
export type DelegationAlertContent = {
  readonly key: string;
  readonly heading: string;
  readonly lines: readonly string[];
  readonly requestId?: string;
  readonly retry: false;
  readonly actions: readonly DelegationAction[];
};

const failureLabel = (
  m: Messages,
  reason: Exclude<DelegationAlert, { kind: "refused" }>["reason"],
): string =>
  reason === "session-ended" ? "" : m[`delegation.failed.${reason}`];

/** The delegation's own alert, when it shows one (W-69, W-71). */
export const delegationAlert = (
  m: Messages,
  view: DelegationView | undefined,
  problem: ProblemInput | undefined,
): DelegationAlertContent | undefined => {
  const alert = view?.alert;
  if (view === undefined || alert === undefined) return undefined;
  if (alert.kind === "failed") {
    return {
      key: `delegation-failed:${alert.reason}`,
      heading: m["error.heading"],
      lines: [failureLabel(m, alert.reason), m["delegation.playOn"]],
      retry: false,
      actions: [],
    };
  }
  // The refused start's own reference, when its error is the one shown.
  const requestId =
    problem?.code === alert.code ? problem.requestId : undefined;
  const signAgain = view.entry().kind === "link";
  return {
    key: [
      "delegation-refused",
      alert.code,
      alert.attempt ?? "",
      problem?.code ?? "",
      requestId ?? "",
      String(signAgain),
    ].join(":"),
    heading: m["error.heading"],
    lines: [
      ...(alert.attempt === undefined ? [] : [failureLabel(m, alert.attempt)]),
      m["error.keyDelegationRefused"],
      m[`error.${alert.code}` as const],
    ],
    ...(requestId === undefined ? {} : { requestId }),
    retry: false,
    actions: signAgain ? ["signAgain", "continueWithout"] : ["continueWithout"],
  };
};

const LABELS: Readonly<Record<DelegationAction, MessageKey>> = {
  signAgain: "delegation.signAgain",
  continueWithout: "delegation.continueWithout",
  continueWithoutWallet: "delegation.continueWithoutWallet",
};

/** The alert line's delegation controls. */
export const delegationActions = (
  el: Builder,
  m: Messages,
  actions: readonly DelegationAction[] | undefined,
  view: DelegationView | undefined,
): Child[] =>
  view === undefined
    ? []
    : (actions ?? []).map(action =>
        button(el, m[LABELS[action]], action, () => {
          if (action === "signAgain") view.link();
          else view.continueWithout();
        }),
      );
