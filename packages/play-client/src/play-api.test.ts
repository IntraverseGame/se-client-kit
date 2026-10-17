// The routes compile only as the vendored document serves them: by literal
// path and method per operationId, so two operations of one shape (a move and
// a cash-out) cannot swap routes. Each `@ts-expect-error` below is a route the
// document does not serve; if one ever compiled, the typecheck would fail.

import { describe, expect, it } from "vitest";

import { PLAY_ROUTES, playRoute } from "./play-api.ts";

describe("playRoute", () => {
  it("compiles for the document's own route", () => {
    expect(
      playRoute("continueRound", "post", "/play/v1/rounds:continue"),
    ).toEqual(PLAY_ROUTES.continueRound);
  });

  it("does not compile a move at the cash-out route, or the reverse", () => {
    const swapped = [
      // @ts-expect-error -- the document serves continueRound at rounds:continue, not rounds:cashOut
      () => playRoute("continueRound", "post", "/play/v1/rounds:cashOut"),
      // @ts-expect-error -- the document serves cashOutRound at rounds:cashOut, not rounds:continue
      () => playRoute("cashOutRound", "post", "/play/v1/rounds:continue"),
      // @ts-expect-error -- the document serves getSnapshot with GET, not POST
      () => playRoute("getSnapshot", "post", "/play/v1/snapshot"),
    ];
    expect(swapped).toHaveLength(3);
  });
});
