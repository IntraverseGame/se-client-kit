// VT-12's browser rows (V-3b, specs/verify-page.md): from the configuration
// document the page reads to the check it renders, which no unit test crosses.
// The canned round's own pins are the earlier pair, and the document's current
// pins are another. The texts are the page's English catalogue
// (`apps/verify/src/messages.ts`).

import type { Page } from "@playwright/test";

import {
  type RoundPins,
  serveEnvironmentConfig,
} from "./harness/environment-config.ts";
import {
  expect,
  test,
  VERIFY_PAGE_NOT_BUILT,
  verifyEnvironmentConfig,
  verifyPageBuilt,
} from "./harness/verify-page.ts";
import { pinsFor } from "./harness/verify-round-sets.ts";
import { matchingRound, VERIFY_ROUND_ID } from "./harness/verify-rounds.ts";

const MATCHES = "This round matches its evidence";
const MISMATCH = "This round does not match its evidence";
const SIGNED_UNDER =
  "Signed under an earlier registry and signer, which this page's configuration lists.";
const CHAIN_ID = "Earlier registry's chain id";
const ADDRESS = "Earlier registry's address";
const SIGNER = "Earlier signer";

const ROUND_PINS = pinsFor("canned");
const CURRENT: RoundPins = {
  ...ROUND_PINS,
  signer: "0x4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f",
  domain: {
    chainId: 127,
    verifyingContract: "0xc4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4",
  },
};
const UNRELATED = {
  registryDomain: {
    chainId: 128,
    verifyingContract: "0xb3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3",
  },
  runtimeSigner: "0xa2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2",
};

const h1 = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name });

/** Check 3's list item, by its heading. */
const check3 = (page: Page) =>
  page.locator("li", {
    has: page.getByRole("heading", {
      level: 3,
      name: "3. The backend's signature:",
    }),
  });

/** The value of the detail row labelled `label` in check 3. */
const detail = (page: Page, label: string) =>
  check3(page).locator(".vp-row", { hasText: label }).locator("dd");

test.beforeAll(() => {
  if (!verifyPageBuilt()) throw new Error(VERIFY_PAGE_NOT_BUILT);
});

test.describe("the verify page under earlierPins (VT-12)", () => {
  test("a round under a listed earlier pair matches, and check 3 names the pair", async ({
    page,
    context,
    playApiBaseUrl,
    verifyApiBaseUrl,
    fakeVerifyApi,
    verifyPage,
  }) => {
    fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, {
      kind: "round",
      body: matchingRound(),
    });
    // Registered after the page's own configuration, so this one is served.
    await serveEnvironmentConfig(context, {
      ...verifyEnvironmentConfig(playApiBaseUrl, verifyApiBaseUrl, CURRENT),
      earlierPins: [
        UNRELATED,
        {
          registryDomain: ROUND_PINS.domain,
          runtimeSigner: ROUND_PINS.signer,
        },
      ],
    });
    await verifyPage.open(page, VERIFY_ROUND_ID);
    await expect(h1(page, MATCHES)).toBeVisible();
    await expect(check3(page).getByText(SIGNED_UNDER)).toBeVisible();
    await expect(detail(page, CHAIN_ID)).toContainText(
      String(ROUND_PINS.domain.chainId),
    );
    await expect(detail(page, ADDRESS)).toContainText(
      ROUND_PINS.domain.verifyingContract,
    );
    await expect(detail(page, SIGNER)).toContainText(ROUND_PINS.signer);
  });

  test("a round whose pair is not listed does not match", async ({
    page,
    context,
    playApiBaseUrl,
    verifyApiBaseUrl,
    fakeVerifyApi,
    verifyPage,
  }) => {
    fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, {
      kind: "round",
      body: matchingRound(),
    });
    await serveEnvironmentConfig(context, {
      ...verifyEnvironmentConfig(playApiBaseUrl, verifyApiBaseUrl, CURRENT),
      earlierPins: [UNRELATED],
    });
    await verifyPage.open(page, VERIFY_ROUND_ID);
    await expect(h1(page, MISMATCH)).toBeVisible();
    await expect(check3(page).getByRole("heading")).toContainText(
      "does not match",
    );
    await expect(check3(page).getByText(SIGNED_UNDER)).toHaveCount(0);
    await expect(detail(page, SIGNER)).toHaveCount(0);
  });
});
