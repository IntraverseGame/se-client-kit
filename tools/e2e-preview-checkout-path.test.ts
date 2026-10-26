// Which specs a project selects does not depend on where the repository is
// checked out (RFC-002). Playwright matches a string `testMatch` or `testIgnore`
// against the file's ABSOLUTE path with `**/` in front of it, so a glob such as
// `preview/**` selected every spec of a checkout whose own path has a `preview`
// directory (the backend's runner checks the kit out anywhere): the preview
// project then ran the whole suite, and the fake projects ran none.
//
// This runs the real Playwright (`test --list`, which starts no browser and
// reads no network) with the real config in a copy whose path has a `preview`
// directory, over three small stand-in specs: one under `preview/`, one beside
// the others, one under `preview-guard/`. The copy holds only what the config
// imports, so it stays quick; the specs' content is not the point.

import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  cleanEnvironment,
  e2e,
  ENTERED,
  playwrightCli,
  SPAWN_TIMEOUT_MS,
  testsDirectory,
} from "./e2e-preview-support.ts";

const SPECS = {
  "hermetic.spec.ts": "a hermetic spec",
  "preview/win.spec.ts": "a preview spec",
  "preview-guard/guard.spec.ts": "a guard spec",
} as const;

let scratch = "";
/** The copy's `e2e/`, at `<scratch>/preview/kit/e2e`. */
let copy = "";

beforeAll(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "se-checkout-")));
  copy = join(scratch, "preview", "kit", "e2e");
  mkdirSync(join(copy, "tests", "harness"), { recursive: true });
  for (const file of ["playwright.config.ts", "package.json"]) {
    cpSync(join(e2e, file), join(copy, file));
  }
  cpSync(
    join(testsDirectory, "preview-support"),
    join(copy, "tests", "preview-support"),
    { recursive: true },
  );
  cpSync(
    join(testsDirectory, "harness", "browser-flags.ts"),
    join(copy, "tests", "harness", "browser-flags.ts"),
  );
  symlinkSync(join(e2e, "node_modules"), join(copy, "node_modules"), "dir");
  for (const [path, title] of Object.entries(SPECS)) {
    const file = join(copy, "tests", path);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(
      file,
      `import { test } from "@playwright/test";\n\ntest(${JSON.stringify(title)}, () => {});\n`,
    );
  }
});

afterAll(() => {
  if (scratch !== "") rmSync(scratch, { recursive: true, force: true });
});

/** The stand-in specs `project` lists, by title. */
const listedIn = (project: string): readonly string[] => {
  const result = spawnSync(
    process.execPath,
    [playwrightCli, "test", `--project=${project}`, "--list"],
    {
      cwd: copy,
      env: cleanEnvironment(ENTERED),
      encoding: "utf8",
      // Shorter than the test's own bound (SPAWN_TIMEOUT_MS), so a hung
      // Playwright fails with its own message, not the test's timeout.
      timeout: 45_000,
    },
  );
  const output = `${result.stdout}${result.stderr}`;
  // The listing's own output is the failure message.
  expect(result.status === 0 ? "listed" : output).toBe("listed");
  return Object.values(SPECS).filter(title => output.includes(title));
};

describe("in a checkout whose path has a `preview` directory", () => {
  it(
    "the preview project lists the preview specs and no other",
    () => {
      expect(listedIn("preview")).toEqual(["a preview spec"]);
    },
    SPAWN_TIMEOUT_MS,
  );

  it.each(["chromium", "firefox", "webkit"])(
    "the %s project lists every spec but the preview ones",
    project => {
      expect(listedIn(project)).toEqual(["a hermetic spec", "a guard spec"]);
    },
    SPAWN_TIMEOUT_MS,
  );
});
