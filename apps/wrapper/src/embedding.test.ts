// W-49's fail-closed minimum: a page that is not framed is unchanged; a framed
// one is allowed only when `location.ancestorOrigins` exists and every entry
// is on `operatorOrigins`; a masked entry, an unlisted one, an empty list, or
// no list at all (Firefox) refuses.

import { describe, expect, it } from "vitest";

import { checkEmbedding, embeddingOf } from "./embedding.ts";

const OPERATOR = "https://operator.example";
const OTHER = "https://evil.example";

describe("checkEmbedding (W-49's minimum)", () => {
  it("allows a page that is not framed, whatever the list", () => {
    expect(
      checkEmbedding({ framed: false, ancestorOrigins: undefined }, []),
    ).toEqual({ ok: true });
  });

  it("allows a frame whose every ancestor is listed", () => {
    expect(
      checkEmbedding({ framed: true, ancestorOrigins: [OPERATOR, OPERATOR] }, [
        OPERATOR,
      ]),
    ).toEqual({ ok: true });
  });

  it.each([
    ["an unlisted ancestor", [OTHER], "ancestor-not-allowed"],
    ["one unlisted among listed", [OPERATOR, OTHER], "ancestor-not-allowed"],
    ["a masked ancestor", ["null"], "ancestor-masked"],
    ["a masked one among listed", [OPERATOR, "null"], "ancestor-masked"],
    ["an empty list", [], "ancestors-unknown"],
  ])("refuses %s", (_what, ancestorOrigins, reason) => {
    expect(
      checkEmbedding({ framed: true, ancestorOrigins }, [OPERATOR]),
    ).toEqual({ ok: false, reason });
  });

  it("refuses a frame with no ancestorOrigins (Firefox): no handshake yet", () => {
    expect(
      checkEmbedding({ framed: true, ancestorOrigins: undefined }, [OPERATOR]),
    ).toEqual({ ok: false, reason: "ancestors-unknown" });
  });

  it("refuses every frame when no operator is listed", () => {
    expect(
      checkEmbedding({ framed: true, ancestorOrigins: [OPERATOR] }, []),
    ).toEqual({ ok: false, reason: "ancestor-not-allowed" });
  });
});

describe("embeddingOf", () => {
  it("reads a top-level page", () => {
    const self = {};
    expect(
      embeddingOf({ parent: self, self, location: { ancestorOrigins: [] } }),
    ).toEqual({ framed: false, ancestorOrigins: [] });
  });

  it("reads a frame and its ancestors", () => {
    expect(
      embeddingOf({
        parent: {},
        self: {},
        location: { ancestorOrigins: [OPERATOR] },
      }),
    ).toEqual({ framed: true, ancestorOrigins: [OPERATOR] });
  });

  it("reads a frame where the platform has no ancestorOrigins", () => {
    expect(embeddingOf({ parent: {}, self: {}, location: {} })).toEqual({
      framed: true,
      ancestorOrigins: undefined,
    });
  });
});
