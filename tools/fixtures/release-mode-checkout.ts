// The temporary checkouts of tools/release-mode.test.ts and
// tools/release-publish-steps.test.ts: a release workflow step's own script run
// as Actions runs it (tools/fixtures/workflow-step.ts) in a checkout with the
// six publishable manifests and `.changeset/`, with a stub `gh` that applies
// the step's `--jq` filter to the pull requests with jq, as
// `gh api --paginate --jq` does (or a test's own `gh`), and a stub `git` that
// answers `ls-remote` from a list of refs, matching the pattern's tail as git
// does.

import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { runStep } from "./workflow-step.ts";

export const REPOSITORY = "owner/repository";
export const SHA = "a".repeat(40);
export const OTHER_SHA = "b".repeat(40);

const MANIFESTS: Readonly<Record<string, string>> = {
  "packages/contracts/package.json": "@intraverse/se-client-contracts",
  "packages/signing/package.json": "@intraverse/se-client-signing",
  "packages/snapshot/package.json": "@intraverse/se-client-snapshot",
  "packages/play-client/package.json": "@intraverse/se-client-play-client",
  "packages/shell/package.json": "@intraverse/se-client-shell",
  "apps/wrapper/package.json": "@intraverse/se-client-wrapper",
};

const GH = `#!/bin/sh
set -eu
echo "gh $*" >> "$STUB_DIR/calls"
[ "$1" = api ] && [ "$2" = --paginate ] &&
  [ "$3" = "repos/$GITHUB_REPOSITORY/commits/$GITHUB_SHA/pulls?per_page=100" ] &&
  [ "$4" = --jq ] || { echo "unexpected call: $*" >&2; exit 2; }
if [ -e "$STUB_DIR/gh-error" ]; then echo "HTTP 502: Bad Gateway" >&2; exit 1; fi
jq -r "$5" "$STUB_DIR/pulls.json"
`;

const GIT = `#!/bin/sh
set -eu
echo "git $*" >> "$STUB_DIR/calls"
if [ -e "$STUB_DIR/git-error" ]; then echo "fatal: unable to access" >&2; exit 128; fi
for last; do :; done
touch "$STUB_DIR/refs"
awk -v p="$last" '{ n = length($2); m = length(p)
  if (substr($2, n - m + 1) == p || substr($2, n - m - 2) == p "^{}") print }' "$STUB_DIR/refs"
`;

export type Pull = {
  readonly head: { readonly ref: string; readonly repo: null | object };
  readonly base: { readonly ref: string };
  readonly merged_at: string | null;
  readonly merge_commit_sha: string;
  readonly number: number;
};

export const BUMP: Pull = {
  head: { ref: "changeset-release/main", repo: { full_name: REPOSITORY } },
  base: { ref: "main" },
  merged_at: "2026-10-28T00:00:00Z",
  merge_commit_sha: SHA,
  number: 7,
};

export type Setup = {
  readonly changesets?: readonly string[];
  readonly versions?: Readonly<Record<string, string>>;
  readonly pulls?: readonly Pull[];
  /** `refs/tags/...`, at commit `c...c`, or `<commit>\t<ref>`. */
  readonly refs?: readonly string[];
  /** A `gh` stub in place of the pull-request one. */
  readonly gh?: string;
  /** More files of the checkout, by path. */
  readonly files?: Readonly<Record<string, string>>;
  /** Files beside the stubs (their data), by name. */
  readonly stubFiles?: Readonly<Record<string, string>>;
  readonly ghError?: boolean;
  readonly gitError?: boolean;
  readonly env?: Readonly<Record<string, string>>;
};

export type Outcome = {
  readonly status: number | null;
  readonly output: string;
  readonly result: string;
  readonly calls: string;
  /** The stubs' directory, where a stub leaves what it was given. */
  readonly stubs: string;
};

const directories: string[] = [];

/** Removes every checkout made so far. */
export const cleanup = (): void => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
};

const put = (root: string, path: string, content: string): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
};

/** Runs `script` in a new checkout made from `setup`. */
export const run = (script: string, setup: Setup = {}): Outcome => {
  const directory = mkdtempSync(join(tmpdir(), "se-client-kit-mode-"));
  directories.push(directory);
  const stubs = join(directory, "stubs");
  const checkout = join(directory, "checkout");
  mkdirSync(stubs);
  mkdirSync(checkout);
  for (const [name, body] of [
    ["gh", setup.gh ?? GH],
    ["git", GIT],
  ] as const) {
    writeFileSync(join(stubs, name), body);
    chmodSync(join(stubs, name), 0o755);
  }
  put(checkout, ".changeset/README.md", "readme\n");
  put(checkout, ".changeset/config.json", "{}\n");
  for (const name of setup.changesets ?? []) {
    put(checkout, `.changeset/${name}`, "---\n---\n");
  }
  for (const [path, name] of Object.entries(MANIFESTS)) {
    const version = setup.versions?.[name] ?? "0.0.0";
    put(checkout, path, JSON.stringify({ name, version }));
  }
  writeFileSync(join(stubs, "pulls.json"), JSON.stringify(setup.pulls ?? []));
  writeFileSync(
    join(stubs, "refs"),
    (setup.refs ?? [])
      .map(ref => (ref.includes("\t") ? ref : `${"c".repeat(40)}\t${ref}`))
      .map(line => `${line}\n`)
      .join(""),
  );
  for (const [path, content] of Object.entries(setup.files ?? {})) {
    put(checkout, path, content);
  }
  for (const [name, content] of Object.entries(setup.stubFiles ?? {})) {
    writeFileSync(join(stubs, name), content);
  }
  const runnerTemp = join(directory, "runner");
  mkdirSync(runnerTemp);
  if (setup.ghError === true) writeFileSync(join(stubs, "gh-error"), "");
  if (setup.gitError === true) writeFileSync(join(stubs, "git-error"), "");
  const output = join(directory, "github-output");
  writeFileSync(output, "");
  const result = runStep(script, directory, {
    cwd: checkout,
    env: {
      PATH: `${stubs}:${process.env["PATH"] ?? ""}`,
      STUB_DIR: stubs,
      GITHUB_OUTPUT: output,
      GITHUB_REPOSITORY: REPOSITORY,
      GITHUB_SHA: SHA,
      GITHUB_SERVER_URL: "https://github.com",
      RUNNER_TEMP: runnerTemp,
      ...setup.env,
    },
  });
  let calls = "";
  try {
    calls = readFileSync(join(stubs, "calls"), "utf8");
  } catch {
    calls = "";
  }
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    result: readFileSync(output, "utf8"),
    calls,
    stubs,
  };
};

export const ENABLED = { RELEASE_PUBLISH_ENABLED: "true" };
export const WRAPPER_1 = { "@intraverse/se-client-wrapper": "1.0.0" };
export const WRAPPER_TAG = "refs/tags/@intraverse/se-client-wrapper@1.0.0";
