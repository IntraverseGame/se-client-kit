// The publish path of the publish command (tools/release-publish.ts
// --publish; ADR-009), without its side effects so that
// tools/release-publish-run.test.ts can run it: the plan's lines are checked,
// every planned tarball is checked against the plan's SHA-256 before anything
// is published, each is published with the npm CLI of the pinned Node (npm
// trusted publishing exchanges the job's OIDC token itself), in the plan's
// order, and then `changeset git-tag` tags every package whose version has no
// tag yet, reporting each tag to changesets/action through the environment's
// CHANGESETS_OUTPUT. The first failure stops it.

import { spawnSync } from "node:child_process";
import { join } from "node:path";

/** Runs one command; throws when it fails. */
export type Runner = (
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
) => void;

/**
 * The runner of the real publish: the command's output shown as it runs; a
 * failure throws.
 */
export const runShown: Runner = (command, args, options) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: "inherit",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `\`${[command, ...args].join(" ")}\` failed (exit ${String(result.status)}).`,
    );
  }
};

export type PublishInput = {
  /** The publish plan: `<sha256> <tarball>` lines, in dependency order. */
  readonly plan: readonly string[];
  /** Where the tarballs are. */
  readonly packagesDirectory: string;
  /** The repository's root, where `changeset git-tag` runs. */
  readonly root: string;
  /** The environment of every command (the job's, unchanged). */
  readonly env: NodeJS.ProcessEnv;
  /** The registry URL npm publishes to. */
  readonly registry: string;
  /** The SHA-256 (hex) of the file at a path. */
  readonly sha256Of: (path: string) => string;
  readonly run: Runner;
};

const PLAN_LINE =
  /^(?<sha>[0-9a-f]{64}) {2}(?<tarball>intraverse-se-client-[a-z-]+-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\.tgz)$/u;

type Entry = { readonly sha: string; readonly tarball: string };

const entryOf = (line: string): Entry => {
  const groups = PLAN_LINE.exec(line)?.groups;
  const sha = groups?.["sha"];
  const tarball = groups?.["tarball"];
  if (sha === undefined || tarball === undefined) {
    throw new Error(`Unexpected publish plan line: ${line}`);
  }
  return { sha, tarball };
};

export const publishPlanned = (input: PublishInput): void => {
  const entries = input.plan.map(line => entryOf(line));
  for (const { sha, tarball } of entries) {
    if (input.sha256Of(join(input.packagesDirectory, tarball)) !== sha) {
      throw new Error(
        `${tarball} is not the tarball the plan names; nothing was published.`,
      );
    }
  }
  for (const { tarball } of entries) {
    console.log(`npm publish ${tarball}`);
    input.run(
      "npm",
      [
        "publish",
        `./${tarball}`,
        "--provenance",
        "--access",
        "public",
        "--ignore-scripts",
        "--registry",
        input.registry,
      ],
      { cwd: input.packagesDirectory, env: input.env },
    );
  }
  input.run("pnpm", ["exec", "changeset", "git-tag"], {
    cwd: input.root,
    env: input.env,
  });
};
