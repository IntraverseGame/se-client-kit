// VT-11, the body (V-21): `book.table`, the mode's rows, is validated and never
// kept. A present and malformed table (not a list, a row that is not a
// `BookTableRow`, a value that is not a base-10 string of at most 78 digits,
// more than 250,000 rows) fails the whole body; a well-formed one, an empty one
// included, is accepted and leaves the evidence as it was.

import { describe, expect, it } from "vitest";

import { BOOK_TABLE, bookBody } from "./fixtures/book-body.ts";
import { asRecord } from "./fixtures/verify-body.ts";
import type { RoundEvidence } from "./round-evidence.ts";
import { parseEvidence } from "./verify-body.ts";

type Json = Record<string, unknown>;

const evidenceOf = (json: unknown): RoundEvidence => {
  const evidence = parseEvidence(json);
  if (evidence === undefined) throw new TypeError("the body does not validate");
  return evidence;
};

/** The won book body with `book.table` set to `table`. */
const withTable = async (table: unknown): Promise<Json> => {
  const body = await bookBody();
  asRecord(body["book"])["table"] = table;
  return body;
};

/** A table row with `fields` changed. */
const tableRow = (fields: Json = {}): Json => ({
  id: "7",
  weight: "10",
  multiplierMilli: "1500",
  ...fields,
});

/** `count` well-formed rows. */
const rows = (count: number): Json[] =>
  Array.from({ length: count }, () => tableRow());

describe("`book.table` (V-21)", () => {
  it("is validated and none of it is kept", async () => {
    const body = await bookBody();
    expect(asRecord(body["book"])["table"]).toEqual(BOOK_TABLE.table);
    const { table: _table, ...withoutRows } = asRecord(body["book"]);
    expect(evidenceOf(body).book).toEqual(
      evidenceOf({ ...body, book: withoutRows }).book,
    );
    expect(evidenceOf(body).book).not.toHaveProperty("table");
  });

  it("accepts an empty table", async () => {
    expect(evidenceOf(await withTable([])).book).not.toHaveProperty("table");
  });

  it.each<[string, unknown]>([
    ["not a list", { 0: tableRow() }],
    ["null", null],
    ["a row that is not an object", [tableRow(), null]],
    ["a row that is a list", [["7", "10", "1500"]]],
    ["a row without an id", [{ weight: "10", multiplierMilli: "1500" }]],
    ["a row without a weight", [{ id: "7", multiplierMilli: "1500" }]],
    ["a row without a multiplier", [{ id: "7", weight: "10" }]],
    ["a number id", [tableRow({ id: 7 })]],
    ["a number weight", [tableRow({ weight: 10 })]],
    ["a number multiplier", [tableRow({ multiplierMilli: 1500 })]],
    ["a weight with a leading zero", [tableRow({ weight: "010" })]],
    ["a negative multiplier", [tableRow({ multiplierMilli: "-1" })]],
    ["a decimal id", [tableRow({ id: "7.5" })]],
    ["an empty weight", [tableRow({ weight: "" })]],
    ["a weight of 79 digits", [tableRow({ weight: `1${"0".repeat(78)}` })]],
    ["a malformed last row", [...rows(3), tableRow({ id: "x" })]],
  ])("refuses a table that has %s", async (_what, table) => {
    expect(parseEvidence(await withTable(table))).toBeUndefined();
  });

  it("accepts zeros and 78 digits in a row", async () => {
    const wide = `1${"0".repeat(77)}`;
    const table = [
      tableRow({ id: "0", weight: "0", multiplierMilli: "0" }),
      tableRow({ id: wide, weight: wide, multiplierMilli: wide }),
    ];
    expect(parseEvidence(await withTable(table))).toBeDefined();
  });

  it("caps the table at 250,000 rows", async () => {
    expect(parseEvidence(await withTable(rows(250_000)))).toBeDefined();
    expect(parseEvidence(await withTable(rows(250_001)))).toBeUndefined();
  });
});
