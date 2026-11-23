import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runStep } from "./fixtures/workflow-step.ts";
import { prod, stepEnv, stepRun, workflow } from "./release-workflow-lines.ts";

// T-48's job inputs and T-49's deploy half for the signing page's site
// (specs/signing-page.md, SP-15; specs/client-kit.md, The signing page's
// site): the configuration job's two optional inputs and its conditional
// third document; and the deploy's layout step, run here as Actions runs it
// (tools/fixtures/workflow-step.ts), word for word the same in pages.yml and
// pages-prod.yml: the site laid out from the artifact's `signer/` with a copy
// of its page at the root and its own configuration document, only with that
// document, and `signer/` gone from the Wrapper's site; a Wrapper document
// naming a signing page without its document, or a document with a Wrapper
// document naming none, refused before any upload. The check before the
// upload and the upload itself are in tools/pages-signer-upload.test.ts. The
// hosts are reserved example names.

const staging = workflow("pages.yml");
const CONFIG = "Build and validate the configuration documents";
const LAYOUT = "Lay out the signing page's site";
const GUARD = "Check the signing page's place";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});
const scratch = (): string => {
  const made = mkdtempSync(join(tmpdir(), "pages-signer-site-"));
  directories.push(made);
  return made;
};

const write = (path: string, text: string): void => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
};

const DOCUMENT = '{"environment":"preview","wrapperOrigins":["x"]}\n';
const digestOf = (text: string): string =>
  `sha256:${createHash("sha256").update(text).digest("hex")}`;

describe("the configuration jobs' signing page inputs", () => {
  it("gives each config job the two optional delegation secrets, and never the token", () => {
    const env = stepEnv("config-stage", CONFIG, staging);
    expect(env).toEqual([
      "PAGES_WRAPPER_ORIGIN: ${{ secrets.PAGES_WRAPPER_ORIGIN }}",
      "PAGES_VERIFIER_ORIGIN: ${{ secrets.PAGES_VERIFIER_ORIGIN }}",
      "PAGES_CHAIN_PINS: ${{ secrets.PAGES_CHAIN_PINS }}",
      "PAGES_RPC_ENDPOINTS: ${{ secrets.PAGES_RPC_ENDPOINTS }}",
      "PAGES_RPC_ORIGINS: ${{ secrets.PAGES_RPC_ORIGINS }}",
      "PAGES_GAME_ORIGINS: ${{ secrets.PAGES_GAME_ORIGINS }}",
      "PAGES_OPERATOR_ORIGINS: ${{ secrets.PAGES_OPERATOR_ORIGINS }}",
      "PAGES_SIGNER_ORIGIN: ${{ secrets.PAGES_SIGNER_ORIGIN }}",
      // Folded by the formatter: the key, then its value.
      "PAGES_ACCEPT_PENDING_NOTICES:",
      "${{ secrets.PAGES_ACCEPT_PENDING_NOTICES }}",
    ]);
    expect(env.join("\n")).not.toContain("CLOUDFLARE");
    expect(stepEnv("config-prod", CONFIG, prod)).toEqual(env);
  });

  it("checks the signing page's document with the page's own validator, only when it was written", () => {
    for (const [job, lines] of [
      ["config-stage", staging],
      ["config-prod", prod],
    ] as const) {
      const run = stepRun(job, CONFIG, lines);
      expect(run).toContain(
        'if [ -f "$out/signer-environment-config.json" ]; then',
      );
      expect(run).toContain(
        "pnpm exec tsx apps/signing-page/config-check-cli.ts \\\n",
      );
      expect(run).toContain('sites="$sites signer"');
    }
  });

  it("uploads the third document, and downloads it, only when the job wrote one", () => {
    for (const [config, lines] of [
      ["config-stage", staging],
      ["config-prod", prod],
    ] as const) {
      const text = lines.map(line => line.text);
      const upload = text.indexOf(
        "if: steps.config.outputs.signer-config-digest != ''",
      );
      expect(text[upload + 2]).toBe(
        "path: ${{ runner.temp }}/pages-config/signer-environment-config.json",
      );
      const download = text.indexOf(
        `if: needs.${config}.outputs.signer-config-digest != ''`,
      );
      expect(text[download + 2]).toBe("name: signer-environment-config.json");
    }
  });
});

describe("the deploy's signing page steps", () => {
  it("are word for word the same on staging and in production", () => {
    for (const step of [LAYOUT, GUARD]) {
      expect(stepRun("deploy-prod", step, prod)).toBe(
        stepRun("deploy-stage", step, staging),
      );
    }
    expect(stepEnv("deploy-stage", LAYOUT, staging)).toEqual([
      "SIGNER_CONFIG_DIGEST:",
      "${{ needs.config-stage.outputs.signer-config-digest }}",
    ]);
    expect(stepEnv("deploy-prod", LAYOUT, prod)).toEqual([
      "SIGNER_CONFIG_DIGEST:",
      "${{ needs.config-prod.outputs.signer-config-digest }}",
    ]);
  });
});

