/**
 * Why the shell refused to act. Callers branch on `code`, never on the message
 * text.
 */
export type ShellErrorCode =
  /**
   * This page does not hold the session's signer lock (another tab holds it,
   * the browser has no Web Locks API, or the lock was lost), so it signs
   * nothing (W-14).
   */
  | "lock-not-held"
  /** The session ended: its key is destroyed and nothing more is signed (W-11). */
  | "session-ended"
  /** A value given to the shell is not of the shape it requires. */
  | "invalid-input"
  /** The random source did not yield a valid action key (W-9). */
  | "key-generation"
  /** The shell already holds transcript state for this round (W-15). */
  | "round-exists"
  /**
   * A different action was asked at a sequence that already has a signature,
   * including a cancel against the first move and the reverse (W-15, W-17).
   */
  | "equivocation"
  /**
   * The round does not take new signatures: it was answered `STALE_ACTION`
   * (W-19), is out of sync, or is closed.
   */
  | "round-stopped"
  /**
   * `PlayerCancel` cannot be signed: no cancel encoding was configured
   * (provisional until the signed-action spec defines it).
   */
  | "cancel-unavailable";

// One fixed message per code. A message never carries an input value, so no
// key, token, launch code, or signed bytes can reach an error (W-4, W-41).
const MESSAGES: Readonly<Record<ShellErrorCode, string>> = {
  "lock-not-held": "this page does not hold the session's signer lock",
  "session-ended": "the session has ended",
  "invalid-input": "a value does not have the required shape",
  "key-generation": "the random source did not yield a valid action key",
  "round-exists": "this round is already open",
  equivocation: "a different action is already signed at this sequence",
  "round-stopped": "this round takes no new signatures",
  "cancel-unavailable": "no cancel encoding is configured",
};

/** The error the shell throws. Its message is fixed per `code`. */
export class ShellError extends Error {
  public readonly code: ShellErrorCode;

  public constructor(code: ShellErrorCode) {
    super(MESSAGES[code]);
    this.name = "ShellError";
    this.code = code;
  }
}
