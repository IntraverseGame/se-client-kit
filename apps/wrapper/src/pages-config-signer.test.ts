import { describe, expect, it } from "vitest";

import { buildPagesConfigs, type PagesConfigInputs } from "../pages-config.ts";
import { validateEnvironmentConfig } from "./environment-config.ts";

// T-48, the Wrapper's side (specs/signing-page.md, SP-15; specs/client-kit.md,
// The Pages sites' configuration): `PAGES_SIGNER_ORIGIN` and
// `PAGES_ACCEPT_PENDING_NOTICES` give the Wrapper's document its two delegation
// fields and the signing page its document, from one set of inputs. The
// signing page's validator runs on that document in
// tools/pages-signer-config.test.ts (no app imports the signing page). The
// hosts are reserved example names; the addresses are the signing vectors'
// public development values, as in pages-config.test.ts.

const WRAPPER = "https://wrapper.example";
const VERIFIER = "https://verifier.example";
const SIGNER = "https://signer.example-signer.test";

const pins = (environment: string) => ({
  environment,
  runtimeSigner: "0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e",
  registryDomain: {
    chainId: 31337,
    verifyingContract: "0xd5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5",
  },
  entropyChainKind: { base: "evm" },
  entropyChainId: { base: 8453 },
  minRpcQuorum: 2,
  tipLagMargin: { base: 2 },
});

type Overrides = Partial<Record<keyof PagesConfigInputs, string>>;

const inputs = (overrides: Overrides = {}): PagesConfigInputs => ({
  PAGES_WRAPPER_ORIGIN: WRAPPER,
  PAGES_VERIFIER_ORIGIN: VERIFIER,
  PAGES_CHAIN_PINS: JSON.stringify(pins("preview")),
  PAGES_RPC_ENDPOINTS: JSON.stringify({
    base: [
      { provider: "p1", url: "https://rpc1.example/base" },
      { provider: "p2", url: "https://rpc2.example/base" },
    ],
  }),
  PAGES_RPC_ORIGINS: "https://rpc1.example https://rpc2.example",
  PAGES_GAME_ORIGINS: "https://game.example",
  PAGES_OPERATOR_ORIGINS: "https://operator.example",
  ...overrides,
});

const PRODUCTION: Overrides = {
  PAGES_CHAIN_PINS: JSON.stringify(pins("production")),
};

type Built = {
  readonly wrapper: Record<string, unknown>;
  readonly verifier: Record<string, unknown>;
  readonly signer: string | undefined;
};

const built = (overrides: Overrides, production = false): Built => {
  const result = buildPagesConfigs(inputs(overrides), { production });
  if (!result.ok) throw new Error(result.issues.join("; "));
  return {
    wrapper: JSON.parse(result.configs.wrapper) as Record<string, unknown>,
    verifier: JSON.parse(result.configs.verifier) as Record<string, unknown>,
    signer: result.configs.signer,
  };
};

/** The signing page's document, read; `undefined` when none was built. */
const parsed = (text: string | undefined): unknown =>
  text === undefined ? undefined : JSON.parse(text);

const issuesOf = (
  overrides: Overrides,
  production = false,
): readonly string[] => {
  const result = buildPagesConfigs(inputs(overrides), { production });
  return result.ok ? [] : result.issues;
};

