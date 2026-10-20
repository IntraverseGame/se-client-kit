// VT-1: the round id on the page (V-4): its normalization, the Snapshot
// schema's `RoundId` pattern (UUIDv7, canonical), its `bytes32` form, the path
// parser for `/rounds/{id}`, and the URL of a round's page (W-39).

import { describe, expect, it } from "vitest";

import {
  normalizeRoundId,
  parseRoute,
  roundIdBytes32,
  roundUrl,
} from "./round-id.ts";

const ID = "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d";
const BYTES32 =
  "0x01927c5e8b3a7f219c4d5e6f7a8b9c0d00000000000000000000000000000000";

describe("normalizeRoundId", () => {
  it("accepts a canonical UUIDv7", () => {
    expect(normalizeRoundId(ID)).toBe(ID);
  });

  it("trims surrounding white space", () => {
    expect(normalizeRoundId(`  ${ID}\n\t`)).toBe(ID);
  });

  it("lower-cases upper-case hex", () => {
    expect(normalizeRoundId(ID.toUpperCase())).toBe(ID);
  });

  it.each([
    ["a UUIDv4", "01927c5e-8b3a-4f21-9c4d-5e6f7a8b9c0d"],
    ["a wrong variant", "01927c5e-8b3a-7f21-cc4d-5e6f7a8b9c0d"],
    ["no hyphens", "01927c5e8b3a7f219c4d5e6f7a8b9c0d"],
    ["braces", `{${ID}}`],
    ["a URN", `urn:uuid:${ID}`],
    ["one character short", ID.slice(0, -1)],
    ["one character long", `${ID}0`],
    ["inner white space", ID.replace("-", " -")],
    ["a non-hex letter", ID.replace("c", "g")],
    ["the empty string", ""],
    ["white space only", "   "],
  ])("refuses %s", (_, input) => {
    expect(normalizeRoundId(input)).toBeUndefined();
  });
});

describe("roundIdBytes32", () => {
  it("is the 16 bytes, left-aligned and zero-padded", () => {
    expect(roundIdBytes32(ID)).toBe(BYTES32);
  });
});

describe("parseRoute", () => {
  const BASE = "/verify";

  it.each([
    ["the base", "/verify"],
    ["the base with a slash", "/verify/"],
    ["/rounds with no slash", "/verify/rounds"],
    ["/rounds/ with no id", "/verify/rounds/"],
    ["a path outside the base", `/other/rounds/${ID}`],
    ["a sibling of the base", `/verifyx/rounds/${ID}`],
    ["another path under the base", `/verify/about/${ID}`],
  ])("shows the empty form for %s", (_, path) => {
    expect(parseRoute(path, BASE)).toEqual({ kind: "form" });
  });

  it("reads a round's path", () => {
    expect(parseRoute(`/verify/rounds/${ID}`, BASE)).toEqual({
      kind: "round",
      roundId: ID,
    });
  });

  it("accepts a base path with a trailing slash", () => {
    expect(parseRoute(`/verify/rounds/${ID}`, "/verify/")).toEqual({
      kind: "round",
      roundId: ID,
    });
  });

  it("normalizes an upper-case id", () => {
    expect(parseRoute(`/verify/rounds/${ID.toUpperCase()}`, BASE)).toEqual({
      kind: "round",
      roundId: ID,
    });
  });

  it("shows the form with the path's text for an id that does not match", () => {
    expect(parseRoute("/verify/rounds/not-a-round", BASE)).toEqual({
      kind: "form",
      text: "not-a-round",
    });
  });

  it("refuses extra segments, with the text in the field", () => {
    expect(parseRoute(`/verify/rounds/${ID}/extra`, BASE)).toEqual({
      kind: "form",
      text: `${ID}/extra`,
    });
  });

  it("decodes encoded characters before the pattern", () => {
    expect(parseRoute("/verify/rounds/a%20b", BASE)).toEqual({
      kind: "form",
      text: "a b",
    });
    expect(
      parseRoute(`/verify/rounds/${encodeURIComponent(ID)}`, BASE),
    ).toEqual({ kind: "round", roundId: ID });
  });

  it("refuses an encoded slash as an extra segment", () => {
    expect(parseRoute(`/verify/rounds/${ID}%2Fextra`, BASE)).toEqual({
      kind: "form",
      text: `${ID}/extra`,
    });
  });

  it("keeps a malformed escape as written", () => {
    expect(parseRoute("/verify/rounds/%E0%A4%A", BASE)).toEqual({
      kind: "form",
      text: "%E0%A4%A",
    });
  });
});

describe("roundUrl", () => {
  it("is <verifyBaseUrl>/rounds/{roundId}", () => {
    expect(roundUrl("https://se.example/verify", ID)).toBe(
      `https://se.example/verify/rounds/${ID}`,
    );
  });

  it("drops a trailing slash of the base", () => {
    expect(roundUrl("https://se.example/verify/", ID)).toBe(
      `https://se.example/verify/rounds/${ID}`,
    );
  });
});
