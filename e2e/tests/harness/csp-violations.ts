import type { Page } from "@playwright/test";

export type Violation = {
  readonly directive: string;
  readonly blocked: string;
};

export type ViolationLog = {
  readonly read: () => Promise<readonly Violation[]>;
};

const MARKER = "csp-violation";

export const recordViolations = async (page: Page): Promise<ViolationLog> => {
  const seen: Violation[] = [];
  page.on("console", message => {
    const [marker, directive, blocked] = message.text().split(" ");
    if (marker !== MARKER || directive === undefined || blocked === undefined) {
      return;
    }
    seen.push({ directive, blocked });
  });
  await page.addInitScript(marker => {
    document.addEventListener("securitypolicyviolation", event => {
      console.debug(marker, event.effectiveDirective, event.blockedURI);
    });
  }, MARKER);
  return {
    read: async () => {
      await page.evaluate(() => 0);
      return [...seen];
    },
  };
};

export const sourcesOf = (
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
