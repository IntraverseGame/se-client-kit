// A small, strict tar reader and a deterministic tar writer, for the release
// dry run (runbook/client-kit-release.md, specs/client-kit/supply-chain.md).
//
// The reader checks a package tarball (`pnpm pack` output, after gunzip). It
// fails closed: a bad checksum, a truncated entry, or a size it cannot read
// throws; an entry that is neither a regular file nor a directory (a link, a
// device, a FIFO) is returned with `type: "other"` so the caller refuses it.
// PAX (`x`) and GNU long-name (`L`) records are honoured for the next entry's
// path; a global PAX record (`g`) is returned as `other` and refused.
//
// The writer is the Wrapper release artifact's format: ustar, entries sorted by
// path, every file mode 0644, owner and group 0 with no names, mtime 0, and no
// directory entries, so the same files always give the same bytes (and the same
// digest), on any machine and in any directory.

const BLOCK = 512;

export type TarEntry = {
  readonly path: string;
  readonly type: "file" | "directory" | "other";
  /** The raw type flag (`0`, `5`, `2`, ...), for messages. */
  readonly flag: string;
  readonly bytes: Buffer;
};

const text = (block: Buffer, start: number, length: number): string => {
  const field = block.subarray(start, start + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString("utf8");
};

const octal = (block: Buffer, start: number, length: number): number => {
  // The base-256 form sets the high bit of the first byte.
  if ((block[start] ?? 0) >= 0x80) {
    throw new Error("tar: a base-256 number field is not supported");
  }
  const digits = text(block, start, length).trim();
  if (!/^[0-7]*$/u.test(digits)) {
    throw new Error(
      `tar: not an octal number field: ${JSON.stringify(digits)}`,
    );
  }
  return digits === "" ? 0 : Number.parseInt(digits, 8);
};

const checksumOf = (header: Buffer): number => {
  let sum = 0;
  for (let index = 0; index < BLOCK; index += 1) {
    // The checksum field itself (bytes 148 to 155) counts as spaces.
    sum += index >= 148 && index < 156 ? 0x20 : (header[index] ?? 0);
  }
  return sum;
};

const isZeroBlock = (block: Buffer): boolean => block.every(byte => byte === 0);

/** The `path` of a PAX extended header, when it sets one. */
const paxPath = (data: Buffer): string | undefined => {
  let path: string | undefined;
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space === -1) throw new Error("tar: a malformed PAX record");
    const digits = data.subarray(offset, space).toString("utf8");
    const length = /^[0-9]+$/u.test(digits) ? Number(digits) : Number.NaN;
    if (!Number.isSafeInteger(length) || length <= 0) {
      throw new Error("tar: a malformed PAX record length");
    }
    const record = data
      .subarray(space + 1, offset + length - 1)
      .toString("utf8");
    const equals = record.indexOf("=");
    if (equals === -1) throw new Error("tar: a malformed PAX record");
    if (record.slice(0, equals) === "path") path = record.slice(equals + 1);
    offset += length;
  }
  return path;
};

/** The entries of an uncompressed tar archive, in archive order. */
export const readTar = (archive: Buffer): TarEntry[] => {
  const entries: TarEntry[] = [];
  let offset = 0;
  let nextPath: string | undefined;
  while (offset + BLOCK <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK);
    if (isZeroBlock(header)) return entries;
    if (octal(header, 148, 8) !== checksumOf(header)) {
      throw new Error(`tar: a header checksum does not match at ${offset}`);
    }
    const size = octal(header, 124, 12);
    const flag = text(header, 156, 1);
    const start = offset + BLOCK;
    const end = start + size;
    if (end > archive.length) throw new Error("tar: an entry is truncated");
    const bytes = Buffer.from(archive.subarray(start, end));
    offset = start + Math.ceil(size / BLOCK) * BLOCK;
    if (flag === "x") {
      nextPath = paxPath(bytes) ?? nextPath;
      continue;
    }
    if (flag === "L") {
      nextPath = text(bytes, 0, bytes.length);
      continue;
    }
    const name = text(header, 0, 100);
    const prefix = text(header, 257, 6).startsWith("ustar")
      ? text(header, 345, 155)
      : "";
    const path = nextPath ?? (prefix === "" ? name : `${prefix}/${name}`);
    nextPath = undefined;
    const type =
      flag === "0" || flag === ""
        ? "file"
        : flag === "5"
          ? "directory"
          : "other";
    entries.push({ path, type, flag, bytes });
  }
  throw new Error("tar: the archive has no end-of-archive block");
};

const writeText = (
  header: Buffer,
  start: number,
  length: number,
  value: string,
): void => {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > length) throw new Error(`tar: ${value} is too long`);
  bytes.copy(header, start);
};

const writeOctal = (
  header: Buffer,
  start: number,
  length: number,
  value: number,
): void => {
  const digits = value.toString(8).padStart(length - 1, "0");
  if (digits.length > length - 1) throw new Error("tar: a number is too large");
  writeText(header, start, length, digits);
};

/** Split a path into the ustar `prefix` and `name` fields. */
const splitPath = (path: string): { prefix: string; name: string } => {
  if (Buffer.byteLength(path) <= 100) return { prefix: "", name: path };
  for (let slash = path.indexOf("/"); slash !== -1;) {
    const prefix = path.slice(0, slash);
    const name = path.slice(slash + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) {
      return { prefix, name };
    }
    slash = path.indexOf("/", slash + 1);
  }
  throw new Error(`tar: the path ${path} does not fit a ustar header`);
};

const headerFor = (path: string, size: number): Buffer => {
  const header = Buffer.alloc(BLOCK);
  const { prefix, name } = splitPath(path);
  writeText(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  writeText(header, 156, 1, "0");
  writeText(header, 257, 6, "ustar");
  writeText(header, 263, 2, "00");
  writeText(header, 345, 155, prefix);
  writeOctal(header, 148, 7, checksumOf(header));
  header[155] = 0x20;
  return header;
};

/**
 * A deterministic ustar archive of `files` (path, relative and with `/`
 * separators, to bytes): sorted by path, with fixed metadata and no directory
 * entries.
 */
export const writeTar = (files: ReadonlyMap<string, Uint8Array>): Buffer => {
  const parts: Buffer[] = [];
  for (const path of [...files.keys()].toSorted()) {
    if (
      path === "" ||
      path.startsWith("/") ||
      path.split("/").some(part => part === "" || part === "." || part === "..")
    ) {
      throw new Error(`tar: refusing the path ${JSON.stringify(path)}`);
    }
    const bytes = files.get(path) ?? new Uint8Array();
    parts.push(headerFor(path, bytes.length), Buffer.from(bytes));
    const padding = (BLOCK - (bytes.length % BLOCK)) % BLOCK;
    parts.push(Buffer.alloc(padding));
  }
  parts.push(Buffer.alloc(BLOCK * 2));
  return Buffer.concat(parts);
};
