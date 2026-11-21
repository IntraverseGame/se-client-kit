// @vitest-environment node
// The signing page's headers in the release (specs/signing-page.md, SP-13;
// T-49): its own policy with `frame-ancestors 'none'` and no `img-src`, no
// referrer, no sniffing, the Wrapper's `Permissions-Policy`, and no
// `Cross-Origin-Opener-Policy` in any rule: the build refuses one.

import { describe, expect, it } from "vitest";

import { HEADERS_FILE } from "../release-files.ts";
import {
  headersFile,
  refuseOpenerPolicy,
  SIGNER_CONTENT_SECURITY_POLICY,
  SIGNER_HEADERS_PATH,
  SIGNER_META_CONTENT_SECURITY_POLICY,
  signerHeaders,
  VERIFY_HEADERS_PATH,
  WRAPPER_HEADERS_PATH,
  wrapperHeaders,
} from "../release-headers.ts";
import { bundleOf, encoder, verified } from "./fixtures/release-bundle.ts";

describe("the signing page's headers (SP-13)", () => {
  it("is exactly SP-13's policy, with no img-src", () => {
    expect(SIGNER_CONTENT_SECURITY_POLICY).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types 'none'",
    );
    expect(SIGNER_CONTENT_SECURITY_POLICY).not.toContain("img-src");
  });

  it("carries the policy without frame-ancestors in its <meta>", () => {
    expect(SIGNER_META_CONTENT_SECURITY_POLICY).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; require-trusted-types-for 'script'; trusted-types 'none'",
    );
  });

  it("is the /signer/* rule: the policy, no referrer, nosniff, the Wrapper's Permissions-Policy", () => {
    expect(headersFile()[SIGNER_HEADERS_PATH]).toEqual({
      "Content-Security-Policy": SIGNER_CONTENT_SECURITY_POLICY,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Permissions-Policy": wrapperHeaders()["Permissions-Policy"],
    });
    expect(signerHeaders()).toEqual(headersFile()[SIGNER_HEADERS_PATH]);
  });

  it("holds no Cross-Origin-Opener-Policy in any rule", () => {
    for (const rule of Object.values(headersFile())) {
      expect(Object.keys(rule).map(name => name.toLowerCase())).not.toContain(
        "cross-origin-opener-policy",
      );
    }
  });
});

/** The release's headers file with a COOP header added to one rule. */
const withCoop = (path: string, name: string) => ({
  ...headersFile(),
  [path]: { ...headersFile()[path], [name]: "same-origin" },
});

describe("the refusal of an opener policy (T-49)", () => {
  it.each([
    [SIGNER_HEADERS_PATH, "Cross-Origin-Opener-Policy"],
    [WRAPPER_HEADERS_PATH, "Cross-Origin-Opener-Policy"],
    [SIGNER_HEADERS_PATH, "cross-origin-opener-policy"],
    [VERIFY_HEADERS_PATH, "CROSS-ORIGIN-OPENER-POLICY"],
  ])("refuses a %s rule with %s", (path, name) => {
    expect(() => {
      refuseOpenerPolicy(withCoop(path, name));
    }).toThrow(
      `The release headers' ${path} rule has a Cross-Origin-Opener-Policy header`,
    );
  });

  it("accepts the release's own headers file", () => {
    expect(() => {
      refuseOpenerPolicy(headersFile());
    }).not.toThrow();
  });

  it.each([SIGNER_HEADERS_PATH, WRAPPER_HEADERS_PATH])(
    "fails the build when the written headers file's %s rule has one",
    async path => {
      await expect(
        verified(files => {
          files.set(
            HEADERS_FILE,
            encoder.encode(
              JSON.stringify(withCoop(path, "Cross-Origin-Opener-Policy")),
            ),
          );
        }, bundleOf()),
      ).rejects.toThrow(/Cross-Origin-Opener-Policy header.*refused/u);
    },
  );
});
