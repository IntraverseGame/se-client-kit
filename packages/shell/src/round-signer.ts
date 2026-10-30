// One round's transcript state (W-15 to W-19), over `signing`'s transcript
// helper. The helper owns the chain and refuses a second, different message at
// one sequence; this module adds what the Wrapper spec asks on top of it: the
// idempotency key of each signed action, recorded with it before anything is
// sent (W-16); the exclusion of a cancel against the first move (W-17);
// advancing `T` only when a validated Snapshot shows the action applied (W-18);
// holding on a refused move or cash-out until a Snapshot decides (W-19); and
// the re-issue state of W-26, which signs nothing new while a W-16 resend of
// an action already signed still goes out.

import { newIntent, type RandomUuid } from "@intraverse/se-client-play-client";
import {
  type Bytes32,
  createTranscript,
  hashPlayerCancel,
  type PlayerMessage,
  type SignedEntry,
  type Signature,
  SigningError,
  type Transcript,
  type TranscriptRequest,
  typedDataDigest,
} from "@intraverse/se-client-signing";
import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import type { SettledInitial } from "./create-round-auth.ts";
import { ShellError } from "./errors.ts";
import type {
  PendingAction,
  RoundPhase,
  RoundSigner,
} from "./pending-action.ts";
import { redacting } from "./redaction.ts";
import {
  closingAppliesPending,
  type PendingKind,
  readSnapshot,
  type RoundPosition,
  type SnapshotReading,
} from "./snapshot-reading.ts";

export type { RoundSigner };

export type RoundSignerOptions = {
  readonly domainSeparator: Bytes32;
  readonly roundId: string;
  readonly round: Bytes32;
  /** `T_0`, settled by the round's verdict (W-26). */
  readonly initial: SettledInitial;
  /** Signs a digest with the session's key, or throws when it may not. */
  readonly sign: (digest: Bytes32) => Signature;
  /** Throws when the session may not sign (no lock, or ended). */
  readonly assertLive: () => void;
  readonly isEnded: () => boolean;
  readonly randomUuid: RandomUuid;
};

/**
 * The signer's pending move or cash-out (never a cancel) while its phase is
 * `open` or `adopted`: set from the signature, recorded before its send (W-16),
 * until a Snapshot shows it applied. `undefined` otherwise: once a 400 or 409
 * held signing (`stale`, W-19), once the round is out of sync, re-issued,
 * failed, or closed, and once the session has ended. A word, never the action.
 */
export const pendingOf = (
  signer: RoundSigner | undefined,
): "move" | "cash-out" | undefined => {
  const phase = signer?.phase();
  if (phase !== "open" && phase !== "adopted") return undefined;
  const action = signer?.pending();
  if (action === undefined || action.kind === "cancel") return undefined;
  return action.kind === "cash-out" ? "cash-out" : "move";
};

const asShellError = (error: unknown): unknown =>
  error instanceof SigningError && error.code === "equivocation"
    ? new ShellError("equivocation")
    : error;

const transcriptFor = (options: RoundSignerOptions): Transcript => {
  try {
    return createTranscript({
      domainSeparator: options.domainSeparator,
      round: options.round,
      initial: options.initial,
    });
  } catch (error) {
    if (error instanceof SigningError) throw new ShellError("invalid-input");
    throw error;
  }
};

