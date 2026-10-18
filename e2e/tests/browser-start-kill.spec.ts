// The real kill path of a deadlocked start (harness/browser-start.ts), in Node
// only, on processes the test spawns itself (`sleep` under `sh`; no browser,
// no network). It lists the machine's processes with the real `ps` and kills
// with the real group signal, and proves what it may touch: the group led by a
// child launched after the "before" listing, all of it, and nothing else; not a
// child that leads no group, not a group there before, not `ps` itself.
//
// Every signal goes through a guard that lets through only the one group the
// test launched: should the selection ever pick another process (a broken
// filter would pick other users' and other tools' groups on the machine), the
// test fails on what was picked, and nothing outside the test is signalled.
// Waiting for a killed process to be gone uses the real clock (a short poll).

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";

import { expect, test } from "@playwright/test";

import {
  childrenBefore,
  killLaunched,
  killProcessGroup,
} from "./harness/browser-start.ts";

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Waits until `check` holds, for up to `ms`; returns whether it did. */
const eventually = async (
  check: () => boolean,
  ms = 3000,
): Promise<boolean> => {
  const deadline = Date.now() + ms;
  // oxlint-disable-next-line no-await-in-loop -- polling: the process ends on its own time
  while (!check() && Date.now() < deadline) await sleep(20);
  return check();
};

/** The ids of the children of `parent`, from the real `ps`. */
const childrenOf = (parent: number): readonly number[] =>
  execFileSync("ps", ["-A", "-o", "pid=,ppid="], { encoding: "utf8" })
    .split("\n")
    .flatMap(line => {
      const [pid, ppid] = line.trim().split(/\s+/u).map(Number);
      return ppid === parent && pid !== undefined ? [pid] : [];
    });

const pidOf = (child: ChildProcess): number => {
  if (child.pid === undefined) throw new Error("the process did not start");
  return child.pid;
};

/** A shell leading a group of its own, with a `sleep` of its own in it. */
const groupLeader = async (): Promise<{
  readonly leader: ChildProcess;
  readonly member: number;
}> => {
  const leader = spawn("sh", ["-c", "sleep 30 & wait"], {
    detached: true,
    stdio: "ignore",
  });
  const leaderPid = pidOf(leader);
  expect(await eventually(() => childrenOf(leaderPid).length > 0)).toBe(true);
  const [member] = childrenOf(leaderPid);
  if (member === undefined) throw new Error("the group has no member");
  return { leader, member };
};

/**
 * The guard every signal goes through: records each group asked for, and
 * signals only `allowed`, the group the test launched.
 */
const onlyGroup =
  (allowed: number, signalled: number[]) =>
  (pgid: number): void => {
    signalled.push(pgid);
    if (pgid === allowed) killProcessGroup(pgid);
  };

const running = (child: ChildProcess): boolean =>
  child.exitCode === null && child.signalCode === null;

/**
 * Ends what a test spawned, through its own unreaped children only: a child's
 * id, and the group it leads, cannot be reused before this process reaps it.
 */
const cleanUp = (groups: readonly ChildProcess[], lone: ChildProcess): void => {
  for (const leader of groups) {
    if (running(leader)) killProcessGroup(pidOf(leader));
  }
  lone.kill("SIGKILL");
};

test.describe("the kill path of a deadlocked start", () => {
  test("kills the launched group, all of it, and nothing else", async () => {
    // There before the launch, as the worker's own browser is.
    const earlier = await groupLeader();
    const before = childrenBefore();
    // Launched after it: a child that leads no group, and the "browser".
    const lone = spawn("sleep", ["30"], { stdio: "ignore" });
    const launched = await groupLeader();
    const launchedPid = pidOf(launched.leader);
    try {
      const signalled: number[] = [];
      const exited = once(launched.leader, "exit");
      const groups = killLaunched(before, {
        killGroup: onlyGroup(launchedPid, signalled),
      });
      expect(groups).toEqual([launchedPid]);
      expect(signalled).toEqual([launchedPid]);
      const [, signal] = await exited;
      expect(signal).toBe("SIGKILL");
      // The whole group: the shell's own `sleep` is gone too.
      expect(await eventually(() => !alive(launched.member))).toBe(true);
      // Nothing else: the earlier group and the lone child still run.
      expect(alive(pidOf(earlier.leader))).toBe(true);
      expect(alive(earlier.member)).toBe(true);
      expect(alive(pidOf(lone))).toBe(true);
      expect(lone.exitCode).toBeNull();
    } finally {
      cleanUp([earlier.leader, launched.leader], lone);
    }
  });

  test("never signals a process that leads no group", async () => {
    const lone = spawn("sleep", ["30"], { stdio: "ignore" });
    const pid = pidOf(lone);
    try {
      // No group has this id: the signal finds no group and is dropped, and
      // the process is not signalled by its own id instead.
      const exited = once(lone, "exit").then(() => true);
      killProcessGroup(pid);
      expect(await Promise.race([exited, sleep(500).then(() => false)])).toBe(
        false,
      );
      expect(running(lone)).toBe(true);
    } finally {
      cleanUp([], lone);
    }
  });
});
