// The launch hook (RFC-002): an absolute-path fixture script is run without a
// shell, with the game id as its one argument and the preview origin in its
// environment; success; a non-zero exit; a timeout, where the script has started
// a child of its own and the child is gone afterwards (the process group is
// killed); output over the bound; and a script that writes a sentinel to its
// standard output and standard error, with a test that the thrown
// `LaunchHookError` holds only an exit code and a reason and that the sentinel
// is in no message, no `cause`, and no attachment. The scripts are written to a
// scratch directory and use `/bin/sh`.

import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "../harness/worker-browser.ts";
import { LaunchHookError } from "../preview-support/launch-hook-error.ts";
import { runLaunchHook } from "../preview-support/launch-hook.ts";

const ORIGIN = "https://preview.example.test";
const SENTINEL = "SENTINEL-HOOK-OUTPUT-7f3a";

let directory = "";

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "se-preview-hook-"));
});

test.afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

/** Writes an executable script and returns its absolute path. */
const script = async (name: string, body: string): Promise<string> => {
  const path = join(directory, name);
  await writeFile(path, `#!/bin/sh\n${body}\n`);
  await chmod(path, 0o755);
  return path;
};

const run = (
  command: string,
  extra: { timeoutMs?: number; maxOutputBytes?: number } = {},
) =>
  runLaunchHook({
    command,
    gameId: "coin-flip",
    previewOrigin: ORIGIN,
    env: { PATH: "/usr/bin:/bin", HOOK_SENTINEL: SENTINEL },
    ...extra,
  });

const failure = async (
  command: string,
  extra: { timeoutMs?: number; maxOutputBytes?: number } = {},
): Promise<LaunchHookError> => {
  try {
    await run(command, extra);
  } catch (error: unknown) {
    if (error instanceof LaunchHookError) return error;
    throw error;
  }
  throw new Error("expected the hook to fail");
};

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test.describe("the launch hook", () => {
  test("returns the launch line, called with the game id and the preview origin", async () => {
    const command = await script(
      "ok",
      `printf '%s/#%s\\n' "$SE_E2E_PREVIEW_ORIGIN" "$1"`,
    );
    const line = await run(command);
    expect(line).toEqual({ url: `${ORIGIN}/#coin-flip`, code: "coin-flip" });
  });

  test("runs without a shell and with the environment it is given", async () => {
    const command = await script(
      "env",
      `printf '%s/#%s\\n' "$SE_E2E_PREVIEW_ORIGIN" "$HOOK_SENTINEL"`,
    );
    expect((await run(command)).code).toBe(SENTINEL);
  });

  test("closes standard input", async () => {
    const command = await script(
      "stdin",
      `if read -r line; then printf '%s/#read\\n' "$SE_E2E_PREVIEW_ORIGIN"; else printf '%s/#closed\\n' "$SE_E2E_PREVIEW_ORIGIN"; fi`,
    );
    expect((await run(command)).code).toBe("closed");
  });

  test("fails with the exit code on a non-zero exit", async () => {
    const error = await failure(await script("exit3", "exit 3"));
    expect(error).toMatchObject({ reason: "exit", exitCode: 3 });
  });

  test("fails with reason start when the command cannot be started", async () => {
    const missing = join(directory, "no-such-hook");
    const error = await failure(missing);
    expect(error).toMatchObject({ reason: "start", exitCode: undefined });
    expect(error.message).not.toContain(missing);
  });

  test("fails with reason line on a line the validator refuses", async () => {
    const error = await failure(await script("bad", "printf 'not a url\\n'"));
    expect(error.reason).toBe("line");
  });

  test("kills the whole process group on the timeout", async () => {
    const pidFile = join(directory, "child.pid");
    const command = await script(
      "sleeper",
      `sleep 60 &\necho $! > "${pidFile}"\nwait`,
    );
    const error = await failure(command, { timeoutMs: 3000 });
    expect(error.reason).toBe("timeout");
    const child = Number((await readFile(pidFile, "utf8")).trim());
    expect(Number.isInteger(child)).toBe(true);
    // The child was started by the hook, in its group: it is gone afterwards.
    await expect.poll(() => alive(child), { timeout: 5000 }).toBe(false);
  });

  test("fails with reason output past the bound", async () => {
    const command = await script(
      "long",
      "head -c 6000 /dev/zero | tr '\\0' 'a'",
    );
    expect((await failure(command)).reason).toBe("output");
    const small = await script("small", "printf '0123456789'");
    expect((await failure(small, { maxOutputBytes: 4 })).reason).toBe("output");
  });

  test("holds no output in the error: only an exit code and a reason", async () => {
    const command = await script(
      "noisy",
      `printf '%s\\n' "${SENTINEL}-stdout"\nprintf '%s\\n' "${SENTINEL}-stderr" >&2\nexit 7`,
    );
    const error = await failure(command);
    expect(error).toMatchObject({ reason: "exit", exitCode: 7 });
    expect(error.cause).toBeUndefined();
    const everything = [
      error.message,
      String(error.stack),
      JSON.stringify(error),
      Object.keys(error).join(","),
      String(error.cause),
    ].join("\n");
    expect(everything).not.toContain(SENTINEL);
    expect(everything).not.toContain(command);
    expect(test.info().attachments).toEqual([]);
  });

  test("holds no output when a clean exit prints a refused line", async () => {
    const command = await script(
      "noisy-ok",
      `printf '%s\\n' "${SENTINEL}-stdout"\nprintf '%s\\n' "${SENTINEL}-stderr" >&2`,
    );
    const error = await failure(command);
    expect(error.reason).toBe("line");
    expect([error.message, String(error.stack)].join("\n")).not.toContain(
      SENTINEL,
    );
  });
});