export const createRoundSigner = (options: RoundSignerOptions): RoundSigner => {
  const { roundId, round, initial, domainSeparator } = options;
  const transcript = transcriptFor(options);
  let phase: Exclude<RoundPhase, "ended" | "reissued"> = "open";
  // Kept apart from `phase`: a re-issue stops new signatures for good, while
  // a `stale` round still learns from its next Snapshot what was applied.
  let reissued = false;
  let pending: PendingAction | undefined;
  let canceled = false;
  // Set while `sign` or `signCancel` runs. An injected function (the random
  // source of keys, the signer) that calls back into
  // either would find the state not yet recorded and could sign a second
  // action at the same sequence, so such a call is refused, as `signing`'s
  // transcript refuses one from its sign callback.
  let busy = false;

  const exclusive = <T>(run: () => T): T => {
    if (busy) throw new ShellError("equivocation");
    busy = true;
    try {
      return run();
    } finally {
      busy = false;
    }
  };

  const assertOpen = (): void => {
    options.assertLive();
    if (reissued || (phase !== "open" && phase !== "adopted")) {
      throw new ShellError("round-stopped");
    }
  };

  // The action is recorded here, with its idempotency key, before the caller
  // gets it, so nothing can be sent that the state does not hold (W-16). The
  // key is drawn before the signature, so a failing random source leaves
  // nothing signed.
  const record = (
    kind: PendingKind,
    entry: Omit<PendingAction, "idempotencyKey" | "kind">,
    idempotencyKey: string,
  ): PendingAction => {
    const action: PendingAction = Object.freeze({
      kind,
      message: entry.message,
      structHash: entry.structHash,
      digest: entry.digest,
      signature: entry.signature,
      idempotencyKey,
    });
    pending = action;
    return action;
  };

  const drawKey = (): string => newIntent(options.randomUuid).idempotencyKey;

  const signEntry = (request: TranscriptRequest): SignedEntry => {
    try {
      return transcript.sign(request, options.sign);
    } catch (error) {
      throw asShellError(error);
    }
  };

  const signOnce = (request: TranscriptRequest): PendingAction => {
    assertOpen();
    if (canceled) throw new ShellError("equivocation");
    if (pending !== undefined) {
      // The same request returns the pending entry; any other one throws.
      signEntry(request);
      return pending;
    }
    const idempotencyKey = drawKey();
    const entry = signEntry(request);
    return record(entry.kind, entry, idempotencyKey);
  };

  const signCancelOnce = (): PendingAction => {
    assertOpen();
    if (canceled && pending !== undefined) return pending;
    if (transcript.pending() !== undefined || transcript.nextSequence() !== 1) {
      throw new ShellError("equivocation");
    }
    const message: PlayerMessage = Object.freeze({
      action: "cancel",
      path: Object.freeze([]),
      sequence: 1,
      round,
      previous: initial,
    });
    // `signing`'s `PlayerCancel`, pinned by the independent signer's vector.
    const structHash = hashPlayerCancel(message);
    const idempotencyKey = drawKey();
    const digest = typedDataDigest(domainSeparator, structHash);
    const signature = options.sign(digest);
    canceled = true;
    return record(
      "cancel",
      { message, structHash, digest, signature },
      idempotencyKey,
    );
  };

  const sign = (request: TranscriptRequest): PendingAction =>
    exclusive(() => signOnce(request));

  const signCancel = (): PendingAction => exclusive(signCancelOnce);

  const observe = (snapshot: ValidSnapshot): SnapshotReading => {
    if (phase === "closed" || phase === "out-of-sync") return phase;
    const position: RoundPosition = {
      roundId,
      applied: transcript.nextSequence() - 1,
      ...(pending === undefined
        ? {}
        : {
            pending: {
              kind: pending.kind,
              sequence: pending.message.sequence,
            },
          }),
    };
    const reading = readSnapshot(position, snapshot);
    if (
      phase === "stale" &&
      reading === "not-applied" &&
      snapshot.status === "resolving"
    ) {
      // The engine is still resolving a move: it decides nothing yet.
      return reading;
    }
    if (reading === "closed" && closingAppliesPending(position, snapshot)) {
      transcript.confirm();
      pending = undefined;
    }
    if (reading === "applied") {
      transcript.confirm();
      pending = undefined;
      if (phase === "stale") phase = "adopted";
      return reading;
    }
    if (reading === "closed" || reading === "out-of-sync") {
      phase = reading;
      return reading;
    }
    if (reading === "not-applied" && phase === "stale") {
      phase = "out-of-sync";
      return "out-of-sync";
    }
    return reading;
  };

  const currentPhase = (): RoundPhase => {
    if (options.isEnded()) return "ended";
    if (reissued && (phase === "open" || phase === "adopted")) {
      return "reissued";
    }
    return phase;
  };

  return redacting({
    roundId,
    round,
    phase: currentPhase,
    last: (): Bytes32 => transcript.last(),
    nextSequence: (): number => transcript.nextSequence(),
    pending: (): PendingAction | undefined => pending,
    resendable: (): PendingAction | undefined => {
      const now = currentPhase();
      return pending !== undefined &&
        pending.kind !== "cancel" &&
        (now === "open" || now === "adopted" || now === "reissued")
        ? pending
        : undefined;
    },
    sign,
    signCancel,
    observe,
    stale: (): void => {
      if (phase === "open" || phase === "adopted") phase = "stale";
    },
    fail: (): void => {
      if (phase === "open" || phase === "adopted" || phase === "stale") {
        phase = "failed";
      }
    },
    reissue: (): void => {
      reissued = true;
    },
  });
};
