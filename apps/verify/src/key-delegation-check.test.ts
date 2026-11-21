// VT-16: check 9, the key delegation (V-22). The vendored
// `valid/coinflip-active-key-delegation` vector's object, read from a body as
// the page reads it, passes items 1 to 5; each item fails on its own change; a
// signature that recovers but is not the published canonical form fails; a
// value `signing` refuses is a mismatch naming the field, never an exception;
// a notice not in the list passes with item 5 not checked; a retired notice
// still verifies. The `key-delegation/v1` vectors replay through the check in
// `key-delegation-vectors.test.ts`.
// No clock is read: the vector's expiry is in the past, and nothing compares
// it with the time.

import { keyDelegationVectors } from "@intraverse/se-client-contracts/testing";
import type {
  KeyDelegationNotice,
  NoticeStatus,
} from "@intraverse/se-client-signing";
import { describe, expect, it } from "vitest";

import { failing, read, run } from "./fixtures/delegation-check.ts";
import { publishedNotices } from "./key-delegation-check.ts";
import { MESSAGES as M } from "./messages.ts";
import type { KeyDelegationEvidence } from "./round-evidence.ts";

type Json = Record<string, unknown>;

/** `hex` with its last byte changed. */
const flipLast = (hex: string): string =>
  `${hex.slice(0, -2)}${hex.endsWith("00") ? "01" : "00"}`;

const listAs = (status: NoticeStatus): readonly KeyDelegationNotice[] =>
  publishedNotices().map(notice => ({
    id: notice.id,
    text: notice.text,
    noticeHash: notice.noticeHash,
    status,
  }));

const EXPIRY_AFTER = M["delegation.expiryAfter"];

describe("the vendored vector's delegation (V-22)", () => {
  it("passes items 1 to 5, `en-draft-1` pending in the list", () => {
    const result = run();
    expect(result.id).toBe(9);
    expect(result.title).toBe("Wallet link");
    expect(result.status).toBe("matches");
    expect(result.comparisons.map(c => c.name)).toEqual([
      "noticeHash",
      "wallet",
      "signature",
      "actionKey",
      EXPIRY_AFTER,
      "noticeId",
      "notice",
    ]);
    expect(result.note).toBeUndefined();
    expect(result.delegation).toEqual({
      wallet: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
      notice: read().d.notice,
      noticeId: "en-draft-1",
      listed: "pending",
      expiry: 1_795_000_000,
      acceptedAt: 1_794_990_000,
      unchecked: [],
    });
  });
});

describe("each item fails on its own change", () => {
  const { d, round } = read();
  it.each<[string, Partial<KeyDelegationEvidence>, readonly string[]]>([
    // Item 1, and item 5's text: the hash still finds the listed notice.
    [
      "a changed byte of `notice`",
      { notice: `${d.notice.slice(0, -1)}!` },
      ["noticeHash", "notice"],
    ],
    // Items 1 and 2: the digest is over the published hash, so the signature
    // (canonical as it was) recovers another wallet; the list does not hold
    // the hash, so item 5 is not checked.
    [
      "a changed `noticeHash`",
      { noticeHash: flipLast(d.noticeHash) },
      ["noticeHash", "wallet"],
    ],
    ["a changed `sessionId`", { sessionId: flipLast(d.sessionId) }, ["wallet"]],
    ["a changed `expiry`", { expiry: d.expiry + 1 }, ["wallet"]],
    ["a changed `wallet`", { wallet: flipLast(d.wallet) }, ["wallet"]],
    [
      "`expiry` equal to `acceptedAt`",
      { acceptedAt: d.expiry },
      [EXPIRY_AFTER],
    ],
    [
      "`acceptedAt` after `expiry`",
      { acceptedAt: d.expiry + 1 },
      [EXPIRY_AFTER],
    ],
    [
      "a `noticeId` other than the list's",
      { noticeId: "en-draft-2" },
      ["noticeId"],
    ],
  ])("%s", (_, change, names) => {
    const result = run(change);
    expect(result.status).toBe("mismatch");
    expect(failing(result)).toEqual(names);
  });

  it("an `actionKey` other than the one `newRound` names", () => {
    const other = { ...round, actionKey: `0x${"15".repeat(20)}` };
    const result = run({}, { newRound: other });
    expect(result.status).toBe("mismatch");
    expect(failing(result)).toEqual(["actionKey"]);
    const key = result.comparisons.find(c => c.name === "actionKey");
    expect(key?.recomputed).toBe(other.actionKey);
    expect(key?.evidence).toBe(d.actionKey);
  });

  it("a changed `actionKey` fails item 3 and the signer", () => {
    const result = run({ actionKey: `0x${"15".repeat(20)}` });
    expect(failing(result)).toEqual(["wallet", "actionKey"]);
  });

  it("a changed byte of `signature` recovers another wallet, or none", () => {
    // The first byte of `r`: still a signature, of another wallet or none.
    const result = run({ signature: `0x00${d.signature.slice(4)}` });
    expect(result.status).toBe("mismatch");
    expect(failing(result)).toContain("wallet");
  });
});

