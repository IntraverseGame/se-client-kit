// V-3: the environment configuration document, validated by the page with the
// Wrapper's rules (the same document, the same schema) before anything else is
// read. One refusal per issue code; an issue names a field, never a value.

import { describe, expect, it } from "vitest";

import {
  CONFIG_FIELDS,
  type ConfigIssue,
  validateEnvironmentConfig,
  type VerifyConfig,
} from "./environment-config.ts";
import {
  endpoints,
  environmentDocument,
  OWN_ORIGIN,
  SOURCE,
} from "./fixtures/environment.ts";

const accepted = (
  document: unknown,
  ownOrigin: string = OWN_ORIGIN,
): VerifyConfig => {
  const result = validateEnvironmentConfig(document, ownOrigin);
  if (!result.ok) {
    throw new TypeError(`refused: ${JSON.stringify(result.issues)}`);
  }
  return result.config;
};

const issues = (
  document: unknown,
  ownOrigin: string = OWN_ORIGIN,
): readonly ConfigIssue[] => {
  const result = validateEnvironmentConfig(document, ownOrigin);
  return result.ok ? [] : result.issues;
};

const codes = (document: unknown, ownOrigin: string = OWN_ORIGIN): string[] =>
  issues(document, ownOrigin).map(issue => issue.code);

describe("a valid document", () => {
  it("is accepted, typed, and frozen", () => {
    const config = accepted(environmentDocument());
    expect(config).toEqual({
      environment: "production",
      runtimeSigner: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
      registryDomain: {
        chainId: 31337n,
        verifyingContract: "0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e",
      },
      minRpcQuorum: 2,
      sources: { [SOURCE]: { chainId: 8453, endpoints: endpoints(2) } },
      verifyBaseUrl: "https://se.example/verify",
      verifyApiBaseUrl: "https://se.example/verify/v1",
    });
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.sources)).toBe(true);
  });

  it("knows the Wrapper's fields, and only them", () => {
    expect(new Set(CONFIG_FIELDS)).toEqual(
      new Set(Object.keys(environmentDocument())),
    );
  });

  it("defaults minRpcQuorum to 2", () => {
    const document = environmentDocument();
    delete document["minRpcQuorum"];
    expect(accepted(document).minRpcQuorum).toBe(2);
  });

  it("accepts a local document with one loopback node and quorum 1", () => {
    const config = accepted(
      environmentDocument({
        environment: "local",
        playApiBaseUrl: "http://localhost:8080/play/v1",
        verifyBaseUrl: "http://localhost:8081/verify",
        verifyApiBaseUrl: "http://localhost:8080/verify/v1",
        minRpcQuorum: 1,
        rpcEndpoints: {
          [SOURCE]: [{ provider: "anvil", url: "http://localhost:8545" }],
        },
        operatorOrigins: [],
      }),
      "http://localhost:8080",
    );
    expect(config.environment).toBe("local");
    expect(config.minRpcQuorum).toBe(1);
  });
});

describe("one refusal per issue code", () => {
  it.each<[string, Record<string, unknown>, ConfigIssue]>([
    [
      "an unknown field",
      { telemetryUrl: "https://collector.example" },
      { code: "unknown-field", field: "telemetryUrl" },
    ],
    [
      "an unknown environment",
      { environment: "staging" },
      { code: "invalid-environment", field: "environment" },
    ],
    [
      "the zero signer",
      { runtimeSigner: `0x${"0".repeat(40)}` },
      { code: "invalid-signer", field: "runtimeSigner" },
    ],
    [
      "a domain without a chain id",
      {
        registryDomain: {
          verifyingContract: "0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e",
        },
      },
      { code: "invalid-domain", field: "registryDomain" },
    ],
    [
      "a quorum of 0",
      { minRpcQuorum: 0 },
      { code: "invalid-quorum", field: "minRpcQuorum" },
    ],
    [
      "production with quorum 1",
      { minRpcQuorum: 1 },
      { code: "production-quorum", field: "minRpcQuorum" },
    ],
    [
      "two endpoints of one provider (without case)",
      {
        rpcEndpoints: {
          [SOURCE]: [
            { provider: "p1", url: "https://rpc1.example/base" },
            { provider: "P1", url: "https://rpc2.example/base" },
          ],
        },
      },
      { code: "shared-provider", field: `rpcEndpoints.${SOURCE}` },
    ],
    [
      "fewer endpoints than the quorum",
      { minRpcQuorum: 3 },
      { code: "quorum-unreachable", field: `rpcEndpoints.${SOURCE}` },
    ],
    [
      "an entropy chain id of 0",
      { entropyChainId: { [SOURCE]: 0 } },
      { code: "invalid-entropy-chain-id", field: `entropyChainId.${SOURCE}` },
    ],
    [
      "a negative lag margin",
      { tipLagMargin: { [SOURCE]: -1 } },
      { code: "invalid-lag-margin", field: `tipLagMargin.${SOURCE}` },
    ],
    [
      "a play API base without /play/v1",
      { playApiBaseUrl: "https://se.example/play" },
      { code: "invalid-play-api-base", field: "playApiBaseUrl" },
    ],
    [
      "a verify base with a query",
      { verifyBaseUrl: "https://se.example/verify?x=1" },
      { code: "invalid-verify-base", field: "verifyBaseUrl" },
    ],
    [
      "a verify API base without /verify/v1",
      { verifyApiBaseUrl: "https://se.example/verify" },
      { code: "invalid-verify-api-base", field: "verifyApiBaseUrl" },
    ],
    [
      "no game origin",
      { gameOrigins: [] },
      { code: "invalid-game-origins", field: "gameOrigins" },
    ],
    [
      "an operator origin with a path",
      { operatorOrigins: ["https://operator.example/lobby"] },
      { code: "invalid-operator-origins", field: "operatorOrigins" },
    ],
    [
      "an operator origin that is a game origin",
      { operatorOrigins: ["https://game.example"] },
      { code: "overlapping-origins", field: "operatorOrigins" },
    ],
    [
      "the page's own origin as a game origin",
      { gameOrigins: [OWN_ORIGIN] },
      { code: "overlapping-origins", field: "gameOrigins" },
    ],
  ])("refuses %s", (_, overrides, issue) => {
    expect(issues(environmentDocument(overrides))).toEqual([issue]);
  });
});

