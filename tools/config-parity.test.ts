// V-3 (specs/verify-page.md): the verify page validates the environment
// configuration document with the same schema as the Wrapper. The page cannot
// import the Wrapper (nor the shell), so its rules are spelled again in
// `apps/verify`; this test runs one shared set of documents through both
// validators and requires the same verdict and the same issues. `earlierPins`
// (V-3b) is the one field they part on, on purpose: the page reads it, the
// Wrapper refuses it, and the Pages configuration tool, which writes it, holds
// each entry to the page's rule.

import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CONFIG_DOCUMENTS,
  configDocument,
  EARLIER_PINS_CASES,
  OWN_ORIGIN,
  VALID_EARLIER_PINS,
} from "./fixtures/config-documents.ts";

type Issue = { readonly code: string; readonly field: string };
type Result =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly Issue[] };
type Validator = {
  readonly validateEnvironmentConfig: (
    document: unknown,
    ownOrigin: string,
  ) => Result;
};

type PagesTool = {
  readonly buildPagesConfigs: (
    inputs: Readonly<Record<string, string>>,
  ) =>
    | { readonly ok: true; readonly configs: { readonly verifier: string } }
    | { readonly ok: false; readonly issues: readonly string[] };
};

const root = join(import.meta.dirname, "..");

// Loaded by path at run time: tools' typecheck does not follow into the apps,
// which have their own `tsconfig.json`.
const load = async (path: string): Promise<Validator> =>
  (await import(pathToFileURL(join(root, path)).href)) as Validator;

const wrapper = await load("apps/wrapper/src/environment-config.ts");
const verify = await load("apps/verify/src/environment-config.ts");
const pagesTool = (await import(
  pathToFileURL(join(root, "apps/wrapper/pages-config.ts")).href
)) as PagesTool;

/** The Pages tool's inputs for `configDocument()`, with `earlierPins`. */
const toolInputs = (earlierPins: unknown): Readonly<Record<string, string>> => {
  const document = configDocument();
  return {
    PAGES_WRAPPER_ORIGIN: OWN_ORIGIN,
    PAGES_VERIFIER_ORIGIN: "https://verifier.example",
    PAGES_CHAIN_PINS: JSON.stringify({
      environment: document["environment"],
      runtimeSigner: document["runtimeSigner"],
      registryDomain: document["registryDomain"],
      earlierPins,
      entropyChainId: document["entropyChainId"],
      minRpcQuorum: document["minRpcQuorum"],
      tipLagMargin: document["tipLagMargin"],
    }),
    PAGES_RPC_ENDPOINTS: JSON.stringify(document["rpcEndpoints"]),
    PAGES_RPC_ORIGINS: "https://rpc1.example https://rpc2.example",
    PAGES_GAME_ORIGINS: "https://game.example",
    PAGES_OPERATOR_ORIGINS: "https://operator.example",
  };
};

/** The verifier's document the Pages tool writes for `earlierPins`. */
const verifierDocument = (earlierPins: unknown): unknown => {
  const result = pagesTool.buildPagesConfigs(toolInputs(earlierPins));
  if (!result.ok) throw new Error(result.issues.join("; "));
  return JSON.parse(result.configs.verifier);
};

const issuesOf = (result: Result): string[] =>
  result.ok
    ? []
    : result.issues.map(issue => `${issue.code} ${issue.field}`).toSorted();

describe("one configuration schema (V-3)", () => {
  it("has documents both valid and not", () => {
    const verdicts = CONFIG_DOCUMENTS.map(
      ({ document, ownOrigin }) =>
        wrapper.validateEnvironmentConfig(document, ownOrigin).ok,
    );
    expect(verdicts).toContain(true);
    expect(verdicts).toContain(false);
  });

  it.each(CONFIG_DOCUMENTS)(
    "$name: the same verdict and issues",
    ({ name, document, ownOrigin }) => {
      const fromWrapper = wrapper.validateEnvironmentConfig(
        document,
        ownOrigin,
      );
      const fromVerify = verify.validateEnvironmentConfig(document, ownOrigin);
      expect(fromVerify.ok).toBe(fromWrapper.ok);
      expect(issuesOf(fromVerify)).toEqual(issuesOf(fromWrapper));
      // A document named valid is accepted, so the shared set cannot drift
      // into refusing what it means to accept.
      expect(fromWrapper.ok).toBe(name.startsWith("valid"));
    },
  );
});

describe("earlierPins, the verifier's field (V-3b)", () => {
  it("the page accepts it, and the Wrapper refuses it as an unknown field", () => {
    const document = configDocument({ earlierPins: VALID_EARLIER_PINS });
    expect(verify.validateEnvironmentConfig(document, OWN_ORIGIN).ok).toBe(
      true,
    );
    expect(
      issuesOf(wrapper.validateEnvironmentConfig(document, OWN_ORIGIN)),
    ).toEqual(["unknown-field earlierPins"]);
  });

  it("the page accepts the document the Pages tool writes for the verifier", () => {
    const written = verify.validateEnvironmentConfig(
      verifierDocument(VALID_EARLIER_PINS),
      "https://verifier.example",
    );
    expect(issuesOf(written)).toEqual([]);
  });

  it.each(EARLIER_PINS_CASES)(
    "$name: the page and the Pages tool judge it alike",
    ({ name, earlierPins }) => {
      const fromPage = verify.validateEnvironmentConfig(
        configDocument({ earlierPins }),
        OWN_ORIGIN,
      );
      const fromTool = pagesTool.buildPagesConfigs(toolInputs(earlierPins));
      expect(fromPage.ok).toBe(name.startsWith("valid"));
      expect(fromTool.ok).toBe(fromPage.ok);
    },
  );
});
