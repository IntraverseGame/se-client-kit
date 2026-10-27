// The reference game's Pages artifact (specs/client-kit.md, The game's site;
// ADR-008, decision 3's amendment note): the built `apps/reference-game/dist/`
// as one deterministic tar archive (tools/tar.ts), identified by the SHA-256 of
// that archive, the same way as the Wrapper's release artifact
// (tools/wrapper-artifact.ts). The game is never published or released; the
// artifact only carries its build from the Pages workflow's build job to its
// deploy job. Not compressed: gzip records the operating system.

import { createHash } from "node:crypto";
import { join } from "node:path";

import { readFiles } from "./release-steps.ts";
import { writeTar } from "./tar.ts";

export type ReferenceGameArtifact = {
  /** Always {@link REFERENCE_GAME_FILE_NAME}: the game has no version. */
  readonly fileName: string;
  readonly archive: Buffer;
  /** `sha256:<hex>` of the archive. */
  readonly digest: string;
};

export const REFERENCE_GAME_FILE_NAME = "se-client-reference-game.tar";

/** The artifact for the game's output `files` (paths relative to `dist/`). */
export const referenceGameArtifact = (
  files: ReadonlyMap<string, Uint8Array>,
): ReferenceGameArtifact => {
  if (!files.has("index.html")) {
    throw new Error(
      "The reference game's output has no index.html; it is not a build.",
    );
  }
  const archive = writeTar(files);
  return {
    fileName: REFERENCE_GAME_FILE_NAME,
    archive,
    digest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
  };
};

/** The artifact of the game built in checkout `root`. */
const built = (root: string): ReferenceGameArtifact =>
  referenceGameArtifact(
    readFiles(join(root, "apps", "reference-game", "dist")),
  );

export type ReproducedArtifact =
  | { readonly ok: true; readonly artifact: ReferenceGameArtifact }
  | { readonly ok: false; readonly problem: string };

/**
 * The artifact of the game built in two checkouts, `first` and `second` (the
 * release dry run's two scratch copies, kept with `--keep`): the first's, when
 * the two digests are equal.
 */
export const reproducedReferenceGame = (
  first: string,
  second: string,
): ReproducedArtifact => {
  const one = built(first);
  const two = built(second);
  return one.digest === two.digest
    ? { ok: true, artifact: one }
    : {
        ok: false,
        problem: `the reference game build is not reproducible: ${one.digest} and ${two.digest}`,
      };
};
