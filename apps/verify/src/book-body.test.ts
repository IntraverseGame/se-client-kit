// VT-11, the body (V-18, V-21): a body with `book` is a book round, and one
// with `book` and a signed creation authorization, ready evidence, or signed
// actions is an API error; each book field's validation, a present and
// malformed one failing the whole body, an absent one not, an `int64` above
// 2^53 - 1 failing, and every index, count, and weight a `bigint`.

import { describe, expect, it } from "vitest";

import { BOOK_TABLE, bookBody, bookVector } from "./fixtures/book-body.ts";
import { asRecord, wonBody } from "./fixtures/verify-body.ts";
import type { RoundEvidence } from "./round-evidence.ts";
import { parseEvidence } from "./verify-body.ts";

const evidenceOf = (json: unknown): RoundEvidence => {
  const evidence = parseEvidence(json);
  if (evidence === undefined) throw new TypeError("the body does not validate");
  return evidence;
};

type Json = Record<string, unknown>;

/** A `DrawnRow` on row 2 with `multiplierMilli`. */
const row = (multiplierMilli: string) => ({ index: 2, multiplierMilli });

/** The won book body with `book.<key>` set to `value`. */
const withBook = async (key: string, value: unknown): Promise<Json> => {
  const body = await bookBody();
  asRecord(body["book"])[key] = value;
  return body;
};

/** The won book body without `book.<key>`. */
const withoutBook = async (key: string): Promise<Json> => {
  const body = await bookBody();
  Reflect.deleteProperty(asRecord(body["book"]), key);
  return body;
};

describe("a book round (V-18)", () => {
  it("is a body that carries `book`, read with its fields", async () => {
    const vector = bookVector("book-lifecycle-won");
    const evidence = evidenceOf(await bookBody());
    expect(evidence.roundId).toBe(vector.roundId);
    expect(evidence.createRoundAuth).toBeUndefined();
    expect(evidence.fairnessProof).toBeUndefined();
    expect(evidence.book).toEqual({
      mode: vector.mode,
      drawn: { index: 2n, multiplierMilli: "2000" },
      cost: BOOK_TABLE.cost,
      merkleRoot: BOOK_TABLE.merkleRoot,
      entryCount: 3n,
      totalWeight: 1_000_000n,
      packageHash: vector.packageHash,
      apiDraw: { index: 2n, multiplierMilli: "2000" },
      entropyChainId: 1,
      seed: expect.stringMatching(/^0x[0-9a-f]{64}$/u) as unknown,
    });
    expect(evidence.payout?.formatted).toBe("2 EUR");
  });

  it("is a config round without `book`", () => {
    expect(evidenceOf(wonBody()).book).toBeUndefined();
  });

  it.each([
    [
      "a signed creation authorization",
      (body: Json): Json => ({
        ...body,
        commitment: {
          ...asRecord(body["commitment"]),
          ...asRecord(wonBody()["commitment"]),
        },
      }),
    ],
    [
      "ready evidence",
      (body: Json): Json => ({ ...body, readyHash: `0x${"ab".repeat(32)}` }),
    ],
    [
      "a signed action",
      (body: Json): Json => ({
        ...body,
        actions: [
          {
            sequence: 1,
            kind: "action",
            action: "draw",
            path: [],
            previous: `0x${"ab".repeat(32)}`,
            signature: `0x${"cd".repeat(65)}`,
          },
        ],
      }),
    ],
  ])("with %s, is an API error (V-10)", async (_name, change) => {
    const body = change(await bookBody());
    expect(parseEvidence(body)).toBeUndefined();
    // The same change without `book` is a body the page reads.
    const { book: _book, ...plain } = body;
    expect(parseEvidence(plain)).toBeDefined();
  });

  it("with a `seedHash`, keeps it, since the seed's commitment then applies", async () => {
    const body = await bookBody();
    const evidence = evidenceOf({ ...body, seedHash: `0x${"ab".repeat(32)}` });
    expect(evidence.fairnessProof?.seedHash).toBe(`0x${"ab".repeat(32)}`);
    expect(evidence.book?.seed).toBe(evidence.fairnessProof?.seed);
  });
});