describe("the wallet delegation's configuration (T-48)", () => {
  it("names the signing page in the Wrapper's document only, and builds the signing page's", () => {
    const { wrapper, verifier, signer } = built({
      PAGES_SIGNER_ORIGIN: SIGNER,
    });
    expect(wrapper["signingPageOrigin"]).toBe(SIGNER);
    expect(wrapper).not.toHaveProperty("acceptPendingNotices");
    expect(verifier).not.toHaveProperty("signingPageOrigin");
    expect(verifier).not.toHaveProperty("acceptPendingNotices");
    expect(validateEnvironmentConfig(wrapper, WRAPPER).ok).toBe(true);
    // Exactly the three fields' document: the pins' environment and the
    // Wrapper's site alone, written in that order, with no flag.
    expect(signer).toBe(
      `${JSON.stringify({ environment: "preview", wrapperOrigins: [WRAPPER] }, undefined, 2)}\n`,
    );
  });

  it("writes the two delegation fields after the Wrapper's other fields", () => {
    const { wrapper } = built({
      PAGES_SIGNER_ORIGIN: SIGNER,
      PAGES_ACCEPT_PENDING_NOTICES: "true",
    });
    expect(Object.keys(wrapper).slice(-2)).toEqual([
      "signingPageOrigin",
      "acceptPendingNotices",
    ]);
  });

  it("writes acceptPendingNotices: true into both documents only when the input is true", () => {
    const { wrapper, verifier, signer } = built({
      PAGES_SIGNER_ORIGIN: SIGNER,
      PAGES_ACCEPT_PENDING_NOTICES: "true",
    });
    expect(wrapper["acceptPendingNotices"]).toBe(true);
    expect(verifier).not.toHaveProperty("acceptPendingNotices");
    expect(parsed(signer)).toEqual({
      environment: "preview",
      wrapperOrigins: [WRAPPER],
      acceptPendingNotices: true,
    });
    expect(validateEnvironmentConfig(wrapper, WRAPPER).ok).toBe(true);
  });

  it.each([
    ["unset", {}],
    ["empty", { PAGES_SIGNER_ORIGIN: "" }],
  ])(
    "writes nothing of the delegation without PAGES_SIGNER_ORIGIN (%s), whatever the flag",
    (_what, origin: Overrides) => {
      for (const flag of [{}, { PAGES_ACCEPT_PENDING_NOTICES: "true" }]) {
        const { wrapper, verifier, signer } = built({ ...origin, ...flag });
        expect(signer).toBeUndefined();
        for (const document of [wrapper, verifier]) {
          expect(document).not.toHaveProperty("signingPageOrigin");
          expect(document).not.toHaveProperty("acceptPendingNotices");
        }
      }
    },
  );

  it("treats an empty PAGES_ACCEPT_PENDING_NOTICES as unset", () => {
    const { wrapper, signer } = built({
      PAGES_SIGNER_ORIGIN: SIGNER,
      PAGES_ACCEPT_PENDING_NOTICES: "",
    });
    expect(wrapper).not.toHaveProperty("acceptPendingNotices");
    expect(parsed(signer)).not.toHaveProperty("acceptPendingNotices");
  });

  it.each(["false", "TRUE", "True", "1", "yes", " true", "true\n"])(
    "refuses PAGES_ACCEPT_PENDING_NOTICES %j, with or without a signing page",
    value => {
      const issue = "PAGES_ACCEPT_PENDING_NOTICES: neither unset nor true";
      expect(issuesOf({ PAGES_ACCEPT_PENDING_NOTICES: value })).toEqual([
        issue,
      ]);
      expect(
        issuesOf({
          PAGES_SIGNER_ORIGIN: SIGNER,
          PAGES_ACCEPT_PENDING_NOTICES: value,
        }),
      ).toEqual([issue]);
    },
  );

  it("builds production's documents with a signing page and no flag", () => {
    const { wrapper, signer } = built(
      { ...PRODUCTION, PAGES_SIGNER_ORIGIN: SIGNER },
      true,
    );
    expect(wrapper["signingPageOrigin"]).toBe(SIGNER);
    expect(parsed(signer)).toEqual({
      environment: "production",
      wrapperOrigins: [WRAPPER],
    });
  });

  it("refuses the flag in production mode, with or without a signing page", () => {
    const flag = { ...PRODUCTION, PAGES_ACCEPT_PENDING_NOTICES: "true" };
    const issue = "PAGES_ACCEPT_PENDING_NOTICES: pending-notices-in-production";
    expect(issuesOf(flag, true)).toEqual([issue]);
    expect(issuesOf({ ...flag, PAGES_SIGNER_ORIGIN: SIGNER }, true)).toEqual([
      issue,
    ]);
  });

  it("refuses the flag with a production environment through the Wrapper's validator, even outside production mode", () => {
    expect(
      issuesOf({
        ...PRODUCTION,
        PAGES_SIGNER_ORIGIN: SIGNER,
        PAGES_ACCEPT_PENDING_NOTICES: "true",
      }),
    ).toEqual([
      "wrapper document: pending-notices-in-production at acceptPendingNotices",
    ]);
  });

  it.each([
    ["http", "http://signer.example-signer.test"],
    ["an uppercase letter", "https://Signer.example-signer.test"],
    ["a path", "https://signer.example-signer.test/"],
    ["no scheme", "signer.example-signer.test"],
    ["an underscore", "https://signer_page.example-signer.test"],
    ["a bracketed IPv6 host", "https://[::1]"],
  ])(
    "refuses a PAGES_SIGNER_ORIGIN with %s, naming the input, never the value",
    (_what, value) => {
      const issues = issuesOf({ PAGES_SIGNER_ORIGIN: value });
      expect(issues).toEqual(["PAGES_SIGNER_ORIGIN: not-https-origin"]);
      expect(issues.join("\n")).not.toContain("signer");
    },
  );

  it.each([
    ["the Wrapper's", WRAPPER],
    ["the verifier's", VERIFIER],
  ])("refuses a PAGES_SIGNER_ORIGIN equal to %s origin", (_what, value) => {
    expect(issuesOf({ PAGES_SIGNER_ORIGIN: value })).toEqual([
      "PAGES_SIGNER_ORIGIN: overlapping-origins",
    ]);
  });

  it("refuses a signing page on the Wrapper's registrable domain, or a game's origin, through the Wrapper's validator", () => {
    expect(
      issuesOf({ PAGES_SIGNER_ORIGIN: "https://signer.wrapper.example" }),
    ).toEqual([
      "wrapper document: signing-page-same-site at signingPageOrigin",
    ]);
    expect(issuesOf({ PAGES_SIGNER_ORIGIN: "https://game.example" })).toEqual([
      "wrapper document: overlapping-origins at signingPageOrigin",
    ]);
  });
});
