// The Wrapper's side of the wallet delegation (W-62 to W-71, slice S6): it
// follows the shell's delegation state and gives the UI what to show of it
// (the menu's entry, the alert line, the start control held), opens the
// consent dialog, and, in the confirm's `click` handler, opens the signing
// window synchronously (signing-window.ts). It holds no wallet code and no
// wallet connection; it never reads the signature, the session id, or the
// expiry; it logs nothing and stores nothing (W-73). Only the shell's state
// reaches it: the wallet's address only while `registered`.

import type {
  DelegationFailureReason,
  DelegationRefusalCode,
  DelegationState,
  DelegationWindow,
  PlaySession,
  SessionRead,
} from "@intraverse/se-client-shell";

import { createConsentDialog } from "./consent-dialog.ts";
import { shortAddress } from "./delegation-messages.ts";
import type { MessageDispatch } from "./message-dispatch.ts";
import { messagesFor } from "./messages.ts";
import type { ProblemInput } from "./round-input.ts";
import {
  openSigningWindow,
  type SigningWindowOptions,
} from "./signing-window.ts";
import type {
  DelegationAlert,
  DelegationEntry,
  DelegationView,
} from "./view-options.ts";
import type { WrapperApp } from "./wrapper-app-types.ts";

/** The platform parts the delegation uses (main.ts). */
export type DelegationPlatform = {
  /** The platform `window.open`, bound to the page's window (W-66). */
  readonly open: SigningWindowOptions["open"];
  /** `matchMedia(query).matches`, read when the menu opens (W-64). */
  readonly matches: (query: string) => boolean;
};

export type DelegationWiringOptions = {
  readonly app: WrapperApp;
  readonly doc: Document;
  readonly messages: MessageDispatch;
  readonly platform: DelegationPlatform & {
    /** The configuration's `signingPageOrigin` (W-62). */
    readonly signingPageOrigin: string;
  };
};

/** A start, guarded: whether it carried the delegation is recorded (W-71). */
export type StartGuard = (
  call: () => Promise<SessionRead>,
) => Promise<SessionRead>;

const REFUSAL_CODES: ReadonlySet<string> = new Set<DelegationRefusalCode>([
  "KEY_DELEGATION_INVALID",
  "KEY_DELEGATION_EXPIRED",
  "KEY_DELEGATION_NOTICE_UNKNOWN",
]);

const NONE: DelegationEntry = Object.freeze({ kind: "none" });
const LINK: DelegationEntry = Object.freeze({ kind: "link" });
const SIGNING: DelegationEntry = Object.freeze({ kind: "signing" });