const SIGNER_ORIGIN = "https://signer.example.test";

type RunnerTempOptions = {
  readonly signerDir?: boolean;
  /** The Wrapper site's configuration document, as text. */
  readonly wrapperDocument?: string;
};

/** The Wrapper's document, naming the signing page or not. */
const wrapperDocument = (named: boolean): string =>
  `${JSON.stringify(named ? { signingPageOrigin: SIGNER_ORIGIN } : {})}\n`;

/** A runner temp with the unpacked Wrapper site and the downloaded document. */
const runnerTemp = (options: RunnerTempOptions = {}) => {
  const temp = scratch();
  write(join(temp, "sites", "wrapper", "index.html"), "wrapper\n");
  write(
    join(temp, "sites", "wrapper", "environment-config.json"),
    options.wrapperDocument ?? wrapperDocument(true),
  );
  if (options.signerDir !== false) {
    write(join(temp, "sites", "wrapper", "signer", "index.html"), "signer\n");
    write(join(temp, "sites", "wrapper", "signer", "assets", "a.js"), "js\n");
  }
  write(join(temp, "download", "signer-environment-config.json"), DOCUMENT);
  return temp;
};

const layout = (temp: string, digest: string) => {
  const result = runStep(stepRun("deploy-stage", LAYOUT, staging), scratch(), {
    env: {
      PATH: process.env["PATH"],
      RUNNER_TEMP: temp,
      SIGNER_CONFIG_DIGEST: digest,
    },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
};

const exists = (path: string): boolean => {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
};

describe("the signing page's layout", () => {
  it("lays out signer/, its page at the root, and its configuration, and takes signer/ out of the Wrapper's site", () => {
    const temp = runnerTemp();
    expect(layout(temp, digestOf(DOCUMENT)).status).toBe(0);
    const site = join(temp, "sites", "signer");
    expect(readFileSync(join(site, "index.html"), "utf8")).toBe("signer\n");
    expect(readFileSync(join(site, "signer", "index.html"), "utf8")).toBe(
      "signer\n",
    );
    expect(exists(join(site, "signer", "assets", "a.js"))).toBe(true);
    expect(readFileSync(join(site, "environment-config.json"), "utf8")).toBe(
      DOCUMENT,
    );
    expect(exists(join(temp, "sites", "wrapper", "signer", "index.html"))).toBe(
      false,
    );
    expect(exists(join(temp, "sites", "wrapper", "index.html"))).toBe(true);
  });

  it("lays out no signing page site without its document, and still takes signer/ out of the Wrapper's", () => {
    const temp = runnerTemp({ wrapperDocument: wrapperDocument(false) });
    expect(layout(temp, "").status).toBe(0);
    expect(exists(join(temp, "sites", "signer", "index.html"))).toBe(false);
    expect(exists(join(temp, "sites", "wrapper", "signer", "index.html"))).toBe(
      false,
    );
  });

  it.each([
    [
      "a document that is not its job's",
      {},
      digestOf("other"),
      "::error::The downloaded signer-environment-config.json is not the one its job made.",
    ],
    [
      "a malformed digest",
      {},
      "sha256:xyz",
      "::error::No digest for signer-environment-config.json.",
    ],
    [
      "an artifact without signer/index.html",
      { signerDir: false },
      digestOf(DOCUMENT),
      "::error::The Wrapper artifact has no signer/index.html.",
    ],
    [
      "a Wrapper document naming a signing page, with no signing page document",
      {},
      "",
      "::error::The Wrapper's configuration names a signing page, and there is no signing page document.",
    ],
    [
      "a signing page document, with a Wrapper document naming none",
      { wrapperDocument: wrapperDocument(false) },
      digestOf(DOCUMENT),
      "::error::There is a signing page document, and the Wrapper's configuration names no signing page.",
    ],
  ])("refuses %s", (_what, options, digest, message) => {
    const temp = runnerTemp(options);
    expect(layout(temp, digest)).toEqual({ status: 1, output: `${message}\n` });
    expect(exists(join(temp, "sites", "signer", "index.html"))).toBe(false);
  });

  it("refuses a Wrapper document it cannot read, before anything is laid out", () => {
    const temp = runnerTemp({ wrapperDocument: "{" });
    const { status, output } = layout(temp, digestOf(DOCUMENT));
    expect(status).toBe(1);
    expect(output).toContain(
      "::error::The Wrapper site's environment-config.json cannot be read.\n",
    );
    expect(exists(join(temp, "sites", "signer", "index.html"))).toBe(false);
    expect(exists(join(temp, "sites", "wrapper", "signer", "index.html"))).toBe(
      true,
    );
  });

  it("refuses a signing page site laid out already", () => {
    const temp = runnerTemp();
    write(join(temp, "sites", "signer", "index.html"), "planted\n");
    expect(layout(temp, digestOf(DOCUMENT))).toEqual({
      status: 1,
      output: "::error::A signing page site is already laid out.\n",
    });
  });
});
