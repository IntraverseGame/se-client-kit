// Vendoring and verification of the `contracts` package
// (specs/client-kit/how-the-kit-gets-its-contracts.md). `verifyLock` is offline and is what the
// `contracts` CI job runs. `planSync` and `applySync` are run by a person with
// access to the sources: the kit's CI never reads a private repository.
//
// Nothing here knows how a source is read: a `SourceReader` does (git in
// production, memory in tests).

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { type Group, GROUPS } from "./contracts-groups.ts";
import { findFiles } from "./workspace.ts";

export const LOCK_FILE = "contracts.lock.json";
export const LOCK_VERSION = 1;

/** One vendored file: where it came from, and what its content hashed to. */
export type LockEntry = {
  /** Path in the package, relative to `packages/contracts`, with `/`. */
  readonly path: string;
  /** The source repository, by name. */
  readonly source: string;
  /**
   * The artifact's public name (from `GROUPS`), never a path inside a private
   * repository: this repository is public.
   */
  readonly sourceName: string;
  /** The last commit that touched the file, a full hash. */
  readonly sourceCommit: string;
  /** SHA-256 of the content, in lower-case hex. */
  readonly sha256: string;
};

export type Lock = {
  readonly lockVersion: typeof LOCK_VERSION;
  readonly entries: readonly LockEntry[];
};

/** A contract in a source repository: one file, or one directory of files. */
export type GroupSource = {
  /** The repository, by name (recorded in the lock). */
  readonly name: string;
  /** Where to read it: a local checkout (never recorded in the lock). */
  readonly repo: string;
  /** A git ref in that checkout (a branch, tag or commit). */
  readonly ref: string;
  /** Path of the file or directory in the repository (never recorded). */
  readonly path: string;
};

export type SourceReader = {
  /** Repository paths of the files under `source.path`, sorted. */
  readonly list: (source: GroupSource) => string[];
  readonly read: (source: GroupSource, file: string) => Uint8Array;
  /** The last commit that touched `file` at `source.ref`. */
  readonly commit: (source: GroupSource, file: string) => string;
};

export const sha256Of = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

const FULL_COMMIT = /^[0-9a-f]{40}$/u;

const byPath = (a: LockEntry, b: LockEntry): number => {
  if (a.path < b.path) return -1;
  return a.path > b.path ? 1 : 0;
};

