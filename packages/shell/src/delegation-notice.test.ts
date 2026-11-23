// T-44's notice choice (W-63): the last `approved` entry in the list's order;
// a `pending` one only with `acceptPendingNotices` and no `approved` entry;
// never a `retired` one; nothing when the reader refuses the list. The
// vendored list's one notice is `pending`.

import { noticeHash } from "@intraverse/se-client-signing";
import { describe, expect, it } from "vitest";

import { chooseNotice, sessionNotice } from "./delegation-notice.ts";
import { ACCEPTED } from "./fixtures/delegation.ts";

type Status = "pending" | "approved" | "retired";

/** A notices document whose entries have these ids and statuses, in order. */
const listOf = (
  ...entries: readonly (readonly [string, Status])[]
): Record<string, unknown> => ({
  version: 1,
  notices: entries.map(([id, status]) => {
    const text = `Notice ${id}.`;
    return { id, text, keccak256: noticeHash(text), status };
  }),
});

const chosen = (
  document: unknown,
  acceptPending: boolean,
): string | undefined => sessionNotice(acceptPending, document)?.id;

describe("the notice offered (W-63)", () => {
  it("is the last approved entry in the list's order", () => {
    const list = listOf(
      ["a", "approved"],
      ["b", "pending"],
      ["c", "approved"],
      ["d", "retired"],
    );
    expect(chosen(list, false)).toBe("c");
    expect(chosen(list, true)).toBe("c");
  });

  it("is the last pending one only with acceptPendingNotices and no approved entry", () => {
    const list = listOf(["a", "pending"], ["b", "retired"], ["c", "pending"]);
    expect(chosen(list, true)).toBe("c");
    expect(chosen(list, false)).toBeUndefined();
  });

  it("is never a retired one", () => {
    expect(chosen(listOf(["a", "retired"]), true)).toBeUndefined();
    expect(chooseNotice([], true)).toBeUndefined();
  });

  it("is none when the reader refuses the list (fail closed)", () => {
    const bad = {
      version: 1,
      notices: [
        {
          id: "a",
          text: "Notice a.",
          keccak256: `0x${"00".repeat(32)}`,
          status: "approved",
        },
      ],
    };
    expect(chosen(bad, true)).toBeUndefined();
    expect(chosen({ version: 2, notices: [] }, true)).toBeUndefined();
    expect(chosen("not a list", true)).toBeUndefined();
  });

  it("from the vendored list: its pending notice, only with acceptPendingNotices", () => {
    expect(sessionNotice(false)).toBeUndefined();
    expect(sessionNotice(true)).toMatchObject({
      id: ACCEPTED.noticeId,
      text: ACCEPTED.notice,
      noticeHash: ACCEPTED.noticeHash,
      status: "pending",
    });
  });
});
