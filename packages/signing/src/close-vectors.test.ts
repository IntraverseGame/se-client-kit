// T-1 (specs/wrapper.md): the signing vectors' `closes`, one full round per
// way a round ends, and `payoutTerms`, reproduced with the kit's own encoders:
// each action's struct hash, digest, signature, and signer (a cancel and a
// cash-out included), `created`, `ready`, `lastActionHash`, the admin's
// `CloseRoundAuth`, and the `closed` and `canceled` evidence hashes. The kit
// has no encoder for `PayoutTerms` (a round carries only its hash,
// `newRound.payoutTermsHash`), so the terms are not rebuilt: the tests only
// check that each round names the hash of its terms.

import { describe, expect, it } from "vitest";

import { hashAbiEncoded, type StructType, typedDataDigest } from "./eip712.ts";
import {
  type CanceledRound,
  type CloseActionVector,
  closes,
  type EndedRound,
  payoutTerms,
} from "./fixtures/close-vectors.ts";
import { engineSigner, playerSigner, separator } from "./fixtures/helpers.ts";
import { vectors } from "./fixtures/vectors.ts";
import type { Bytes32 } from "./hex.ts";
import {
  hashCloseRoundAuth,
  hashNewRound,
  hashPlayerAction,
  hashPlayerCancel,
  hashPlayerCashOut,
  hashReady,
  type PlayerMessage,
} from "./messages.ts";
import { recoverAddress } from "./signature.ts";

const player = playerSigner();
const engine = engineSigner();

const ZERO_HASH: Bytes32 = `0x${"00".repeat(32)}`;

// The registry's two evidence hashes of a round's end. They are not kit API
// (the shell never computes either), so their tuples live in this test only:
// `closed = keccak256(abi.encode(ready, payoutAmount, expired, lastActionHash,
// resultHash))` and `canceled = keccak256(abi.encode(ready, T_1))`.
const CLOSED: StructType = {
  name: "Closed",
  fields: [
    { name: "ready", type: "bytes32" },
    { name: "payoutAmount", type: "uint128" },
    { name: "expired", type: "bool" },
    { name: "lastActionHash", type: "bytes32" },
    { name: "resultHash", type: "bytes32" },
  ],
};
const CANCELED: StructType = {
  name: "Canceled",
  fields: [
    { name: "ready", type: "bytes32" },
    { name: "cancelHash", type: "bytes32" },
  ],
};

const HASHERS = {
  Action: hashPlayerAction,
  CashOut: hashPlayerCashOut,
  Cancel: hashPlayerCancel,
} as const;

const messageOf = (
  vector: CloseActionVector,
  roundId: Bytes32,
): PlayerMessage => ({
  action: vector.action,
  path: vector.path,
  sequence: vector.sequence,
  round: roundId,
  previous: vector.previous,
});

/** `T_n` of the last action, or 0 when the round had none. */
const lastHashOf = (actions: readonly CloseActionVector[]): Bytes32 =>
  actions.at(-1)?.structHash ?? ZERO_HASH;

const ended = closes.filter((close): close is EndedRound => "result" in close);
const canceled = closes.filter(
  (close): close is CanceledRound => "canceled" in close,
);
type WithAuth = EndedRound & Required<Pick<EndedRound, "closeRoundAuth">>;
const withAuth = ended.filter(
  (close): close is WithAuth => close.closeRoundAuth !== undefined,
);

describe("the closes", () => {
  it("holds the nine ways a round ends", () => {
    expect(closes.map(close => close.scenario)).toEqual([
      "cashout-half",
      "cashout-cap",
      "cashout-max-depth",
      "loss",
      "expired-with-actions",
      "expire-no-action",
      "claim-cashout",
      "unchecked-cap",
      "player-cancel",
    ]);
  });

  it("ends eight in a result and a closed hash, and one in a player cancel", () => {
    expect(ended).toHaveLength(8);
    expect(canceled.map(close => close.function)).toEqual(["cancelReadyRound"]);
  });

  it("gives an admin authorization to the closeRound rounds only", () => {
    expect(withAuth.map(close => close.function)).toEqual(
      withAuth.map(() => "closeRound"),
    );
    expect(
      ended
        .filter(close => close.function === "closeRound")
        .every(close => close.closeRoundAuth !== undefined),
    ).toBe(true);
  });

  it("names the hash of its payout terms in every round's newRound", () => {
    const hashes = new Map(payoutTerms.map(terms => [terms.name, terms.hash]));
    expect(payoutTerms.map(terms => terms.name)).toHaveLength(hashes.size);
    expect(
      closes.map(close => [close.scenario, close.newRound.payoutTermsHash]),
    ).toEqual(closes.map(close => [close.scenario, hashes.get(close.terms)]));
  });

  it("signs every round with the one action key", () => {
    expect(closes.map(close => close.newRound.actionKey)).toEqual(
      closes.map(() => vectors.actionKey),
    );
  });
});

