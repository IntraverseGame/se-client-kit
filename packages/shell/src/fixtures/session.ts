// Test-only: opening a session and a round with fixture values.

import {
  type Bytes32,
  hashPlayerAction,
  type PlayerMessage,
} from "@intraverse/se-client-signing";

import { ShellError, type ShellErrorCode } from "../errors.ts";
import type { RoundSigner } from "../round-signer.ts";
import {
  openSigningSession,
  type SigningSession,
  type SigningSessionOptions,
} from "../signing-session.ts";
import { createFakeLockManager } from "./fake-locks.ts";
import { recordingRandom, seededUuids } from "./seeded.ts";
import { domain, ROUND_ID, workedInitial, workedRound } from "./vectors.ts";

export const SESSION_ID = "ses_01J9ZK3M7Q2W5X8Y4T6R1V0B9N";

/**
 * A stand-in `PlayerCancel` encoding for the tests: the `PlayerAction` struct
 * hash of the cancel message. The real type string is not published yet; the
 * shell takes the encoding as an injected, provisional dependency.
 */
export const testCancelHash = (message: PlayerMessage): Bytes32 =>
  hashPlayerAction(message);

export type TestSessionOverrides = Partial<SigningSessionOptions> & {
  /** Opens the session with no cancel encoding at all. */
  readonly withoutCancel?: boolean;
};

export const openTestSession = (
  overrides: TestSessionOverrides = {},
): Promise<SigningSession> => {
  const { withoutCancel = false, ...options } = overrides;
  const defaults = {
    sessionId: SESSION_ID,
    locks: createFakeLockManager(),
    random: recordingRandom(1),
    randomUuid: seededUuids(2),
    domain,
  };
  return openSigningSession(
    withoutCancel
      ? { ...defaults, ...options }
      : { ...defaults, hashCancel: testCancelHash, ...options },
  );
};

/** Opens the worked round (its round id and `T_0`) under `ROUND_ID`. */
export const openWorkedRound = (session: SigningSession): RoundSigner =>
  session.openRound({
    roundId: ROUND_ID,
    round: workedRound,
    initial: workedInitial,
  });

/** The `code` of the `ShellError` that `run` throws, or undefined. */
export const shellCodeOf = (run: () => unknown): ShellErrorCode | undefined => {
  try {
    run();
  } catch (error) {
    if (error instanceof ShellError) return error.code;
    throw error;
  }
  return undefined;
};
