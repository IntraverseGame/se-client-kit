// VT-11, the verdicts (V-20) and the kernel's seed vectors: a book round's
// verdict for each status (not ended, voided, refused, unknown kernel, `won`
// and `lost` at V-8's book reason, `canceled` at V-6), and its checks 5 and 7
// replayed against `kernel/public/v1/seed`.

import { describe, expect, it } from "vitest";

import { bookVerdictOf } from "./book-checks.ts";
import type { CheckResult } from "./check-result.ts";
import { type BookEnding, bookBody } from "./fixtures/book-body.ts";
import {
  agreeing,
  changed,
  checkOf,
  type Json,
  run,
} from "./fixtures/book-run.ts";
import { field, vectorsOf } from "./fixtures/kernel-vectors.ts";
import { evidenceOfBody } from "./fixtures/rounds.ts";
import { asRecord } from "./fixtures/verify-body.ts";

/** A book body whose block value, secret, and seed are a seed vector's. */
const fromVector = async (
  blockValue: string,
  secret: string,
  seed: string,
): Promise<Json> => {
  const body = await bookBody("book-lifecycle-won", blockValue);
  body["reveal"] = { roundSecret: secret, seed };
  return body;
};

describe("the verdicts of a book round (V-20)", () => {
  it.each<BookEnding>(["book-lifecycle-won", "book-lifecycle-lost"])(
    "%s, every check it can run passing: V-8's book reason",
    async ending => {
      const report = await run(await bookBody(ending));
      expect(report.verdict).toEqual({
        kind: "not-recomputable",
        reason: "book-draw",
      });
    },
  );

  it("a canceled round with its reveals reaches V-6, check 8 not applying", async () => {
    const report = await run(
      await changed(body => {
        body["status"] = "canceled";
        Reflect.deleteProperty(body, "payout");
        Reflect.deleteProperty(asRecord(body["book"]), "drawn");
        Reflect.deleteProperty(body, "recomputed");
      }),
    );
    expect(checkOf(report, 8).status).toBe("not-applicable");
    expect(checkOf(report, 5).status).toBe("matches");
    expect(report.verdict).toEqual({ kind: "matches" });
  });

  it("a canceled round without reveals shows checks 5 and 7 as not checked, at V-6", async () => {
    const report = await run(
      await changed(body => {
        body["status"] = "canceled";
        Reflect.deleteProperty(body, "reveal");
      }),
    );
    expect(checkOf(report, 5).status).toBe("not-checked");
    expect(checkOf(report, 7).status).toBe("not-checked");
    expect(report.verdict).toEqual({ kind: "matches" });
  });

  it.each(["idle", "starting", "active", "resolving"])(
    "a round %s has not ended: V-8, checks 5 and 7 not run",
    async status => {
      const report = await run(
        await changed(body => {
          body["status"] = status;
          body["closed"] = false;
          Reflect.deleteProperty(body, "payout");
          Reflect.deleteProperty(body, "recomputed");
          Reflect.deleteProperty(asRecord(body["book"]), "drawn");
        }),
      );
      expect(checkOf(report, 5).status).toBe("not-checked");
      expect(checkOf(report, 7).status).toBe("not-checked");
      expect(report.verdict).toEqual({
        kind: "not-recomputable",
        reason: "not-ended",
      });
    },
  );

  it("a round whose block N is not on the chain yet waits for its end", async () => {
    const report = await run(
      await changed(body => {
        body["status"] = "starting";
        body["closed"] = false;
        Reflect.deleteProperty(asRecord(body["entropy"]), "value");
      }),
      {},
    );
    expect(checkOf(report, 6).status).toBe("not-checked");
    expect(report.verdict).toEqual({
      kind: "not-recomputable",
      reason: "not-ended",
    });
  });

  it.each([
    ["voided", "voidReason", "ENTROPY_TIMEOUT"],
    ["refused", "rejectCode", "INSUFFICIENT_FUNDS"],
  ] as const)("a %s round is V-8, %s", async (closure, key, code) => {
    const report = await run(
      await changed(body => {
        body["status"] = "idle";
        body[key] = code;
        Reflect.deleteProperty(body, "reveal");
        Reflect.deleteProperty(body, "payout");
        Reflect.deleteProperty(body, "recomputed");
        Reflect.deleteProperty(asRecord(body["book"]), "drawn");
      }),
    );
    expect(report.verdict).toEqual({
      kind: "not-recomputable",
      reason: closure,
    });
  });

  it("a round of a kernel version the page does not know is V-8, check 7 not run", async () => {
    const report = await run(
      await changed(body => {
        asRecord(body["kernel"])["version"] = 2;
      }),
    );
    expect(checkOf(report, 7).status).toBe("not-checked");
    expect(checkOf(report, 5).status).toBe("not-checked");
    expect(report.verdict).toEqual({
      kind: "not-recomputable",
      reason: "unknown-kernel",
    });
  });

  it("a failed check comes before every other verdict", async () => {
    const evidence = await evidenceOfBody(await bookBody());
    const failed: CheckResult = {
      id: 8,
      title: "The draw",
      status: "mismatch",
      comparisons: [],
    };
    expect(bookVerdictOf(evidence, [failed])).toEqual({
      kind: "mismatch",
      failed: [8],
    });
  });
});

describe("checks 5 and 7 of a book round against kernel/public/v1/seed", () => {
  const seedVectors = vectorsOf("seed").filter(v => v.error === undefined);

  it.each(seedVectors.map(v => [v.id, v] as const))(
    "%s: check 7 recomputes the vector's seed from its block value and secret",
    async (_id, vector) => {
      const blockValue = `0x${field(vector.input, "blockValue", vector.id)}`;
      const secret = `0x${field(vector.input, "secret", vector.id)}`;
      const seed = `0x${field(vector.expected, "seed", vector.id)}`;
      const report = await run(
        await fromVector(blockValue, secret, seed),
        agreeing(blockValue),
      );
      expect(checkOf(report, 7)).toMatchObject({
        status: "matches",
        details: [{ label: "seed", value: seed }],
      });
    },
  );

  it.each(seedVectors.map(v => [v.id, v] as const))(
    "%s: check 5 recomputes SHA-256 of a 32-byte value as the vector's seedHash",
    async (_id, vector) => {
      // The vector's seed as a round secret: its SHA-256 is the vector's
      // `seedHash`, the same function as `roundSecretHash`'s.
      const secret = `0x${field(vector.expected, "seed", vector.id)}`;
      const hash = `0x${field(vector.expected, "seedHash", vector.id)}`;
      const body = await bookBody();
      body["reveal"] = { ...asRecord(body["reveal"]), roundSecret: secret };
      body["commitment"] = { roundSecretHash: hash };
      const report = await run(body);
      expect(checkOf(report, 5).status).toBe("matches");
      expect(checkOf(report, 5).details).toEqual([
        { label: "roundSecretHash", value: hash },
      ]);
    },
  );
});
