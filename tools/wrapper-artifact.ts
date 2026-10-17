// The Wrapper release artifact (specs/client-kit.md, How the Wrapper reaches the
// SuperEngine origin; runbook/client-kit-release.md): the built `apps/wrapper/
// dist/` as one deterministic tar archive (tools/tar.ts), identified by the
// SHA-256 of that archive. The archive holds exactly the files of the release
// output, whose SRI attributes, policy, and manifest the Wrapper's build has
// already enforced (apps/wrapper/release-*.ts), so equal digests mean equal
// files. The archive is not compressed: gzip writes an operating-system byte
// into its header, which would make the digest depend on the machine.

import { createHash } from "node:crypto";

import { writeTar } from "./tar.ts";

export type WrapperArtifact = {
  /** `se-client-wrapper-<version>.tar`. */
  readonly fileName: string;
  readonly archive: Buffer;
  /** `sha256:<hex>` of the archive. */
  readonly digest: string;
};

export const MANIFEST_FILE = "integrity-manifest.json";

/** The artifact for the Wrapper output `files` (paths relative to `dist/`). */
export const wrapperArtifact = (
  version: string,
  files: ReadonlyMap<string, Uint8Array>,
): WrapperArtifact => {
  if (!files.has(MANIFEST_FILE)) {
    throw new Error(
      `The Wrapper output has no ${MANIFEST_FILE}; it is not a release build.`,
    );
  }
  const archive = writeTar(files);
  return {
    fileName: `se-client-wrapper-${version}.tar`,
    archive,
    digest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
  };
};
