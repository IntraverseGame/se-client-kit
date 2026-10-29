import { describe, expect, it } from "vitest";

import { publishPlanned, type Runner } from "./release-publish-run.ts";

// The publish command's `--publish` path (tools/release-publish.ts, run by
// changesets/action in the release workflow's `publish` job; ADR-009): only the
// tarballs the plan names are published, each checked against the plan's
// SHA-256 before anything is published (the guarantee of the earlier
// `publish` job, #158: "publishes only the tarballs build planned, checked by
// SHA-256, with npm"), with the npm CLI and exactly these arguments, in the
// plan's order; the first failure stops it; and `changeset git-tag` runs last,
// with the same environment, so it reports its tags to the action through
// CHANGESETS_OUTPUT.

const REGISTRY = "https://registry.npmjs.org/";
const PACKAGES = "/out/packages";
const ROOT = "/repository";
const ENV = {
  CHANGESETS_OUTPUT: "/runner/changesets-output.ndjson",
  PATH: "x",
};

const SHELL = "intraverse-se-client-shell-1.2.0.tgz";
const SIGNING = "intraverse-se-client-signing-1.0.0.tgz";
const SNAPSHOT = "intraverse-se-client-snapshot-1.0.0-rc.1.tgz";
const BYTES: Readonly<Record<string, string>> = {
  [SIGNING]: "1".repeat(64),
  [SHELL]: "2".repeat(64),
  [SNAPSHOT]: "3".repeat(64),
  "intraverse-se-client-contracts-1.0.0.tgz": "4".repeat(64),
};

type Call = {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
};

const lineOf = (tarball: string): string =>
  `${BYTES[tarball] ?? ""}  ${tarball}`;

const publish = (
  plan: readonly string[],
  options: {
    readonly failOn?: string;
    readonly digests?: Readonly<Record<string, string>>;
  } = {},
) => {
  const calls: Call[] = [];
  const run: Runner = (command, args, { cwd, env }) => {
    calls.push({ command, args, cwd, env });
    if (options.failOn !== undefined && args.includes(options.failOn)) {
      throw new Error(`${command} failed`);
    }
  };
  const digests = { ...BYTES, ...options.digests };
  const sha256Of = (path: string): string =>
    digests[path.slice(PACKAGES.length + 1)] ?? "0".repeat(64);
  let error: unknown;
  try {
    publishPlanned({
      plan,
      packagesDirectory: PACKAGES,
      root: ROOT,
      env: ENV,
      registry: REGISTRY,
      sha256Of,
      run,
    });
  } catch (caught) {
    error = caught;
  }
  return { calls, error };
};

const npmArgs = (tarball: string): string[] => [
  "publish",
  `./${tarball}`,
  "--provenance",
  "--access",
  "public",
  "--ignore-scripts",
  "--registry",
  REGISTRY,
];

const GIT_TAG = ["exec", "changeset", "git-tag"];

describe("the publish command's publish path", () => {
  it("publishes exactly the planned tarballs with npm, in the plan's order, then tags", () => {
    const { calls, error } = publish([lineOf(SIGNING), lineOf(SHELL)]);
    expect(error).toBeUndefined();
    expect(calls.map(call => call.command)).toEqual(["npm", "npm", "pnpm"]);
    expect(calls.map(call => call.args)).toEqual([
      npmArgs(SIGNING),
      npmArgs(SHELL),
      GIT_TAG,
    ]);
    expect(calls.map(call => call.cwd)).toEqual([PACKAGES, PACKAGES, ROOT]);
  });

  it("runs changeset git-tag last, with the environment that names CHANGESETS_OUTPUT", () => {
    const { calls } = publish([lineOf(SHELL)]);
    const [last] = calls.slice(-1);
    expect(last?.command).toBe("pnpm");
    expect(last?.args).toEqual(GIT_TAG);
    expect(last?.env["CHANGESETS_OUTPUT"]).toBe(ENV.CHANGESETS_OUTPUT);
    expect(calls.every(call => call.env === ENV)).toBe(true);
  });

  it("tags even with nothing to publish (every version already on the registry)", () => {
    const { calls, error } = publish([]);
    expect(error).toBeUndefined();
    expect(calls.map(call => call.command)).toEqual(["pnpm"]);
    expect(calls.map(call => call.args)).toEqual([GIT_TAG]);
  });

  it("publishes a prerelease tarball by its name", () => {
    const { calls } = publish([lineOf(SNAPSHOT)]);
    expect(calls[0]?.args).toEqual(npmArgs(SNAPSHOT));
  });

  it("stops at the first failure: nothing after it is published, and nothing is tagged", () => {
    const { calls, error } = publish(
      [lineOf(SIGNING), lineOf(SHELL), lineOf(SNAPSHOT)],
      { failOn: `./${SHELL}` },
    );
    expect(error).toBeInstanceOf(Error);
    expect(calls.map(call => call.args[1])).toEqual([
      `./${SIGNING}`,
      `./${SHELL}`,
    ]);
  });

  it("publishes nothing when a tarball is not the bytes the plan names", () => {
    const { calls, error } = publish([lineOf(SIGNING), lineOf(SHELL)], {
      digests: { [SHELL]: "f".repeat(64) },
    });
    expect(String(error)).toContain(`${SHELL} is not the tarball`);
    expect(calls).toEqual([]);
  });

  it.each([
    "not a plan line",
    `${"1".repeat(64)} ${SHELL}`,
    `${"1".repeat(63)}  ${SHELL}`,
    `${"1".repeat(64)}  ../${SHELL}`,
    `${"1".repeat(64)}  intraverse-se-client-shell-1.2.0.tgz --tag x`,
  ])("refuses the plan line %j and publishes nothing", line => {
    const { calls, error } = publish([lineOf(SIGNING), line]);
    expect(String(error)).toContain("Unexpected publish plan line");
    expect(calls).toEqual([]);
  });
});
