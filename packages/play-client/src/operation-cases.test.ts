// The error tests' case table follows the vendored document: each operation's
// problem statuses are exactly the ones the document lists for it, and every
// operation has its case.

import { describe, expect, expectTypeOf, it } from "vitest";

import type { ListedStatus } from "./fixtures/fake-play-server.ts";
import { CASES, PROBLEMS } from "./fixtures/operation-cases.ts";
import { PLAY_ROUTES, type PlayOperationId } from "./play-api.ts";

type TableStatuses = {
  [Id in PlayOperationId]: (typeof PROBLEMS)[Id][number][0];
};

type DocumentStatuses = {
  [Id in PlayOperationId]: Exclude<ListedStatus<Id>, 200>;
};

describe("the operations' error cases", () => {
  it("list exactly the problem statuses the document lists, per operation", () => {
    expectTypeOf<TableStatuses>().toEqualTypeOf<DocumentStatuses>();
  });

  it("cover every operation of the document, with its own problems", () => {
    expect(CASES.map(c => c.id).toSorted()).toEqual(
      Object.keys(PLAY_ROUTES).toSorted(),
    );
    expect(CASES.map(c => c.problems)).toEqual(CASES.map(c => PROBLEMS[c.id]));
  });
});
