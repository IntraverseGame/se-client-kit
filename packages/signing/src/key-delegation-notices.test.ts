import { keyDelegationNotices } from "@intraverse/se-client-contracts";
import { describe, expect, it } from "vitest";

import { caught, codeOf } from "./fixtures/helpers.ts";
import { record } from "./fixtures/vectors.ts";
import { readKeyDelegationNotices } from "./key-delegation-notices.ts";
import { noticeHash } from "./key-delegation.ts";

type Entry = Record<string, unknown>;

/** A fresh copy of the vendored document, to change one thing in. */
const vendored = (): { version: unknown; notices: Entry[] } =>
  JSON.parse(JSON.stringify(keyDelegationNotices)) as {
    version: unknown;
    notices: Entry[];
  };

const firstOf = (document: { notices: Entry[] }): Entry => {
  const [first] = document.notices;
  if (first === undefined) throw new Error("the vendored list is empty");
  return first;
};

const vendoredEntry = (): Entry => firstOf(vendored());

/** An entry with its own text and that text's hash. */
const entryWith = (id: string, text: string, status = "pending"): Entry => ({
  id,
  text,
  keccak256: noticeHash(text),
  status,
});

/** The vendored document with its entry changed by `change`. */
const withEntry = (change: (entry: Entry) => void): unknown => {
  const document = vendored();
  change(firstOf(document));
  return document;
};

/** The vendored document with `text` in its entry, hashed. */
const withText = (text: string): unknown =>
  withEntry(entry => {
    entry["text"] = text;
    entry["keccak256"] = noticeHash(text);
  });

describe("readKeyDelegationNotices", () => {
  it("reads the vendored list: one pending draft, its hash checked", () => {
    const entry = record(vendoredEntry(), "notice");
    expect(readKeyDelegationNotices(keyDelegationNotices)).toEqual([
      {
        id: "en-draft-1",
        text: entry["text"],
        noticeHash:
          "0x71508a4d7d3e376ef39a9d928b6ce49120f86f99de1987add45b405f8b5ba777",
        status: "pending",
      },
    ]);
  });

  it("returns a frozen list of frozen entries", () => {
    const notices = readKeyDelegationNotices(keyDelegationNotices);
    expect(Object.isFrozen(notices)).toBe(true);
    expect(notices.every(notice => Object.isFrozen(notice))).toBe(true);
  });

  it("keeps the list's order and reads every status", () => {
    const document = vendored();
    document.notices.push(
      entryWith("en-2", "Second notice.", "approved"),
      entryWith("en-3", "Third notice.", "retired"),
    );
    expect(
      readKeyDelegationNotices(document).map(notice => [
        notice.id,
        notice.status,
      ]),
    ).toEqual([
      ["en-draft-1", "pending"],
      ["en-2", "approved"],
      ["en-3", "retired"],
    ]);
  });

  it("reads an empty list", () => {
    expect(readKeyDelegationNotices({ version: 1, notices: [] })).toEqual([]);
  });

  it.each([
    ["one byte", "a"],
    ["512 bytes", "a".repeat(512)],
    ["512 bytes of two-byte characters", "\u00E9".repeat(256)],
    ["a character outside the BMP", "notice \u{1F3B2}"],
  ])("accepts a text of %s", (_name, text) => {
    expect(readKeyDelegationNotices(withText(text))[0]?.text).toBe(text);
  });

  const refused: readonly (readonly [string, unknown])[] = [
    ["undefined", undefined],
    ["null", null],
    ["a list", [vendored()]],
    ["a string", JSON.stringify(keyDelegationNotices)],
    [
      "an object that is not plain",
      Object.assign(Object.create({ inherited: true }) as object, vendored()),
    ],
    ["a document with another key", { ...vendored(), extra: 1 }],
    ["a document without version", { notices: vendored().notices }],
    ["version 2", { ...vendored(), version: 2 }],
    ["version as text", { ...vendored(), version: "1" }],
    ["notices that are not a list", { version: 1, notices: {} }],
    ["an entry that is not an object", { version: 1, notices: ["x"] }],
    [
      "an entry with another key",
      withEntry(entry => {
        entry["extra"] = 1;
      }),
    ],
    [
      "an entry without status",
      withEntry(entry => {
        delete entry["status"];
      }),
    ],
    [
      "an empty id",
      withEntry(entry => {
        entry["id"] = "";
      }),
    ],
    [
      "an id in uppercase",
      withEntry(entry => {
        entry["id"] = "EN-DRAFT-1";
      }),
    ],
    [
      "an id of 65 characters",
      withEntry(entry => {
        entry["id"] = "a".repeat(65);
      }),
    ],
    ["an empty text", withText("")],
    ["a text of 513 bytes", withText("a".repeat(513))],
    ["a text of 514 bytes in 257 characters", withText("\u00E9".repeat(257))],
    ["a text with a line feed", withText("a\nb")],
    ["a text with a tab", withText("a\tb")],
    ["a text with a zero-width space", withText("a\u200Bb")],
    ["a text with a bidi override", withText("a\u202Eb")],
    ["a text with a byte-order mark", withText("\uFEFFnotice")],
    ["a text with a line separator", withText("a\u2028b")],
    ["a text with a paragraph separator", withText("a\u2029b")],
    [
      "a text with a lone surrogate",
      withEntry(entry => {
        entry["text"] = "notice \uD800";
      }),
    ],
    [
      "a text that is not a string",
      withEntry(entry => {
        entry["text"] = 1;
      }),
    ],
    [
      "a hash in uppercase",
      withEntry(entry => {
        entry["keccak256"] =
          `0x${String(entry["keccak256"]).slice(2).toUpperCase()}`;
      }),
    ],
    [
      "a hash that is not the text's",
      withEntry(entry => {
        entry["keccak256"] = noticeHash("another text");
      }),
    ],
    [
      "a hash without 0x",
      withEntry(entry => {
        entry["keccak256"] = String(entry["keccak256"]).slice(2);
      }),
    ],
    [
      "an unknown status",
      withEntry(entry => {
        entry["status"] = "draft";
      }),
    ],
    [
      "a repeated id",
      {
        version: 1,
        notices: [entryWith("en-1", "One."), entryWith("en-1", "Two.")],
      },
    ],
    [
      "a repeated hash",
      {
        version: 1,
        notices: [entryWith("en-1", "One."), entryWith("en-2", "One.")],
      },
    ],
  ];

  it.each(refused)("refuses %s", (_name, given) => {
    expect(codeOf(() => readKeyDelegationNotices(given))).toBe("invalid-input");
  });

  it("names the reason, never a value", () => {
    const error = caught(() => readKeyDelegationNotices(withText("a\nb")));
    expect(String(error)).toBe(
      "SigningError: a value does not fit its field type",
    );
    expect(JSON.stringify(error)).not.toContain("a\\nb");
  });
});
