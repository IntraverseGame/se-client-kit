// The preview scripts stay out of `pnpm check` (RFC-002, "Never part of `pnpm
// check`"): the root `check` script's dependency closure holds neither
// `test:preview` nor `test:e2e:preview`, nothing but the root `test:e2e:preview`
// depends on `e2e`'s `test:preview`, and `test:preview` has no `files` and no
// `output`, so wireit never caches it.

import { describe, expect, it } from "vitest";

import {
  closureOf,
  declaredEnvironment,
  environmentOf,
  manifestOf,
  scriptsDependingOnPreview,
} from "./e2e-preview-support.ts";

describe("the preview scripts", () => {
  it("are not in the closure of the root check script", () => {
    const closure = [...closureOf(".:check")];
    expect(closure.length).toBeGreaterThan(10);
    expect(closure.filter(key => key.includes("preview"))).toEqual([]);
  });

  it("are reached by test:e2e:preview", () => {
    expect([...closureOf(".:test:e2e:preview")]).toContain("e2e:test:preview");
  });

  it("are a dependency of nothing but test:e2e:preview", () => {
    expect(
      scriptsDependingOnPreview([
        ".",
        "e2e",
        "packages/contracts",
        "packages/play-client",
        "packages/shell",
        "packages/signing",
        "packages/snapshot",
        "apps/reference-game",
        "apps/verify",
        "apps/wrapper",
      ]),
    ).toEqual([".:test:e2e:preview"]);
  });

  it("test:preview has no files and no output, so wireit never caches it", () => {
    const script = manifestOf("e2e")["test:preview"];
    expect(script).toBeDefined();
    expect(script?.files).toBeUndefined();
    expect(script?.output).toBeUndefined();
    expect(script?.command).toContain("tests/preview-support/run-preview.ts");
  });

  it("test:preview checks the builds it serves exist, as test does, and depends on them", () => {
    const script = manifestOf("e2e")["test:preview"];
    expect(script?.command).toContain(
      "check-kit-dist.ts test:preview ../apps/wrapper/dist/index.html ../apps/reference-game/dist/index.html",
    );
    expect(script?.dependencies).toEqual(
      manifestOf("e2e")["test"]?.dependencies,
    );
  });

  it("test:preview declares every variable the mode reads, as external", () => {
    const declared = environmentOf("e2e", "test:preview");
    for (const name of [
      "SE_E2E_PREVIEW_ORIGIN",
      "SE_E2E_PREVIEW_LAUNCH_COMMAND",
      "SE_E2E_PREVIEW_GAME_ORIGIN",
      "SE_E2E_PREVIEW_ALLOWED_ORIGINS",
    ]) {
      expect(declared).toHaveProperty([name], { external: true });
    }
  });

  it("test:preview does not declare the marker: the launcher sets it, the backend's runner never does", () => {
    expect(declaredEnvironment("e2e", "test:preview")).not.toContain(
      "SE_E2E_PREVIEW_ENTRY",
    );
  });

  it("the fake test script declares no preview variable", () => {
    expect(
      declaredEnvironment("e2e", "test").filter(name =>
        name.includes("PREVIEW"),
      ),
    ).toEqual([]);
  });
});
