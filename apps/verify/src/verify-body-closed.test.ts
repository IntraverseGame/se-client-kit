// VT-16 and VT-3: the body's reading is closed to the vendored verify API
// document since slice S7 of #220 (The evidence). Every object of the document
// is closed, so a field it does not define fails the body (V-10) at any level;
// so does a check name outside its list. A body with both `book` and
// `keyDelegation` fails (a book round cannot carry a delegation), and so does
// a malformed `keyDelegation` (V-22).

import { describe, expect, it, vi } from "vitest";

import { bookBody } from "./fixtures/book-body.ts";
import {
  delegatedBody,
  vectorDelegation,
  withField,
  wonBody,
} from "./fixtures/verify-body.ts";
import { parseEvidence } from "./verify-body.ts";
import { CHECK_NAMES } from "./verify-readers.ts";

type Json = Record<string, unknown>;

const EXTRA = "verified";

/**
 * A deep copy of `base` with an unknown field set on the object at `path`
 * (deep, as a fixture may share an object between its bodies).
 */
const withExtra = (path: string, base: () => Json): Json => {
  const copy = structuredClone(base());
  let target: unknown = copy;
  for (const key of path === "" ? [] : path.split(".")) {
    target = (target as Json)[key];
  }
  (target as Json)[EXTRA] = true;
  return copy;
};

const ACTION = {
  sequence: 1,
  kind: "action",
  action: "pick",
  path: [1],
  previous: `0x${"ab".repeat(32)}`,
  signature: `0x${"ab".repeat(65)}`,
};
const withAction = (): Json => withField("actions", [{ ...ACTION }]);
const withCheck = (): Json =>
  withField("checks", [{ name: "key_delegation", result: "passed" }]);

describe("an unknown field fails the body at every level (V-10)", () => {
  it("reads each base body without the unknown field", async () => {
    expect(parseEvidence(delegatedBody())).toBeDefined();
    expect(parseEvidence(withAction())).toBeDefined();
    expect(parseEvidence(withCheck())).toBeDefined();
    expect(parseEvidence(await bookBody())).toBeDefined();
  });

  it.each<[string, () => Json]>([
    ["", wonBody],
    ["kernel", wonBody],
    ["game", wonBody],
    ["game.terms", wonBody],
    ["game.terms.nodes.0", wonBody],
    ["bet", wonBody],
    ["payout", wonBody],
    ["commitment", wonBody],
    ["commitment.createRoundAuth", wonBody],
    ["entropy", wonBody],
    ["reveal", wonBody],
    ["recomputed", wonBody],
    ["recomputed.steps.0", wonBody],
    ["actions.0", withAction],
    ["checks.0", withCheck],
    ["keyDelegation", delegatedBody],
    ["keyDelegation.domain", delegatedBody],
  ])("in `%s`", (path, base) => {
    expect(parseEvidence(withExtra(path, base))).toBeUndefined();
  });

  it.each(["book", "book.drawn", "book.table.0", "recomputed.draw"])(
    "in a book round's `%s`",
    async path => {
      const body = await bookBody();
      expect(parseEvidence(withExtra(path, () => body))).toBeUndefined();
    },
  );
});

describe("the check names (V-10)", () => {
  it.each(CHECK_NAMES)("accepts the document's `%s`", name => {
    expect(
      parseEvidence(withField("checks", [{ name, result: "not_applicable" }])),
    ).toBeDefined();
  });

  it.each(["wallet_link", "KEY_DELEGATION", "", "key-delegation"])(
    "refuses the name `%s`",
    name => {
      expect(
        parseEvidence(withField("checks", [{ name, result: "passed" }])),
      ).toBeUndefined();
    },
  );
});

describe("a book round with a key delegation (V-10, V-22)", () => {
  it("fails the body", async () => {
    const body = await bookBody();
    expect(parseEvidence(body)).toBeDefined();
    expect(
      parseEvidence({ ...body, keyDelegation: vectorDelegation() }),
    ).toBeUndefined();
  });
});

/** The delegated body with `keyDelegation.<field>` set to `value`. */
const set = (field: string, value: unknown): Json =>
  withField(`keyDelegation.${field}`, value, delegatedBody);
