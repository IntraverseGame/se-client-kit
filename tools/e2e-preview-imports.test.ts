// The import boundary of the preview support (RFC-002): no module under
// `e2e/tests/harness/` imports from `preview-support/` (directly or through
// another module), and no fake-project spec reaches it except those under
// `preview-guard/`, so the fake projects cannot import or reach `guardPreview`;
// the preview code never imports the fake Play API, the fake verify API, the
// fake RPC, or the round vectors' checks; and the pure modules read no
// `process.env` (it reaches them as a parameter).

import { describe, expect, it } from "vitest";

import {
  filesIn,
  inDirectory,
  reachableFrom,
  readsProcessEnvironment,
  sources,
} from "./e2e-preview-support.ts";

const SPEC = /\.spec\.ts$/u;

const FORBIDDEN: ReadonlySet<string> = new Set([
  "harness/fake-play-api.ts",
  "harness/fake-verify-api.ts",
  "harness/fake-rpc.ts",
  "harness/round-vector.ts",
  "harness/round-play.ts",
  "harness/fixtures.ts",
  "harness/hermetic.ts",
]);

/**
 * The modules that may name `process.env`: the launcher, the setup, the
 * worker's.
 */
const MAY_READ_PROCESS_ENVIRONMENT: ReadonlySet<string> = new Set([
  "preview-support/run-preview.ts",
  "preview-support/global-setup.ts",
  "preview-support/preview-process-environment.ts",
  "preview-support/preview-session.ts",
]);

/** The files of `paths` that reach a file of `directory`, as `[path, reached]`. */
const reaching = (
  paths: readonly string[],
  directory: string,
): readonly (readonly [string, readonly string[]])[] =>
  paths
    .map(
      path =>
        [
          path,
          reachableFrom(path, false).filter(target =>
            inDirectory(directory, target),
          ),
        ] as const,
    )
    .filter(([, reached]) => reached.length > 0);

describe("the import boundary of the preview support", () => {
  it("scans the files it should", () => {
    expect(filesIn("preview-support").length).toBeGreaterThan(10);
    expect(filesIn("preview-guard").length).toBeGreaterThan(5);
    expect(filesIn("harness").length).toBeGreaterThan(20);
    expect(filesIn("preview").length).toBe(3);
  });

  it("no module of harness/ imports preview-support/, directly or through another module", () => {
    expect(reaching(filesIn("harness"), "preview-support")).toEqual([]);
  });

  const FAKE_SPECS = [...sources.keys()].filter(
    path =>
      SPEC.test(path) &&
      !inDirectory("preview-guard", path) &&
      !inDirectory("preview", path),
  );

  it("no fake-project spec reaches preview-support/ or preview-guard/", () => {
    expect(FAKE_SPECS.length).toBeGreaterThan(30);
    expect(reaching(FAKE_SPECS, "preview-support")).toEqual([]);
    expect(reaching(FAKE_SPECS, "preview-guard")).toEqual([]);
  });

  it("the preview specs and support never import the fake Play API, the fake verify API, the fake RPC, or the round checks", () => {
    const previewFiles = [...filesIn("preview"), ...filesIn("preview-support")];
    const offenders = previewFiles
      .map(
        path =>
          [
            path,
            [path, ...reachableFrom(path, true)].filter(item =>
              FORBIDDEN.has(item),
            ),
          ] as const,
      )
      .filter(([, reached]) => reached.length > 0);
    expect(previewFiles.length).toBeGreaterThan(10);
    expect(offenders).toEqual([]);
  });

  it("the pure modules of the preview support read no process.env", () => {
    expect(
      filesIn("preview-support").filter(path => readsProcessEnvironment(path)),
    ).toEqual([...MAY_READ_PROCESS_ENVIRONMENT].toSorted());
  });
});
