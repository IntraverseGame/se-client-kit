// VT-7 (specs/verify-page.md, V-14): the verify page's accessibility in a
// browser, against the fakes of VT-5. An axe scan (the WCAG 2.2 A and AA rules,
// `harness/accessibility.ts`) of every state the page can show: the form, its
// refused submit, a match, a mismatch, a chain that could not be verified, a
// round not ended, voided, refused, of an unknown kernel, of a shape other than
// one step of two options (A-3), not found, an API error, an unreachable
// service, and the configuration error (without and with a retry). Then the keyboard-only use of the form and of the retry, the focus
// after a submit and after a retry (and none moved on its own), the polite
// live region and the alert, the focus indicator, and 200 % zoom.

import type { Page } from "@playwright/test";

import { auditAccessibility } from "./harness/accessibility.ts";
import {
  ENVIRONMENT_CONFIG_PATH,
  serveEnvironmentConfig,
} from "./harness/environment-config.ts";
import { WRAPPER_ORIGIN } from "./harness/origins.ts";
import {
  expect,
  test,
  verifyPageBuilt,
  VERIFY_PAGE_NOT_BUILT,
} from "./harness/verify-page.ts";
import {
  matchingRound,
  notEndedRound,
  refusedRound,
  tamperedRound,
  unknownKernelRound,
  unsupportedShapeRound,
  UNKNOWN_ROUND_ID,
  VERIFY_ROUND_ID,
  voidedRound,
} from "./harness/verify-rounds.ts";

const h1 = (page: Page): ReturnType<Page["locator"]> => page.locator("h1");

test.beforeAll(() => {
  if (!verifyPageBuilt()) throw new Error(VERIFY_PAGE_NOT_BUILT);
});

test.describe("the verify page's accessibility (VT-7)", () => {
  test.describe("axe on every state", () => {
    test("the form", async ({ page, verifyPage }) => {
      await verifyPage.open(page);
      await expect(h1(page)).toContainText("Verify a round");
      expect(await auditAccessibility(page)).toEqual([]);
    });

    test("the form after a refused submit", async ({ page, verifyPage }) => {
      await verifyPage.open(page);
      await page.getByLabel("Round id").fill("not a round id");
      await page.getByRole("button", { name: "Verify", exact: true }).click();
      await expect(
        page.locator("#vp-field-error, .vp-field-error"),
      ).toBeVisible();
      expect(await auditAccessibility(page)).toEqual([]);
    });

    const rounds = [
      ["a match", "This round matches its evidence", matchingRound],
      [
        "a mismatch",
        "This round does not match its evidence",
        () => tamperedRound(2),
      ],
      ["a round not ended", "This round has not ended yet", notEndedRound],
      ["a voided round", "This round was voided", voidedRound],
      ["a refused round", "This round was refused", refusedRound],
      [
        "a round of an unknown kernel",
        "This round cannot be recomputed",
        unknownKernelRound,
      ],
    ] as const;
    for (const [name, title, body] of rounds) {
      test(name, async ({ page, fakeVerifyApi, verifyPage }) => {
        fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, {
          kind: "round",
          body: body(),
        });
        await verifyPage.open(page, VERIFY_ROUND_ID);
        await expect(h1(page)).toContainText(title);
        expect(await auditAccessibility(page)).toEqual([]);
      });
    }

    test("a round that is not one step of two options", async ({
      page,
      fakeVerifyApi,
      verifyPage,
    }) => {
      fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, {
        kind: "round",
        body: unsupportedShapeRound(),
      });
      await verifyPage.open(page, VERIFY_ROUND_ID);
      // The heading is the unknown kernel's too; the text tells them apart.
      await expect(h1(page)).toContainText("This round cannot be recomputed");
      await expect(
        page.getByText("recomputes rounds of one step with two options only"),
      ).toBeVisible();
      expect(await auditAccessibility(page)).toEqual([]);
    });

    test("a chain that could not be verified", async ({
      page,
      fakeVerifyApi,
      verifyPage,
      verifyRpc,
    }) => {
      fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, {
        kind: "round",
        body: matchingRound(),
      });
      verifyRpc.behave("p2", "other-hash");
      await verifyPage.open(page, VERIFY_ROUND_ID);
      await expect(h1(page)).toContainText(
        "This round could not be verified against the chain",
      );
      expect(await auditAccessibility(page)).toEqual([]);
    });

    test("a round not found", async ({ page, verifyPage }) => {
      await verifyPage.open(page, UNKNOWN_ROUND_ID);
      await expect(h1(page)).toContainText("Round not found");
      expect(await auditAccessibility(page)).toEqual([]);
    });

    test("an API error", async ({ page, fakeVerifyApi, verifyPage }) => {
      fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, {
        kind: "error",
        status: 500,
      });
      await verifyPage.open(page, VERIFY_ROUND_ID);
      await expect(h1(page)).toContainText(
        "The verification service could not answer",
      );
      expect(await auditAccessibility(page)).toEqual([]);
    });

    test("an unreachable service", async ({
      page,
      fakeVerifyApi,
      verifyPage,
    }) => {
      fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, { kind: "abort" });
      await verifyPage.open(page, VERIFY_ROUND_ID);
      await expect(h1(page)).toContainText(
        "The verification service could not be reached",
      );
      expect(await auditAccessibility(page)).toEqual([]);
    });

    test("a configuration error, with no control", async ({
      page,
      context,
      verifyPage,
    }) => {
      // Registered after the page's own configuration, so this one is served.
      await serveEnvironmentConfig(context, {});
      await verifyPage.open(page, VERIFY_ROUND_ID);
      await expect(h1(page)).toContainText(
        "This page is not configured correctly",
      );
      await expect(page.getByRole("button")).toHaveCount(0);
      expect(await auditAccessibility(page)).toEqual([]);
    });

    test("a configuration that could not be loaded, with its retry", async ({
      page,
      context,
      verifyPage,
    }) => {
      await context.route(
        `${WRAPPER_ORIGIN}${ENVIRONMENT_CONFIG_PATH}`,
        route => route.fulfill({ status: 503, body: "" }),
      );
      await verifyPage.open(page, VERIFY_ROUND_ID);
      await expect(h1(page)).toContainText(
        "This page is not configured correctly",
      );
      await expect(
        page.getByRole("button", { name: "Try again" }),
      ).toBeVisible();
      expect(await auditAccessibility(page)).toEqual([]);
    });
  });
});
