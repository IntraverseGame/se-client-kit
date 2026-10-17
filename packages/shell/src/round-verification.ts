// One round's W-26 verification: checks 1 to 5 over the round's Snapshots, the
// tip check's decision (W-26b), and the re-issue rule, combined into what the
// shell may do. It decides; it signs nothing. The flow that acts on it (shows
// the game, signs a move, or signs `PlayerCancel` through the round's
// `signCancel`) is the start flow, not built yet.
//
// - `T_0` is settled only when checks 1 to 5 pass (W-26).
// - Nothing is signed for the round, and the game is not shown, until the
//   Snapshot is `active` and every check passes, the tip check included.
// - A `PlayerCancel` may be signed only when `T_0` is settled and only the tip
//   check failed, once the round is `active` (W-25, W-26). A tip check that
//   fails before check 5 has run waits for it; if check 5 then fails, nothing
//   is signed. After a re-issue nothing more is signed, not even a cancel.

import type { Bytes32 } from "@intraverse/se-client-signing";
import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import type { ChainConfig } from "./chain-config.ts";
import type { ChainDecision, FailReason } from "./chain-decision.ts";
import {
  type AuthCheck,
  type CheckReason,
  checkCreateRoundAuth,
  checkReady,
  type CreateRoundAuthProof,
  type ReadyCheck,
  type StartRequest,
} from "./create-round-auth.ts";
import { isReissue } from "./reissue.ts";
import type { TipCheckFailure } from "./tip-check.ts";

/** Why the round failed verification. */
export type VerificationFailure =
  | CheckReason
  /** A later read carried a different `proofs.createRoundAuth` (W-26). */
  | "reissued"
  /** Only the tip check (or its bind rule) failed: `T_0` is settled. */
  | "tip-check";

export type RoundVerdict =
  | {
      /**
       * Not every check has passed yet (or the round is still `starting`): the
       * game is not shown and nothing is signed.
       */
      readonly state: "checking";
    }
  | {
      /**
       * Every check passed and the round is `active`: the game may be shown,
       * the first move links to `initial`, and, `T_0` being settled, a cancel
       * the player asks for in a config round with no move made may be signed
       * (W-25, W-31).
       */
      readonly state: "ready";
      /** `T_0`, settled. */
      readonly initial: Bytes32;
    }
  | {
      /** The round failed verification: it is never shown as ready. */
      readonly state: "failed";
      readonly failure: VerificationFailure;
      /** The tip check's failure, when `failure` is `tip-check`. */
      readonly tipFailure?: TipCheckFailure | "bind";
      /**
       * What the player is shown: "this round failed verification", or "could
       * not verify the chain" for a tip check that could not read the chain
       * (W-26a). When `cancel` is set, "and was canceled" is added to the
       * former once the cancel is accepted.
       */
      readonly shown: FailReason;
      /** `T_0`, when it was settled before the failure. */
      readonly initial?: Bytes32;
      /**
       * `true` exactly when the shell must sign `PlayerCancel` now: `T_0` is
       * settled, only the tip check failed, the round is `active`, and there
       * was no re-issue. Otherwise nothing is signed for the round, not even
       * `PlayerCancel`, and it ends by its game's expiry rule.
       */
      readonly cancel: boolean;
    };

/** What the round's evidence keeps of its `CreateRoundAuth` (W-26, W-27). */
export type AuthEvidence = {
  /** The first `proofs.createRoundAuth` received for the round. */
  readonly first: CreateRoundAuthProof | undefined;
  /** Every different one received later, in order (re-issues). */
  readonly reissues: readonly CreateRoundAuthProof[];
};

export type RoundVerification = {
  /** Reads a validated Snapshot of the round; another round's is ignored. */
  readonly observe: (snapshot: ValidSnapshot) => RoundVerdict;
  /** Takes the tip check's decision for the round (W-26b). */
  readonly observeTip: (decision: ChainDecision) => RoundVerdict;
  readonly verdict: () => RoundVerdict;
  readonly evidence: () => AuthEvidence;
};

export type RoundVerificationOptions = {
  readonly config: ChainConfig;
  /** The Snapshot `roundId` the `start` response named. */
  readonly roundId: string;
  /** What the shell sent in `start`. */
  readonly request: StartRequest;
};

const CHECKING: RoundVerdict = Object.freeze({ state: "checking" });

const failed = (
  failure: VerificationFailure,
  extra: { readonly initial?: Bytes32 } = {},
): RoundVerdict =>
  Object.freeze({
    state: "failed",
    failure,
    shown: "verification-failed",
    cancel: false,
    ...extra,
  });

export const createRoundVerification = (
  options: RoundVerificationOptions,
): RoundVerification => {
  const { config, roundId, request } = options;
  let first: CreateRoundAuthProof | undefined;
  const reissues: CreateRoundAuthProof[] = [];
  let auth: AuthCheck | undefined;
  let ready: ReadyCheck | undefined;
  let tip: ChainDecision | undefined;
  let status: ValidSnapshot["status"] | undefined;

  const decide = (): RoundVerdict => {
    const initial = ready?.status === "settled" ? ready.initial : undefined;
    const settled = initial === undefined ? {} : { initial };
    if (reissues.length > 0) return failed("reissued", settled);
    if (auth === undefined || auth.status === "waiting") return CHECKING;
    if (auth.status === "refused") return failed(auth.reason);
    if (ready === undefined || ready.status === "waiting") return CHECKING;
    if (ready.status === "refused") return failed(ready.reason);
    if (tip === undefined) return CHECKING;
    if (tip.verdict === "fail") {
      return Object.freeze({
        state: "failed",
        failure: "tip-check",
        tipFailure: tip.failure,
        shown: tip.reason,
        initial: ready.initial,
        cancel: status === "active",
      });
    }
    return status === "starting" || status === undefined
      ? CHECKING
      : Object.freeze({ state: "ready", initial: ready.initial });
  };

  let current: RoundVerdict = CHECKING;

  const observe = (snapshot: ValidSnapshot): RoundVerdict => {
    if (snapshot.status === "idle" || snapshot.roundId !== roundId) {
      return current;
    }
    status = snapshot.status;
    const carried = snapshot.proofs?.createRoundAuth;
    if (first === undefined) {
      first = carried;
    } else if (carried !== undefined) {
      // Kept once per distinct object: the same re-issue read twice is one.
      const known = [first, ...reissues].some(k => !isReissue(k, snapshot));
      if (!known) reissues.push(carried);
    }
    // Checks 1 to 4 run once, on the first Snapshot that carries the object
    // (or fail `missing` once the round is past `starting` without it).
    if (auth === undefined || auth.status === "waiting") {
      auth = checkCreateRoundAuth(config, request, snapshot);
    }
    // Check 5 runs once `readyHash` arrives (or fails `missing` by `active`).
    if (
      auth.status === "passed" &&
      (ready === undefined || ready.status === "waiting")
    ) {
      ready = checkReady(auth.created, snapshot);
    }
    current = decide();
    return current;
  };

  const observeTip = (decision: ChainDecision): RoundVerdict => {
    // The round has one tip check; a second decision does not replace it.
    tip ??= decision;
    current = decide();
    return current;
  };

  return Object.freeze({
    observe,
    observeTip,
    verdict: () => current,
    evidence: (): AuthEvidence =>
      Object.freeze({ first, reissues: Object.freeze([...reissues]) }),
  });
};
