import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runStep } from "./fixtures/workflow-step.ts";
import { headersStep } from "./pages-headers-step.ts";
import { prodCheck, stepRun } from "./release-workflow-lines.ts";

// T-49, the deploy's headers for the signing page's site
// (specs/signing-page.md, SP-13 and SP-15; specs/client-kit.md, The signing
// page's site): the headers step (its own script, from pages.yml,
// tools/pages-headers-step.ts) writes the `/signer/*` rule's headers on `/*`
// of the signing page's site, where there is one; the Wrapper's site takes
// every rule but that one; no rule may set a Cross-Origin-Opener-Policy; and
// the release's production check lays the signing page's site out, so its
// headers are checked before publish. The headers file here is SP-13's, not
// the build's, so the step's own behavior is what is tested.

// SP-13's policy, exactly.
const SIGNER_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types 'none'";
const PERMISSIONS = "camera=(), microphone=()";

const SIGNER_RULE = {
  "Content-Security-Policy": SIGNER_CSP,
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": PERMISSIONS,
};

const HEADERS = {
  "/*": {
    "Content-Security-Policy": "default-src 'none'; frame-src {{gameOrigins}}",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": PERMISSIONS,
  },
  "/verify/*": {
    "Content-Security-Policy": "default-src 'none'",
    "Referrer-Policy": "no-referrer",
  },
  "/signer/*": SIGNER_RULE,
};

const ORIGINS = { game: ["https://game.example"] };

describe("the signing page's _headers", () => {
  const step = headersStep();
  afterEach(step.cleanup);

  it("puts the /signer/* rule's headers on /* of the signing page's site", () => {
    const result = step.run(HEADERS, ORIGINS, { signer: true });
    expect(result.status).toBe(0);
    expect(result.signer).toBe(
      [
        "/*",
        ...Object.entries(SIGNER_RULE).map(
          ([name, value]) => `  ${name}: ${value}`,
        ),
        "",
      ].join("\n"),
    );
    expect(result.signer).not.toMatch(/cross-origin-opener-policy/iu);
  });

  it("leaves the /signer/* rule out of the Wrapper's site, which never serves the page", () => {
    for (const signer of [true, false]) {
      const result = step.run(HEADERS, ORIGINS, { signer });
      expect(result.status).toBe(0);
      expect(result.wrapper).toContain("/verify/*");
      expect(result.wrapper).not.toContain("/signer/");
      expect(result.wrapper).not.toContain(SIGNER_CSP);
    }
  });

  it("writes no signing page headers without its site", () => {
    expect(step.run(HEADERS, ORIGINS).signer).toBeNull();
  });

  it("refuses a signing page site without a /signer/* rule", () => {
    const { "/signer/*": _signer, ...withoutSigner } = HEADERS;
    const result = step.run(withoutSigner, ORIGINS, { signer: true });
    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "::error::headers.json has no /signer/* rule.",
    );
    expect(result.signer).toBeNull();
  });

  it.each([
    ["the signing page's rule", "/signer/*", "Cross-Origin-Opener-Policy"],
    ["the Wrapper's rule", "/*", "cross-origin-opener-policy"],
  ])(
    "refuses an opener policy in %s, with or without a signing page site",
    (_what, pattern, header) => {
      const rules: Record<string, Record<string, string>> = {
        ...HEADERS,
        [pattern]: {
          ...HEADERS[pattern as keyof typeof HEADERS],
          [header]: "same-origin",
        },
      };
      for (const signer of [true, false]) {
        const result = step.run(rules, ORIGINS, { signer });
        expect(result.status).toBe(1);
        expect(result.output).toContain(
          "::error::headers.json sets a Cross-Origin-Opener-Policy header.",
        );
        expect(result.wrapper).toBeNull();
      }
    },
  );
});

describe("the production check's layout of the signing page's site", () => {
  const LAYOUT = stepRun("config-check", "Lay out the sites", prodCheck);
  const step = headersStep();
  afterEach(step.cleanup);

  /** The layout step, from a checkout whose Wrapper build is `HEADERS`. */
  const layout = (documents: readonly string[]): string[] => {
    const checkout = step.directory();
    mkdirSync(join(checkout, "apps", "wrapper", "dist"), { recursive: true });
    writeFileSync(
      join(checkout, "apps", "wrapper", "dist", "headers.json"),
      JSON.stringify(HEADERS),
    );
    const temp = step.directory();
    mkdirSync(join(temp, "pages-config"));
    for (const site of documents) {
      writeFileSync(
        join(temp, "pages-config", `${site}-environment-config.json`),
        "{}\n",
      );
    }
    const result = runStep(LAYOUT, step.directory(), {
      cwd: checkout,
      env: { PATH: process.env["PATH"], RUNNER_TEMP: temp },
    });
    expect(result.status).toBe(0);
    return readdirSync(join(temp, "sites")).toSorted();
  };

  it("lays out the signing page's site only when production names one", () => {
    expect(layout(["wrapper", "verifier", "signer"])).toEqual([
      "signer",
      "verifier",
      "wrapper",
    ]);
    expect(layout(["wrapper", "verifier"])).toEqual(["verifier", "wrapper"]);
  });
});
