// The round's player actions: a pick (W-23), a cash-out (W-24), and the W-16
// resend. Each is refused, with nothing signed, unless the round's verdict is
// `ready`, its transcript state takes new signatures, the page holds the
// signer lock, nothing is in flight or pending, and the request is legal in
// the shell's own latest validated Snapshot (round-legality.ts). A step is
// signed at most once. `accepted` means signed and sent at least once; the
// Snapshot decides what happened.

import type { PickOutcome, PickUseCase } from "./controller-bridge.ts";
import type { RejectReason } from "./controller-protocol.ts";
import { ShellError } from "./errors.ts";
import type { RoundDelivery } from "./round-delivery.ts";
import {
  isPick,
  type Legality,
  legalCashOut,
  legalMove,
} from "./round-legality.ts";
import type { RoundSigner } from "./round-signer.ts";
import type { RoundTracking } from "./round-tracking.ts";
import type { SigningSession } from "./signing-session.ts";

export type RoundActions = {
  readonly pick: PickUseCase;
  readonly cashOut: () => Promise<PickOutcome>;
  /**
   * Whether `cashOut` would sign now (W-24): the same gate and legality, with
   * nothing signed or sent. The UI offers the cash-out control only then.
   */
  readonly cashOutOffered: () => boolean;
  /**
   * Sends the pending move or cash-out again with the same bytes and key.
   * `not_active` when nothing may be resent: no pending move or cash-out, a
   * cancel (sent again only after a Snapshot read, W-25), or a round held after
   * W-19.
   */
  readonly resend: () => Promise<PickOutcome>;
};

const ACCEPTED: PickOutcome = Object.freeze({ accepted: true });

const rejected = (reason: RejectReason): PickOutcome =>
  Object.freeze({ accepted: false, reason });

const refuse = (reason: RejectReason): Promise<PickOutcome> =>
  Promise.resolve(rejected(reason));

const reasonOf = (error: unknown): RejectReason => {
  if (!(error instanceof ShellError)) throw error;
  return error.code === "equivocation" ? "not_legal" : "not_active";
};

export const createRoundActions = (
  session: SigningSession,
  tracking: RoundTracking,
  delivery: RoundDelivery,
): RoundActions => {
  // The steps the shell has signed a move for, by position: never twice, even
  // when an older Snapshot shows one again.
  const signedRows = new Set<number>();

  /** The transcript state when the round takes a new signature. */
  const gate = (): RoundSigner | RejectReason => {
    if (delivery.busy()) return "busy";
    const signer = tracking.signer();
    const phase = signer?.phase();
    if (
      signer === undefined ||
      tracking.verdict().state !== "ready" ||
      session.state() !== "signing" ||
      (phase !== "open" && phase !== "adopted")
    ) {
      return "not_active";
    }
    return signer.pending() === undefined ? signer : "busy";
  };

  const run = async (
    legality: Legality,
    signer: RoundSigner,
  ): Promise<PickOutcome> => {
    if (!legality.legal) return rejected(legality.reason);
    let sent;
    try {
      sent = delivery.sign(signer, legality.request);
    } catch (error) {
      return rejected(reasonOf(error));
    }
    if (legality.request.kind === "action") signedRows.add(legality.row);
    await delivery.whileBusy(() => delivery.send(sent));
    return ACCEPTED;
  };

  const pick: PickUseCase = value => {
    if (!isPick(value)) return refuse("invalid");
    const signer = gate();
    if (typeof signer === "string") return refuse(signer);
    const legality = legalMove(
      tracking.latest(),
      signer.nextSequence() - 1,
      value,
    );
    if (legality.legal && signedRows.has(legality.row)) {
      return refuse("not_legal");
    }
    return run(legality, signer);
  };

  const cashOut = (): Promise<PickOutcome> => {
    const signer = gate();
    if (typeof signer === "string") return refuse(signer);
    return run(
      legalCashOut(tracking.latest(), signer.nextSequence() - 1),
      signer,
    );
  };

  const cashOutOffered = (): boolean => {
    const signer = gate();
    return (
      typeof signer !== "string" &&
      legalCashOut(tracking.latest(), signer.nextSequence() - 1).legal
    );
  };

  const resend = async (): Promise<PickOutcome> => {
    if (delivery.busy()) return rejected("busy");
    const action = tracking.signer()?.resendable();
    const sent = delivery.lastSent();
    if (action === undefined || sent?.action !== action) {
      return rejected("not_active");
    }
    await delivery.whileBusy(() => delivery.send(sent));
    return ACCEPTED;
  };

  return Object.freeze({ pick, cashOut, cashOutOffered, resend });
};
