// T-9a, 6: the framing decision (W-49a). A page that is not framed is a
// standalone launch with no handshake; a nested one is refused on every path;
// where `location.ancestorOrigins` exists, a framed page goes on to the
// handshake only with exactly one entry, on `operatorOrigins`; where it is
// missing, the handshake decides.

import { describe, expect, it } from "vitest";

import {
  checkEmbedding,
  type EmbeddingContext,
  embeddingOf,
} from "./embedding.ts";

const OPERATOR = "https://operator.example";
const OTHER = "https://evil.example";

const framed = (
  ancestorOrigins?: readonly string[],
  nested = false,
): EmbeddingContext => ({ framed: true, nested, ancestorOrigins });

describe("checkEmbedding (W-49a)", () => {
  it("a page that is not framed needs no handshake, whatever the list", () => {
    for (const operatorOrigins of [[], [OPERATOR]]) {
      expect(
        checkEmbedding(
          { framed: false, nested: false, ancestorOrigins: [] },
          operatorOrigins,
        ),
      ).toEqual({ ok: true, handshake: false });
    }
  });

  it("a frame with one listed ancestor goes on to the handshake", () => {
    expect(checkEmbedding(framed([OPERATOR]), [OPERATOR])).toEqual({
      ok: true,
      handshake: true,
    });
  });

  it("a frame without location.ancestorOrigins goes on to the handshake", () => {
    expect(checkEmbedding(framed(), [OPERATOR])).toEqual({
      ok: true,
      handshake: true,
    });
  });

  it.each<[string, readonly string[] | undefined, boolean, string]>([
    ["an unlisted ancestor", [OTHER], false, "ancestor-not-allowed"],
    ["a masked ancestor", ["null"], false, "ancestor-masked"],
    ["an empty list", [], false, "ancestors-unknown"],
    ["two listed ancestors", [OPERATOR, OPERATOR], false, "nested"],
    ["a masked one among two", [OPERATOR, "null"], false, "nested"],
    ["parent !== top, with the list", [OPERATOR], true, "nested"],
    ["parent !== top, without the list", undefined, true, "nested"],
  ])("refuses %s", (_what, ancestorOrigins, nested, reason) => {
    expect(checkEmbedding(framed(ancestorOrigins, nested), [OPERATOR])).toEqual(
      { ok: false, reason },
    );
  });

  it("refuses every frame with the list when no operator is listed", () => {
    expect(checkEmbedding(framed([OPERATOR]), [])).toEqual({
      ok: false,
      reason: "ancestor-not-allowed",
    });
  });
});

describe("embeddingOf", () => {
  it("reads a top-level page", () => {
    const self = {};
    expect(
      embeddingOf({
        parent: self,
        self,
        top: self,
        location: { ancestorOrigins: [] },
      }),
    ).toEqual({ framed: false, nested: false, ancestorOrigins: [] });
  });

  it("reads a direct frame and its ancestor", () => {
    const parent = {};
    expect(
      embeddingOf({
        parent,
        self: {},
        top: parent,
        location: { ancestorOrigins: [OPERATOR] },
      }),
    ).toEqual({ framed: true, nested: false, ancestorOrigins: [OPERATOR] });
  });

  it("reads a nested frame", () => {
    expect(
      embeddingOf({ parent: {}, self: {}, top: {}, location: {} }),
    ).toEqual({ framed: true, nested: true, ancestorOrigins: undefined });
  });
});
