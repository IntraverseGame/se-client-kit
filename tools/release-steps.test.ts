import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, sep } from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkReleaseSize,
  prepareOut,
  scratchEnvironment,
} from "./release-steps.ts";

describe("scratchEnvironment", () => {
  const root = join(sep, "work", "kit");

  it("drops every variable that names a token, a secret, a key, or an auth value, and keeps PNPM_HOME", () => {
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
        pnpm_config_store_dir: "x",
        npm_lifecycle_event: "x",
        WIREIT_PARENT: "x",
        HOME: "/home/user",
        PNPM_HOME: "/home/user/.pnpm",
      },
      root,
    );
    expect(environment).toEqual({
      HOME: "/home/user",
      PNPM_HOME: "/home/user/.pnpm",
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

/** A root whose `apps/wrapper/dist/` holds `files`. */
const withDist = (files: Readonly<Record<string, Uint8Array>>): string => {
  const root = mkdtempSync(join(tmpdir(), "se-client-kit-size-"));
  const dist = join(root, "apps", "wrapper", "dist");
  mkdirSync(dist, { recursive: true });
  for (const [path, bytes] of Object.entries(files)) {
    mkdirSync(dirname(join(dist, path)), { recursive: true });
    writeFileSync(join(dist, path), bytes);
  }
  return root;
};

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

describe("checkReleaseSize", () => {
  it("passes a built output within the budgets, each page measured apart", () => {
    const root = withDist({
      "index.html": text("<!doctype html>"),
      "assets/index.js": text("console.log(1);"),
      "verify/index.html": text("<!doctype html><title>v</title>"),
    });
    try {
      const report = checkReleaseSize(root);
      expect(report.problems).toEqual([]);
      expect(report.rows.map(row => row.name)).toEqual([
        "wrapper output",
        "wrapper page, gzip",
        "verify output",
        "verify page, gzip",
      ]);
      expect(report.rows.map(row => row.bytes)).toEqual([
        30,
        expect.any(Number),
        31,
        expect.any(Number),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports a built output over the budget, nested files included", () => {
    const root = withDist({
      "index.html": new Uint8Array(1),
      "assets/big.js": new Uint8Array(204_800),
      "verify/index.html": new Uint8Array(1),
    });
    try {
      expect(checkReleaseSize(root).problems).toContain(
        "wrapper output: 204801 bytes, over its size budget of 204800 bytes by 1",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not count the verify page's bytes toward the Wrapper's budget", () => {
    const root = withDist({
      "index.html": new Uint8Array(1),
      "verify/index.html": new Uint8Array(1),
      "verify/assets/big.js": new Uint8Array(150_000),
    });
    try {
      expect(checkReleaseSize(root).problems).toEqual([
        "verify output: 150001 bytes, over its size budget of 150000 bytes by 1",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports an empty dist/ as no release build", () => {
    const root = withDist({});
    try {
      expect(checkReleaseSize(root).problems).toEqual([
        "the Wrapper output has no index.html, so it is not a release build",
        "the Wrapper output has no verify/index.html, so it is not a release build",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports an output without the verify page", () => {
    const root = withDist({ "index.html": text("<!doctype html>") });
    try {
      expect(checkReleaseSize(root).problems).toEqual([
        "the Wrapper output has no verify/index.html, so it is not a release build",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports a Wrapper that is not built, never a pass", () => {
    const root = mkdtempSync(join(tmpdir(), "se-client-kit-size-"));
    try {
      expect(checkReleaseSize(root).problems).toEqual([
        "wrapper output: not measured, so its size budget cannot pass",
        "wrapper page, gzip: not measured, so its size budget cannot pass",
        "verify output: not measured, so its size budget cannot pass",
        "verify page, gzip: not measured, so its size budget cannot pass",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
