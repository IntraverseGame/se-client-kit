import { describe, expect, it } from "vitest";

import { readTar, writeTar } from "./tar.ts";

const files = (entries: Record<string, string>): Map<string, Uint8Array> =>
  new Map(
    Object.entries(entries).map(([path, text]) => [path, Buffer.from(text)]),
  );

/** Recompute a header's checksum after a test changed it. */
const fixChecksum = (archive: Buffer, offset: number): void => {
  const header = archive.subarray(offset, offset + 512);
  header.fill(0x20, 148, 156);
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "latin1");
};

/** One PAX record: `<length> <key>=<value>\n`, the length counting itself. */
const record = (key: string, value: string): string => {
  const body = ` ${key}=${value}\n`;
  let length = body.length + 1;
  while (`${String(length)}${body}`.length !== length) length += 1;
  return `${String(length)}${body}`;
};

describe("writeTar", () => {
  it("writes the same bytes for the same files in any order", () => {
    const one = writeTar(files({ "b.js": "b", "a/index.html": "<p>" }));
    const two = writeTar(files({ "a/index.html": "<p>", "b.js": "b" }));
    expect(one.equals(two)).toBe(true);
  });

  it("round-trips through readTar, sorted, as regular files only", () => {
    const archive = writeTar(
      files({ "z.txt": "last", "assets/a.js": "x".repeat(700), "m.json": "" }),
    );
    expect(
      readTar(archive).map(entry => [
        entry.path,
        entry.type,
        entry.bytes.length,
      ]),
    ).toEqual([
      ["assets/a.js", "file", 700],
      ["m.json", "file", 0],
      ["z.txt", "file", 4],
    ]);
  });

  it("fixes the metadata: mode 0644, owner 0, mtime 0, no names", () => {
    const header = writeTar(files({ "a.js": "a" })).subarray(0, 512);
    expect(header.subarray(100, 107).toString()).toBe("0000644");
    expect(header.subarray(108, 115).toString()).toBe("0000000");
    expect(header.subarray(116, 123).toString()).toBe("0000000");
    expect(header.subarray(136, 147).toString()).toBe("00000000000");
    expect(header.subarray(265, 329).every(byte => byte === 0)).toBe(true);
  });

  it("stores a long path in the ustar prefix field", () => {
    const path = `${"d".repeat(80)}/${"e".repeat(80)}/file.js`;
    const [entry] = readTar(writeTar(files({ [path]: "x" })));
    expect(entry?.path).toBe(path);
  });

  it.each(["", "/abs.js", "../up.js", "a/./b.js", "a//b.js"])(
    "refuses the path %j",
    path => {
      expect(() => writeTar(files({ [path]: "x" }))).toThrow(/refusing/u);
    },
  );
});

describe("readTar", () => {
  it("refuses a header whose checksum does not match", () => {
    const archive = writeTar(files({ "a.js": "a" }));
    archive.write("b", 0, "latin1");
    expect(() => readTar(archive)).toThrow(/checksum/u);
  });

  it("refuses a truncated entry", () => {
    const archive = writeTar(files({ "a.js": "x".repeat(600) }));
    expect(() => readTar(archive.subarray(0, 700))).toThrow(/truncated/u);
  });

  it("refuses an archive without an end-of-archive block", () => {
    const archive = writeTar(files({ "a.js": "a" }));
    expect(() => readTar(archive.subarray(0, 1024))).toThrow(/end-of-archive/u);
  });

  it("returns a symbolic link as another type, for the caller to refuse", () => {
    const archive = writeTar(files({ "link.js": "" }));
    archive.write("2", 156, "latin1");
    fixChecksum(archive, 0);
    expect(readTar(archive)).toMatchObject([
      { path: "link.js", type: "other", flag: "2" },
    ]);
  });

  it("takes the next entry's path from a PAX header", () => {
    const pax = record("path", "package/a-very-long-name.js");
    const archive = writeTar(files({ "a.pax": pax, "b.js": "code" }));
    archive.write("x", 156, "latin1");
    fixChecksum(archive, 0);
    expect(readTar(archive)).toMatchObject([
      { path: "package/a-very-long-name.js", type: "file" },
    ]);
  });
});
