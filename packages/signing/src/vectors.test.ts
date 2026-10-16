// T-1 (specs/wrapper.md): the vendored signing vectors, reproduced.

import { describe, expect, it } from "vitest";

import { encodeType, hashStruct, typeHash, typedDataDigest } from "./eip712.ts";
import {
  actionVector,
  domain,
  drawSeparator,
  engineSigner,
  messageOf,
  playerSigner,
  separator,
  structHashOf,
} from "./fixtures/helpers.ts";
import { vectors } from "./fixtures/vectors.ts";
import {
  domainSeparator,
  hashCloseRoundAuth,
  hashCreateRoundAuth,
  hashMarkReadyAuth,
  hashPlayerAction,
  hashPlayerCashOut,
} from "./messages.ts";
import { recoverAddress } from "./signature.ts";
import {
  CLOSE_ROUND_AUTH,
  CREATE_DRAW_ROUND_AUTH,
  CREATE_ROUND_AUTH,
  MARK_READY_AUTH,
  PLAYER_ACTION,
  PLAYER_CASH_OUT,
  RECORD_DRAW_AUTH,
} from "./types.ts";

const player = playerSigner();
const engine = engineSigner();

const STRUCTS = {
  PlayerAction: PLAYER_ACTION,
  PlayerCashOut: PLAYER_CASH_OUT,
  CreateRoundAuth: CREATE_ROUND_AUTH,
  MarkReadyAuth: MARK_READY_AUTH,
  CloseRoundAuth: CLOSE_ROUND_AUTH,
  CreateDrawRoundAuth: CREATE_DRAW_ROUND_AUTH,
  RecordDrawAuth: RECORD_DRAW_AUTH,
};

describe("the domain", () => {
  it("reproduces the domain separator", () => {
    expect(separator).toBe(vectors.domain.separator);
  });

  it("reproduces the draw registry's domain separator", () => {
    expect(drawSeparator).toBe(vectors.draw.separator);
  });

  it("accepts the chain id as a decimal string", () => {
    expect(domainSeparator({ ...domain, chainId: "31337" })).toBe(
      vectors.domain.separator,
    );
  });
});

describe("the type hashes", () => {
  it("covers every type of the vector file", () => {
    expect(Object.keys(STRUCTS).toSorted()).toEqual(
      Object.keys(vectors.types).toSorted(),
    );
  });

  it.each(Object.entries(STRUCTS))("reproduces %s", (name, struct) => {
    expect(encodeType(struct)).toBe(vectors.types[name]?.encodeType);
    expect(typeHash(struct)).toBe(vectors.types[name]?.typeHash);
  });
});

describe("the worked round's player actions", () => {
  it("starts the chain at the ready hash with sequence 1", () => {
    expect(actionVector(0).previous).toBe(vectors.ready);
    expect(actionVector(0).sequence).toBe(1);
  });

  it.each(
    vectors.actions.slice(1).map((vector, i) => [i + 1, vector] as const),
  )("links action %i to the T before it", (index, vector) => {
    expect(vector.previous).toBe(actionVector(index - 1).structHash);
    expect(vector.sequence).toBe(index + 1);
  });

  it.each(vectors.actions.map((vector, index) => [index, vector] as const))(
    "reproduces action %i: struct hash, digest, signature, signer",
    (_index, vector) => {
      const structHash = structHashOf(vector);
      expect(structHash).toBe(vector.structHash);
      const digest = typedDataDigest(separator, structHash);
      expect(digest).toBe(vector.digest);
      expect(player.sign(digest)).toBe(vector.signature);
      expect(recoverAddress(digest, vector.signature)).toBe(vector.signer);
    },
  );

  it("derives the action key's address from the player key", () => {
    expect(player.address).toBe(vectors.actionKey);
  });

  it("does not verify an action whose previous was changed", () => {
    const vector = actionVector(1);
    const changed = hashPlayerAction({
      ...messageOf(vector),
      previous: vectors.ready,
    });
    expect(changed).not.toBe(vector.structHash);
    const digest = typedDataDigest(separator, changed);
    expect(recoverAddress(digest, vector.signature)).not.toBe(vector.signer);
  });

  it("gives a cash-out a different hash from an action of the same fields", () => {
    const vector = actionVector(0);
    expect(hashPlayerCashOut(messageOf(vector))).not.toBe(vector.structHash);
  });
});

describe("the registry authorizations", () => {
  it("reproduces CreateRoundAuth", () => {
    const vector = vectors.createRoundAuth;
    const digest = typedDataDigest(
      separator,
      hashCreateRoundAuth({
        created: vectors.created,
        prepareWindow: vector.prepareWindow,
        expiry: vector.expiry,
      }),
    );
    expect(digest).toBe(vector.digest);
    expect(engine.sign(digest)).toBe(vector.signature);
    expect(recoverAddress(digest, vector.signature)).toBe(vector.signer);
  });

  it("reproduces MarkReadyAuth", () => {
    const vector = vectors.markReadyAuth;
    expect(vector.roundId).toBe(vectors.roundId);
    expect(vector.seedHash).toBe(vectors.seedHash);
    const digest = typedDataDigest(
      separator,
      hashMarkReadyAuth({
        roundId: vector.roundId,
        seedHash: vector.seedHash,
        expiry: BigInt(vector.expiry),
      }),
    );
    expect(digest).toBe(vector.digest);
    expect(engine.sign(digest)).toBe(vector.signature);
    expect(recoverAddress(digest, vector.signature)).toBe(vector.signer);
  });

  it("reproduces CloseRoundAuth, whose last action hash is the cash-out's T", () => {
    const vector = vectors.closeRoundAuth;
    expect(vector.lastActionHash).toBe(vectors.actions.at(-1)?.structHash);
    const digest = typedDataDigest(
      separator,
      hashCloseRoundAuth({
        roundId: vector.roundId,
        payoutAmount: vector.payoutAmount,
        expired: vector.expired,
        resultHash: vector.resultHash,
        lastActionHash: vector.lastActionHash,
        expiry: vector.expiry,
      }),
    );
    expect(digest).toBe(vector.digest);
    expect(engine.sign(digest)).toBe(vector.signature);
    expect(recoverAddress(digest, vector.signature)).toBe(vector.signer);
  });

  it("reproduces the draw registry's CreateDrawRoundAuth", () => {
    const vector = vectors.draw.createDrawRoundAuth;
    const structHash = hashStruct(CREATE_DRAW_ROUND_AUTH, {
      created: vectors.draw.created,
      drawWindow: vector.drawWindow,
      expiry: vector.expiry,
    });
    expect(structHash).toBe(vector.structHash);
    const digest = typedDataDigest(drawSeparator, structHash);
    expect(digest).toBe(vector.digest);
    expect(engine.sign(digest)).toBe(vector.signature);
    expect(recoverAddress(digest, vector.signature)).toBe(vector.signer);
  });

  it("reproduces the draw registry's RecordDrawAuth", () => {
    const vector = vectors.draw.recordDrawAuth;
    const structHash = hashStruct(RECORD_DRAW_AUTH, {
      closed: vectors.draw.closed,
      expiry: vector.expiry,
    });
    expect(structHash).toBe(vector.structHash);
    const digest = typedDataDigest(drawSeparator, structHash);
    expect(digest).toBe(vector.digest);
    expect(engine.sign(digest)).toBe(vector.signature);
    expect(recoverAddress(digest, vector.signature)).toBe(vector.signer);
  });
});
