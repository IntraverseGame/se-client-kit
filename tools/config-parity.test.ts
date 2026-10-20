// V-3 (specs/verify-page.md): the verify page validates the environment
// configuration document with the same schema as the Wrapper. The page cannot
// import the Wrapper (nor the shell), so its rules are spelled again in
// `apps/verify`; this test runs one shared set of documents through both
// validators and requires the same verdict and the same issues.

import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { CONFIG_DOCUMENTS, OWN_ORIGIN } from "./fixtures/config-documents.ts";

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

const root = join(import.meta.dirname, "..");

// Loaded by path at run time: tools' typecheck does not follow into the apps,
// which have their own `tsconfig.json`.
const load = async (path: string): Promise<Validator> =>
  (await import(pathToFileURL(join(root, path)).href)) as Validator;

const wrapper = await load("apps/wrapper/src/environment-config.ts");
const verify = await load("apps/verify/src/environment-config.ts");

const issuesOf = (result: Result): string[] =>
  result.ok
    ? []
    : result.issues.map(issue => `${issue.code} ${issue.field}`).toSorted();

describe("one configuration schema (V-3)", () => {
  it("has documents both valid and not", () => {
    const verdicts = CONFIG_DOCUMENTS.map(
      ([, document]) =>
        wrapper.validateEnvironmentConfig(document, OWN_ORIGIN).ok,
    );
    expect(verdicts).toContain(true);
    expect(verdicts).toContain(false);
  });

  it.each(CONFIG_DOCUMENTS)(
    "%s: the same verdict and issues",
    (_name, document) => {
      const fromWrapper = wrapper.validateEnvironmentConfig(
        document,
        OWN_ORIGIN,
      );
      const fromVerify = verify.validateEnvironmentConfig(document, OWN_ORIGIN);
      expect(fromVerify.ok).toBe(fromWrapper.ok);
      expect(issuesOf(fromVerify)).toEqual(issuesOf(fromWrapper));
    },
  );
});
