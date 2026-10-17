// Opens the deliberately leaking test page (`pages/leaky.html`) for the secret
// scan's negative tests, and checks that a finding never repeats a secret.

import { expect, type Page } from "@playwright/test";

import type { FakePlayApi } from "./fake-play-types.ts";
import { PAGES_ORIGIN } from "./origins.ts";
import { keyDrawSecrets, type RandomDraws } from "./random-stub.ts";
import { contains, needlesOf } from "./secret-needles.ts";
import type { Finding, ScanChannel, SecretScan } from "./secret-scan.ts";

export type Leak = ScanChannel | "none";
export type Leaked = "code" | "key" | "key-decimal" | "token";

/** The label of the secret each kind of leak must be reported under. */
export const SECRET_LABEL: Readonly<Record<Leaked, RegExp>> = {
  code: /^launch code$/u,
  token: /^play token 0$/u,
  key: /^32-byte random draw 0$/u,
  "key-decimal": /^32-byte random draw 0$/u,
};

/**
 * Opens a session on the leaking page, which then leaks `what` through `leak`.
 * The test's own navigation to the launch URL is allowed, once.
 */
export const openLeakyPage = async (
  page: Page,
  fake: FakePlayApi,
  scan: SecretScan,
  leak: Leak,
  what: Leaked,
): Promise<void> => {
  const url = `${PAGES_ORIGIN}/leaky.html#code=${fake.launchCode}&leak=${leak}&what=${what}`;
  scan.allowLaunchNavigation(url);
  await page.goto(url);
  await expect(page.locator("#status")).toHaveText("done");
};

/** The findings whose detail still holds any form of any known secret. */
export const repeatingFindings = (
  findings: readonly Finding[],
  fake: FakePlayApi,
  draws: RandomDraws,
): readonly Finding[] => {
  const forms = [...fake.secrets(), ...keyDrawSecrets(draws)()].flatMap(
    secret => needlesOf(secret.value),
  );
  return findings.filter(finding =>
    forms.some(form => contains(finding.detail, form)),
  );
};