/** The delegated body without `keyDelegation.<field>`. */
const without = (field: string): Json => {
  const copy = delegatedBody();
  Reflect.deleteProperty(copy["keyDelegation"] as Json, field);
  return copy;
};
const upper = (hex: string): string => `0x${hex.slice(2).toUpperCase()}`;

describe("a malformed `keyDelegation` fails the body (V-10)", () => {
  const delegation = vectorDelegation();

  it.each([
    "wallet",
    "actionKey",
    "sessionId",
    "expiry",
    "noticeId",
    "noticeHash",
    "notice",
    "signature",
    "domain",
    "acceptedAt",
  ])("without `%s`", field => {
    expect(parseEvidence(without(field))).toBeUndefined();
  });

  it.each<[string, Json]>([
    ["as null", withField("keyDelegation", null, delegatedBody)],
    ["as an empty object", withField("keyDelegation", {}, delegatedBody)],
    ["as a list", withField("keyDelegation", [], delegatedBody)],
    [
      "a wallet in upper case",
      set("wallet", upper(String(delegation["wallet"]))),
    ],
    ["an action key of 19 bytes", set("actionKey", `0x${"90".repeat(19)}`)],
    ["a session id of 16 bytes", set("sessionId", `0x${"01".repeat(16)}`)],
    ["an expiry of 0", set("expiry", 0)],
    ["a fractional expiry", set("expiry", 1_795_000_000.5)],
    ["an expiry as text", set("expiry", "1795000000")],
    ["an expiry past 2^53 - 1", set("expiry", 2 ** 53)],
    ["an acceptedAt of 0", set("acceptedAt", 0)],
    ["an acceptedAt as text", set("acceptedAt", "1794990000")],
    ["a notice id in upper case", set("noticeId", "EN-DRAFT-1")],
    ["a notice id of 65 characters", set("noticeId", "a".repeat(65))],
    ["an empty notice id", set("noticeId", "")],
    ["a notice hash of 31 bytes", set("noticeHash", `0x${"71".repeat(31)}`)],
    ["an empty notice", set("notice", "")],
    ["a notice of 513 characters", set("notice", "a".repeat(513))],
    // These two would also be refused without the length guard; the guard's
    // own test is below.
    [
      "a notice of 1,025 UTF-16 units (513 characters)",
      set("notice", "\u{1F600}".repeat(512) + "a"),
    ],
    ["a notice of a million characters", set("notice", "a".repeat(1_000_000))],
    ["a notice as a number", set("notice", 7)],
    ["a signature of 64 bytes", set("signature", `0x${"9a".repeat(64)}`)],
    [
      "a signature in upper case",
      set("signature", upper(String(delegation["signature"]))),
    ],
    [
      "another domain name",
      set("domain", { name: "SuperEngine", version: "1" }),
    ],
    [
      "another domain version",
      set("domain", { name: "SuperEngine KeyDelegation", version: "2" }),
    ],
    [
      "a domain with a chain id",
      set("domain", {
        name: "SuperEngine KeyDelegation",
        version: "1",
        chainId: 1,
      }),
    ],
  ])("%s", (_, json) => {
    expect(parseEvidence(json)).toBeUndefined();
  });

  it("counts the notice's length in characters, not UTF-16 units", () => {
    // 512 characters outside the BMP: 1,024 UTF-16 units, within the limit.
    const wide = "\u{1F600}".repeat(512);
    expect(parseEvidence(set("notice", wide))?.keyDelegation?.notice).toBe(
      wide,
    );
    expect(parseEvidence(set("notice", `${wide}a`))).toBeUndefined();
  });

  it("refuses a notice of more than 1,024 UTF-16 units before splitting it (a performance guard)", () => {
    const long = "a".repeat(1_025);
    const wide = "\u{1F600}".repeat(512);
    const split = vi.spyOn(String.prototype, Symbol.iterator);
    try {
      expect(parseEvidence(set("notice", long))).toBeUndefined();
      expect(split.mock.contexts).not.toContain(long);
      // The control: a notice within 1,024 units is split into code points.
      expect(parseEvidence(set("notice", wide))).toBeDefined();
      expect(split.mock.contexts).toContain(wide);
    } finally {
      split.mockRestore();
    }
  });
});
