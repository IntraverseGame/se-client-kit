// The sync's rule for the key-delegation notices list
// (specs/client-kit/how-the-kit-gets-its-contracts.md, rule 1). The list is
// not a vector and may change, but only as the backend's contract lets it.
// Entries are matched by id, as the backend's own check does: every locked
// entry stays, with its `id`, `text`, and `keccak256`, and its `status` only
// moves forward; a new entry may appear anywhere, and order does not matter.
// No `id` or hash repeats, and every status is a known one. No flag lifts this
// rule, and anything it cannot read fails it.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Notice = {
  readonly id: string;
  readonly text: string;
  readonly keccak256: string;
  readonly status: string;
};

/** The statuses each status may move to, itself included. */
const FORWARD: ReadonlyMap<string, readonly string[]> = new Map([
  ["pending", ["pending", "approved", "retired"]],
  ["approved", ["approved", "retired"]],
  ["retired", ["retired"]],
]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const noticesOf = (bytes: Uint8Array, which: string): readonly Notice[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch {
    throw new Error(`the ${which} notices list is not UTF-8 JSON`);
  }
  const list = isRecord(parsed) ? parsed["notices"] : undefined;
  if (!Array.isArray(list))
    throw new Error(`the ${which} notices list has no "notices" array`);
  const entries: unknown[] = list;
  const notices = entries.map((entry, index): Notice => {
    const where = `the ${which} notices list's entry ${String(index)}`;
    if (!isRecord(entry)) throw new Error(`${where} is not an object`);
    const { id, text, keccak256, status } = entry;
    if (typeof id !== "string" || typeof keccak256 !== "string")
      throw new Error(`${where} has no id or keccak256 to match by`);
    if (typeof text !== "string") throw new Error(`${where} has no text`);
    if (typeof status !== "string" || !FORWARD.has(status))
      throw new Error(`${where} has an unknown status`);
    return { id, text, keccak256, status };
  });
  for (const field of ["id", "keccak256"] as const)
    if (new Set(notices.map(notice => notice[field])).size !== notices.length)
      throw new Error(`the ${which} notices list repeats an entry's ${field}`);
  return notices;
};

/**
 * Throws, naming the cause, when the notices list `after` is not one the sync
 * may lock at all, whether or not a list is locked yet: not UTF-8 JSON, an
 * entry without an `id`, `keccak256`, or text, an unknown status, or a repeated
 * `id` or hash.
 */
export const checkNoticesList = (after: Uint8Array): void => {
  noticesOf(after, "new");
};

/**
 * Throws, naming the entry, when `after` is not an allowed change of the locked
 * notices list `before`, matched by id: an entry removed or renamed, its `text`
 * or `keccak256` changed, or its status moved back.
 */
export const checkNoticesChange = (
  path: string,
  before: Uint8Array,
  after: Uint8Array,
): void => {
  const next = new Map(
    noticesOf(after, "new").map(notice => [notice.id, notice]),
  );
  for (const old of noticesOf(before, "locked")) {
    const where = `${path}: notice "${old.id}"`;
    const now = next.get(old.id);
    if (now === undefined)
      throw new Error(`${where} was removed or renamed; notices stay`);
    for (const field of ["text", "keccak256"] as const)
      if (now[field] !== old[field])
        throw new Error(
          `${where} changed its ${field}; notices stay as locked`,
        );
    if (!(FORWARD.get(old.status) ?? []).includes(now.status))
      throw new Error(
        `${where} moved its status back (a status moves only from pending to approved or retired, or from approved to retired)`,
      );
  }
};

/**
 * The content of a locked file as it is on disk, by its path in the package, or
 * undefined when there is none: the base the notices rule compares with, once
 * checked against the lock's hash.
 */
export type LockedFiles = (path: string) => Uint8Array | undefined;

/**
 * The files on disk of the package at `packageDir`, checked against the lock's
 * hash by `checkLockedNotices` before they are used.
 */
export const lockedFilesIn =
  (packageDir: string): LockedFiles =>
  path => {
    const file = join(packageDir, path);
    return existsSync(file) ? readFileSync(file) : undefined;
  };

/**
 * The notices rule for a locked list: `after` may replace the list at `path`
 * only as `checkNoticesChange` allows. The locked content must be on disk and
 * hash to `lockedSha256`, so the rule never compares with anything but what was
 * locked.
 */
export const checkLockedNotices = (
  path: string,
  lockedSha256: string,
  after: Uint8Array,
  locked: LockedFiles,
): void => {
  const before = locked(path);
  if (
    before === undefined ||
    createHash("sha256").update(before).digest("hex") !== lockedSha256
  )
    throw new Error(
      `${path}: the locked notices list is missing or differs from the lock`,
    );
  checkNoticesChange(path, before, after);
};
