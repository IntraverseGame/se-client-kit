import { describe, expect, it } from "vitest";

import { buildPagesConfigs, type PagesConfigInputs } from "../pages-config.ts";
import { validateEnvironmentConfig } from "./environment-config.ts";

// The Pages sites' environment configuration documents (pages-config.ts).
// The hosts are reserved example names; the addresses are the signing vectors'
// public development values, as in the Wrapper's own fixtures.

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

const built = (): Built => {
  const result = buildPagesConfigs(inputs());
  if (!result.ok) throw new Error(result.issues.join("; "));
  return {
    wrapper: JSON.parse(result.configs.wrapper) as Record<string, unknown>,
    verifier: JSON.parse(result.configs.verifier) as Record<string, unknown>,
  };
};

const issuesOf = (
  overrides: Partial<Record<keyof PagesConfigInputs, string>>,
): readonly string[] => {
  const result = buildPagesConfigs(inputs(overrides));
  return result.ok ? [] : result.issues;
};

describe("the Pages sites' configuration documents", () => {
  it("points each site's APIs at its own origin and the verify link at the verifier", () => {
    const { wrapper, verifier } = built();
    expect(wrapper["playApiBaseUrl"]).toBe(`${WRAPPER}/play/v1`);
    expect(wrapper["verifyApiBaseUrl"]).toBe(`${WRAPPER}/verify/v1`);
    expect(wrapper["verifyBaseUrl"]).toBe(`${VERIFIER}/verify`);
    expect(verifier["playApiBaseUrl"]).toBe(`${WRAPPER}/play/v1`);
    expect(verifier["verifyApiBaseUrl"]).toBe(`${VERIFIER}/verify/v1`);
    expect(verifier["verifyBaseUrl"]).toBe(`${VERIFIER}/verify`);
  });

  it("shares the chain pins, endpoints, and origin lists between the two", () => {
    const { wrapper, verifier } = built();
    for (const document of [wrapper, verifier]) {
      expect(document).toMatchObject(PINS);
      expect(document["rpcEndpoints"]).toEqual(ENDPOINTS);
      expect(document["gameOrigins"]).toEqual(["https://game.example"]);
      expect(document["operatorOrigins"]).toEqual([
        "https://operator-b.example",
        "https://operator-a.example",
      ]);
    }
  });

  it("writes documents the Wrapper's validator accepts for each site's origin", () => {
    const { wrapper, verifier } = built();
    expect(validateEnvironmentConfig(wrapper, WRAPPER).ok).toBe(true);
    expect(validateEnvironmentConfig(verifier, VERIFIER).ok).toBe(true);
  });

  it("writes the fields in the schema's order, as stable text", () => {
    const result = buildPagesConfigs(inputs());
    expect(result.ok).toBe(true);
    const again = buildPagesConfigs(inputs());
    expect(again).toEqual(result);
    expect(Object.keys(built().wrapper)).toEqual([
      "environment",
      "playApiBaseUrl",
      "verifyBaseUrl",
      "verifyApiBaseUrl",
      "runtimeSigner",
      "registryDomain",
      "rpcEndpoints",
      "entropyChainId",
      "minRpcQuorum",
      "tipLagMargin",
      "gameOrigins",
      "operatorOrigins",
    ]);
  });

  it("accepts an empty operator list (no page may embed the Wrapper)", () => {
    expect(issuesOf({ PAGES_OPERATOR_ORIGINS: "" })).toEqual([]);
  });

  it.each([
    [
      "a missing Wrapper origin",
      { PAGES_WRAPPER_ORIGIN: "" },
      "PAGES_WRAPPER_ORIGIN",
    ],
    [
      "an http Wrapper origin",
      { PAGES_WRAPPER_ORIGIN: "http://wrapper.example" },
      "PAGES_WRAPPER_ORIGIN",
    ],
    [
      "a verifier origin with a path",
      { PAGES_VERIFIER_ORIGIN: `${VERIFIER}/` },
      "PAGES_VERIFIER_ORIGIN",
    ],
    [
      "the same origin for both sites",
      { PAGES_VERIFIER_ORIGIN: WRAPPER },
      "PAGES_VERIFIER_ORIGIN",
    ],
    [
      "chain pins that are not JSON",
      { PAGES_CHAIN_PINS: "{" },
      "PAGES_CHAIN_PINS",
    ],
    [
      "chain pins that carry another field",
      { PAGES_CHAIN_PINS: JSON.stringify({ ...PINS, gameOrigins: [] }) },
      "PAGES_CHAIN_PINS: field gameOrigins",
    ],
    [
      "missing RPC endpoints",
      { PAGES_RPC_ENDPOINTS: "" },
      "PAGES_RPC_ENDPOINTS",
    ],
  ])("refuses %s", (_, overrides, expected) => {
    const issues = issuesOf(overrides);
    expect(issues.join("\n")).toContain(expected);
  });

  it.each([
    [
      "no game origin",
      { PAGES_GAME_ORIGINS: "" },
      "invalid-game-origins at gameOrigins",
    ],
    [
      "a game origin that is the Wrapper's",
      { PAGES_GAME_ORIGINS: WRAPPER },
      "wrapper document: overlapping-origins at gameOrigins",
    ],
    [
      "a game origin that is the verifier's",
      { PAGES_GAME_ORIGINS: VERIFIER },
      "verifier document: overlapping-origins at gameOrigins",
    ],
    [
      "an operator origin that is a game origin",
      { PAGES_OPERATOR_ORIGINS: "https://game.example" },
      "overlapping-origins at operatorOrigins",
    ],
    [
      "one RPC endpoint under a quorum of two",
      {
        PAGES_RPC_ENDPOINTS: JSON.stringify({
          base: ENDPOINTS.base.slice(0, 1),
        }),
        PAGES_RPC_ORIGINS: "https://rpc1.example",
      },
      "wrapper document:",
    ],
  ])(
    "refuses a document with %s, by the validator",
    (_, overrides, expected) => {
      expect(issuesOf(overrides).join("\n")).toContain(expected);
    },
  );

  it("refuses RPC origins that are not exactly the endpoints' origins", () => {
    for (const origins of [
      "https://rpc1.example",
      "https://rpc1.example https://rpc2.example https://rpc3.example",
      "",
    ]) {
      expect(issuesOf({ PAGES_RPC_ORIGINS: origins }).join("\n")).toContain(
        "PAGES_RPC_ORIGINS: not exactly the origins of PAGES_RPC_ENDPOINTS",
      );
    }
  });

  it("accepts the staging placeholder https://invalid.example", () => {
    // Staging's pre-RPC placeholders (real values: specs/wrapper.md): one placeholder
    // endpoint, a quorum of one (preview), and placeholder origin lists.
    const placeholder = "https://invalid.example";
    expect(
      issuesOf({
        PAGES_CHAIN_PINS: JSON.stringify({ ...PINS, minRpcQuorum: 1 }),
        PAGES_RPC_ENDPOINTS: JSON.stringify({
          base: [{ provider: "placeholder", url: placeholder }],
        }),
        PAGES_RPC_ORIGINS: placeholder,
        PAGES_GAME_ORIGINS: placeholder,
        PAGES_OPERATOR_ORIGINS: "",
      }),
    ).toEqual([]);
  });

  it("refuses the same placeholder as a game and an operator origin (W-49)", () => {
    const placeholder = "https://invalid.example";
    expect(
      issuesOf({
        PAGES_GAME_ORIGINS: placeholder,
        PAGES_OPERATOR_ORIGINS: placeholder,
      }).join("\n"),
    ).toContain("overlapping-origins at operatorOrigins");
  });

  it("never names a value in an issue", () => {
    const secretish = "https://not-to-be-printed.example";
    const issues = issuesOf({
      PAGES_GAME_ORIGINS: `${secretish}/path`,
      PAGES_WRAPPER_ORIGIN: `${secretish}:99999`,
    });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.join("\n")).not.toContain("not-to-be-printed");
  });
});
