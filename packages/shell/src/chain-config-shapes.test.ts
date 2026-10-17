// T-8a (configuration): every field of the chain configuration is read from
// untrusted parsed JSON, and a value of the wrong shape is refused.

import { describe, expect, it } from "vitest";

import {
  configDocument,
  endpoints,
  issueCodes,
  issuesOf,
  REGISTRY,
  SOURCE,
} from "./fixtures/chain-config.ts";

const twoWith = (first: unknown): Record<string, unknown> => ({
  [SOURCE]: [first, { provider: "p2", url: "https://b.example/" }],
});

describe("validateChainConfig shapes", () => {
  it.each([
    [{ environment: "staging" }, "invalid-environment"],
    [{ environment: undefined }, "invalid-environment"],
    [{ runtimeSigner: "0x1234" }, "invalid-signer"],
    [{ runtimeSigner: `0x${"0".repeat(40)}` }, "invalid-signer"],
    [{ runtimeSigner: `0x${"g".repeat(40)}` }, "invalid-signer"],
    [{ registryDomain: undefined }, "invalid-domain"],
    [
      { registryDomain: { chainId: 0, verifyingContract: REGISTRY } },
      "invalid-domain",
    ],
    [
      { registryDomain: { chainId: "1", verifyingContract: REGISTRY } },
      "invalid-domain",
    ],
    [
      {
        registryDomain: {
          chainId: 1,
          verifyingContract: `0x${"0".repeat(40)}`,
        },
      },
      "invalid-domain",
    ],
    [{ minRpcQuorum: 0 }, "invalid-quorum"],
    [{ minRpcQuorum: 2.5 }, "invalid-quorum"],
    [{ minRpcQuorum: "2" }, "invalid-quorum"],
  ] as const)("refuses %j with %s", (overrides, code) => {
    expect(issueCodes(configDocument(overrides))).toEqual([code]);
  });

  it.each([0, -1, 1.5, "1", null, 1n, 2 ** 53])(
    "refuses an entropy chain id of %s",
    chainId => {
      expect(
        issueCodes(configDocument({ entropyChainId: { [SOURCE]: chainId } })),
      ).toEqual(["invalid-entropy-chain-id"]);
    },
  );

  it.each([-1, 1.5, "2", null, 2n])("refuses a lag margin of %s", margin => {
    expect(
      issueCodes(configDocument({ tipLagMargin: { [SOURCE]: margin } })),
    ).toEqual(["invalid-lag-margin"]);
  });

  it.each([
    ["no sources", {}],
    ["an empty list", { [SOURCE]: [] }],
    ["a list that is not one", { [SOURCE]: "https://a.example/" }],
    ["a bad source name", { "bad name": endpoints(2) }],
    [
      "an http URL off loopback",
      twoWith({ provider: "p1", url: "http://a.example/" }),
    ],
    [
      "a URL with credentials",
      twoWith({ provider: "p1", url: "https://user@a.example/" }),
    ],
    [
      "a URL with a query string",
      twoWith({ provider: "p1", url: "https://a.example/?k=v" }),
    ],
    [
      "a URL with a fragment",
      twoWith({ provider: "p1", url: "https://a.example/#top" }),
    ],
    [
      "a URL with a fragment right after the host",
      twoWith({ provider: "p1", url: "https://a.example#top" }),
    ],
    [
      "a loopback URL with a fragment right after the host",
      twoWith({ provider: "p1", url: "http://localhost#x" }),
    ],
    [
      "an http URL on a host that only starts with localhost",
      twoWith({ provider: "p1", url: "http://localhost.evil.example/" }),
    ],
    ["an endpoint without a provider", twoWith({ url: "https://a.example/" })],
    [
      "a provider name with a space",
      twoWith({ provider: "p 1", url: "https://a.example/" }),
    ],
  ])("refuses rpcEndpoints with %s", (_label, rpcEndpoints) => {
    expect(issueCodes(configDocument({ rpcEndpoints }))).toContain(
      "invalid-endpoints",
    );
  });

  it.each(["http://[::1]", "http://[::1]:8545/", "http://localhost:8545"])(
    "accepts the loopback http URL %s",
    url => {
      const rpcEndpoints = twoWith({ provider: "p1", url });
      expect(issueCodes(configDocument({ rpcEndpoints }))).toEqual([]);
    },
  );

  it("does not read an inherited property as a field", () => {
    const document = Object.create(configDocument()) as object;
    expect(issueCodes(document)).toContain("invalid-environment");
  });

  it("reports every issue of a document that is not an object", () => {
    expect(issueCodes(null)).toEqual([
      "invalid-environment",
      "invalid-signer",
      "invalid-domain",
      "invalid-endpoints",
      "invalid-lag-margin",
      "invalid-entropy-chain-id",
    ]);
  });

  it("never echoes a value in an issue", () => {
    const document = configDocument({ runtimeSigner: "secret-looking-text" });
    expect(JSON.stringify(issuesOf(document))).not.toContain(
      "secret-looking-text",
    );
  });
});
