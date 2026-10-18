// How the suite starts a browser. On macOS, an installed Google Chrome whose
// start overlaps another's can deadlock for good: its main thread waits forever
// on RunningBoard for an App Nap assertion (`rbs_acquire_appnap_assertion`), so
// it never answers the DevTools protocol and the launch, or its first context
// or page, hangs until the test or the launch times out. No longer budget helps
// a hang that does not end. Started one at a time (start-lock.ts), it was much
// rarer (none in 3,300 starts of a standalone loop, against 10 when six
// overlapped); a start outside the lock (any other Chrome on the machine) can
// still set it off, and then `startBrowser` kills the stuck browser and starts
// one new one.
//
// Finding the stuck browser needs `ps` on every start (macOS and Linux; the
// suite runs nowhere else). The kill can never reach another process: the
// listing and the signals happen in one synchronous turn, and only for a
// process that is this process's own child, leads its own process group, and
// was not there before the launch. Until this process reaps a child, its id
// cannot be reused, and only this process's event loop reaps its children
// (`execFileSync` reaps only its own `ps`), so between the listing and the
// signal that id, and the group it leads, stay that child's. Playwright starts
// each browser as the leader of its own group; the signal goes to the group
// (`kill(-pid)`), never to a bare process id, and a group already gone is left.

import { execFileSync } from "node:child_process";

import { errors, type Browser } from "@playwright/test";

import { errorCode, startAlone, type StartLock } from "./start-lock.ts";

export type ProcessRow = {
  readonly pid: number;
  readonly ppid: number;
  readonly pgid: number;
};

/** Every process on the machine with its parent and its group, at once. */
const listProcesses = (): readonly ProcessRow[] =>
  execFileSync("ps", ["-A", "-o", "pid=,ppid=,pgid="], { encoding: "utf8" })
    .split("\n")
    .flatMap(line => {
      const [pid, ppid, pgid] = line.trim().split(/\s+/u).map(Number);
      return pid !== undefined &&
        ppid !== undefined &&
        pgid !== undefined &&
        [pid, ppid, pgid].every(value => Number.isSafeInteger(value))
        ? [{ pid, ppid, pgid }]
        : [];
    });

/**
 * Signals a process group; a group already gone is left alone. Gone is ESRCH,
 * or, on macOS, EPERM: a group whose leader has exited but is not reaped yet (a
 * zombie, as when Playwright has just killed it) answers EPERM. Only this
 * process's own children's groups are ever signalled, so EPERM cannot mean a
 * process of another user.
 */
export const killProcessGroup = (pgid: number): void => {
  try {
    process.kill(-pgid, "SIGKILL");
  } catch (error: unknown) {
    const code = errorCode(error);
    if (code !== "ESRCH" && code !== "EPERM") throw error;
  }
};

export type KillPath = {
  /** Lists every process; synchronous, so nothing runs before the signals. */
  readonly processes?: () => readonly ProcessRow[];
  /** Signals one process group. */
  readonly killGroup?: (pgid: number) => void;
};

/** This process's children now: the set a later kill must leave alone. */
export const childrenBefore = ({
  processes = listProcesses,
}: KillPath = {}): ReadonlySet<number> =>
  new Set(
    processes()
      .filter(row => row.ppid === process.pid)
      .map(row => row.pid),
  );

/**
 * Kills every process group led by a child of this process that is not in
 * `before`: the browser a start launched, with everything it started. The
 * listing and the signals run in one synchronous turn. Returns the groups it
 * signalled.
 */
export const killLaunched = (
  before: ReadonlySet<number>,
  { processes = listProcesses, killGroup = killProcessGroup }: KillPath = {},
): readonly number[] => {
  const groups = processes()
    .filter(
      row =>
        row.ppid === process.pid &&
        row.pgid === row.pid &&
        !before.has(row.pid),
    )
    .map(row => row.pid);
  for (const pgid of groups) killGroup(pgid);
  return groups;
};

/**
 * The command lines of the process groups this process's children lead: its
 * browsers. For checking how the worker's browser was really launched.
 */
export const launchedCommandLines = (): readonly string[] =>
  // `-ww`: never cut a long command line (procps on Linux may otherwise).
  execFileSync("ps", ["-A", "-ww", "-o", "pid=,ppid=,pgid=,command="], {
    encoding: "utf8",
  })
    .split("\n")
    .flatMap(line => {
      const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/u.exec(line);
      if (match === null) return [];
      const [, pid, ppid, pgid, command] = match;
      return Number(ppid) === process.pid &&
        pgid === pid &&
        command !== undefined
        ? [command]
        : [];
    });

