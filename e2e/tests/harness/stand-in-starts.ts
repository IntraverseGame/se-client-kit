// Stand-ins for the browser-start tests (browser-start.spec.ts,
// browser-start-deadlock.spec.ts): a lock file of the test's own, stand-in
// browsers, and stand-in launches over a stand-in process table. No real
// browser or process is started. Test-only.

import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";

import { errors, test, type Browser } from "@playwright/test";

import type { BrowserStart, ProcessRow } from "./browser-start.ts";

/** A lock file of the test's own, so no other run's starts are involved. */
export const ownLockFile = async (): Promise<string> => {
  const path = test.info().outputPath("start.lock");
  await mkdir(dirname(path), { recursive: true });
  await rm(path, { force: true });
  return path;
};

export const exists = async (path: string): Promise<boolean> => {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * A stand-in browser (no real browser is started) whose first context opens,
 * fails, or never answers, and which records how it was used.
 */
export const standIn = (
  firstContext: "opens" | "fails" | "hangs",
  lockFile = "",
): {
  readonly browser: Browser;
  readonly closed: () => boolean;
  readonly lockHeldAtClose: () => boolean;
  readonly contextClosed: () => boolean;
} => {
  let closed = false;
  let lockHeldAtClose = false;
  let contextClosed = false;
  const context = {
    close: () => {
      contextClosed = true;
      return Promise.resolve();
    },
  };
  const newContext = {
    opens: () => Promise.resolve(context),
    fails: () => Promise.reject(new Error("newContext failed on purpose")),
    hangs: () =>
      new Promise<never>(() => {
        // Never settles, as a deadlocked browser never answers.
      }),
  }[firstContext];
  const browser = {
    newContext,
    close: () => {
      closed = true;
      lockHeldAtClose = existsSync(lockFile);
      // A deadlocked browser does not answer its close either.
      return firstContext === "hangs"
        ? new Promise<never>(() => {
            // Never settles.
          })
        : Promise.resolve();
    },
  };
  return {
    browser: browser as unknown as Browser,
    closed: () => closed,
    lockHeldAtClose: () => lockHeldAtClose,
    contextClosed: () => contextClosed,
  };
};

/** The worker's own browser, a child process that is there before any start. */
export const WORKER_BROWSER_PID = 999;
/** The stand-in `ps` that lists the processes. */
export const PS_PID = 998;
/** The process id of the first stand-in browser; each next one adds one. */
export const FIRST_PID = 1000;

type Outcome =
  | "opens"
  | "context fails"
  | "context hangs"
  | "launch fails"
  | "launch times out";

/**
 * Stand-in launches, one outcome per launch, over a stand-in process table:
 * each launch starts a process that is a child of this one and leads its own
 * group (a launch that times out leaves its process behind, as a deadlocked
 * Chrome does), and `killGroup` ends one. The table also holds the worker's
 * browser, there before any start, and a `ps` that is a child but leads no
 * group. It records what the start did: the launches, the groups killed, the
 * log lines, and the lock's owner at each launch.
 */
export const fakeStarts = (
  outcomes: readonly Outcome[],
  lockFile: string,
): {
  readonly launch: (timeout: number) => Promise<Browser>;
  readonly options: BrowserStart & { readonly lockFile: string };
  readonly launches: () => number;
  readonly timeouts: () => readonly number[];
  readonly browsers: () => readonly ReturnType<typeof standIn>[];
  readonly killed: () => readonly number[];
  readonly logs: () => readonly string[];
  readonly lockAtLaunch: () => readonly string[];
} => {
  const live = new Set([WORKER_BROWSER_PID]);
  const table = (): readonly ProcessRow[] => [
    ...[...live].map(pid => ({ pid, ppid: process.pid, pgid: pid })),
    // The `ps` that lists them: a child of this process in this process's group.
    { pid: PS_PID, ppid: process.pid, pgid: process.pid },
  ];
  const timeouts: number[] = [];
  const browsers: ReturnType<typeof standIn>[] = [];
  const killed: number[] = [];
  const logs: string[] = [];
  const lockAtLaunch: string[] = [];
  const launch = async (timeout: number): Promise<Browser> => {
    const index = timeouts.length;
    timeouts.push(timeout);
    lockAtLaunch.push(
      existsSync(lockFile) ? await readFile(lockFile, "utf8") : "no lock",
    );
    const outcome = outcomes[index] ?? "opens";
    if (outcome === "launch fails") {
      throw new Error("launch failed on purpose");
    }
    live.add(FIRST_PID + index);
    if (outcome === "launch times out") {
      throw new errors.TimeoutError("browserType.launch: Timeout exceeded");
    }
    const stand = standIn(
      { opens: "opens", "context fails": "fails", "context hangs": "hangs" }[
        outcome
      ] as "opens" | "fails" | "hangs",
      lockFile,
    );
    browsers.push(stand);
    return stand.browser;
  };
  return {
    launch,
    options: {
      lockFile,
      startMs: 50,
      processes: table,
      killGroup: pgid => {
        killed.push(pgid);
        live.delete(pgid);
      },
      log: line => {
        logs.push(line);
      },
    },
    launches: () => timeouts.length,
    timeouts: () => timeouts,
    browsers: () => browsers,
    killed: () => killed,
    logs: () => logs,
    lockAtLaunch: () => lockAtLaunch,
  };
};
