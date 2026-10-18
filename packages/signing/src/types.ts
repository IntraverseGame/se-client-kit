// The fixed set of EIP-712 struct types. Each `encodeType` and type hash is
// pinned by a vendored vector (the tests compare them): the signing vectors,
// and for `PlayerCancel` the independent signer's `signed-action/` Snapshot
// vector. A type is added here only with the vector that pins it.
// `PayoutTerms` reaches the player only as `newRound.payoutTermsHash`, so
// there is no player-side type to encode.

import type { StructType } from "./eip712.ts";

export const EIP712_DOMAIN: StructType = {
  name: "EIP712Domain",
  fields: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
};

const PLAYER_FIELDS = [
  { name: "action", type: "string" },
  { name: "path", type: "uint8[]" },
  { name: "sequence", type: "uint32" },
  { name: "round", type: "bytes32" },
  { name: "previous", type: "bytes32" },
] as const;

export const PLAYER_ACTION: StructType = {
  name: "PlayerAction",
  fields: PLAYER_FIELDS,
};

export const PLAYER_CASH_OUT: StructType = {
  name: "PlayerCashOut",
  fields: PLAYER_FIELDS,
};

export const PLAYER_CANCEL: StructType = {
  name: "PlayerCancel",
  fields: PLAYER_FIELDS,
};

export const CREATE_ROUND_AUTH: StructType = {
  name: "CreateRoundAuth",
  fields: [
    { name: "created", type: "bytes32" },
    { name: "prepareWindow", type: "uint40" },
    { name: "expiry", type: "uint256" },
  ],
};

export const MARK_READY_AUTH: StructType = {
  name: "MarkReadyAuth",
  fields: [
    { name: "roundId", type: "bytes32" },
    { name: "seedHash", type: "bytes32" },
    { name: "expiry", type: "uint256" },
  ],
};

export const CLOSE_ROUND_AUTH: StructType = {
  name: "CloseRoundAuth",
  fields: [
    { name: "roundId", type: "bytes32" },
    { name: "payoutAmount", type: "uint128" },
    { name: "expired", type: "bool" },
    { name: "resultHash", type: "bytes32" },
    { name: "lastActionHash", type: "bytes32" },
    { name: "expiry", type: "uint256" },
  ],
};

// The draw-round registry's authorizations. They are in the vendored vectors
// (and replayed by the tests), but the specification does not list them among
// the types the shell recomputes, so they are not part of the public API.
export const CREATE_DRAW_ROUND_AUTH: StructType = {
  name: "CreateDrawRoundAuth",
  fields: [
    { name: "created", type: "bytes32" },
    { name: "drawWindow", type: "uint40" },
    { name: "expiry", type: "uint256" },
  ],
};

export const RECORD_DRAW_AUTH: StructType = {
  name: "RecordDrawAuth",
  fields: [
    { name: "closed", type: "bytes32" },
    { name: "expiry", type: "uint256" },
  ],
};

// The `abi.encode` tuples the shell recomputes (W-26). They are not EIP-712
// structs: each is hashed as `keccak256(abi.encode(...))`, with no type hash.
// The field order and types are the Snapshot schema's (`NewRound`, "11 static
// words in abi.encode order", and `randomnessTarget`) and the signing vectors'
// (`created`, `seedHash`, `ready`), which the tests reproduce.

/** `newRound`, whose hash is `created`. */
export const NEW_ROUND: StructType = {
  name: "NewRound",
  fields: [
    { name: "roundId", type: "bytes32" },
    { name: "playerRef", type: "bytes32" },
    { name: "currency", type: "bytes32" },
    { name: "betAmount", type: "uint128" },
    { name: "gameId", type: "uint32" },
    { name: "gameVersion", type: "uint32" },
    { name: "circuitVersion", type: "uint32" },
    { name: "roundSecretHash", type: "bytes32" },
    { name: "randomnessTarget", type: "bytes32" },
    { name: "actionKey", type: "address" },
    { name: "payoutTermsHash", type: "bytes32" },
  ],
};

/** `(bytes32 source, uint256 entropyChainId, uint256 blockNumber)`. */
export const RANDOMNESS_TARGET: StructType = {
  name: "RandomnessTarget",
  fields: [
    { name: "source", type: "bytes32" },
    { name: "entropyChainId", type: "uint256" },
    { name: "blockNumber", type: "uint256" },
  ],
};

/** `(bytes32 created, bytes32 seedHash)`, whose hash is `T_0`. */
export const READY: StructType = {
  name: "Ready",
  fields: [
    { name: "created", type: "bytes32" },
    { name: "seedHash", type: "bytes32" },
  ],
};
