// T-47: the notice the page signs (SP-7): from its own copy, by id; an
// `approved` one, or a `pending` one with the page's own flag; never a
// `retired` one, an unknown id, or text from a list the reader refuses.

import { keyDelegationNotices } from "@intraverse/se-client-contracts";
import { noticeHash } from "@intraverse/se-client-signing";
import { describe, expect, it } from "vitest";

import { findNotice } from "./notice.ts";

const entry = (id: string, text: string, status: string) => ({
  id,
  text,
  keccak256: noticeHash(text),
  status,
});

const LIST = {
  version: 1,
  notices: [
    entry("approved-1", "I approve this key.", "approved"),
    entry("pending-1", "I may approve this key.", "pending"),
    entry("retired-1", "I approved this key once.", "retired"),
  ],
};

describe("findNotice (SP-7)", () => {
  it("finds an approved notice with or without the flag", () => {
    for (const flag of [false, true]) {
      expect(findNotice("approved-1", flag, LIST)).toEqual({
        id: "approved-1",
        text: "I approve this key.",
        status: "approved",
      });
    }
  });

  it("finds a pending notice only with the flag", () => {
    expect(findNotice("pending-1", true, LIST)).toEqual({
      id: "pending-1",
      text: "I may approve this key.",
      status: "pending",
    });
    expect(findNotice("pending-1", false, LIST)).toBeUndefined();
  });

  it("never finds a retired notice or an unknown id", () => {
    expect(findNotice("retired-1", true, LIST)).toBeUndefined();
    expect(findNotice("unknown-1", true, LIST)).toBeUndefined();
  });

  it("finds nothing in a list the reader refuses (fail closed)", () => {
    const tampered = {
      ...LIST,
      notices: [{ ...LIST.notices[0], text: "Something else." }],
    };
    expect(findNotice("approved-1", true, tampered)).toBeUndefined();
    expect(findNotice("approved-1", true, { version: 2 })).toBeUndefined();
  });

  it("reads the vendored list by default: its pending notice with the flag", () => {
    const vendored = keyDelegationNotices as {
      readonly notices: readonly {
        readonly id: string;
        readonly text: string;
      }[];
    };
    const first = vendored.notices[0] as {
      readonly id: string;
      readonly text: string;
    };
    expect(findNotice(first.id, true)?.text).toBe(first.text);
    expect(findNotice(first.id, false)).toBeUndefined();
  });
});
