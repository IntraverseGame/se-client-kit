import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { prepareOut, scratchEnvironment } from "./release-steps.ts";

describe("scratchEnvironment", () => {
  const root = join(sep, "work", "kit");

  it("drops every variable that names a token, a secret, or an auth value", () => {
    const environment = scratchEnvironment(
      {
        GITHUB_TOKEN: "x",
        NODE_AUTH_TOKEN: "x",
        NPM_TOKEN: "x",
        ACTIONS_ID_TOKEN_REQUEST_URL: "x",
        ACTIONS_RUNTIME_TOKEN: "x",
        SOME_SECRET: "x",
        AWS_ACCESS_KEY_ID: "x",
        STRIPE_API_KEY: "x",
        SIGNING_PRIVATE_KEY: "x",
        deploy_key: "x",
        DB_PASSWORD: "x",
        npm_config_registry: "x",
        npm_lifecycle_event: "x",
        WIREIT_PARENT: "x",
        HOME: "/home/user",
      },
      root,
    );
    expect(environment).toEqual({
      HOME: "/home/user",
      WIREIT_CACHE: "none",
      CI: "true",
      pnpm_config_verify_deps_before_run: "false",
    });
  });

  it("removes the repository's own node_modules/.bin from PATH", () => {
    const bin = join(root, "node_modules", ".bin");
    const other = join(sep, "usr", "bin");
    expect(
      scratchEnvironment({ PATH: [bin, other].join(delimiter) }, root)["PATH"],
    ).toBe(other);
  });

  it("turns wireit's cache and pnpm's install-before-run off, and adds the extra variables", () => {
    expect(
      scratchEnvironment(
        {
          WIREIT_CACHE: "github",
          pnpm_config_verify_deps_before_run: "install",
        },
        root,
        { TZ: "UTC" },
      ),
    ).toEqual({
      WIREIT_CACHE: "none",
      CI: "true",
      pnpm_config_verify_deps_before_run: "false",
      TZ: "UTC",
    });
  });
});

describe("prepareOut", () => {
  const root = join(import.meta.dirname, "..");

  it("refuses a directory inside the repository, or the repository itself", () => {
    expect(() => prepareOut(root, join(root, "release-out"))).toThrow(
      /outside the repository/u,
    );
    expect(() => prepareOut(root, root)).toThrow(/outside the repository/u);
  });

  it("refuses a directory that is not empty, and accepts an empty one", () => {
    const base = mkdtempSync(join(tmpdir(), "se-client-kit-out-"));
    try {
      const full = join(base, "full");
      mkdirSync(full);
      writeFileSync(join(full, "x"), "");
      expect(() => prepareOut(root, full)).toThrow(/must be empty/u);
      expect(prepareOut(root, join(base, "new"))).toBe(join(base, "new"));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
