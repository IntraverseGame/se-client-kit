// The browser-start lock, in Node only (no page, no browser): starts run one at
// a time, the lock is released however a start ends, an abandoned lock (its
// holder gone, or too old) is taken over, a live holder's is waited for, and a
// release never removes a lock that is no longer its own. The lock's ages are
// file times against the real clock; the tests set them, and wait only where a
// start must not run (200 ms) or a poll must pass (20 ms).

import { spawnSync } from "node:child_process";
import { readFile, rm, utimes, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

import { expect, test } from "@playwright/test";

import { exists, ownLockFile } from "./harness/stand-in-starts.ts";
import { startAlone } from "./harness/start-lock.ts";

test.describe("one browser start at a time", () => {
  test("concurrent starts run one after another", async () => {
    const lockFile = await ownLockFile();
    let running = 0;
    let most = 0;
    const start = async (index: number): Promise<number> => {
      running += 1;
      most = Math.max(most, running);
      await sleep(10);
      running -= 1;
      return index;
    };
    const results = await Promise.all(
      [0, 1, 2, 3, 4].map(index =>
        startAlone(() => start(index), { lockFile }),
      ),
    );
    expect(results).toEqual([0, 1, 2, 3, 4]);
    expect(most).toBe(1);
    expect(await exists(lockFile)).toBe(false);
  });

  test("a start that fails releases the lock", async () => {
    const lockFile = await ownLockFile();
    await expect(
      startAlone(() => Promise.reject(new Error("launch failed on purpose")), {
        lockFile,
      }),
    ).rejects.toThrow(/launch failed on purpose/u);
    expect(await exists(lockFile)).toBe(false);
    expect(await startAlone(() => Promise.resolve("next"), { lockFile })).toBe(
      "next",
    );
  });

  test("a lock whose holder is alive is waited for", async () => {
    const lockFile = await ownLockFile();
    await writeFile(lockFile, `${process.pid}:0`);
    let started = false;
    const waiting = startAlone(
      () => {
        started = true;
        return Promise.resolve();
      },
      { lockFile, staleMs: 60_000 },
    );
    await sleep(200);
    expect(started).toBe(false);
    await rm(lockFile);
    await waiting;
    expect(started).toBe(true);
  });

  test("a lock whose holder is gone is taken over at once", async () => {
    const lockFile = await ownLockFile();
    // A process that has exited and been reaped: its id names no process.
    const { pid } = spawnSync("true");
    await writeFile(lockFile, `${pid}:1`);
    expect(
      await startAlone(() => Promise.resolve("taken over"), {
        lockFile,
        staleMs: 60_000,
      }),
    ).toBe("taken over");
  });

  test("a lock older than the stale age is taken over", async () => {
    const lockFile = await ownLockFile();
    await writeFile(lockFile, "a holder that died");
    const old = new Date(Date.now() - 60_000);
    await utimes(lockFile, old, old);
    expect(
      await startAlone(() => Promise.resolve("taken over"), {
        lockFile,
        staleMs: 30_000,
      }),
    ).toBe("taken over");
    expect(await exists(lockFile)).toBe(false);
  });

  test("a release leaves a lock taken over by another start", async () => {
    const lockFile = await ownLockFile();
    await startAlone(() => writeFile(lockFile, "the start that took over"), {
      lockFile,
    });
    expect(await readFile(lockFile, "utf8")).toBe("the start that took over");
  });
});
