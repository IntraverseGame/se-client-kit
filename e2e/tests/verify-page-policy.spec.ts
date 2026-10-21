// VT-8 (specs/verify-page.md, V-16 and Security): the verify page under the
// release bundle's own `headers.json` policy. The page is served with the
// `/verify/*` entry of `apps/wrapper/dist/headers.json` as built, its one
// placeholder filled with the origins of the verify API and the RPC endpoints
// as the deploy side does (`verifyPolicyHeaders`). The rows:
//
// - the page loads and recomputes a round with no `securitypolicyviolation`
//   (the policy allows exactly what the page does, check 6's cross-origin RPC
//   reads included), and the policy is in force: a request to another origin
//   is refused by `connect-src`, before the network;
// - every script and stylesheet carries `integrity`, there is no inline script
//   or style, and the browser enforces it: a script whose bytes changed is
//   refused and the page does not run;
// - every request the page made went to the Wrapper's origin or a configured
//   RPC endpoint (the build-time half is `release-sri`'s and
//   `release-verify`'s unit tests and `pnpm check:build-output`).

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

import type { Page } from "@playwright/test";

import { ROUND_RPC_ENDPOINTS } from "./harness/environment-config.ts";
import { WRAPPER_DIST, WRAPPER_ORIGIN } from "./harness/origins.ts";
import {
  expect,
  test,
  verifyPageBuilt,
  verifyUrl,
  VERIFY_PAGE_NOT_BUILT,
} from "./harness/verify-page.ts";
import { matchingRound, VERIFY_ROUND_ID } from "./harness/verify-rounds.ts";

const MATCHES = "This round matches its evidence";

/** A policy violation the browser reported. */
type Violation = {
  readonly directive: string;
  readonly blocked: string;
};

/** Records every `securitypolicyviolation` event of the page from its start. */
const recordViolations = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const seen: Violation[] = [];
    (globalThis as unknown as { cspViolations: Violation[] }).cspViolations =
      seen;
    document.addEventListener("securitypolicyviolation", event => {
      seen.push({
        directive: event.effectiveDirective,
        blocked: event.blockedURI,
      });
    });
  });
};

const violations = (page: Page): Promise<readonly Violation[]> =>
  page.evaluate(
    () =>
      (globalThis as unknown as { cspViolations: Violation[] }).cspViolations,
  );

/** The origins the page may reach: its own and the configured RPC endpoints. */
const ALLOWED_ORIGINS: readonly string[] = [
  WRAPPER_ORIGIN,
  ...ROUND_RPC_ENDPOINTS.map(endpoint => new URL(endpoint.url).origin),
];

/** The sorted source list of `directive` in `policy`, empty if it has none. */
const sourcesOf = (
  policy: string | undefined,
  directive: string,
): readonly string[] =>
  (
    (policy ?? "")
      .split(";")
      .map(part => part.trim().split(/\s+/u))
      .find(([name]) => name === directive)
      ?.slice(1) ?? []
  ).toSorted();

test.beforeAll(() => {
  if (!verifyPageBuilt()) throw new Error(VERIFY_PAGE_NOT_BUILT);
});

test.use({ verifyPolicy: true });

test.describe("the verify page under its headers.json policy (VT-8)", () => {
  test.beforeEach(({ fakeVerifyApi }) => {
    fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, {
      kind: "round",
      body: matchingRound(),
    });
  });

  test("loads and recomputes a round with no policy violation", async ({
    page,
    verifyPage,
    verifyRpc,
  }) => {
    await recordViolations(page);
    const documentResponse = page.waitForResponse(verifyUrl(VERIFY_ROUND_ID));
    await verifyPage.open(page, VERIFY_ROUND_ID);
    await expect(
      page.getByRole("heading", { level: 1, name: MATCHES }),
    ).toBeVisible();
    const policy = (await documentResponse).headers()[
      "content-security-policy"
    ];
    // The policy was on the document, not only the `<meta>` one.
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("worker-src 'none'");
    // Exactly the page's own origin and the configured ones: an extra allowed
    // origin in the release header fails here.
    expect(sourcesOf(policy, "connect-src")).toEqual(
      ["'self'", ...ALLOWED_ORIGINS].toSorted(),
    );
    // Check 6 read the chain across origins, which `connect-src` allowed.
    expect(verifyRpc.calls().length).toBeGreaterThan(0);
    expect(await violations(page)).toEqual([]);
  });

  test("enforces the policy: a request to another origin is refused", async ({
    page,
    verifyPage,
  }) => {
    await recordViolations(page);
    await verifyPage.open(page, VERIFY_ROUND_ID);
    await expect(
      page.getByRole("heading", { level: 1, name: MATCHES }),
    ).toBeVisible();
    const outcome = await page.evaluate(async () => {
      try {
        await fetch("https://elsewhere.e2e.test/");
        return "sent";
      } catch {
        return "refused";
      }
    });
    expect(outcome).toBe("refused");
    await expect.poll(() => violations(page)).toHaveLength(1);
    expect((await violations(page))[0]?.directive).toBe("connect-src");
  });

  test("every script and stylesheet carries integrity, with no inline script or style", async ({
    page,
    verifyPage,
  }) => {
    await verifyPage.open(page, VERIFY_ROUND_ID);
    await expect(
      page.getByRole("heading", { level: 1, name: MATCHES }),
    ).toBeVisible();
    const found = await page.evaluate(() => ({
      scripts: [...document.querySelectorAll("script[src]")].map(element =>
        element.getAttribute("integrity"),
      ),
      styles: [...document.querySelectorAll('link[rel="stylesheet"]')].map(
        element => element.getAttribute("integrity"),
      ),
      inlineScripts: document.querySelectorAll("script:not([src])").length,
      inlineStyles: document.querySelectorAll("style, [style]").length,
    }));
    expect(found.scripts.length).toBeGreaterThan(0);
    expect(found.styles.length).toBeGreaterThan(0);
    for (const value of [...found.scripts, ...found.styles]) {
      expect(value).toMatch(/^sha256-[A-Za-z0-9+/]{43}=$/u);
    }
    expect(found.inlineScripts).toBe(0);
    expect(found.inlineStyles).toBe(0);
  });

  test("the browser enforces integrity: a script with changed bytes does not run", async ({
    page,
    context,
    verifyPage,
  }) => {
    // The static origin serves the bundle's file; this route serves other bytes.
    await context.route(`${WRAPPER_ORIGIN}/verify/assets/*.js`, route => {
      const file = join(
        WRAPPER_DIST,
        "verify",
        "assets",
        basename(new URL(route.request().url()).pathname),
      );
      return route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: `${readFileSync(file, "utf8")}\n// changed\n`,
      });
    });
    await verifyPage.open(page, VERIFY_ROUND_ID);
    await expect(page.locator("#verify-root")).toBeEmpty();
    await expect(page.getByRole("heading")).toHaveCount(0);
  });

  test("makes no request outside the Wrapper's origin and the configured RPC endpoints", async ({
    page,
    context,
    verifyPage,
  }) => {
    const origins = new Set<string>();
    context.on("request", request => {
      origins.add(new URL(request.url()).origin);
    });
    await verifyPage.open(page, VERIFY_ROUND_ID);
    await expect(
      page.getByRole("heading", { level: 1, name: MATCHES }),
    ).toBeVisible();
    expect(origins.size).toBeGreaterThan(0);
    for (const origin of origins) {
      expect(ALLOWED_ORIGINS).toContain(origin);
    }
  });
});
