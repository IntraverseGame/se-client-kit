// A browser start, in Node only (stand-in browsers and a stand-in process
// table, harness/stand-in-starts.ts): it opens and closes a first context; a
// start that deadlocks (its launch or first context times out) is killed, one
// line says so, and exactly one new browser starts under the same hold of the
// lock; a second timeout fails the start; any other error is not retried.

import { expect, test } from "@playwright/test";

import { startBrowser } from "./harness/browser-start.ts";
import {
  exists,
  fakeStarts,
  FIRST_PID,
  ownLockFile,
} from "./harness/stand-in-starts.ts";

test.describe("a browser start", () => {
  test("a start opens and closes a first context and passes the timeout on", async () => {
    const starts = fakeStarts(["opens"], await ownLockFile());
    const browser = await startBrowser(starts.launch, starts.options);
    expect(browser).toBe(starts.browsers()[0]?.browser);
    expect(starts.timeouts()).toEqual([50]);
    expect(starts.browsers()[0]?.contextClosed()).toBe(true);
    expect(starts.browsers()[0]?.closed()).toBe(false);
    expect(starts.killed()).toEqual([]);
    expect(starts.logs()).toEqual([]);
    expect(await exists(starts.options.lockFile)).toBe(false);
  });

  test("a first context that fails is not retried, and its browser is closed after the lock", async () => {
    const starts = fakeStarts(["context fails"], await ownLockFile());
    await expect(startBrowser(starts.launch, starts.options)).rejects.toThrow(
      /newContext failed on purpose/u,
    );
    expect(starts.launches()).toBe(1);
    expect(starts.browsers()[0]?.closed()).toBe(true);
    expect(starts.browsers()[0]?.lockHeldAtClose()).toBe(false);
    expect(starts.killed()).toEqual([]);
    expect(starts.logs()).toEqual([]);
    expect(await exists(starts.options.lockFile)).toBe(false);
  });

  test("a launch that fails is not retried", async () => {
    const starts = fakeStarts(["launch fails"], await ownLockFile());
    await expect(startBrowser(starts.launch, starts.options)).rejects.toThrow(
      /launch failed on purpose/u,
    );
    expect(starts.launches()).toBe(1);
    expect(starts.killed()).toEqual([]);
    expect(starts.logs()).toEqual([]);
    expect(await exists(starts.options.lockFile)).toBe(false);
  });

  test("a first context that never answers: the browser is killed, one line says so, and one new browser starts under the same lock", async () => {
    const starts = fakeStarts(["context hangs", "opens"], await ownLockFile());
    const browser = await startBrowser(starts.launch, starts.options);
    expect(browser).toBe(starts.browsers()[1]?.browser);
    expect(starts.launches()).toBe(2);
    // Only the stuck browser's group: not the worker's browser, not `ps`.
    expect(starts.killed()).toEqual([FIRST_PID]);
    expect(starts.logs()).toHaveLength(1);
    expect(starts.logs()[0]).toMatch(
      /opened no context within 50 ms: its start deadlocked; killed its process group, starting one new browser/u,
    );
    // Both launches ran under one hold of the lock: none was let in between.
    const [first, second] = starts.lockAtLaunch();
    expect(first).toMatch(/^\d+:\d+$/u);
    expect(second).toBe(first);
    expect(await exists(starts.options.lockFile)).toBe(false);
  });

  test("a launch that times out: its process is killed and one new browser starts", async () => {
    const starts = fakeStarts(
      ["launch times out", "opens"],
      await ownLockFile(),
    );
    const browser = await startBrowser(starts.launch, starts.options);
    expect(browser).toBe(starts.browsers()[0]?.browser);
    expect(starts.launches()).toBe(2);
    expect(starts.killed()).toEqual([FIRST_PID]);
    expect(starts.logs()).toHaveLength(1);
    expect(starts.logs()[0]).toMatch(
      /did not launch within 50 ms: its start deadlocked; killed its process group/u,
    );
  });

  test("a second timeout fails the start, and no third browser starts", async () => {
    const starts = fakeStarts(
      ["context hangs", "launch times out", "opens"],
      await ownLockFile(),
    );
    await expect(startBrowser(starts.launch, starts.options)).rejects.toThrow(
      /did not launch within 50 ms: its start deadlocked/u,
    );
    expect(starts.launches()).toBe(2);
    expect(starts.killed()).toEqual([FIRST_PID, FIRST_PID + 1]);
    expect(starts.logs()).toHaveLength(1);
    expect(await exists(starts.options.lockFile)).toBe(false);
  });
});