describe("a source whose endpoints are refused", () => {
  // As the Wrapper's: the source is dropped, so its per-source entries then
  // name a source with no endpoints and are refused too.
  const dropped = [
    { code: "invalid-lag-margin", field: `tipLagMargin.${SOURCE}` },
    { code: "invalid-entropy-chain-id", field: `entropyChainId.${SOURCE}` },
  ];

  it("refuses an endpoint over plain http on a public host", () => {
    const document = environmentDocument({
      rpcEndpoints: {
        [SOURCE]: [
          { provider: "p1", url: "http://rpc1.example/base" },
          { provider: "p2", url: "https://rpc2.example/base" },
        ],
      },
    });
    expect(issues(document)).toEqual([
      { code: "invalid-endpoints", field: `rpcEndpoints.${SOURCE}` },
      ...dropped,
    ]);
  });

  it("refuses an empty endpoint map", () => {
    expect(issues(environmentDocument({ rpcEndpoints: {} }))).toEqual([
      { code: "invalid-endpoints", field: "rpcEndpoints" },
      ...dropped,
    ]);
  });
});

describe("the verify API base (D-4)", () => {
  it("is required, never derived or defaulted", () => {
    const document = environmentDocument();
    delete document["verifyApiBaseUrl"];
    expect(codes(document)).toEqual(["invalid-verify-api-base"]);
  });

  it.each([
    ["a trailing slash", "https://se.example/verify/v1/"],
    ["credentials", "https://user:pw@se.example/verify/v1"],
    ["a fragment", "https://se.example/verify/v1#x"],
    ["plain http on a public host", "http://se.example/verify/v1"],
    ["not written as the parser writes it", "HTTPS://se.example/verify/v1"],
  ])("refuses %s", (_, value) => {
    expect(codes(environmentDocument({ verifyApiBaseUrl: value }))).toEqual([
      "invalid-verify-api-base",
    ]);
  });

  it.each([
    ["https://se.example/verify/v1", OWN_ORIGIN],
    ["https://se.example/api/verify/v1", OWN_ORIGIN],
    ["http://localhost:8080/verify/v1", "http://localhost:8080"],
  ])("accepts %s on the page's own origin %s (V-3a)", (value, ownOrigin) => {
    expect(
      accepted(environmentDocument({ verifyApiBaseUrl: value }), ownOrigin)
        .verifyApiBaseUrl,
    ).toBe(value);
  });

  it.each([
    ["another host", "https://verify-api.example/verify/v1", OWN_ORIGIN],
    ["a subdomain", "https://api.se.example/verify/v1", OWN_ORIGIN],
    [
      "another scheme",
      "http://localhost:8080/verify/v1",
      "https://localhost:8080",
    ],
    ["another port", "https://se.example:8443/verify/v1", OWN_ORIGIN],
  ])("refuses %s than the page's own origin (V-3a)", (_, value, ownOrigin) => {
    expect(
      issues(environmentDocument({ verifyApiBaseUrl: value }), ownOrigin),
    ).toEqual([{ code: "invalid-verify-api-base", field: "verifyApiBaseUrl" }]);
  });
});

describe("a document that is not an object", () => {
  it.each([null, [], "text", 1])("reports every required field: %j", value => {
    expect(codes(value)).toEqual(
      expect.arrayContaining([
        "invalid-environment",
        "invalid-signer",
        "invalid-domain",
        "invalid-endpoints",
        "invalid-play-api-base",
        "invalid-verify-base",
        "invalid-verify-api-base",
        "invalid-game-origins",
        "invalid-operator-origins",
      ]),
    );
  });
});

describe("issues", () => {
  it("name a field, never a value", () => {
    const withCredentials = "https://user:pw-text@se.example/verify/v1";
    const found = issues(
      environmentDocument({ verifyApiBaseUrl: withCredentials }),
    );
    expect(JSON.stringify(found)).not.toContain("pw-text");
  });
});
