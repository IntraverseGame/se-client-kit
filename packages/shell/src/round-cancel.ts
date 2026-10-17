// The one `PlayerCancel` W-26 requires when `T_0` is settled and only the tip
// check failed (W-25). It is signed once, never again at sequence 1, and sent
// on its own route, which the transport never repeats. After any failure the
// Snapshot is read. Only after a lost response or a 503, and only when that
// read shows the round still `active` with no move (and not re-issued), are
// the same signed bytes sent again, once (W-16, W-25). After that resend, or
// any other outcome, the cancel path ends: the round ends by its expiry rule
// unless a Snapshot shows it `canceled`. Signing it needs the injected cancel
// encoding (#41).

import { cancelRound } from "@intraverse/se-client-play-client";
import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import type { SettledInitial } from "./create-round-auth.ts";
import { ShellError } from "./errors.ts";
import type { DeliveryOptions, RoundDelivery } from "./round-delivery.ts";
import {
  isCallError,
  isLostOrUnavailable,
  isRefusal,
  type Sent,
  signedBody,
} from "./round-request.ts";
import type { RoundSigner } from "./round-signer.ts";
import { encoderOf, type FlowTestHooks } from "./typed-data.ts";

/** The required cancel's progress (W-25, W-26). */
export type CancelState =
  /** No cancel is required, or it has not been reached. */
  | "none"
  /**
   * Required, but not sent: it could not be signed (no cancel encoding, #41),
   * or the signed cancel did not match its typed data (the round is failed).
   */
  | "unavailable"
  /** Signed and sent; the answer was the round's Snapshot. */
  | "sent"
  /** Refused (a problem that is not retryable, a 400 included): never resent. */
  | "refused"
  /**
   * No answer, a retryable problem (a 503), or an answer that was not a
   * Snapshot: the outcome is unknown.
   */
  | "unconfirmed";

export type RoundCancel = {
  readonly state: () => CancelState;
  /** How often the same signed cancel was sent again: 0 or 1. */
  readonly resends: () => number;
  /** Signs and sends the cancel, the first time only. */
  readonly run: (signer: RoundSigner, initial: SettledInitial) => Promise<void>;
};

export type CancelHost = {
  readonly roundId: string;
  /** Whether the round's `CreateRoundAuth` was re-issued (W-26). */
  readonly reissued: () => boolean;
};

/** What one send of the cancel leads to. */
type Attempt = "done" | "resend";

/** `hooks` is test-only (typed-data.ts): production passes none. */
export const createRoundCancel = (
  options: DeliveryOptions,
  host: CancelHost,
  delivery: RoundDelivery,
  hooks: FlowTestHooks = {},
): RoundCancel => {
  const { roundId } = host;
  const encode = encoderOf(hooks);
  let state: CancelState = "none";
  let resends = 0;

  const sign = (signer: RoundSigner, initial: SettledInitial): Sent =>
    delivery.record(
      signedBody(
        encode,
        roundId,
        "cancel",
        {
          action: "cancel",
          path: [],
          sequence: 1,
          round: signer.round,
          previous: initial,
        },
        () => signer.signCancel(),
        () => {
          // The cancel stops the round itself, whoever calls `run`.
          signer.fail();
          delivery.fail(new ShellError("invalid-input"));
        },
      ),
    );

  // W-25: a read that shows the round `active` with no move applied.
  const stillCancelable = (read: ValidSnapshot | undefined): boolean =>
    read?.status === "active" &&
    read.roundId === roundId &&
    read.step === 0 &&
    !host.reissued();

  const attempt = async (sent: Sent): Promise<Attempt> => {
    try {
      const result = await cancelRound(options.transport, sent.body, {
        authorization: options.authorization,
      });
      state = "sent";
      await delivery.observeBody(result.body);
      return "done";
    } catch (error) {
      if (!isCallError(error)) throw error;
      delivery.fail(error);
      const unknown = isLostOrUnavailable(error);
      state = !unknown && isRefusal(error) ? "refused" : "unconfirmed";
      const read = await delivery.resync();
      return unknown && stillCancelable(read) ? "resend" : "done";
    }
  };

  const run = async (
    signer: RoundSigner,
    initial: SettledInitial,
  ): Promise<void> => {
    // Set before anything is awaited: a second call never signs again.
    if (state !== "none") return;
    let sent: Sent;
    try {
      sent = sign(signer, initial);
    } catch (error) {
      // Nothing was signed; it is not tried again.
      state = "unavailable";
      if (!(error instanceof ShellError)) throw error;
      return;
    }
    state = "sent";
    await delivery.whileBusy(async () => {
      if ((await attempt(sent)) === "resend") {
        // The same bytes and key, once; a second unknown outcome is read and
        // never sent a third time.
        resends += 1;
        await attempt(sent);
      }
    });
  };

  return Object.freeze({
    state: (): CancelState => state,
    resends: (): number => resends,
    run,
  });
};