/** The signature of the refused `key-delegation/v1` vector `name`. */
const refusedSignature = (name: string): string => {
  const vectors = keyDelegationVectors.v1 as {
    refused: readonly { name: string; keyDelegation: Json }[];
  };
  const vector = vectors.refused.find(r => r.name === name);
  return String(vector?.keyDelegation["signature"]);
};

describe("a signature that is not the published canonical form", () => {
  it.each(["high-s twin", "v as 0"])(
    "the vector's %s recovers the wallet and fails the signature by bytes",
    name => {
      const result = run({ signature: refusedSignature(name) });
      expect(result.status).toBe("mismatch");
      expect(failing(result)).toEqual(["signature"]);
      const signature = result.comparisons.find(c => c.name === "signature");
      expect(signature?.recomputed).toBe(read().d.signature);
      expect(signature?.evidence).toBe(refusedSignature(name));
    },
  );

  it("the vector's v as 1 recovers another wallet, and is not canonical", () => {
    const result = run({ signature: refusedSignature("v as 1") });
    expect(failing(result)).toEqual(["wallet", "signature"]);
  });
});

/** The comparisons a refused signature leaves with nothing recomputed. */
const REFUSED_SIGNATURE = ["wallet", "signature"];
/** The comparisons a refused notice leaves with nothing recomputed. */
const REFUSED_NOTICE = ["noticeHash"];

describe("a value `signing` refuses is a mismatch naming the field", () => {
  const { d } = read();
  const one = M["delegation.refused"];
  const both = M["delegation.refusedMany"];
  it.each<[string, Partial<KeyDelegationEvidence>, string, readonly string[]]>([
    [
      "a `v` of 29",
      { signature: `${d.signature.slice(0, -2)}1d` },
      `${one} (signature).`,
      REFUSED_SIGNATURE,
    ],
    [
      "an `r` of zero",
      { signature: `0x${"00".repeat(32)}${d.signature.slice(66)}` },
      `${one} (signature).`,
      REFUSED_SIGNATURE,
    ],
    [
      "a notice with a lone surrogate",
      { notice: `${d.notice}\uD800` },
      `${one} (notice).`,
      REFUSED_NOTICE,
    ],
    [
      "both: a lone surrogate and a `v` of 29",
      {
        notice: `${d.notice}\uD800`,
        signature: `${d.signature.slice(0, -2)}1d`,
      },
      `${both} (notice, signature).`,
      [...REFUSED_NOTICE, ...REFUSED_SIGNATURE],
    ],
  ])("%s", (_, change, note, names) => {
    const result = run(change);
    expect(result.status).toBe("mismatch");
    expect(result.note).toBe(note);
    const refused = result.comparisons.filter(c => c.recomputed === undefined);
    expect(refused.map(c => c.name)).toEqual(names);
  });
});

describe("item 5: the notice in this page's list, looked up by hash", () => {
  it("a notice not in the list passes, with item 5 not checked (never V-7)", () => {
    const result = run({}, { notices: [] });
    expect(result.status).toBe("matches");
    expect(result.comparisons.map(c => c.name)).not.toContain("noticeId");
    expect(result.delegation?.listed).toBe("unlisted");
    expect(result.delegation?.unchecked).toEqual([
      M["delegation.unlistedItem"],
    ]);
  });

  it.each<NoticeStatus>(["retired", "approved", "pending"])(
    "a notice the list holds as %s still verifies, its status shown",
    status => {
      const result = run({}, { notices: listAs(status) });
      expect(result.status).toBe("matches");
      expect(result.delegation?.listed).toBe(status);
    },
  );

  it("reads the page's own list from `contracts`' runtime entry", () => {
    expect(publishedNotices().map(n => [n.id, n.status])).toEqual([
      ["en-draft-1", "pending"],
    ]);
  });
});

describe("item 3 before the round is bound (A-2)", () => {
  it("waits on a round that has not ended, the other items still checked", () => {
    const result = run({}, { newRound: undefined, ended: false });
    expect(result.status).toBe("matches");
    expect(result.comparisons.map(c => c.name)).not.toContain("actionKey");
    expect(result.delegation?.unchecked).toEqual([M["delegation.waitsItem"]]);
  });

  it("fails on an ended round", () => {
    const result = run({}, { newRound: undefined, ended: true });
    expect(result.status).toBe("mismatch");
    expect(failing(result)).toEqual(["actionKey"]);
  });
});
