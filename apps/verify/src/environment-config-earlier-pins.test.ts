// V-3b: `earlierPins` in the page's validator, in the closed style of
// `registryDomain`. An issue names an index, never a value.

import { describe, expect, it } from "vitest";

import {
  type ConfigIssue,
  validateEnvironmentConfig,
  type VerifyConfig,
} from "./environment-config.ts";
import { environmentDocument, OWN_ORIGIN } from "./fixtures/environment.ts";

const accepted = (document: unknown): VerifyConfig => {
  const result = validateEnvironmentConfig(document, OWN_ORIGIN);
  if (!result.ok) {
    throw new TypeError(`refused: ${JSON.stringify(result.issues)}`);
  }
  return result.config;
};

const issues = (document: unknown): readonly ConfigIssue[] => {
  const result = validateEnvironmentConfig(document, OWN_ORIGIN);
  return result.ok ? [] : result.issues;
};

describe("earlierPins (V-3b)", () => {
  const PAIR = {
    registryDomain: {
      chainId: 127,
      verifyingContract: "0xD5d5d5D5d5d5d5d5d5D5d5d5d5d5d5d5d5d5d5D5",
    },
    runtimeSigner: "0x4F4f4f4F4f4f4f4f4f4f4f4f4f4F4f4f4f4f4f4f",
  };
  // Another pair than any entry's below, so an entry is refused for itself and
  // never for repeating this one.
  const FIRST = { ...PAIR, runtimeSigner: `0x${"ab".repeat(20)}` };
  const CURRENT = {
    registryDomain: environmentDocument()["registryDomain"],
    runtimeSigner: environmentDocument()["runtimeSigner"],
  };

  it("is an empty list when absent, or empty", () => {
    expect(accepted(environmentDocument()).earlierPins).toEqual([]);
    expect(
      accepted(environmentDocument({ earlierPins: [] })).earlierPins,
    ).toEqual([]);
  });

  it("reads each pair typed, lowercased, and frozen, in order", () => {
    const other = { ...PAIR, runtimeSigner: `0x${"ab".repeat(20)}` };
    const { earlierPins } = accepted(
      environmentDocument({ earlierPins: [PAIR, other] }),
    );
    expect(earlierPins).toEqual([
      {
        registryDomain: {
          chainId: 127n,
          verifyingContract: `0x${"d5".repeat(20)}`,
        },
        runtimeSigner: `0x${"4f".repeat(20)}`,
      },
      {
        registryDomain: {
          chainId: 127n,
          verifyingContract: `0x${"d5".repeat(20)}`,
        },
        runtimeSigner: `0x${"ab".repeat(20)}`,
      },
    ]);
    expect(Object.isFrozen(earlierPins)).toBe(true);
    expect(Object.isFrozen(earlierPins[0])).toBe(true);
  });

  it("accepts the current domain with an earlier signer, and the reverse", () => {
    expect(
      issues(
        environmentDocument({
          earlierPins: [
            { ...CURRENT, runtimeSigner: PAIR.runtimeSigner },
            { ...CURRENT, registryDomain: PAIR.registryDomain },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it.each([null, {}, "text", 1])("refuses a field that is %j", value => {
    expect(issues(environmentDocument({ earlierPins: value }))).toEqual([
      { code: "invalid-earlier-pins", field: "earlierPins" },
    ]);
  });

  it.each<[string, unknown]>([
    ["not an object", "text"],
    ["null", null],
    ["without a signer", { registryDomain: PAIR.registryDomain }],
    ["without a domain", { runtimeSigner: PAIR.runtimeSigner }],
    ["with an end time", { ...PAIR, endTime: 1 }],
    ["with the zero signer", { ...PAIR, runtimeSigner: `0x${"0".repeat(40)}` }],
    ["with a short signer", { ...PAIR, runtimeSigner: "0x1234" }],
    [
      "with a zero chain id",
      { ...PAIR, registryDomain: { ...PAIR.registryDomain, chainId: 0 } },
    ],
    [
      "with a chain id as text",
      { ...PAIR, registryDomain: { ...PAIR.registryDomain, chainId: "127" } },
    ],
    [
      "with the zero contract",
      {
        ...PAIR,
        registryDomain: {
          chainId: 127,
          verifyingContract: `0x${"0".repeat(40)}`,
        },
      },
    ],
    [
      "with another field in its domain",
      { ...PAIR, registryDomain: { ...PAIR.registryDomain, name: "x" } },
    ],
    ["equal to the current pair", CURRENT],
    [
      "equal to the current pair in another case",
      {
        ...CURRENT,
        runtimeSigner: String(CURRENT.runtimeSigner).toLowerCase(),
      },
    ],
    ["repeating another entry", FIRST],
  ])("refuses an entry %s, by its index", (_, entry) => {
    expect(
      issues(environmentDocument({ earlierPins: [FIRST, entry] })),
    ).toEqual([{ code: "invalid-earlier-pins", field: "earlierPins.1" }]);
  });

  it("names an index, never a value", () => {
    const found = issues(
      environmentDocument({
        earlierPins: [{ ...PAIR, runtimeSigner: "not-to-be-printed" }],
      }),
    );
    expect(found).toHaveLength(1);
    expect(JSON.stringify(found)).not.toContain("not-to-be-printed");
  });
});
