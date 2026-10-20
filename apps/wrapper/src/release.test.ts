// @vitest-environment node
// The release bundle's strict Content Security Policy (specs/client-kit.md,
// How the Wrapper reaches the SuperEngine origin): the recommended headers and
// the policy filled per environment. The build step is in
// release-integrity.test.ts.

import { describe, expect, it } from "vitest";

import {
  CONTENT_SECURITY_POLICY_TEMPLATE,
  contentSecurityPolicyFor,
  CSP_PLACEHOLDERS,
  META_CONTENT_SECURITY_POLICY,
  PERMISSIONS_POLICY,
  VERIFY_CONTENT_SECURITY_POLICY_TEMPLATE,
  VERIFY_CSP_PLACEHOLDER,
  VERIFY_META_CONTENT_SECURITY_POLICY,
  verifyHeaders,
  wrapperHeaders,
  headersFile,
} from "../release-headers.ts";
import {
  type EnvironmentConfig,
  validateEnvironmentConfig,
} from "./environment-config.ts";
import {
  endpoints,
  environmentDocument,
  SE_ORIGIN,
  SOURCE,
} from "./fixtures/environment.ts";

const directives = (policy: string): Map<string, string> =>
  new Map(
    policy.split(";").map(part => {
      const [name = "", ...values] = part.trim().split(/\s+/u);
      return [name, values.join(" ")];
    }),
  );

const configOf = (
  overrides: Readonly<Record<string, unknown>>,
): EnvironmentConfig => {
  const result = validateEnvironmentConfig(
    environmentDocument(overrides),
    SE_ORIGIN,
  );
  if (!result.ok) throw new Error("fixture document refused");
  return result.config;
};

describe("the recommended headers", () => {
  it("allows no inline script or style and no eval", () => {
    for (const policy of [
      CONTENT_SECURITY_POLICY_TEMPLATE,
      META_CONTENT_SECURITY_POLICY,
    ]) {
      expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|unsafe-hashes|\*/u);
    }
    const policy = directives(CONTENT_SECURITY_POLICY_TEMPLATE);
    expect(policy.get("default-src")).toBe("'none'");
    expect(policy.get("script-src")).toBe("'self'");
    expect(policy.get("style-src")).toBe("'self'");
    expect(policy.get("object-src")).toBe("'none'");
    expect(policy.get("base-uri")).toBe("'none'");
    expect(policy.get("require-trusted-types-for")).toBe("'script'");
  });

  it("leaves the per-environment origins as placeholders", () => {
    const policy = directives(CONTENT_SECURITY_POLICY_TEMPLATE);
    expect(policy.get("connect-src")).toBe(
      `'self' ${CSP_PLACEHOLDERS.connect}`,
    );
    expect(policy.get("frame-src")).toBe(CSP_PLACEHOLDERS.frame);
    expect(policy.get("frame-ancestors")).toBe(CSP_PLACEHOLDERS.ancestors);
  });

  it("keeps the meta policy free of what only a header can set", () => {
    const meta = directives(META_CONTENT_SECURITY_POLICY);
    for (const name of [
      "default-src",
      "connect-src",
      "frame-src",
      "frame-ancestors",
    ]) {
      expect(meta.has(name)).toBe(false);
    }
  });

  it("sends no referrer and turns off unused powerful features", () => {
    const headers = wrapperHeaders();
    expect(headers["Referrer-Policy"]).toBe("no-referrer");
    expect(headers["Permissions-Policy"]).toBe(PERMISSIONS_POLICY);
    expect(PERMISSIONS_POLICY).toContain("camera=()");
    expect(PERMISSIONS_POLICY).not.toContain("clipboard-write");
  });
});

describe("contentSecurityPolicyFor", () => {
  it("limits connect-src to the SE origin, the Play API, and the RPCs", () => {
    const policy = directives(
      contentSecurityPolicyFor(
        configOf({
          rpcEndpoints: { [SOURCE]: endpoints(2) },
          operatorOrigins: ["https://b.example", "https://a.example"],
        }),
      ),
    );
    expect(policy.get("connect-src")).toBe(
      "'self' https://rpc1.example https://rpc2.example https://se.example",
    );
    expect(policy.get("frame-src")).toBe("https://game.example");
    expect(policy.get("frame-ancestors")).toBe(
      "https://a.example https://b.example",
    );
  });

  it("lets no page embed the Wrapper when operatorOrigins is empty", () => {
    const policy = directives(
      contentSecurityPolicyFor(configOf({ operatorOrigins: [] })),
    );
    expect(policy.get("frame-ancestors")).toBe("'none'");
  });
});

describe("the verify page's recommended headers", () => {
  const policy = directives(VERIFY_CONTENT_SECURITY_POLICY_TEMPLATE);

  it("has the meta policy specs/verify-page.md (Security) gives, the Wrapper's with worker-src 'none'", () => {
    expect(VERIFY_META_CONTENT_SECURITY_POLICY).toBe(
      "script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'; require-trusted-types-for 'script'; trusted-types 'none'",
    );
    expect(
      VERIFY_META_CONTENT_SECURITY_POLICY.replace(" worker-src 'none';", ""),
    ).toBe(META_CONTENT_SECURITY_POLICY);
  });

  it("allows no inline script or style, no eval, and no worker", () => {
    for (const text of [
      VERIFY_CONTENT_SECURITY_POLICY_TEMPLATE,
      VERIFY_META_CONTENT_SECURITY_POLICY,
    ]) {
      expect(text).not.toMatch(/unsafe-inline|unsafe-eval|unsafe-hashes|\*/u);
    }
    expect(policy.get("default-src")).toBe("'none'");
    expect(policy.get("script-src")).toBe("'self'");
    expect(policy.get("style-src")).toBe("'self'");
    expect(policy.get("worker-src")).toBe("'none'");
    expect(policy.get("form-action")).toBe("'none'");
    expect(policy.get("require-trusted-types-for")).toBe("'script'");
    expect(
      directives(VERIFY_META_CONTENT_SECURITY_POLICY).get("worker-src"),
    ).toBe("'none'");
  });

  it("is never embedded, embeds nothing, and leaves one placeholder", () => {
    expect(policy.get("frame-ancestors")).toBe("'none'");
    expect(policy.get("frame-src")).toBe("'none'");
    expect(policy.get("connect-src")).toBe(`'self' ${VERIFY_CSP_PLACEHOLDER}`);
    expect(
      VERIFY_CONTENT_SECURITY_POLICY_TEMPLATE.match(/\{\{/gu),
    ).toHaveLength(1);
  });

  it("keeps the meta policy free of what only a header can set", () => {
    const meta = directives(VERIFY_META_CONTENT_SECURITY_POLICY);
    for (const name of [
      "default-src",
      "connect-src",
      "frame-src",
      "frame-ancestors",
    ]) {
      expect(meta.has(name)).toBe(false);
    }
  });

  it("keeps the Wrapper's referrer and permissions policy", () => {
    expect(verifyHeaders()).toEqual({
      ...wrapperHeaders(),
      "Content-Security-Policy": VERIFY_CONTENT_SECURITY_POLICY_TEMPLATE,
    });
  });

  it("is the headers file's entry for /verify/*, beside the Wrapper's for /*", () => {
    expect(headersFile()).toEqual({
      "/*": wrapperHeaders(),
      "/verify/*": verifyHeaders(),
    });
  });
});
