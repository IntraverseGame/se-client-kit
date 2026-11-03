import { describe, expect, it } from "vitest";

import { buildPagesConfigs, type PagesConfigInputs } from "../pages-config.ts";
import { validateEnvironmentConfig } from "./environment-config.ts";

// `earlierPins` in `PAGES_CHAIN_PINS` (V-3b): the verifier's document only. The
// hosts are reserved example names; the addresses are of the fixtures' style.

const WRAPPER = "https://wrapper.example";
const VERIFIER = "https://verifier.example";

const PINS = {
  environment: "preview",
  runtimeSigner: "0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e",
  registryDomain: {
    chainId: 31337,
    verifyingContract: "0xd5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5",
  },
  entropyChainId: { base: 8453 },
  minRpcQuorum: 2,
  tipLagMargin: { base: 2 },
};

const ENDPOINTS = {
  base: [
    { provider: "p1", url: "https://rpc1.example/base" },
    { provider: "p2", url: "https://rpc2.example/base" },
  ],
};

const inputs = (
  overrides: Partial<Record<keyof PagesConfigInputs, string>> = {},
): PagesConfigInputs => ({
  PAGES_WRAPPER_ORIGIN: WRAPPER,
  PAGES_VERIFIER_ORIGIN: VERIFIER,
  PAGES_CHAIN_PINS: JSON.stringify(PINS),
  PAGES_RPC_ENDPOINTS: JSON.stringify(ENDPOINTS),
  PAGES_RPC_ORIGINS: "https://rpc2.example https://rpc1.example",
  PAGES_GAME_ORIGINS: "https://game.example",
  PAGES_OPERATOR_ORIGINS:
    "https://operator-b.example\nhttps://operator-a.example",
  ...overrides,
});

type Built = {
  wrapper: Record<string, unknown>;
  verifier: Record<string, unknown>;
};

const parsed = (
  overrides: Partial<Record<keyof PagesConfigInputs, string>> = {},
): Built => {
  const result = buildPagesConfigs(inputs(overrides));
  if (!result.ok) throw new Error(result.issues.join("; "));
  return {
    wrapper: JSON.parse(result.configs.wrapper) as Record<string, unknown>,
    verifier: JSON.parse(result.configs.verifier) as Record<string, unknown>,
  };
};

const built = (): Built => parsed();

const issuesOf = (
  overrides: Partial<Record<keyof PagesConfigInputs, string>>,
): readonly string[] => {
  const result = buildPagesConfigs(inputs(overrides));
  return result.ok ? [] : result.issues;
};

describe("earlierPins in the Pages sites' documents", () => {
  const PAIR = {
    registryDomain: {
      chainId: 127,
      verifyingContract: "0xc4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4",
    },
    runtimeSigner: "0x4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f",
  };
  const CURRENT = {
    registryDomain: PINS.registryDomain,
    runtimeSigner: PINS.runtimeSigner,
  };

  const withEarlier = (
    earlierPins: unknown,
  ): Partial<Record<keyof PagesConfigInputs, string>> => ({
    PAGES_CHAIN_PINS: JSON.stringify({ ...PINS, earlierPins }),
  });

  const documentsWith = (earlierPins: unknown): Built =>
    parsed(withEarlier(earlierPins));

  it("writes the list to the verifier's document only, last", () => {
    const { wrapper, verifier } = documentsWith([PAIR]);
    expect(verifier["earlierPins"]).toEqual([PAIR]);
    expect(Object.keys(verifier).at(-1)).toBe("earlierPins");
    expect(wrapper).not.toHaveProperty("earlierPins");
  });

  it("leaves the Wrapper's document as it is without the field", () => {
    const { wrapper } = documentsWith([PAIR]);
    expect(wrapper).toEqual(built().wrapper);
    expect(validateEnvironmentConfig(wrapper, WRAPPER).ok).toBe(true);
  });

  it("differs from the document without the field by the list alone", () => {
    const { verifier } = documentsWith([PAIR]);
    const { earlierPins: _, ...rest } = verifier;
    expect(rest).toEqual(built().verifier);
  });

  it("writes nothing for an empty list: the same documents as no field", () => {
    const without = buildPagesConfigs(inputs());
    expect(buildPagesConfigs(inputs(withEarlier([])))).toEqual(without);
  });

  it("makes the Wrapper's validator refuse a document with the field, as any unknown field", () => {
    const { verifier } = documentsWith([PAIR]);
    expect(validateEnvironmentConfig(verifier, VERIFIER)).toEqual({
      ok: false,
      issues: [{ code: "unknown-field", field: "earlierPins" }],
    });
  });

  it("accepts an address in another case and keeps it as written", () => {
    const mixed = {
      ...PAIR,
      runtimeSigner: "0x4F4F4F4F4F4F4F4F4F4F4F4F4F4F4F4F4F4F4F4F",
    };
    expect(documentsWith([mixed]).verifier["earlierPins"]).toEqual([mixed]);
  });

  it("accepts the current domain with an earlier signer, and the reverse", () => {
    expect(
      issuesOf(
        withEarlier([
          { ...CURRENT, runtimeSigner: PAIR.runtimeSigner },
          { ...CURRENT, registryDomain: PAIR.registryDomain },
        ]),
      ),
    ).toEqual([]);
  });

  it.each<[string, unknown, string]>([
    ["a value that is no list", {}, "earlierPins is not a list"],
    ["null", null, "earlierPins is not a list"],
    ["an entry that is no object", ["text"], "earlierPins entry 0 is not"],
    [
      "an entry without a signer",
      [{ registryDomain: PAIR.registryDomain }],
      "earlierPins entry 0 is not",
    ],
    [
      "an entry with an end time",
      [{ ...PAIR, endTime: 1 }],
      "earlierPins entry 0 is not",
    ],
    [
      "a domain with another field",
      [
        {
          ...PAIR,
          registryDomain: { ...PAIR.registryDomain, name: "SuperEngine" },
        },
      ],
      "earlierPins entry 0 is not",
    ],
    [
      "the zero signer",
      [{ ...PAIR, runtimeSigner: `0x${"0".repeat(40)}` }],
      "earlierPins entry 0: invalid-signer at runtimeSigner",
    ],
    [
      "a zero chain id",
      [
        {
          ...PAIR,
          registryDomain: { ...PAIR.registryDomain, chainId: 0 },
        },
      ],
      "earlierPins entry 0: invalid-domain at registryDomain",
    ],
    ["the current pair", [CURRENT], "earlierPins entry 0 is the current pair"],
    [
      "the current pair in another case",
      [
        {
          ...CURRENT,
          registryDomain: {
            ...PINS.registryDomain,
            verifyingContract: PINS.registryDomain.verifyingContract
              .toUpperCase()
              .replace("0X", "0x"),
          },
        },
      ],
      "earlierPins entry 0 is the current pair",
    ],
    [
      "a repeated pair",
      [PAIR, PAIR],
      "earlierPins entry 1 repeats another entry",
    ],
  ])("refuses %s, naming the input", (_, earlierPins, expected) => {
    expect(issuesOf(withEarlier(earlierPins)).join("\n")).toContain(
      `PAGES_CHAIN_PINS: ${expected}`,
    );
  });

  it("names no value of an entry, nor a field name it supplies", () => {
    const issues = issuesOf(
      withEarlier([
        { ...PAIR, "not-to-be-printed-a": 1 },
        { ...PAIR, runtimeSigner: "not-to-be-printed-b" },
      ]),
    );
    expect(issues).toHaveLength(2);
    expect(issues.join("\n")).not.toContain("not-to-be-printed");
  });
});
