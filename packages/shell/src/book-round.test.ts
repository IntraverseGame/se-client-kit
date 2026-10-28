// T-22 (#146, W-51, W-52): a book round the session holds. It signs nothing
// and takes no input but the start: a pick and a cash-out are refused with no
// request (it has no transport to send one). W-26's checks do not run on it:
// it is `ready` from its start, with no `T_0`, and no verdict waits on a check.
// In their place, once a Snapshot of the round carries `randomnessProof`, a
// later Snapshot with another `source`, `blockNumber`, `roundSecretHash`, or
// `config.packageHash` is a changed round, kept in the evidence.

import { describe, expect, it } from "vitest";

import { createBookRound } from "./book-round.ts";
import {
  BOOK_ROUND_ID,
  bookInput,
  bookSnapshot,
  configOf,
  proofOf,
} from "./fixtures/book.ts";
import { OTHER_ROUND_ID, validated } from "./fixtures/vectors.ts";

const REQUEST = {
  actionKey: "0x00000000000000000000000000000000000000aa",
  bet: { value: "100", unit: "EUR" },
  idempotencyKey: "00000000-0000-4000-8000-000000000001",
} as const;

/** A book round started at `starting` (with its bound proof by default). */
const started = (
  first = bookSnapshot("starting"),
): ReturnType<typeof createBookRound> => {
  const round = createBookRound(
    { roundId: BOOK_ROUND_ID, request: REQUEST },
    first,
  );
  void round.observe(first);
  return round;
};

/** A `won` Snapshot of the round with one field of W-52 changed. */
const wonWith = (
  change: (input: Record<string, unknown>) => void,
): ReturnType<typeof bookSnapshot> => {
  const input = bookInput("won");
  change(input);
  return validated(input);
};

describe("a book round signs nothing and takes no input (W-51)", () => {
  it("refuses a pick and a cash-out as not legal, and offers no cash-out", async () => {
    const round = started();
    expect(await round.pick({ step: 0, option: 0 })).toEqual({
      accepted: false,
      reason: "not_legal",
    });
    expect(await round.cashOut()).toEqual({
      accepted: false,
      reason: "not_legal",
    });
    expect(round.cashOutOffered()).toBe(false);
  });

  it("opens no transcript state and has no cancel", () => {
    const round = started();
    expect(round.phase()).toBe("unopened");
    expect(round.cancel()).toBe("none");
    expect(round.unconfirmed()).toBeUndefined();
    expect(round.lastError()).toBeUndefined();
  });
});

describe("what the shell checks on a book round (W-52)", () => {
  it("runs no W-26 check: ready from its start, with no T_0, and over at its result", async () => {
    const round = started(bookSnapshot("starting", { proofs: false }));
    expect(round.verdict()).toEqual({ state: "ready" });
    expect(round.over()).toBe(false);
    await round.observe(bookSnapshot("starting"));
    await round.observe(bookSnapshot("won"));
    expect(round.verdict()).toEqual({ state: "ready" });
    expect(round.over()).toBe(true);
    expect(round.latest().status).toBe("won");
  });

  it("keeps the start's request and each distinct randomnessProof as its evidence", async () => {
    const round = started();
    await round.observe(bookSnapshot("starting"));
    await round.observe(bookSnapshot("won"));
    await round.observe(bookSnapshot("won"));
    const evidence = round.evidence();
    expect(evidence.request).toEqual(REQUEST);
    expect(evidence.randomnessProofs).toHaveLength(2);
    expect(evidence.randomnessProofs[1]?.roundSecret).toMatch(/^0x4/u);
    expect(evidence.first).toEqual({
      source: "ethereum:block",
      blockNumber: 21_000_123,
      roundSecretHash: `0x${"22".repeat(32)}`,
      packageHash: `0x${"aa".repeat(32)}`,
    });
    expect(evidence.changes).toEqual([]);
  });

  it.each<[string, (input: Record<string, unknown>) => void]>([
    ["source", input => (proofOf(input)["source"] = "base:block")],
    ["blockNumber", input => (proofOf(input)["blockNumber"] = 21_000_124)],
    [
      "roundSecretHash",
      input => (proofOf(input)["roundSecretHash"] = `0x${"23".repeat(32)}`),
    ],
    [
      "packageHash",
      input => (configOf(input)["packageHash"] = `0x${"ab".repeat(32)}`),
    ],
  ])(
    "another %s is a changed round, kept in the evidence",
    async (_, change) => {
      const round = started();
      const changed = wonWith(change);
      await round.observe(changed);
      expect(round.verdict()).toEqual({
        state: "failed",
        shown: "verification-failed",
      });
      const { first, changes } = round.evidence();
      expect(first?.blockNumber).toBe(21_000_123);
      expect(changes).toHaveLength(1);
      expect(changes[0]).not.toEqual(first);
      // The Snapshot is read in (W-52 is not W-53's changed session).
      expect(round.latest()).toBe(changed);
      // Final for the round: a Snapshot like the first does not lift it.
      await round.observe(bookSnapshot("won"));
      expect(round.verdict()).toMatchObject({ state: "failed" });
    },
  );

  it("a Snapshot without randomnessProof after one with it is a changed round", async () => {
    const round = started();
    await round.observe(versionedStarting(3));
    expect(round.verdict()).toMatchObject({ state: "failed" });
    expect(round.evidence().changes[0]?.source).toBeUndefined();
  });

  it("ignores a stale read, of a lower version, before checking it (W-29)", async () => {
    const round = started();
    // The round's `starting` read before it was bound: version 1, no proofs.
    await round.observe(versionedStarting(1));
    expect(round.verdict()).toEqual({ state: "ready" });
    expect(round.evidence().changes).toEqual([]);
    expect(round.latest().version).toBe(2);
  });

  it("names only the last Snapshot observed as stale", async () => {
    const round = started();
    const stale = versionedStarting(1);
    await round.observe(stale);
    expect(round.staleRead()).toBe(stale);
    await round.observe(bookSnapshot("idle"));
    expect(round.staleRead()).toBeUndefined();
  });

  it("before any randomnessProof there is nothing to change", async () => {
    const round = started(bookSnapshot("starting", { proofs: false }));
    await round.observe(versionedStarting(3));
    expect(round.verdict()).toEqual({ state: "ready" });
    expect(round.evidence().first).toBeUndefined();
  });

  it("ignores idle and another round's Snapshot", async () => {
    const round = started();
    await round.observe(bookSnapshot("idle"));
    const other = bookInput("won");
    other["roundId"] = OTHER_ROUND_ID;
    proofOf(other)["blockNumber"] = 1;
    await round.observe(validated(other));
    expect(round.verdict()).toEqual({ state: "ready" });
    expect(round.latest().status).toBe("starting");
  });

  it("reads nothing the session's W-53 guard does not admit", async () => {
    const first = bookSnapshot("starting");
    const round = createBookRound(
      { roundId: BOOK_ROUND_ID, request: REQUEST },
      first,
      { admit: snapshot => snapshot.status !== "won" },
    );
    await round.observe(first);
    await round.observe(wonWith(input => (proofOf(input)["blockNumber"] = 1)));
    expect(round.latest()).toBe(first);
    expect(round.verdict()).toEqual({ state: "ready" });
  });

  it("prints no evidence", () => {
    expect(String(started())).toBe("[redacted]");
  });
});

/** A `starting` Snapshot of the round without proofs, at `version`. */
const versionedStarting = (version: number): ReturnType<typeof bookSnapshot> =>
  validated({ ...bookInput("starting", { proofs: false }), version });
