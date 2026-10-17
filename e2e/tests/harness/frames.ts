// Finds a named child frame once it exists: `page.frame()` answers only for a
// frame already attached, which a child may not be when `goto` returns.

import { expect, type Frame, type Page } from "@playwright/test";

export const frameNamed = async (page: Page, name: string): Promise<Frame> => {
  await expect.poll(() => page.frame({ name }) !== null).toBe(true);
  const frame = page.frame({ name });
  if (frame === null) throw new Error(`no frame named ${name}`);
  await frame.waitForLoadState();
  return frame;
};
