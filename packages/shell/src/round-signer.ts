// One round's transcript state (W-15 to W-19), over `signing`'s transcript
// helper. The helper owns the chain and refuses a second, different message at
// one sequence; this module adds what the Wrapper spec asks on top of it: the
// idempotency key of each signed action, recorded with it before anything is
// sent (W-16); the exclusion of a cancel against the first move (W-17);
// advancing `T` only when a validated Snapshot shows the action applied (W-18);
// and stopping on `STALE_ACTION` (W-19).

import { newIntent, type RandomUuid } from "@intraverse/se-client-play-client";
import {
  type Bytes32,
  createTranscript,
  type PlayerMessage,
  type SignedEntry,
  type Signature,
  SigningError,
  type Transcript,
  type TranscriptRequest,
  typedDataDigest,
} from "@intraverse/se-client-signing";
import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import { ShellError } from "./errors.ts";
import type {
  CancelHasher,
  PendingAction,
  RoundPhase,
} from "./pending-action.ts";
import { redacting } from "./redaction.ts";
import {
  closingAppliesPending,
  type PendingKind,
  readSnapshot,
  type RoundPosition,
  type SnapshotReading,
} from "./snapshot-reading.ts";

export type RoundSigner = {
  /** The Snapshot `roundId` of the round. */
  readonly roundId: string;
  /** The round id as the signed messages carry it. */
  readonly round: Bytes32;
  readonly phase: () => RoundPhase;
  /** The last accepted `T` (`T_0` until the first applied action). */
  readonly last: () => Bytes32;
  /** The sequence of the next new signature. */
  readonly nextSequence: () => number;
  /** The signed action awaiting its outcome: what a resend sends (W-16). */
  readonly pending: () => PendingAction | undefined;
  /**
   * Signs a move or a cash-out at the next sequence and records it, with a new
   * idempotency key, before it returns: the caller sends only what this
   * returned. While an action is pending, the same request returns the same
   * action (the same bytes and key) and any other request throws
   * `equivocation`, as does a call made while another `sign` or `signCancel`
   * runs (from inside an injected function).
   */
  readonly sign: (request: TranscriptRequest) => PendingAction;
  /**
   * Signs `PlayerCancel` (`action = "cancel"`, empty path, sequence 1,
   * `previous = T_0`, W-25). Throws `equivocation` once a move is signed; a
   * move asked after it throws `equivocation` too (W-17). A call made while
   * another `sign` or `signCancel` runs throws `equivocation`.
   */
  readonly signCancel: () => PendingAction;
  /**
   * Reads a validated Snapshot: `T` advances only when it shows the pending
   * move applied (W-18). After `stale`, a Snapshot of this round that shows it
   * applied is adopted and one that does not puts the round out of sync; either
   * way the round signs nothing more (W-19).
   */
  readonly observe: (snapshot: ValidSnapshot) => SnapshotReading;
  /** The pending action was answered `STALE_ACTION`: stop signing (W-19). */
  readonly stale: () => void;
};

export type RoundSignerOptions = {
  readonly domainSeparator: Bytes32;
  readonly roundId: string;
  readonly round: Bytes32;
  /** `T_0`. */
  readonly initial: Bytes32;
  /** Signs a digest with the session's key, or throws when it may not. */
  readonly sign: (digest: Bytes32) => Signature;
  /** Throws when the session may not sign (no lock, or ended). */
  readonly assertLive: () => void;
  readonly isEnded: () => boolean;
  readonly randomUuid: RandomUuid;
  readonly hashCancel: CancelHasher | undefined;
};

const BYTES32 = /^0x[0-9a-f]{64}$/u;

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
  const { roundId, round, initial, domainSeparator, hashCancel } = options;
  const transcript = transcriptFor(options);
  let phase: Exclude<RoundPhase, "ended"> = "open";
  let pending: PendingAction | undefined;
  let canceled = false;
  // Set while `sign` or `signCancel` runs. An injected function (the random
  // source of keys, the cancel encoding, the signer) that calls back into
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
    if (phase !== "open") throw new ShellError("round-stopped");
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
    if (hashCancel === undefined) throw new ShellError("cancel-unavailable");
    const message: PlayerMessage = Object.freeze({
      action: "cancel",
      path: Object.freeze([]),
      sequence: 1,
      round,
      previous: initial,
    });
    const structHash = hashCancel(message);
    if (typeof structHash !== "string" || !BYTES32.test(structHash)) {
      throw new ShellError("invalid-input");
    }
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

  return redacting({
    roundId,
    round,
    phase: (): RoundPhase => (options.isEnded() ? "ended" : phase),
    last: (): Bytes32 => transcript.last(),
    nextSequence: (): number => transcript.nextSequence(),
    pending: (): PendingAction | undefined => pending,
    sign,
    signCancel,
    observe,
    stale: (): void => {
      if (phase === "open") phase = "stale";
    },
  });
};