/**
 * How long a browser may take to start, its launch and its first context each:
 * a start takes about a second, a deadlocked one never ends, and the starts
 * waiting behind it must still fit in their test's 30 s.
 */
const START_MS = 10_000;

/** A start that ran out of time: the browser deadlocked and will never answer. */
class StartTimeoutError extends Error {
  override readonly name = "StartTimeoutError";
}

/** Rejects with `timedOut()` if `pending` has not settled within `ms`. */
const within = async <T>(
  pending: Promise<T>,
  ms: number,
  timedOut: () => Error,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(timedOut());
    }, ms);
  });
  try {
    return await Promise.race([pending, deadline]);
  } finally {
    clearTimeout(timer);
  }
};

const logLine = (line: string): void => {
  console.error(line);
};

/** The browsers `startBrowser` started, so a test can check a browser was. */
const started = new WeakSet<Browser>();

/** Whether `browser` was started by `startBrowser`. */
export const startedAlone = (browser: Browser): boolean => started.has(browser);

export type BrowserStart = StartLock &
  KillPath & {
    /** How long the launch, and then the first context, may take. */
    readonly startMs?: number;
    /** Where the line about a killed browser goes; the default is stderr. */
    readonly log?: (line: string) => void;
  };

/**
 * Launches a browser with `launch` (given the launch timeout to pass on) while
 * no other browser starts. Its first context, opened and closed at once, is
 * part of the start: the deadlock also strikes the first context of a browser
 * launched a moment before.
 *
 * A start that runs out of time (the launch, or the first context) has
 * deadlocked: the process group of the browser it launched is killed, one line
 * says so, and exactly one new browser is started, still under the same hold of
 * the lock. A second timeout fails the start, saying so. Only a start is ever
 * retried, never a test or an assertion, and only on that timeout: any other
 * error fails the start at once. A browser whose first context fails is closed
 * after the lock is released, so the next start does not wait behind it; a
 * close that takes longer than `startMs` is left to Playwright, which kills its
 * browsers when the worker exits.
 */
export const startBrowser = async (
  launch: (timeout: number) => Promise<Browser>,
  {
    startMs = START_MS,
    log = logLine,
    processes,
    killGroup,
    ...lock
  }: BrowserStart = {},
): Promise<Browser> => {
  const killPath: KillPath = {
    ...(processes === undefined ? {} : { processes }),
    ...(killGroup === undefined ? {} : { killGroup }),
  };
  let failed: Browser | undefined;

  /** One start; on a timeout, kills what it launched and throws. */
  const startOnce = async (): Promise<Browser> => {
    const before = childrenBefore(killPath);
    let browser: Browser;
    try {
      browser = await launch(startMs);
    } catch (error: unknown) {
      if (!(error instanceof errors.TimeoutError)) throw error;
      killLaunched(before, killPath);
      throw new StartTimeoutError(
        `the browser did not launch within ${startMs} ms: its start deadlocked`,
        { cause: error },
      );
    }
    try {
      const context = await within(
        browser.newContext(),
        startMs,
        () =>
          new StartTimeoutError(
            `the browser opened no context within ${startMs} ms: its start deadlocked`,
          ),
      );
      await context.close();
      return browser;
    } catch (error: unknown) {
      if (error instanceof StartTimeoutError) {
        killLaunched(before, killPath);
      } else {
        failed = browser;
      }
      throw error;
    }
  };

  try {
    const browser = await startAlone(async () => {
      try {
        return await startOnce();
      } catch (error: unknown) {
        if (!(error instanceof StartTimeoutError)) throw error;
        log(
          `[browser-start] ${error.message}; killed its process group, starting one new browser (harness/browser-start.ts)`,
        );
        return await startOnce();
      }
    }, lock);
    started.add(browser);
    return browser;
  } catch (error: unknown) {
    if (failed !== undefined) {
      await within(
        failed.close(),
        startMs,
        () => new Error("the browser did not close"),
      ).catch(() => {
        // A browser that does not answer is left to Playwright; the start's
        // error is the one to report.
      });
    }
    throw error;
  }
};
