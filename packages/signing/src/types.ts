// The fixed set of EIP-712 struct types. Each `encodeType` and type hash is
// pinned by the vendored signing vectors (the tests compare them).
//
// Not here yet, because no vendored contract defines them: `PlayerCancel`,
// `NewRound`, and `PayoutTerms` (they come with the signed-action spec).

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
