// Records each frame's origin before any page code runs, so the secret scan's
// one excuse (a `SecurityError` in a frame whose origin is "null") reads the
// origin the browser gave the frame, not one the page wrote over
// `self.origin`. The value is a non-writable, non-configurable global the page
// cannot replace.
//
// It also records, the same way and frozen, everything the scan's OPFS write
// probe calls (secret-scan-page.ts), as the browser gave it:
// `Reflect.apply`, `navigator.storage`, `StorageManager.prototype.getDirectory`,
// and the handle methods `getFileHandle`, `removeEntry`, `createWritable`, the
// writable stream's `write`, and `WritableStream.prototype.close`. A page that
// replaces any of them later cannot make the probe fail.

import type { BrowserContext } from "@playwright/test";

/** The global the origin is recorded under; secret-scan-page.ts reads it. */
export const ORIGIN_AT_START = "__seE2eOriginAtStart";

/** The global the OPFS root access is recorded under, for the write probe. */
export const OPFS_AT_START = "__seE2eOpfsAtStart";

// Runs in the page: no reference to anything outside its own body.
const recordOrigin = (name: string): void => {
  Object.defineProperty(globalThis, name, {
    value: globalThis.origin,
    writable: false,
    configurable: false,
    enumerable: false,
  });
};

// Runs in the page: no reference to anything outside its own body.
const recordOpfs = (name: string): void => {
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- it runs in the page, inside the one function Playwright sends there
  const method = (owner: unknown, key: string): unknown =>
    typeof owner === "function"
      ? Reflect.get(Reflect.get(owner, "prototype") as object, key)
      : undefined;
  const scope = globalThis as Record<string, unknown>;
  const capture = {
    apply: Reflect.apply,
    storage: Reflect.get(navigator, "storage") as unknown,
    getDirectory: method(scope["StorageManager"], "getDirectory"),
    getFileHandle: method(scope["FileSystemDirectoryHandle"], "getFileHandle"),
    removeEntry: method(scope["FileSystemDirectoryHandle"], "removeEntry"),
    createWritable: method(scope["FileSystemFileHandle"], "createWritable"),
    write: method(scope["FileSystemWritableFileStream"], "write"),
    close: method(scope["WritableStream"], "close"),
  };
  Object.defineProperty(globalThis, name, {
    value: Object.freeze(capture),
    writable: false,
    configurable: false,
    enumerable: false,
  });
};

export const captureOrigins = async (
  context: BrowserContext,
): Promise<void> => {
  await context.addInitScript(recordOrigin, ORIGIN_AT_START);
  await context.addInitScript(recordOpfs, OPFS_AT_START);
};
