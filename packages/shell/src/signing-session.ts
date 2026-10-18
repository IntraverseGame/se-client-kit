// Key custody for one session (W-9 to W-14): the signer lock, the action key,
// and the transcript state of each round the session signs for. The key lives
// only in the closure of the `signing` package's signer, which this module
// holds and never returns; every use of it goes through the lock check.

import type { RandomUuid } from "@intraverse/se-client-play-client";
import {
  type Address,
  type Bytes32,
  createSigner,
  type Domain,
  domainSeparator,
  type RandomSource,
  type Signature,
  type Signer,
  SigningError,
} from "@intraverse/se-client-signing";

import type { SettledInitial } from "./create-round-auth.ts";
import { ShellError } from "./errors.ts";
import { redacting } from "./redaction.ts";
import { createRoundSigner, type RoundSigner } from "./round-signer.ts";
import { acquireSignerLock, signerLockName } from "./web-lock.ts";

export type SigningSessionOptions = {
  /** The session id from the redeem; it names the lock (W-14). */
  readonly sessionId: string;
  /**
   * The platform's `navigator.locks`. Anything that is not a lock manager,
   * `undefined` included, means no Web Locks API: the session signs nothing.
   */
  readonly locks: unknown;
  /**
   * The cryptographic random source of the key (W-9). The default is the
   * platform's `crypto.getRandomValues`; tests inject their own.
   */
  readonly random?: RandomSource;
  /** `crypto.randomUUID`: one idempotency key per intent (W-36). */
  readonly randomUuid: RandomUuid;
  /**
   * The EIP-712 domain of the player's messages. PROVISIONAL: the Wrapper spec
   * assumes it comes from the environment configuration until the Play API or
   * the signed-action spec says where the shell learns it.
   */
  readonly domain: Domain;
};

/** What this page may do for the session. */
export type SessionState =
  /** It holds the lock and may sign. */
  | "signing"
  /** Another tab holds the lock: "this session is open in another tab". */
  | "held-elsewhere"
  /** No Web Locks API: it signs nothing (fail closed). */
  | "unsupported"
  /** The lock was taken away: it signs nothing more. */
  | "lost"
  /** The session ended: the key is destroyed. */
  | "ended";

/** What the shell knows of a round when it opens its transcript state. */
export type RoundOptions = {
  /** The Snapshot `roundId` (UUIDv7 text). */
  readonly roundId: string;
  /**
   * The round id as the signed messages carry it (`bytes32`): the Snapshot
   * schema's `RoundIdBytes32` form of `roundId`, the value check 3 compares
   * `newRound.roundId` with (W-26).
   */
  readonly round: Bytes32;
  /**
   * `T_0`, the Ready evidence hash the first message links to (W-18), as the
   * round's verdict settled it (W-26, check 5). The type admits only a settled
   * value: a round's transcript state is never opened with an unchecked one.
   */
  readonly initial: SettledInitial;
};

export type SigningSession = {
  readonly state: () => SessionState;
  /**
   * The action key's address (EIP-55). The key is generated on the first call
   * (W-9), only while this page holds the lock.
   */
  readonly address: () => Address;
  /** Opens the transcript state of a round (W-15); one per round. */
  readonly openRound: (options: RoundOptions) => RoundSigner;
  /** The transcript state of a round, if this session holds it (W-42). */
  readonly round: (roundId: string) => RoundSigner | undefined;
  /**
   * Ends the session: zeroes the key bytes (best effort), releases the lock,
   * and signs nothing more (W-7, W-11). Signed actions stay readable.
   */
  readonly end: () => void;
};

// The Snapshot schema's `RoundId`: UUIDv7, canonical lowercase text.
const ROUND_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const separatorOf = (domain: Domain): Bytes32 => {
  try {
    return domainSeparator(domain);
  } catch (error) {
    if (error instanceof SigningError) throw new ShellError("invalid-input");
    throw error;
  }
};

/**
 * Opens the session's key custody: requests the signer lock once (W-14) and
 * resolves when the platform answers. A page that did not get the lock gets a
 * session that refuses every signature with `lock-not-held`.
 */
export const openSigningSession = async (
  options: SigningSessionOptions,
): Promise<SigningSession> => {
  const name = signerLockName(options.sessionId);
  if (name === undefined) throw new ShellError("invalid-input");
  const separator = separatorOf(options.domain);
  if (typeof options.randomUuid !== "function") {
    throw new ShellError("invalid-input");
  }
  const lock = await acquireSignerLock(options.locks, name);
  const rounds = new Map<string, RoundSigner>();
  let signer: Signer | undefined;
  let ended = false;

  const state = (): SessionState => {
    if (ended) return "ended";
    const held = lock.state();
    return held === "held" ? "signing" : held === "released" ? "ended" : held;
  };

  const assertLive = (): void => {
    const current = state();
    if (current === "ended") throw new ShellError("session-ended");
    if (current !== "signing") throw new ShellError("lock-not-held");
  };

  const key = (): Signer => {
    assertLive();
    if (signer === undefined) {
      try {
        signer = createSigner(
          options.random === undefined ? {} : { random: options.random },
        );
      } catch (error) {
        if (error instanceof SigningError) {
          throw new ShellError("key-generation");
        }
        throw error;
      }
    }
    return signer;
  };

  const sign = (digest: Bytes32): Signature => key().sign(digest);

  return redacting({
    state,
    address: (): Address => key().address,
    openRound: (round: RoundOptions): RoundSigner => {
      assertLive();
      if (typeof round.roundId !== "string" || !ROUND_ID.test(round.roundId)) {
        throw new ShellError("invalid-input");
      }
      if (rounds.has(round.roundId)) throw new ShellError("round-exists");
      const opened = createRoundSigner({
        domainSeparator: separator,
        roundId: round.roundId,
        round: round.round,
        initial: round.initial,
        sign,
        assertLive,
        isEnded: (): boolean => state() === "ended",
        randomUuid: options.randomUuid,
      });
      rounds.set(round.roundId, opened);
      return opened;
    },
    round: (roundId: string): RoundSigner | undefined => rounds.get(roundId),
    end: (): void => {
      ended = true;
      signer?.destroy();
      signer = undefined;
      lock.release();
    },
  });
};
