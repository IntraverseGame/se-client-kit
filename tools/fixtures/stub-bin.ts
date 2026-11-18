// The stub executables (`gh`, `git`, `npm`) of the tests that run a workflow
// step's script with stubs first on PATH.
//
// Each distinct stub is written and made executable once per test file, in a
// store, and every directory that needs it gets a hard link to that one file.
// Writing a new executable for each test made these tests slow and then time
// out under load (#192): macOS assesses a new executable file on its first
// exec (measured at 140 to 240 ms on an idle machine, and seconds under the
// load of `pnpm check`, since one system daemon does it for every process),
// while a hard link is the same file and is not assessed again. The stub is
// still run as itself, from PATH, as the step would run the real tool.
//
// A store file is read-only (0o555): every link is that one file, so a test
// that wrote a data file under a stub's name (`stubFiles`, `files`) would
// otherwise change the stub for every later test; the write fails instead. A
// stub's data goes in other files or in its environment, never in its body.

import { createHash } from "node:crypto";
import {
  chmodSync,
  linkSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let store: string | undefined;
const written = new Set<string>();

/** Puts an executable `name` with the script `body` in `directory`. */
export const installStub = (
  directory: string,
  name: string,
  body: string,
): void => {
  store ??= mkdtempSync(join(tmpdir(), "se-client-kit-stubs-"));
  const file = join(store, createHash("sha256").update(body).digest("hex"));
  if (!written.has(file)) {
    writeFileSync(file, body);
    chmodSync(file, 0o555);
    written.add(file);
  }
  linkSync(file, join(directory, name));
};

/** Removes the store of stubs; a test file runs it in `afterAll`. */
export const removeStubs = (): void => {
  if (store !== undefined) rmSync(store, { recursive: true, force: true });
  store = undefined;
  written.clear();
};
