// The contracts the kit vendors, and where each lands in packages/contracts.
// The layout is pinned by specs/client-kit/the-contracts-package.md ("Source
// layout"); the public names by
// specs/client-kit/how-the-kit-gets-its-contracts.md.

export type Group = {
  readonly id: string;
  readonly kind: "file" | "directory";
  /** Where it lands, relative to `packages/contracts`. */
  readonly destination: string;
  /**
   * The public name the lock records, never a path inside a private repository.
   * A directory's files are recorded as `<sourceName>/<file>`.
   */
  readonly sourceName: string;
  /** Vector files are append-only. */
  readonly vectors: boolean;
};

export const GROUPS: readonly Group[] = [
  {
    id: "snapshot-schema",
    kind: "file",
    destination: "src/schemas/se.snapshot.v1.schema.json",
    sourceName: "se.snapshot/1 schema",
    vectors: false,
  },
  {
    id: "snapshot-vectors-valid",
    kind: "directory",
    destination: "src/vectors/snapshot/valid",
    sourceName: "se.snapshot/1 vectors/valid",
    vectors: true,
  },
  {
    id: "snapshot-vectors-invalid",
    kind: "directory",
    destination: "src/vectors/snapshot/invalid",
    sourceName: "se.snapshot/1 vectors/invalid",
    vectors: true,
  },
  {
    id: "signing-vectors",
    kind: "file",
    destination: "src/vectors/signing.json",
    sourceName: "test/vectors/signing.json",
    vectors: true,
  },
];
