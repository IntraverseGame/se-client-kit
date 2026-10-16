// The public API, listed by name: nothing else in `src/` is public.

import { typedDataDigest, type UintValue } from "./eip712.ts";
import { SigningError, type SigningErrorCode } from "./errors.ts";
import { type ActionGrammar, provisionalGrammar } from "./grammar.ts";
import type { Address, Bytes32, Hex } from "./hex.ts";
import {
  type CloseRoundAuth,
  type CreateRoundAuth,
  type Domain,
  domainSeparator,
  hashCloseRoundAuth,
  hashCreateRoundAuth,
  hashMarkReadyAuth,
  hashPlayerAction,
  hashPlayerCashOut,
  type MarkReadyAuth,
  type PlayerMessage,
} from "./messages.ts";
import { recoverAddress, type Signature } from "./signature.ts";
import {
  createSigner,
  type RandomSource,
  type Signer,
  type SignerOptions,
} from "./signer.ts";
import {
  createTranscript,
  type PlayerMessageKind,
  type SignedEntry,
  type Transcript,
  type TranscriptOptions,
  type TranscriptRequest,
} from "./transcript.ts";

export type {
  ActionGrammar,
  Address,
  Bytes32,
  CloseRoundAuth,
  CreateRoundAuth,
  Domain,
  Hex,
  MarkReadyAuth,
  PlayerMessage,
  PlayerMessageKind,
  RandomSource,
  Signature,
  SignedEntry,
  Signer,
  SignerOptions,
  SigningErrorCode,
  Transcript,
  TranscriptOptions,
  TranscriptRequest,
  UintValue,
};
export {
  createSigner,
  createTranscript,
  domainSeparator,
  hashCloseRoundAuth,
  hashCreateRoundAuth,
  hashMarkReadyAuth,
  hashPlayerAction,
  hashPlayerCashOut,
  provisionalGrammar,
  recoverAddress,
  SigningError,
  typedDataDigest,
};