export const serializeLock = (entries: readonly LockEntry[]): string => {
  const lock: Lock = {
    lockVersion: LOCK_VERSION,
    entries: entries.toSorted(byPath),
  };
  return `${JSON.stringify(lock, null, 2)}\n`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toEntry = (value: unknown): LockEntry | undefined => {
  if (!isRecord(value)) return undefined;
  const { path, source, sourceName, sourceCommit, sha256 } = value;
  if (
    typeof path !== "string" ||
    typeof source !== "string" ||
    typeof sourceName !== "string" ||
    typeof sourceCommit !== "string" ||
    typeof sha256 !== "string"
  )
    return undefined;
  return { path, source, sourceName, sourceCommit, sha256 };
};

/** The lock, or the reasons it cannot be read. A missing file is an empty lock. */
export const readLock = (
  packageDir: string,
): { entries: LockEntry[]; problems: string[] } => {
  const file = join(packageDir, LOCK_FILE);
  if (!existsSync(file)) return { entries: [], problems: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { entries: [], problems: [`${LOCK_FILE}: not valid JSON`] };
  }
  if (!isRecord(parsed) || parsed["lockVersion"] !== LOCK_VERSION)
    return {
      entries: [],
      problems: [`${LOCK_FILE}: lockVersion must be ${String(LOCK_VERSION)}`],
    };
  const raw = parsed["entries"];
  if (!Array.isArray(raw))
    return { entries: [], problems: [`${LOCK_FILE}: entries must be a list`] };
  const entries: LockEntry[] = [];
  const problems: string[] = [];
  for (const [index, item] of raw.entries()) {
    const entry = toEntry(item);
    if (entry === undefined)
      problems.push(`${LOCK_FILE}: entry ${String(index)} is malformed`);
    else entries.push(entry);
  }
  return { entries, problems };
};

/** Paths (relative to the package) of the files in a managed location. */
const managedFiles = (packageDir: string, group: Group): string[] => {
  const absolute = join(packageDir, group.destination);
  if (!existsSync(absolute)) return [];
  if (group.kind === "file") return [group.destination];
  return findFiles(absolute, () => true).map(
    file => `${group.destination}/${file}`,
  );
};

/**
 * The public name a package path is recorded under, or undefined when the path
 * is outside every managed location.
 */
export const expectedSourceName = (path: string): string | undefined => {
  for (const group of GROUPS) {
    if (group.kind === "file" && path === group.destination)
      return group.sourceName;
    if (group.kind === "directory" && path.startsWith(`${group.destination}/`))
      return `${group.sourceName}/${path.slice(group.destination.length + 1)}`;
  }
  return undefined;
};

/**
 * Offline check of the package against its lock: every entry's file exists and
 * hashes to the recorded SHA-256, every file in a managed location is in the
 * lock, and every entry names its source, its public name (exactly the one its
 * group assigns: never a path in a private repository) and a full commit. Empty
 * when the package is consistent.
 */
export const verifyLock = (packageDir: string): string[] => {
  const { entries, problems } = readLock(packageDir);
  const locked = new Set<string>();
  for (const entry of entries) {
    locked.add(entry.path);
    const file = join(packageDir, entry.path);
    if (!existsSync(file))
      problems.push(`${entry.path}: in ${LOCK_FILE} but missing on disk`);
    else if (sha256Of(readFileSync(file)) !== entry.sha256)
      problems.push(
        `${entry.path}: content differs from ${LOCK_FILE} (sha256 mismatch)`,
      );
    if (!FULL_COMMIT.test(entry.sourceCommit))
      problems.push(`${entry.path}: sourceCommit is not a full commit hash`);
    if (entry.source === "") problems.push(`${entry.path}: source is empty`);
    const expected = expectedSourceName(entry.path);
    if (expected === undefined)
      problems.push(`${entry.path}: not in a managed location`);
    else if (entry.sourceName !== expected)
      problems.push(
        `${entry.path}: sourceName must be the public name "${expected}"`,
      );
  }
  for (const group of GROUPS)
    for (const path of managedFiles(packageDir, group))
      if (!locked.has(path))
        problems.push(`${path}: on disk but not in ${LOCK_FILE}`);
  return problems.toSorted();
};

export type SyncPlan = {
  readonly entries: readonly LockEntry[];
  /** Package-relative path -> content. */
  readonly files: ReadonlyMap<string, Uint8Array>;
};

export type SyncOptions = {
  /** Allow changing or removing a vector that is already in the lock. */
  readonly allowVectorChange: boolean;
};

const inGroup = (group: Group, path: string): boolean =>
  path === group.destination || path.startsWith(`${group.destination}/`);

/**
 * Read every group from its source and decide the new lock and files, without
 * writing anything. Throws, naming the cause, before any write is possible.
 */
export const planSync = (
  sources: Readonly<Record<string, GroupSource>>,
  previous: readonly LockEntry[],
  reader: SourceReader,
  options: SyncOptions,
): SyncPlan => {
  const before = new Map(previous.map(entry => [entry.path, entry]));
  const entries: LockEntry[] = [];
  const files = new Map<string, Uint8Array>();

  for (const group of GROUPS) {
    const source = sources[group.id];
    if (source === undefined) throw new Error(`no source for "${group.id}"`);
    const listed = reader.list(source);
    if (listed.length === 0)
      throw new Error(`"${group.id}": ${source.path} has no files`);
    if (group.kind === "file" && listed.length !== 1)
      throw new Error(`"${group.id}": ${source.path} must be one file`);

    for (const file of listed) {
      const relative = file.slice(source.path.length + 1);
      const path =
        group.kind === "file"
          ? group.destination
          : `${group.destination}/${relative}`;
      const bytes = reader.read(source, file);
      const entry: LockEntry = {
        path,
        source: source.name,
        sourceName:
          group.kind === "file"
            ? group.sourceName
            : `${group.sourceName}/${relative}`,
        sourceCommit: reader.commit(source, file),
        sha256: sha256Of(bytes),
      };
      const old = before.get(path);
      if (
        group.vectors &&
        old !== undefined &&
        old.sha256 !== entry.sha256 &&
        !options.allowVectorChange
      )
        throw new Error(
          `${path}: vector files are append-only; refusing to change one`,
        );
      entries.push(entry);
      files.set(path, bytes);
    }

    if (group.vectors && !options.allowVectorChange)
      for (const old of previous)
        if (inGroup(group, old.path) && !files.has(old.path))
          throw new Error(
            `${old.path}: vector files are append-only; refusing to remove one`,
          );
  }
  return { entries, files };
};

/** Write the plan: the files, then the lock; drop managed files that left. */
export const applySync = (packageDir: string, plan: SyncPlan): void => {
  for (const group of GROUPS)
    for (const path of managedFiles(packageDir, group))
      if (!plan.files.has(path)) rmSync(join(packageDir, path));
  for (const [path, bytes] of plan.files) {
    const target = join(packageDir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  writeFileSync(join(packageDir, LOCK_FILE), serializeLock(plan.entries));
};
