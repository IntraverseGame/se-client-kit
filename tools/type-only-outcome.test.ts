import { describe, expect, it } from "vitest";

import {
  importOutcomeProblem,
  OUTCOME_PREFIX,
  typeOnlyOutcomeProblems,
} from "./type-only-outcome.ts";

const line = (outcome: unknown): string =>
  `${OUTCOME_PREFIX}${JSON.stringify(outcome)}`;

describe("importOutcomeProblem", () => {
  it("passes ERR_PACKAGE_PATH_NOT_EXPORTED only", () => {
    expect(
      importOutcomeProblem("p/x", {
        resolved: false,
        code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
      }),
    ).toBeUndefined();
  });

  it("reports an entry that resolved at run time", () => {
    expect(importOutcomeProblem("p/x", { resolved: true })).toBe(
      "p/x: the type-only entry resolved at run time",
    );
  });

  it.each([
    ["ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING"],
    ["ERR_MODULE_NOT_FOUND"],
  ])("reports another error code (%s)", code => {
    expect(importOutcomeProblem("p/x", { resolved: false, code })).toBe(
      `p/x: importing the type-only entry failed with ${code}, not ERR_PACKAGE_PATH_NOT_EXPORTED`,
    );
  });

  it("reports an error without a code", () => {
    expect(
      importOutcomeProblem("p/x", { resolved: false, code: undefined }),
    ).toBe(
      "p/x: importing the type-only entry failed with no error code, not ERR_PACKAGE_PATH_NOT_EXPORTED",
    );
  });
});

describe("typeOnlyOutcomeProblems", () => {
  it("passes an ERR_PACKAGE_PATH_NOT_EXPORTED outcome among other output", () => {
    expect(
      typeOnlyOutcomeProblems(
        ["p/x"],
        `noise\n${line({ specifier: "p/x", resolved: false, code: "ERR_PACKAGE_PATH_NOT_EXPORTED" })}\n`,
      ),
    ).toEqual([]);
  });

  it("reports a resolved outcome and another code", () => {
    expect(
      typeOnlyOutcomeProblems(
        ["p/x", "p/y"],
        [
          line({ specifier: "p/x", resolved: true }),
          line({
            specifier: "p/y",
            resolved: false,
            code: "ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING",
          }),
        ].join("\n"),
      ),
    ).toEqual([
      "p/x: the type-only entry resolved at run time",
      "p/y: importing the type-only entry failed with ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING, not ERR_PACKAGE_PATH_NOT_EXPORTED",
    ]);
  });

  it("reports a null code as no error code", () => {
    expect(
      typeOnlyOutcomeProblems(
        ["p/x"],
        line({ specifier: "p/x", resolved: false, code: null }),
      ),
    ).toEqual([
      "p/x: importing the type-only entry failed with no error code, not ERR_PACKAGE_PATH_NOT_EXPORTED",
    ]);
  });

  it("reports a missing outcome, never a pass", () => {
    expect(typeOnlyOutcomeProblems(["p/x"], "")).toEqual([
      "p/x: no outcome for the type-only entry's run-time import",
    ]);
  });

  it.each([
    ["not JSON", `${OUTCOME_PREFIX}{`],
    ["not an object", `${OUTCOME_PREFIX}"p/x"`],
    ["no specifier", line({ resolved: true })],
    ["no resolved flag", line({ specifier: "p/x" })],
    [
      "a code that is not a string",
      line({ specifier: "p/x", resolved: false, code: 1 }),
    ],
  ])("reports an unreadable outcome line (%s), never a pass", (_, text) => {
    expect(typeOnlyOutcomeProblems(["p/x"], text)).toEqual([
      `an unreadable type-only outcome line: ${text}`,
      "p/x: no outcome for the type-only entry's run-time import",
    ]);
  });

  it("reports a repeated or unknown outcome line", () => {
    const pass = line({
      specifier: "p/x",
      resolved: false,
      code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
    });
    const resolved = line({ specifier: "p/x", resolved: true });
    const unknown = line({ specifier: "p/z", resolved: true });
    expect(
      typeOnlyOutcomeProblems(["p/x"], [pass, resolved, unknown].join("\n")),
    ).toEqual([
      `a repeated outcome for p/x: ${resolved}`,
      `an outcome for an unknown type-only entry: ${unknown}`,
    ]);
  });
});
