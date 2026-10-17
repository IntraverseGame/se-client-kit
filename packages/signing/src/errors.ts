/**
 * Why an operation of this package was refused. Callers branch on `code`, never
 * on the message text.
 */
export type SigningErrorCode =
  /**
   * A value is not of the shape or range its field type allows (an EIP-712
   * field, or a field of the typedData encoding).
   */
  | "invalid-input"
  /** A signature is not exactly 65 bytes. */
  | "invalid-signature-length"
  /** A signature's `v` is not 27 or 28. */
  | "invalid-signature-v"
  /** A signature's `s` is above half the curve order. */
  | "high-s"
  /**
   * A signature's `r` or `s` is zero or not below the curve order, or no key
   * recovers from it.
   */
  | "invalid-signature"
  /** A signature recovers to the zero address. */
  | "zero-address"
  /** The random source did not yield a valid secp256k1 secret key. */
  | "random-source"
  /** A signer was used after it was destroyed. */
  | "signer-destroyed"
  /** Signing failed inside the curve implementation. */
  | "signing-failed"
  /**
   * A different action was asked for a (round, sequence) that already has a
   * signature.
   */
  | "equivocation"
  /** A transcript operation needs a pending action and there is none. */
  | "nothing-pending";

// One fixed message per code. A message never carries an input value, so no
// key, signature, or message content can reach an error.
const MESSAGES: Readonly<Record<SigningErrorCode, string>> = {
  "invalid-input": "a value does not fit its field type",
  "invalid-signature-length": "a signature must be exactly 65 bytes",
  "invalid-signature-v": "a signature's v must be 27 or 28",
  "high-s": "a signature's s must be in the lower half of the curve order",
  "invalid-signature": "the signature is not a valid secp256k1 signature",
  "zero-address": "the signature recovers to the zero address",
  "random-source": "the random source did not yield a valid secret key",
  "signer-destroyed": "the signer was destroyed",
  "signing-failed": "signing failed",
  equivocation:
    "a different action is already signed at this round and sequence",
  "nothing-pending": "no signed action is pending",
};

/** The only error this package throws. Its message is fixed per `code`. */
export class SigningError extends Error {
  public readonly code: SigningErrorCode;

  public constructor(code: SigningErrorCode) {
    super(MESSAGES[code]);
    this.name = "SigningError";
    this.code = code;
  }
}
