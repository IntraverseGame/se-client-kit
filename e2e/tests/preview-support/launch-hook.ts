// Runs the launch hook (RFC-002, "The launch hook"): an executable the backend's
// runner provides, called once per session a test opens with the game id
// (`coin-flip` or `cash-or-crash`, the kit's own labels), which funds a new
// player and prints one launch URL. It is run without a shell, with standard
// input closed and standard error dropped (it may hold a credential), a timeout,
// and a bounded output. It leads a process group of its own, and the timeout
// kills the whole group, so a hook that started children leaves none behind
// (Linux and macOS, the platforms the suite supports).
//
// Every failure is a `LaunchHookError`: an exit code (or none) and a reason, and
// nothing the hook printed. The suite never prints, attaches, or stores its
// standard output.

import { spawn } from "node:child_process";

import { LaunchHookError } from "./launch-hook-error.ts";
import { type LaunchLine, parseLaunchLine } from "./launch-line.ts";
import type { EnvironmentSource } from "./preview-environment.ts";

export type GameId = "cash-or-crash" | "coin-flip";

/**
 * How long the hook may run: well within one test's timeout, so a hook that
 * hangs fails as a hook, before the test's own timeout (runbook, "Timeouts").
 */
export const HOOK_TIMEOUT_MS = 15_000;

/**
 * The most standard output kept: a launch line is far shorter (a design
 * choice).
 */
export const HOOK_MAX_OUTPUT_BYTES = 4096;

export type LaunchHookOptions = {
  /** The absolute path of the executable (validated by the environment). */
  readonly command: string;
  readonly gameId: GameId;
  readonly previewOrigin: string;
  /** The runner's environment, which the hook receives. */
  readonly env: EnvironmentSource;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
};

/** Signals the child's process group; a group already gone is left alone. */
const killGroup = (pid: number | undefined): void => {
  if (pid === undefined) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // ESRCH (gone) or EPERM (a zombie on macOS): nothing left to signal.
  }
};

const definedEntries = (env: EnvironmentSource): [string, string][] =>
  Object.entries(env).flatMap(([name, value]) =>
    value === undefined ? [] : [[name, value] as [string, string]],
  );

/** Runs the hook and returns its standard output, or throws a `LaunchHookError`. */
const output = (options: LaunchHookOptions): Promise<string> =>
  new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs ?? HOOK_TIMEOUT_MS;
    const maxBytes = options.maxOutputBytes ?? HOOK_MAX_OUTPUT_BYTES;
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (error: LaunchHookError | undefined, text = ""): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error === undefined) resolve(text);
      else reject(error);
    };
    // No shell; standard input closed; standard error dropped.
    const child = spawn(options.command, [options.gameId], {
      shell: false,
      detached: true,
      stdio: ["ignore", "pipe", "ignore"],
      env: {
        ...Object.fromEntries(definedEntries(options.env)),
        SE_E2E_PREVIEW_ORIGIN: options.previewOrigin,
      },
    });
    const timer = setTimeout(() => {
      killGroup(child.pid);
      finish(new LaunchHookError("timeout"));
    }, timeoutMs);
    child.once("error", () => {
      // The Node error names the command: it is dropped.
      finish(new LaunchHookError("start"));
    });
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        killGroup(child.pid);
        finish(new LaunchHookError("output"));
        return;
      }
      chunks.push(chunk);
    });
    child.once("close", (code: number | null) => {
      if (code === 0) {
        finish(undefined, Buffer.concat(chunks).toString("utf8"));
        return;
      }
      finish(new LaunchHookError("exit", code ?? undefined));
    });
  });

/** Runs the hook for `gameId` and returns its validated launch line. */
export const runLaunchHook = async (
  options: LaunchHookOptions,
): Promise<LaunchLine> =>
  parseLaunchLine(await output(options), options.previewOrigin);
