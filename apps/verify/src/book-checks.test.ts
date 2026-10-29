// VT-11, the checks (V-19): a book round's checks 1 to 8 end to end over the
// vendored book round (`valid/book-lifecycle-won` and `-lost`, written as the
// verify API's body), with a fake JSON-RPC endpoint set for the chain read
// (check 6); check 8 not checked, its agreement with `recomputed.draw` leaving
// it so and a disagreement failing it.

import { describe, expect, it } from "vitest";

import { checkDraw, DRAW_NOT_CHECKED } from "./book-checks.ts";
import {
  type BookEnding,
  bookBlockValue,
  bookBody,
} from "./fixtures/book-body.ts";
import {
  agreeing,
  changed,
  checkOf,
  config,
  OTHER_HASH,
  run,
  statuses,
} from "./fixtures/book-run.ts";
import { chainDeps, evidenceOfBody } from "./fixtures/rounds.ts";
import { asRecord } from "./fixtures/verify-body.ts";
import { verifyRound } from "./verify-round.ts";

describe("the checks of a book round (V-19)", () => {
  it.each<BookEnding>(["book-lifecycle-won", "book-lifecycle-lost"])(
    "%s: 1 and 5 to 7 match, 2 to 4 do not apply, 8 is not checked",
    async ending => {
      const report = await run(await bookBody(ending));
      expect(report.checks.map(c => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(statuses(report)).toEqual([
        "1 matches",
        "2 not-applicable",
        "3 not-applicable",
        "4 not-applicable",
        "5 matches",
        "6 matches",
        "7 matches",
        "8 not-checked",
      ]);
      expect(checkOf(report, 8).note).toContain(DRAW_NOT_CHECKED);
      expect(checkOf(report, 7).title).toBe("Seed");
    },
  );

  it("never counts a check that does not apply, or is not checked, as passed", async () => {
    const report = await run(await bookBody());
    for (const id of [2, 3, 4, 8] as const) {
      expect(checkOf(report, id).status).not.toBe("matches");
      expect(checkOf(report, id).comparisons).toEqual([]);
    }
  });

  it("check 1 compares the round id only: there is no newRound", async () => {
    const report = await run(await bookBody());
    expect(checkOf(report, 1).comparisons.map(c => c.name)).toEqual([
      "roundId",
    ]);
    const other = await verifyRound(
      chainDeps(agreeing(bookBlockValue())),
      config,
      await evidenceOfBody(await bookBody()),
      "01927c61-4d5e-7f6a-9b7c-8d9e0f1a2b3d",
    );
    expect(checkOf(other, 1).status).toBe("mismatch");
  });

  it("check 5 fails on a round secret that does not hash to its commitment", async () => {
    const report = await run(
      await changed(body => {
        asRecord(body["reveal"])["roundSecret"] = OTHER_HASH;
      }),
    );
    expect(checkOf(report, 5).status).toBe("mismatch");
    expect(report.verdict).toEqual({ kind: "mismatch", failed: [5, 7] });
  });

  it("check 5 compares `seedHash` only when the body carries one", async () => {
    const plain = await run(await bookBody());
    expect(checkOf(plain, 5).comparisons.map(c => c.name)).toEqual([
      "roundSecretHash",
    ]);
    const body = await bookBody();
    const report = await run({ ...body, seedHash: OTHER_HASH });
    expect(checkOf(report, 5).comparisons.map(c => c.name)).toEqual([
      "roundSecretHash",
      "seedHash",
    ]);
    expect(checkOf(report, 5).status).toBe("mismatch");
  });

  it("a won round without its seed is a mismatch of check 7", async () => {
    const report = await run(
      await changed(body => {
        Reflect.deleteProperty(asRecord(body["reveal"]), "seed");
      }),
    );
    expect(report.verdict).toEqual({ kind: "mismatch", failed: [7] });
  });

  it("a won round without its reveal is a mismatch of checks 5 and 7", async () => {
    const report = await run(
      await changed(body => {
        Reflect.deleteProperty(body, "reveal");
      }),
    );
    expect(report.verdict).toEqual({ kind: "mismatch", failed: [5, 7] });
  });

  it("check 6 fails on an `entropy.value` that is not block N's hash", async () => {
    const report = await run(
      await changed(body => {
        asRecord(body["entropy"])["value"] = OTHER_HASH;
      }),
    );
    expect(checkOf(report, 6).status).toBe("mismatch");
    // The seed is recomputed from the chain's hash, which still gives it.
    expect(checkOf(report, 7).status).toBe("matches");
  });

  it("check 6 fails on an `entropy.chainId` that is not the pinned one", async () => {
    const report = await run(
      await changed(body => {
        asRecord(body["entropy"])["chainId"] = 2;
      }),
    );
    const check = checkOf(report, 6);
    expect(check.status).toBe("mismatch");
    expect(check.comparisons[0]).toMatchObject({
      name: "entropy.chainId",
      recomputed: "1",
      evidence: "2",
      matches: false,
    });
    expect(report.verdict).toEqual({ kind: "mismatch", failed: [6] });
  });

  it("check 6 compares nothing more when the body has no `entropy.chainId`", async () => {
    const report = await run(
      await changed(body => {
        Reflect.deleteProperty(asRecord(body["entropy"]), "chainId");
      }),
    );
    expect(checkOf(report, 6).status).toBe("matches");
    expect(checkOf(report, 6).comparisons.map(c => c.name)).not.toContain(
      "entropy.chainId",
    );
  });

  it("check 6 cannot be verified for a source the configuration does not list", async () => {
    const report = await run(await bookBody(), agreeing(bookBlockValue()), {
      ...config,
      sources: {},
    });
    expect(checkOf(report, 6)).toMatchObject({
      status: "unverified",
      chainFailure: "config",
    });
    expect(checkOf(report, 7).status).toBe("not-checked");
    expect(report.verdict).toEqual({ kind: "chain-unverified" });
  });

  it("check 7 fails on a seed that is not SHA-256(blockValue || roundSecret)", async () => {
    const report = await run(
      await changed(body => {
        asRecord(body["reveal"])["seed"] = OTHER_HASH;
      }),
    );
    expect(checkOf(report, 7).status).toBe("mismatch");
    expect(report.verdict).toEqual({ kind: "mismatch", failed: [7] });
  });

  it("check 7 uses the chain's hash, never the API's", async () => {
    // The body's seed was made from another block hash than the chain gives.
    const report = await run(
      await bookBody("book-lifecycle-won", OTHER_HASH),
      agreeing(bookBlockValue()),
    );
    expect(checkOf(report, 6).status).toBe("mismatch");
    expect(checkOf(report, 7).status).toBe("mismatch");
  });

  it("check 8 fails when the recorded and the redrawn rows disagree, naming both", async () => {
    const report = await run(
      await changed(body => {
        asRecord(asRecord(body["recomputed"])["draw"])["index"] = 1;
      }),
    );
    const check = checkOf(report, 8);
    expect(check.status).toBe("mismatch");
    expect(check.comparisons[0]).toMatchObject({
      name: "drawn row index",
      recomputed: "1",
      evidence: "2",
      matches: false,
    });
    expect(check.comparisons[0]?.labels?.recomputed).toContain(
      "the verify API's redraw",
    );
    expect(report.verdict).toEqual({ kind: "mismatch", failed: [8] });
  });
});

describe("check 8 (V-19)", () => {
  const row = { index: 2n, multiplierMilli: "2000" };

  it("is not checked without both rows", () => {
    expect(checkDraw("won", row)).toMatchObject({
      status: "not-checked",
      note: DRAW_NOT_CHECKED,
    });
    expect(checkDraw("won", undefined, row).status).toBe("not-checked");
  });

  it("stays not checked when the rows agree, and says they agree", () => {
    const check = checkDraw("lost", row, { ...row });
    expect(check.status).toBe("not-checked");
    expect(check.note).toContain(
      "recorded and redrawn rows agree (not recomputed by this page)",
    );
    expect(check.comparisons).toEqual([]);
  });

  it("fails on another multiplier, compared as a bigint", () => {
    const check = checkDraw("won", row, { index: 2n, multiplierMilli: "1940" });
    expect(check.status).toBe("mismatch");
    expect(check.comparisons.map(c => c.matches)).toEqual([true, false]);
  });

  it("does not apply to a canceled round: no row was drawn", () => {
    expect(checkDraw("canceled", row, row).status).toBe("not-applicable");
  });
});
