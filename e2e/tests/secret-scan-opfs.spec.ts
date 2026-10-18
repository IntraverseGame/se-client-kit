// The scan's WebKit OPFS excuse (decided by the human, 2026-10-18) is narrow:
// an origin private file system read that fails with `UnknownError` is
// excused only in WebKit, and only when a write probe in the same frame,
// through the API as it was before page code ran, fails too. Any other error,
// any other browser, or a probe that wrote is a finding. The rule is a pure
// function (`isExcusedOpfs`); a page that fakes the read's failure where OPFS
// works is still a finding, in a real browser, and a file of the probe's name
// the page made first is left in place (the probe then cannot tell).

import type { Page } from "@playwright/test";

import { expect, test } from "./harness/fixtures.ts";
import { PAGES_ORIGIN } from "./harness/origins.ts";
import { inPage, type PageRecord } from "./harness/secret-scan-page.ts";
import { isExcusedOpfs } from "./harness/secret-scan.ts";

const OPFS = {
  channel: "unreadable",
  where: "origin-private-file-system",
  text: "UnknownError",
} as const;

test.describe("isExcusedOpfs", () => {
  test("excuses WebKit's UnknownError when the write probe failed too", () => {
    expect(isExcusedOpfs("webkit", { ...OPFS, opfsWrite: "failed" })).toBe(
      true,
    );
  });

  test("keeps it a finding when the write probe wrote, or could not tell", () => {
    expect(isExcusedOpfs("webkit", { ...OPFS, opfsWrite: "succeeded" })).toBe(
      false,
    );
    expect(isExcusedOpfs("webkit", { ...OPFS, opfsWrite: "unknown" })).toBe(
      false,
    );
    expect(isExcusedOpfs("webkit", OPFS)).toBe(false);
  });

  test("keeps it a finding in every other browser", () => {
    for (const browser of ["chromium", "firefox", undefined]) {
      expect(isExcusedOpfs(browser, { ...OPFS, opfsWrite: "failed" })).toBe(
        false,
      );
    }
  });

  test("keeps any other error or channel a finding", () => {
    expect(
      isExcusedOpfs("webkit", {
        ...OPFS,
        text: "SecurityError",
        opfsWrite: "failed",
      }),
    ).toBe(false);
    expect(
      isExcusedOpfs("webkit", {
        ...OPFS,
        where: "indexeddb",
        opfsWrite: "failed",
      }),
    ).toBe(false);
  });
});

/** Makes the page's own OPFS read fail with `UnknownError`. */
const fakeUnknownError = (page: Page): Promise<void> =>
  page.evaluate(() => {
    StorageManager.prototype.getDirectory = () =>
      Promise.reject(new DOMException("faked on purpose", "UnknownError"));
  });

/** The page's storage records, as the scan reads them. */
const storageRecords = async (page: Page): Promise<readonly PageRecord[]> => {
  const global = await page.evaluateHandle(() => globalThis);
  const records = await global.evaluate(inPage, "storage");
  await global.dispose();
  return records;
};

test.describe("a faked OPFS failure where OPFS works", () => {
  test.skip(
    ({ browserName }) => browserName === "webkit",
    "WebKit's OPFS does not work here, so the write probe cannot succeed; the pure rule covers that case",
  );

  test("the write probe, through the API as it was at start, writes, and the scan reports it", async ({
    page,
    secretScan,
  }) => {
    await page.goto(`${PAGES_ORIGIN}/blank.html`);
    await fakeUnknownError(page);
    expect(await storageRecords(page)).toContainEqual({
      ...OPFS,
      opfsWrite: "succeeded",
    });
    expect(await secretScan.findings()).toEqual([
      {
        channel: "unreadable",
        secret: "UnknownError",
        detail: "origin-private-file-system: UnknownError",
      },
    ]);
  });

  test("a file of the probe's name that the page made is left in place, the probe cannot tell, and the scan reports it", async ({
    page,
    secretScan,
  }) => {
    await page.goto(`${PAGES_ORIGIN}/blank.html`);
    // The probe's file name (secret-scan-page.ts), taken first by the page.
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const file = await root.getFileHandle("se-e2e-write-probe", {
        create: true,
      });
      const writable = await file.createWritable();
      await writable.write("the page's own");
      await writable.close();
    });
    await fakeUnknownError(page);
    expect(await storageRecords(page)).toContainEqual({
      ...OPFS,
      opfsWrite: "unknown",
    });
    expect(await secretScan.findings()).toEqual([
      {
        channel: "unreadable",
        secret: "UnknownError",
        detail: "origin-private-file-system: UnknownError",
      },
    ]);
    await page.reload();
    expect(
      await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        const file = await root.getFileHandle("se-e2e-write-probe");
        return (await file.getFile()).text();
      }),
    ).toBe("the page's own");
  });
});

test.describe("WebKit's OPFS", () => {
  test.skip(
    ({ browserName }) => browserName !== "webkit",
    "the excuse is WebKit's only; elsewhere OPFS is read",
  );

  test("fails with UnknownError, its write probe fails too, and the scan excuses it", async ({
    page,
    secretScan,
  }) => {
    await page.goto(`${PAGES_ORIGIN}/blank.html`);
    expect(await storageRecords(page)).toContainEqual({
      ...OPFS,
      opfsWrite: "failed",
    });
    expect(await secretScan.findings()).toEqual([]);
  });
});
