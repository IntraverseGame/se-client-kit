// T-8: W-26's checks 1 to 5, each failing with its reason, in order. A round
// that needs a signed change is issued by a seeded registry key
// (fixtures/round-auth.ts); an unsigned change is made after signing.

import { describe, expect, it } from "vitest";

import {
  checkCreateRoundAuth,
  checkReady,
  type StartRequest,
} from "./create-round-auth.ts";
import {
  asStarting,
  configFor,
  issueRound,
  type IssueOptions,
  ROUND_DOMAIN,
  ROUND_REQUEST,
  ROUND_SIGNER,
  ROUND_SOURCE,
  roundConfig,
  vendoredRound,
} from "./fixtures/round-auth.ts";
import {
  checked,
  HASH,
  refused,
  reread,
  unvalidated,
} from "./fixtures/round-edits.ts";
import {
  OTHER_ROUND_ID,
  snapshot as golden,
  validated,
  vectorInput,
} from "./fixtures/vectors.ts";

describe("a good createRoundAuth", () => {
  it("passes checks 1 to 4 and 5, and T_0 is the readyHash", () => {
    const round = issueRound();
    const auth = checkCreateRoundAuth(
      round.config,
      ROUND_REQUEST,
      round.snapshot,
    );
    expect(auth).toMatchObject({ status: "passed", created: round.created });
    expect(checkReady(round.created, round.snapshot)).toEqual({
      status: "settled",
      initial: round.initial,
    });
  });

  it("passes with a past expiry: no clock is read", () => {
    expect(checked({ before: p => (p.auth["expiry"] = "1") }).status).toBe(
      "passed",
    );
  });

  it("compares the action key without case", () => {
    const request = {
      ...ROUND_REQUEST,
      actionKey: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    } as const;
    expect(checked({}, request).status).toBe("passed");
  });
});

describe("check 1, present (missing)", () => {
  it("waits on a starting Snapshot that has no proofs yet", () => {
    const starting = vendoredRound(p => {
      asStarting(p);
      delete p.input["proofs"];
    });
    expect(
      checkCreateRoundAuth(roundConfig(), ROUND_REQUEST, starting),
    ).toEqual({ status: "waiting" });
  });

  it("refuses a Snapshot whose proofs carry no createRoundAuth", () => {
    const input = vectorInput("valid", "book-playback-resolving-placeholder");
    const book = validated(input);
    expect(book.proofs?.createRoundAuth).toBeUndefined();
    expect(checkCreateRoundAuth(roundConfig(), ROUND_REQUEST, book)).toEqual(
      refused("missing"),
    );
  });

  it("refuses, failing closed, a config Snapshot that lost it", () => {
    // The validator refuses this document; the check does not rely on that.
    const snapshot = unvalidated(vendoredRound(), p => {
      delete p.proofs["createRoundAuth"];
    });
    expect(
      checkCreateRoundAuth(roundConfig(), ROUND_REQUEST, snapshot),
    ).toEqual(refused("missing"));
  });

  it("refuses an idle Snapshot", () => {
    expect(
      checkCreateRoundAuth(roundConfig(), ROUND_REQUEST, golden("idle")),
    ).toEqual(refused("missing"));
  });
});

describe("check 2, pinned values (pinned-mismatch)", () => {
  const snapshot = vendoredRound();
  const pinned = { ...ROUND_DOMAIN, signer: ROUND_SIGNER };

  it.each([
    ["the domain's chain id", { ...pinned, chainId: 1 }],
    [
      "the verifying contract",
      { ...pinned, verifyingContract: `0x${"d5".repeat(20)}` },
    ],
    ["the signer", { ...pinned, signer: `0x${"5e".repeat(20)}` }],
  ])("refuses another %s than the pinned one", (_, values) => {
    expect(
      checkCreateRoundAuth(configFor(values), ROUND_REQUEST, snapshot),
    ).toEqual(refused("pinned-mismatch"));
  });

  it("comes before the cross-field check", () => {
    const config = configFor({ ...pinned, chainId: 1 });
    const request = { ...ROUND_REQUEST, bet: { value: "1", unit: "EUR" } };
    expect(checkCreateRoundAuth(config, request, snapshot)).toEqual(
      refused("pinned-mismatch"),
    );
  });
});