describe("the book fields (V-21)", () => {
  it("needs `mode`, a string", async () => {
    expect(parseEvidence(await withoutBook("mode"))).toBeUndefined();
    expect(parseEvidence(await withBook("mode", 1))).toBeUndefined();
  });

  it.each(["drawn", "cost", "merkleRoot", "entryCount", "totalWeight"])(
    "reads a body without `book.%s`, as not reported",
    async key => {
      const evidence = evidenceOf(await withoutBook(key));
      expect(evidence.book).toBeDefined();
      expect(evidence.book).not.toHaveProperty(key);
    },
  );

  it("reads a book round before its draw: `book` with its mode only", async () => {
    const body = await bookBody();
    const early: Json = {
      ...body,
      status: "starting",
      closed: false,
      book: { mode: "base" },
    };
    for (const key of ["payout", "reveal", "recomputed"]) {
      Reflect.deleteProperty(early, key);
    }
    expect(evidenceOf(early).book).toEqual({
      mode: "base",
      packageHash: bookVector("book-lifecycle-won").packageHash,
      entropyChainId: 1,
    });
  });

  it.each<[string, string, unknown]>([
    ["drawn", "a string index", { index: "2", multiplierMilli: "2000" }],
    ["drawn", "a negative index", { index: -1, multiplierMilli: "2000" }],
    ["drawn", "a fractional index", { index: 1.5, multiplierMilli: "2000" }],
    [
      "drawn",
      "an index above 2^53 - 1",
      { index: 2 ** 53, multiplierMilli: "1" },
    ],
    ["drawn", "a number multiplier", { index: 2, multiplierMilli: 2000 }],
    [
      "drawn",
      "a multiplier with a leading zero",
      { index: 2, multiplierMilli: "02000" },
    ],
    ["drawn", "a negative multiplier", { index: 2, multiplierMilli: "-1" }],
    ["drawn", "no multiplier", { index: 2 }],
    ["cost", "zero", "0"],
    ["cost", "a zero denominator", "1/0"],
    ["cost", "a leading zero", "01"],
    ["cost", "a decimal", "0.2"],
    ["cost", "a number", 1],
    ["merkleRoot", "upper-case hex", `0x${"AB".repeat(32)}`],
    ["merkleRoot", "31 bytes", `0x${"ab".repeat(31)}`],
    ["entryCount", "zero", 0],
    ["entryCount", "a string", "3"],
    ["entryCount", "a value above 2^53 - 1", 2 ** 53],
    ["totalWeight", "zero", "0"],
    ["totalWeight", "a number", 1_000_000],
    ["totalWeight", "a leading zero", "01"],
  ])("refuses `book.%s` as %s", async (key, _what, value) => {
    expect(parseEvidence(await withBook(key, value))).toBeUndefined();
  });

  it("caps a multiplier at an amount's 78 digits, in both rows", async () => {
    const at = `1${"0".repeat(77)}`;
    const over = `1${"0".repeat(78)}`;
    expect(evidenceOf(await withBook("drawn", row(at))).book?.drawn).toEqual({
      index: 2n,
      multiplierMilli: at,
    });
    expect(parseEvidence(await withBook("drawn", row(over)))).toBeUndefined();
    const body = await bookBody();
    const recomputed = asRecord(body["recomputed"]);
    expect(
      parseEvidence({
        ...body,
        recomputed: { ...recomputed, draw: row(over) },
      }),
    ).toBeUndefined();
  });

  it("caps a total weight at an amount's 78 digits", async () => {
    const at = `1${"0".repeat(77)}`;
    expect(
      evidenceOf(await withBook("totalWeight", at)).book?.totalWeight,
    ).toBe(10n ** 77n);
    expect(
      parseEvidence(await withBook("totalWeight", `1${"0".repeat(78)}`)),
    ).toBeUndefined();
  });

  it("refuses a malformed `recomputed.draw`", async () => {
    const body = await bookBody();
    const recomputed = asRecord(body["recomputed"]);
    expect(
      parseEvidence({
        ...body,
        recomputed: {
          ...recomputed,
          draw: { index: -1, multiplierMilli: "0" },
        },
      }),
    ).toBeUndefined();
  });

  it.each(["1", "100", "1/5", "4/10"])(
    "accepts a cost of %s, kept as its text",
    async cost => {
      expect(evidenceOf(await withBook("cost", cost)).book?.cost).toBe(cost);
    },
  );

  it("reads every index, count, and weight as a bigint, never a number", async () => {
    const body = await withBook(
      "totalWeight",
      "123456789012345678901234567890",
    );
    asRecord(body["book"])["entryCount"] = Number.MAX_SAFE_INTEGER;
    const book = evidenceOf(body).book;
    expect(book?.totalWeight).toBe(123_456_789_012_345_678_901_234_567_890n);
    expect(book?.entryCount).toBe(BigInt(Number.MAX_SAFE_INTEGER));
    expect(typeof book?.drawn?.index).toBe("bigint");
    expect(typeof book?.apiDraw?.index).toBe("bigint");
    expect(typeof book?.drawn?.multiplierMilli).toBe("string");
  });
});