/** Wires the delegation for a session opened with a signing page. */
export const wireDelegation = (
  options: DelegationWiringOptions,
  session: PlaySession,
): StartGuard => {
  const { app, doc, platform } = options;
  const dialog = createConsentDialog(doc);
  doc.body.append(dialog.element);
  let state: DelegationState = session.delegation();
  // A "Sign again" attempt begun from `refused` holds the start (W-71).
  let held = false;
  let refusedCode: DelegationRefusalCode | undefined;
  // A failure's alert, until the player's next action (W-69).
  let failure: DelegationFailureReason | undefined;
  // The failed "Sign again" attempt shown before the refusal again (W-71).
  let attempt: DelegationFailureReason | undefined;
  let handle: DelegationWindow | null = null;
  let otherRefusal: ProblemInput | undefined;
  let linked = 0;

  const entry = (): DelegationEntry => {
    const now = session.delegation();
    if (now.state === "registered") {
      return { kind: "linked", wallet: shortAddress(now.wallet) };
    }
    if (now.state === "signing") return handle === null ? NONE : SIGNING;
    if (session.delegationOffer().kind !== "offered") return NONE;
    // Desktop only: the popup and the browser wallet (W-64's third condition).
    return platform.matches("(pointer: fine)") &&
      platform.matches("(hover: hover)")
      ? LINK
      : NONE;
  };

  const alertOf = (): DelegationAlert | undefined => {
    const holding =
      state.state === "refused" || (state.state === "signing" && held);
    if (holding && refusedCode !== undefined) {
      return {
        kind: "refused",
        code: refusedCode,
        ...(attempt === undefined ? {} : { attempt }),
      };
    }
    return failure === undefined
      ? undefined
      : { kind: "failed", reason: failure };
  };

  const menuButton = (): HTMLElement | null =>
    doc.querySelector<HTMLElement>(".se-menu-button");

  // In the confirm's `click` handler, with no `await` before it (W-66).
  const confirm = (): void => {
    const opened = openSigningWindow({
      open: platform.open,
      signingPageOrigin: platform.signingPageOrigin,
      session,
      messages: options.messages,
    });
    if (opened.begun.kind === "started" && opened.handle !== null) {
      handle = opened.handle;
      push();
    }
  };

  // "Link a wallet" and "Sign again": the consent dialog (W-65).
  const link = (): void => {
    const offer = session.delegationOffer();
    if (offer.kind !== "offered" || dialog.isOpen()) return;
    const { language, messages: m } = messagesFor(
      app.state().snapshot?.context.language,
    );
    failure = undefined;
    dialog.open({
      m,
      language,
      notice: offer.notice,
      onConfirm: confirm,
      onClose: () => {
        menuButton()?.focus();
      },
    });
    push();
  };

  const focusWindow = (): void => {
    try {
      handle?.focus();
    } catch {
      // A window that is gone cannot take the focus.
    }
  };

  // "Continue without" (W-71): dropped only by the player's choice.
  const continueWithout = (): void => {
    const refusal = state.state === "refused" || held;
    session.dropDelegation();
    held = false;
    attempt = undefined;
    otherRefusal = undefined;
    const shown = app.state().problem;
    if (refusal && shown !== undefined && REFUSAL_CODES.has(shown.code)) {
      app.dismissProblem();
    }
    push();
  };

  const dismiss = (): void => {
    if (failure === undefined) return;
    failure = undefined;
    push();
  };

  const push = (): void => {
    const alert = alertOf();
    const view: DelegationView = {
      key: JSON.stringify(state),
      entry,
      ...(alert === undefined ? {} : { alert }),
      ...(otherRefusal === undefined ? {} : { otherRefusal }),
      holdsStart:
        state.state === "refused" || (state.state === "signing" && held),
      linked,
      link,
      focusWindow,
      continueWithout,
      dismiss,
    };
    app.delegation(view);
  };

  session.onDelegation(next => {
    const previous = state;
    state = next;
    if (next.state !== "signing") handle = null;
    if (next.state !== "failed") failure = undefined;
    switch (next.state) {
      case "signing": {
        held = previous.state === "refused";
        attempt = undefined;
        break;
      }
      case "failed": {
        failure = next.reason === "session-ended" ? undefined : next.reason;
        break;
      }
      case "refused": {
        refusedCode = next.code;
        attempt = previous.state === "failed" ? previous.reason : undefined;
        held = false;
        otherRefusal = undefined;
        break;
      }
      case "registered": {
        linked += 1;
        held = false;
        attempt = undefined;
        otherRefusal = undefined;
        break;
      }
      default: {
        held = false;
        attempt = undefined;
        if (next.state === "offered") otherRefusal = undefined;
        break;
      }
    }
    push();
  });
  session.onEnd(() => {
    dialog.close();
    handle = null;
  });
  push();

  return async call => {
    // A start is the player's next action: a failure's alert goes (W-69).
    const carried = state.state === "registered";
    if (failure !== undefined || otherRefusal !== undefined) {
      failure = undefined;
      otherRefusal = undefined;
      push();
    }
    const read = await call();
    // Another refusal of a delegated start: "Continue without a wallet".
    if (
      carried &&
      read.kind === "problem" &&
      session.delegation().state === "registered"
    ) {
      otherRefusal = read.problem;
      push();
    }
    return read;
  };
};
