// The fake Play API's request-body tables are exactly the document's request
// types: a field the type does not have, a missing field, or the wrong
// optionality does not compile. Each `@ts-expect-error` below is such a table.

import { describe, expect, it } from "vitest";

import {
  REQUEST_SHAPES,
  type RequestShapes,
} from "./fixtures/request-shapes.ts";

describe("the request-body tables", () => {
  it("refuse an extra, a missing, or a wrongly optional field at compile time", () => {
    const wrong: readonly RequestShapes["redeemLaunchCode"][] = [
      // @ts-expect-error -- the redeem body has no field `extra` in the document
      { launchCode: "required", extra: "optional" },
      // @ts-expect-error -- the redeem body's `launchCode` is required in the document
      {},
      // @ts-expect-error -- `launchCode` is required, not optional
      { launchCode: "optional" },
    ];
    expect(wrong).toHaveLength(3);
  });

  it("take no body where the document takes none", () => {
    expect(REQUEST_SHAPES.refreshPlayToken).toBeUndefined();
    expect(REQUEST_SHAPES.getSnapshot).toBeUndefined();
  });
});
