// Typed struct hashes for the messages the shell signs or verifies.

import { hashAbiEncoded, hashStruct, type UintValue } from "./eip712.ts";
import type { Address, Bytes32 } from "./hex.ts";
import {
  CLOSE_ROUND_AUTH,
  CREATE_ROUND_AUTH,
  EIP712_DOMAIN,
  MARK_READY_AUTH,
  NEW_ROUND,
  PLAYER_ACTION,
  PLAYER_CASH_OUT,
  RANDOMNESS_TARGET,
  READY,
} from "./types.ts";

/**
 * The EIP-712 domain: `EIP712Domain(string name,string version,uint256
 * chainId,address verifyingContract)`.
 */
export type Domain = {
  readonly name: string;
  readonly version: string;
  readonly chainId: UintValue;
  readonly verifyingContract: Address;
};

/**
 * The fields of `PlayerAction` and `PlayerCashOut`: `(string action,uint8[]
 * path,uint32 sequence,bytes32 round,bytes32 previous)`. `round` is the round
 * id; `previous` is the `T` the action links to.
 */
export type PlayerMessage = {
  readonly action: string;
  /** Each entry is an integer in 0..255. */
  readonly path: readonly number[];
  /** An integer in 0..2^32-1. */
  readonly sequence: number;
  readonly round: Bytes32;
  readonly previous: Bytes32;
};

/**
 * `CreateRoundAuth(bytes32 created,uint40 prepareWindow,uint256 expiry)`: the
 * registry's authorization of a round's creation, which the shell checks before
 * a round is shown as ready.
 */
export type CreateRoundAuth = {
  readonly created: Bytes32;
  /** An integer in 0..2^40-1. */
  readonly prepareWindow: number;
  readonly expiry: UintValue;
};

/** `MarkReadyAuth(bytes32 roundId,bytes32 seedHash,uint256 expiry)`. */
export type MarkReadyAuth = {
  readonly roundId: Bytes32;
  readonly seedHash: Bytes32;
  readonly expiry: UintValue;
};

/**
 * `CloseRoundAuth(bytes32 roundId,uint128 payoutAmount,bool expired,bytes32
 * resultHash,bytes32 lastActionHash,uint256 expiry)`.
 */
export type CloseRoundAuth = {
  readonly roundId: Bytes32;
  /** Base units, as a `bigint` or a decimal string; never a `number`. */
  readonly payoutAmount: UintValue;
  readonly expired: boolean;
  readonly resultHash: Bytes32;
  readonly lastActionHash: Bytes32;
  readonly expiry: UintValue;
};

/** The domain separator, `hashStruct(EIP712Domain)`. */
export const domainSeparator = (domain: Domain): Bytes32 =>
  hashStruct(EIP712_DOMAIN, domain);

/** `hashStruct(PlayerAction)`: the `T` of a move. */
export const hashPlayerAction = (message: PlayerMessage): Bytes32 =>
  hashStruct(PLAYER_ACTION, message);

/** `hashStruct(PlayerCashOut)`: the `T` of a cash-out. */
export const hashPlayerCashOut = (message: PlayerMessage): Bytes32 =>
  hashStruct(PLAYER_CASH_OUT, message);

export const hashCreateRoundAuth = (message: CreateRoundAuth): Bytes32 =>
  hashStruct(CREATE_ROUND_AUTH, message);

export const hashMarkReadyAuth = (message: MarkReadyAuth): Bytes32 =>
  hashStruct(MARK_READY_AUTH, message);

export const hashCloseRoundAuth = (message: CloseRoundAuth): Bytes32 =>
  hashStruct(CLOSE_ROUND_AUTH, message);

/**
 * A round's `newRound`: the arguments of its on-chain creation, in `abi.encode`
 * order. `currency` is the bet's unit as `bytes32` (ASCII, left-aligned,
 * zero-padded).
 */
export type NewRound = {
  readonly roundId: Bytes32;
  readonly playerRef: Bytes32;
  readonly currency: Bytes32;
  /** `uint128` base units, as a `bigint` or a decimal string; never a `number`. */
  readonly betAmount: UintValue;
  /** `uint32`. */
  readonly gameId: number | UintValue;
  /** `uint32`. */
  readonly gameVersion: number | UintValue;
  /** `uint32`. */
  readonly circuitVersion: number | UintValue;
  readonly roundSecretHash: Bytes32;
  readonly randomnessTarget: Bytes32;
  readonly actionKey: Address;
  readonly payoutTermsHash: Bytes32;
};

/** What a round's `randomnessTarget` is computed from. */
export type RandomnessTarget = {
  /**
   * The entropy source identifier as `bytes32` (ASCII, left-aligned,
   * zero-padded).
   */
  readonly source: Bytes32;
  readonly entropyChainId: UintValue;
  readonly blockNumber: UintValue;
};

/** What a round's `T_0` (the Ready evidence hash) is computed from. */
export type Ready = {
  readonly created: Bytes32;
  readonly seedHash: Bytes32;
};

/** `created = keccak256(abi.encode(newRound))`. */
export const hashNewRound = (newRound: NewRound): Bytes32 =>
  hashAbiEncoded(NEW_ROUND, newRound);

/**
 * `keccak256(abi.encode(bytes32 source, uint256 entropyChainId, uint256
 * blockNumber))`: the `randomnessTarget` a round's `newRound` commits to.
 */
export const hashRandomnessTarget = (target: RandomnessTarget): Bytes32 =>
  hashAbiEncoded(RANDOMNESS_TARGET, target);

/** `T_0 = keccak256(abi.encode(created, seedHash))`, the Ready evidence hash. */
export const hashReady = (ready: Ready): Bytes32 =>
  hashAbiEncoded(READY, ready);