describe.each(closes.map(close => [close.scenario, close] as const))(
  "the round %s",
  (_scenario, close) => {
    it("reproduces created, T_0, and the chain of T_n", () => {
      expect(hashNewRound(close.newRound)).toBe(close.created);
      expect(
        hashReady({ created: close.created, seedHash: close.seedHash }),
      ).toBe(close.ready);
      expect(close.actions.map(vector => vector.sequence)).toEqual(
        close.actions.map((_vector, index) => index + 1),
      );
      expect(close.actions.map(vector => vector.previous)).toEqual(
        [
          close.ready,
          ...close.actions.slice(0, -1).map(vector => vector.structHash),
        ].slice(0, close.actions.length),
      );
      expect(
        close.actions.map(vector =>
          HASHERS[vector.kind](messageOf(vector, close.newRound.roundId)),
        ),
      ).toEqual(close.actions.map(vector => vector.structHash));
      expect(close.lastActionHash).toBe(lastHashOf(close.actions));
    });

    it("reproduces every action's digest, signature, and signer", () => {
      const digests = close.actions.map(vector =>
        typedDataDigest(separator, vector.structHash),
      );
      expect(digests).toEqual(close.actions.map(vector => vector.digest));
      expect(digests.map(digest => player.sign(digest))).toEqual(
        close.actions.map(vector => vector.signature),
      );
      expect(
        close.actions.map(vector =>
          recoverAddress(vector.digest, vector.signature),
        ),
      ).toEqual(close.actions.map(() => player.address));
      expect(close.actions.map(vector => vector.signer)).toEqual(
        close.actions.map(() => player.address),
      );
    });
  },
);

describe.each(ended.map(close => [close.scenario, close] as const))(
  "the ended round %s",
  (_scenario, close) => {
    it("reproduces closed = keccak256(abi.encode(ready, payoutAmount, expired, lastActionHash, resultHash))", () => {
      expect(
        hashAbiEncoded(CLOSED, {
          ready: close.ready,
          payoutAmount: close.result.payoutAmount,
          expired: close.result.expired,
          lastActionHash: close.lastActionHash,
          resultHash: close.result.resultHash,
        }),
      ).toBe(close.closed);
    });
  },
);

describe.each(withAuth.map(close => [close.scenario, close] as const))(
  "the CloseRoundAuth of %s",
  (_scenario, close) => {
    it("reproduces its struct hash, digest, signature, and signer", () => {
      const auth = close.closeRoundAuth;
      const structHash = hashCloseRoundAuth({
        roundId: close.newRound.roundId,
        payoutAmount: close.result.payoutAmount,
        expired: close.result.expired,
        resultHash: close.result.resultHash,
        lastActionHash: close.lastActionHash,
        expiry: auth.expiry,
      });
      expect(structHash).toBe(auth.structHash);
      const digest = typedDataDigest(separator, structHash);
      expect(digest).toBe(auth.digest);
      expect(engine.sign(digest)).toBe(auth.signature);
      expect(recoverAddress(digest, auth.signature)).toBe(engine.address);
      expect(auth.signer).toBe(engine.address);
    });
  },
);

describe.each(canceled.map(close => [close.scenario, close] as const))(
  "the round %s",
  (_scenario, close) => {
    it("is one PlayerCancel at sequence 1 on T_0, with an empty path", () => {
      expect(
        close.actions.map(vector => [
          vector.kind,
          vector.action,
          vector.path,
          vector.sequence,
          vector.previous,
        ]),
      ).toEqual([["Cancel", "cancel", [], 1, close.ready]]);
    });

    it("has canceled = keccak256(abi.encode(ready, T_1))", () => {
      expect(
        hashAbiEncoded(CANCELED, {
          ready: close.ready,
          cancelHash: lastHashOf(close.actions),
        }),
      ).toBe(close.canceled);
    });

    it("is not the hash of a move or a cash-out of the same message", () => {
      const messages = close.actions.map(vector =>
        messageOf(vector, close.newRound.roundId),
      );
      const hashes = close.actions.map(vector => vector.structHash);
      expect(messages.map(message => hashPlayerAction(message))).not.toEqual(
        hashes,
      );
      expect(messages.map(message => hashPlayerCashOut(message))).not.toEqual(
        hashes,
      );
    });
  },
);
