// The public API, listed by name: nothing else in `src/` is public.

export { typedDataDigest, type UintValue } from "./eip712.ts";
export { SigningError, type SigningErrorCode } from "./errors.ts";
export {
  type ActionGrammar,
  actionGrammar,
  type GrammarAction,
} from "./grammar.ts";
export type { Address, Bytes32, Hex } from "./hex.ts";
export {
  type CloseRoundAuth,
  type CreateRoundAuth,
  type Domain,
  domainSeparator,
  hashCloseRoundAuth,
  hashCreateRoundAuth,
  hashMarkReadyAuth,
  hashNewRound,
  hashPlayerAction,
  hashPlayerCashOut,
  hashRandomnessTarget,
  hashReady,
  type MarkReadyAuth,
  type NewRound,
  type PlayerMessage,
  type RandomnessTarget,
  type Ready,
} from "./messages.ts";
export { recoverAddress, type Signature } from "./signature.ts";
export {
  createSigner,
  type RandomSource,
  type Signer,
  type SignerOptions,
} from "./signer.ts";
export {
  createTranscript,
  type PlayerMessageKind,
  type SignedEntry,
  type Transcript,
  type TranscriptOptions,
  type TranscriptRequest,
} from "./transcript.ts";
export {
  encodeTypedData,
  type TypedDataFields,
  type TypedDataKind,
} from "./typed-data.ts";