describe("check 3, cross-field (cross-field)", () => {
  it.each<[string, IssueOptions]>([
    ["a wrong round", { after: p => (p.input["roundId"] = OTHER_ROUND_ID) }],
    [
      "a round secret hash other than the randomness proof's",
      { before: p => (p.newRound["roundSecretHash"] = HASH) },
    ],
    [
      "a randomnessTarget not recomputed from the proof",
      { after: p => (p.newRound["randomnessTarget"] = HASH) },
    ],
    [
      "a block number the target was not computed from",
      { after: p => (p.randomnessProof["blockNumber"] = 21000124) },
    ],
    [
      "a bet other than the one sent",
      { before: p => (p.newRound["betAmount"] = "101") },
    ],
    [
      "a currency other than the one sent",
      { before: p => (p.newRound["currency"] = "USD") },
    ],
    [
      "another action key than the shell's",
      {
        before: p => (p.newRound["actionKey"] = `0x${"70".repeat(20)}`),
      },
    ],
  ])("refuses %s", (_, options) => {
    expect(checked(options)).toEqual(refused("cross-field"));
  });

  it.each<[string, StartRequest["bet"]]>([
    ["a bet value that is not base units", { value: "1.00", unit: "EUR" }],
    ["a bet with a leading zero", { value: "0100", unit: "EUR" }],
    ["a unit that is not ASCII", { value: "100", unit: "€UR" }],
    ["a unit longer than 32 bytes", { value: "100", unit: "E".repeat(33) }],
  ])("refuses %s in the request sent", (_, bet) => {
    expect(checked({}, { ...ROUND_REQUEST, bet })).toEqual(
      refused("cross-field"),
    );
  });

  // The `signature/` vectors do not pin the entropy chain id, so the wrong
  // chain is tested here: the round is signed consistently with its own
  // `entropyChainId`, and only the configuration's pin differs.
  describe("the entropy chain", () => {
    it("refuses a round whose entropyChainId is not the source's pinned one", () => {
      expect(checked({ chains: { [ROUND_SOURCE]: 8453 } })).toEqual(
        refused("cross-field"),
      );
    });

    it("refuses a round re-signed on another chain than the pinned one", () => {
      const options: IssueOptions = {
        before: p => (p.auth["entropyChainId"] = 8453),
      };
      expect(checked(options)).toEqual(refused("cross-field"));
      expect(
        checked({ ...options, chains: { [ROUND_SOURCE]: 8453 } }).status,
      ).toBe("passed");
    });

    it("refuses a round whose entropyChainId changed after signing", () => {
      const options: IssueOptions = {
        after: p => (p.auth["entropyChainId"] = 8453),
        chains: { [ROUND_SOURCE]: 8453 },
      };
      // It equals the pin, but the target was computed with chain 1.
      expect(checked(options)).toEqual(refused("cross-field"));
    });

    it("refuses a source the configuration does not list", () => {
      expect(checked({ chains: { base: 1 } })).toEqual(refused("cross-field"));
    });

    it("refuses a source too long to encode as bytes32", () => {
      const source = `e${":".repeat(32)}`;
      const round = issueRound({ chains: { [source]: 1 } });
      const snapshot = reread(round.snapshot, p => {
        p.randomnessProof["source"] = source;
      });
      expect(
        checkCreateRoundAuth(round.config, ROUND_REQUEST, snapshot),
      ).toEqual(refused("cross-field"));
    });
  });

  it("comes before the signature check", () => {
    expect(
      checked({
        after: p => {
          p.newRound["gameId"] = 2;
          p.input["roundId"] = OTHER_ROUND_ID;
        },
      }),
    ).toEqual(refused("cross-field"));
  });
});
