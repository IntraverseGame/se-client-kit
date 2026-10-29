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
    id: "play-api-document",
    kind: "file",
    destination: "src/schemas/play.v1.openapi.yaml",
    sourceName: "play/v1 OpenAPI document",
    vectors: false,
  },
  {
    id: "verify-api-document",
    kind: "file",
    destination: "src/schemas/verify.v1.openapi.yaml",
    sourceName: "verify/v1 OpenAPI document",
    vectors: false,
  },
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
    id: "snapshot-vectors-signature",
    kind: "directory",
    destination: "src/vectors/snapshot/signature",
    sourceName: "se.snapshot/1 vectors/signature",
    vectors: true,
  },
  {
    id: "snapshot-vectors-typed-data",
    kind: "directory",
    destination: "src/vectors/snapshot/typed-data",
    sourceName: "se.snapshot/1 vectors/typed-data",
    vectors: true,
  },
  {
    id: "snapshot-vectors-signed-action",
    kind: "directory",
    destination: "src/vectors/snapshot/signed-action",
    sourceName: "se.snapshot/1 vectors/signed-action",
    vectors: true,
  },
  {
    id: "signing-vectors",
    kind: "file",
    destination: "src/vectors/signing.json",
    sourceName: "test/vectors/signing.json",
    vectors: true,
  },
  // The SuperEngine fairness kernel, kernelVersion 1: its public vector sets,
  // each recorded under its set id (the file's own `set` field).
  {
    id: "kernel-vectors-seed",
    kind: "file",
    destination: "src/vectors/kernel/v1/seed.json",
    sourceName: "kernel/public/v1/seed",
    vectors: true,
  },
  {
    id: "kernel-vectors-steps-derive",
    kind: "file",
    destination: "src/vectors/kernel/v1/steps-derive.json",
    sourceName: "kernel/public/v1/steps-derive",
    vectors: true,
  },
  {
    id: "kernel-vectors-derive",
    kind: "file",
    destination: "src/vectors/kernel/v1/derive.json",
    sourceName: "kernel/public/v1/derive",
    vectors: true,
  },
  {
    id: "kernel-vectors-shuffle-draw",
    kind: "file",
    destination: "src/vectors/kernel/v1/shuffle-draw.json",
    sourceName: "kernel/public/v1/shuffle-draw",
    vectors: true,
  },
  {
    id: "kernel-vectors-round-secret-hash",
    kind: "file",
    destination: "src/vectors/kernel/v1/round-secret-hash.json",
    sourceName: "kernel/public/v1/round-secret-hash",
    vectors: true,
  },
  {
    id: "kernel-vectors-coin-flip-payout",
    kind: "file",
    destination: "src/vectors/kernel/v1/coin-flip-payout.json",
    sourceName: "kernel/public/v1/coin-flip-payout",
    vectors: true,
  },
  {
    id: "kernel-vectors-weighted-draw",
    kind: "file",
    destination: "src/vectors/kernel/v1/weighted-draw.json",
    sourceName: "kernel/public/v1/weighted-draw",
    vectors: true,
  },
  {
    id: "kernel-vectors-book-draw",
    kind: "file",
    destination: "src/vectors/kernel/v1/book-draw.json",
    sourceName: "kernel/public/v1/book-draw",
    vectors: true,
  },
];
