// One browser starts at a time per user on the machine, across the suite's
// workers and any other run of it (why: browser-start.ts). The lock is a file
// created exclusively in the temporary directory, named for the user: macOS
// gives each user a temporary directory of their own, and on a Linux `/tmp`
// shared by several users the user's id in the name keeps one user's lock from
// blocking, or being removed by, another (the sticky bit would refuse that
// removal with EPERM).
//
// The lock only keeps starts apart, nothing relies on it for correctness:
// - a lock whose holder process is gone (`kill(pid, 0)` fails with ESRCH) is
//   taken over at once, and one older than `STALE_MS` is taken over whatever
//   its holder (a holder of the same user is always visible to `kill(pid, 0)`;
//   an EPERM answer counts as alive, and only the age rule applies);
// - a takeover is not atomic: two waiters may both remove a lock they judged
//   abandoned, and then two starts overlap once. That is the failure the lock
//   prevents, not a worse one, and it needs a holder that died.
//
// The ages are file times against the real clock (`Date.now()`): this is test
// infrastructure, not code under test, and its tests set the file times
// themselves.

import { open, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const LOCK_FILE = join(
  tmpdir(),
  `se-client-kit-e2e-browser-start-${process.getuid?.() ?? "user"}.lock`,
);

/** How often a waiting start looks at the lock again. */
const POLL_MS = 20;

/**
 * A start takes about a second, and two tries of it give up after 20 s; a lock
 * older than this belongs to a process that died or hung holding it.
 */
const STALE_MS = 60_000;

export const errorCode = (error: unknown): unknown =>
  error instanceof Error && "code" in error ? error.code : undefined;

/** Tells this process's holds apart, so a release removes only its own lock. */
let holds = 0;

const tryAcquire = async (
  lockFile: string,
  owner: string,
): Promise<boolean> => {
  try {
    const file = await open(lockFile, "wx");
    try {
      await file.writeFile(owner);
    } finally {
      await file.close();
    }
    return true;
  } catch (error: unknown) {
    if (errorCode(error) === "EEXIST") return false;
    throw error;
  }
};

/** Whether the process that wrote `owner` (`<pid>:<hold>`) is known to be gone. */
const holderGone = (owner: string): boolean => {
  const pid = Number(owner.split(":")[0]);
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error: unknown) {
    return errorCode(error) === "ESRCH";
  }
};

/**
 * Removes the lock if its holder is gone or it is older than `staleMs`. A lock
 * removed already counts as cleared. A lock just created may not hold its owner
 * yet: an empty owner is not judged gone, only by its age.
 */
const clearAbandoned = async (
  lockFile: string,
  staleMs: number,
): Promise<void> => {
  try {
    const [{ mtimeMs }, owner] = await Promise.all([
      stat(lockFile),
      readFile(lockFile, "utf8"),
    ]);
    if (holderGone(owner) || Date.now() - mtimeMs > staleMs) {
      await rm(lockFile, { force: true });
    }
  } catch (error: unknown) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
};

const acquire = async (
  lockFile: string,
  owner: string,
  staleMs: number,
): Promise<void> => {
  // oxlint-disable-next-line no-await-in-loop -- each try waits for the one before it
  while (!(await tryAcquire(lockFile, owner))) {
    // oxlint-disable-next-line no-await-in-loop -- polling: the holder must finish first
    await clearAbandoned(lockFile, staleMs);
    // oxlint-disable-next-line no-await-in-loop -- polling: the holder must finish first
    await sleep(POLL_MS);
  }
};

/** Removes the lock if it is still this hold's: it may have been taken over. */
const release = async (lockFile: string, owner: string): Promise<void> => {
  try {
    if ((await readFile(lockFile, "utf8")) === owner) {
      await rm(lockFile, { force: true });
    }
  } catch (error: unknown) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
};

export type StartLock = {
  /** The lock file; the default is shared by every run of this user. */
  readonly lockFile?: string;
  readonly staleMs?: number;
};

/**
 * Runs `start` (a browser launch, with whatever must finish before the next
 * browser may start) while no other browser starts, and returns its result. The
 * lock is released however `start` ends.
 */
export const startAlone = async <T>(
  start: () => Promise<T>,
  { lockFile = LOCK_FILE, staleMs = STALE_MS }: StartLock = {},
): Promise<T> => {
  holds += 1;
  const owner = `${process.pid}:${holds}`;
  await acquire(lockFile, owner, staleMs);
  try {
    return await start();
  } finally {
    await release(lockFile, owner);
  }
};
