// The W-29 version helper (RFC-002, Q10): it finds a `version` that went down
// only among responses that did not overlap another Snapshot response in time.
// Two requests in flight may be answered in either order, which is not the
// backend's counter going down.

import { expect, test } from "../harness/worker-browser.ts";
import {
  versionDecreases,
  type VersionRecord,
} from "../preview-support/snapshot-versions.ts";

const record = (
  startedAt: number,
  endedAt: number,
  version: number,
): VersionRecord => ({ startedAt, endedAt, version });

test.describe("the version helper", () => {
  test("finds nothing in a rising sequence", () => {
    expect(
      versionDecreases([record(0, 1, 1), record(2, 3, 2), record(4, 5, 5)]),
    ).toEqual([]);
  });

  test("finds nothing for equal versions or for no records", () => {
    expect(versionDecreases([record(0, 1, 2), record(2, 3, 2)])).toEqual([]);
    expect(versionDecreases([])).toEqual([]);
  });

  test("finds a decrease between responses that did not overlap", () => {
    expect(
      versionDecreases([record(0, 1, 4), record(2, 3, 3), record(4, 5, 6)]),
    ).toEqual([{ from: 4, to: 3 }]);
  });

  test("orders by when the request began, not by when it was recorded", () => {
    expect(
      versionDecreases([record(4, 5, 6), record(0, 1, 4), record(2, 3, 5)]),
    ).toEqual([]);
  });

  test("ignores responses that overlapped another in time", () => {
    // 5 then 4 with overlapping requests: either order may arrive.
    expect(versionDecreases([record(0, 10, 5), record(2, 4, 4)])).toEqual([]);
    expect(
      versionDecreases([record(0, 3, 5), record(2, 6, 4), record(8, 9, 7)]),
    ).toEqual([]);
  });

  test("treats a request that starts as another ends as not overlapping", () => {
    expect(versionDecreases([record(0, 2, 5), record(2, 4, 4)])).toEqual([
      { from: 5, to: 4 },
    ]);
  });

  test("finds a decrease between two lone responses around an overlapping pair", () => {
    expect(
      versionDecreases([
        record(0, 1, 9),
        record(2, 6, 10),
        record(3, 5, 8),
        record(7, 8, 7),
      ]),
    ).toEqual([{ from: 9, to: 7 }]);
  });
});
