// Typed struct hashes for the messages the shell signs or verifies.

import { hashStruct, type UintValue } from "./eip712.ts";
import type { Address, Bytes32 } from "./hex.ts";
import {
  CLOSE_ROUND_AUTH,
  CREATE_ROUND_AUTH,
  EIP712_DOMAIN,
  MARK_READY_AUTH,
  PLAYER_ACTION,
  PLAYER_CASH_OUT,
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
 * bind receipt.
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
