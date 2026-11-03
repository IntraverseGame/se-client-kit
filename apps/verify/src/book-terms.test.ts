// VT-11, `game.terms` (V-18, V-21): the document sets it for a config round and
// leaves it out exactly when the body has `book`. A book round without it and a
// config round with it are read; both, or neither, are an API error. A config
// round's terms keep their bounds, and a book round reaches its own report.

import { describe, expect, it } from "vitest";

import { bookBody } from "./fixtures/book-body.ts";
import { run } from "./fixtures/book-run.ts";
import { asRecord, withField, wonBody } from "./fixtures/verify-body.ts";
import { isOneStepTwoOptions, type RoundEvidence } from "./round-evidence.ts";
import { parseEvidence } from "./verify-body.ts";

type Json = Record<string, unknown>;

const evidenceOf = (json: unknown): RoundEvidence => {
  const evidence = parseEvidence(json);
  if (evidence === undefined) throw new TypeError("the body does not validate");
  return evidence;
};

/** A config round's `game.terms`. */
const configTerms = (): unknown => asRecord(wonBody()["game"])["terms"];

/** `body` with `game.terms` set to `terms`. */
const withTerms = (body: Json, terms: unknown): Json => ({
  ...body,
  game: { ...asRecord(body["game"]), terms },
});

describe("`game.terms`, absent exactly when the body has `book`", () => {
  it("accepts a book round without terms: no nodes, no payout terms", async () => {
    const evidence = evidenceOf(await bookBody());
    expect(evidence.book).toBeDefined();
    expect(evidence.terms).toEqual([]);
    expect(evidence).not.toHaveProperty("payoutTerms");
    // A-3's shape test never holds for it.
    expect(isOneStepTwoOptions(evidence)).toBe(false);
  });

  it("accepts a config round with terms", () => {
    const evidence = evidenceOf(wonBody());
    expect(evidence.book).toBeUndefined();
    expect(evidence.terms).toEqual([{ options: 2, losers: 1, next: [] }]);
    expect(evidence.payoutTerms).toBeDefined();
  });

  it("refuses a body with both `book` and a config round's terms", async () => {
    expect(
      parseEvidence(withTerms(await bookBody(), configTerms())),
    ).toBeUndefined();
  });

  it("refuses a book body without `book`: neither `book` nor `game.terms`", async () => {
    const { book: _book, ...plain } = await bookBody();
    expect(parseEvidence(plain)).toBeUndefined();
  });

  it("refuses a config body without `game.terms`: neither", () => {
    const body = wonBody();
    const game = { ...asRecord(body["game"]) };
    Reflect.deleteProperty(game, "terms");
    // No replay steps either, so only the missing terms can refuse it.
    const recomputed = { ...asRecord(body["recomputed"]), steps: [] };
    expect(parseEvidence({ ...body, game, recomputed })).toBeUndefined();
  });

  it.each<[string, unknown]>([
    // Empty terms with zeros, the cap below the document's minimum.
    [
      "empty terms with zeros",
      { nodes: [], houseEdgeWad: "0", maxMultiplierMilli: 0 },
    ],
    // Terms that validate on their own: `book` alone is why they are refused.
    [
      "empty terms that validate",
      { nodes: [], houseEdgeWad: "0", maxMultiplierMilli: 1 },
    ],
  ])("refuses `book` with %s", async (_what, terms) => {
    expect(parseEvidence(withTerms(await bookBody(), terms))).toBeUndefined();
  });

  it("refuses a `game.terms` of null on a config round", () => {
    expect(parseEvidence(withTerms(wonBody(), null))).toBeUndefined();
  });

  it("refuses a `game.terms` of null on a book round", async () => {
    expect(parseEvidence(withTerms(await bookBody(), null))).toBeUndefined();
  });

  it("refuses a config round whose multiplier cap is 0", () => {
    expect(
      parseEvidence(withField("game.terms.maxMultiplierMilli", 0)),
    ).toBeUndefined();
  });

  it("reads a config round whose multiplier cap is 1", () => {
    expect(
      evidenceOf(withField("game.terms.maxMultiplierMilli", 1)).payoutTerms
        ?.maxMultiplierMilli,
    ).toBe(1);
  });

  it("refuses a book round's replay step: no terms have its node", async () => {
    const body = await bookBody();
    expect(
      parseEvidence({
        ...body,
        recomputed: {
          ...asRecord(body["recomputed"]),
          steps: [{ node: 0, option: 0, losers: [1], survived: true }],
        },
      }),
    ).toBeUndefined();
  });

  it("takes a book round without terms to its own report, not the unsupported shape", async () => {
    const report = await run(await bookBody());
    expect(report.verdict).toEqual({
      kind: "not-recomputable",
      reason: "book-draw",
    });
  });
});
