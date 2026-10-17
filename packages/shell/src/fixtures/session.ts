// Test-only: opening a session and a round with fixture values.

import type { Bytes32 } from "@intraverse/se-client-signing";

import type { SettledInitial } from "../create-round-auth.ts";
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

export type TestSessionOverrides = Partial<SigningSessionOptions>;

export const openTestSession = (
  overrides: TestSessionOverrides = {},
): Promise<SigningSession> =>
  openSigningSession({
    sessionId: SESSION_ID,
    locks: createFakeLockManager(),
    random: recordingRandom(1),
    randomUuid: seededUuids(2),
    domain,
    ...overrides,
  });

/**
 * A vector's `T_0` taken as settled. Test-only: in the shell, only check 5
 * settles a `T_0` (W-26); the worked round's is the signing vectors' `ready`.
 */
export const settledForTest = (initial: Bytes32): SettledInitial =>
  initial as SettledInitial;

/** Opens the worked round (its round id and `T_0`) under `ROUND_ID`. */
export const openWorkedRound = (session: SigningSession): RoundSigner =>
  session.openRound({
    roundId: ROUND_ID,
    round: workedRound,
    initial: settledForTest(workedInitial),
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
