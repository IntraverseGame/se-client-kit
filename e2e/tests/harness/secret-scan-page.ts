// The part of the secret scan that runs in the page: it serializes a console
// argument, or reads a frame's storage, to text the scan can search. Binary
// values (an ArrayBuffer or a typed array) become hex, base64, and
// comma-separated decimals, the forms the scan looks for; a `bigint` prints in
// decimal.
//
// A channel that cannot be read is an `unreadable` record naming the channel
// and the error's name, never a value, and the scan fails on it (decided
// 2026-10-17). The one exception made here is a `SecurityError` in a frame
// whose origin, as recorded before any page code ran (origin-capture.ts), is
// "null" (a sandboxed or opaque frame), which has no such storage to read.
//
// An origin private file system read that fails with `UnknownError` (WebKit's
// answer where it has none, decided by the human, 2026-10-18) carries the
// result of a write probe in the same frame, `opfsWrite`: "failed" when the
// root cannot be had (no write can then happen), "succeeded" when a probe file
// was written and removed, and "unknown" otherwise. Every call it makes goes
// through the frozen capture an init script made before any page code ran
// (origin-capture.ts: `Reflect.apply`, the root access, and the handle
// methods), read as an own non-writable property, so a page that replaces one
// of them cannot make the probe fail; only the language's own `await` and
// `typeof` are used from the page's realm. A page can still override
// `Promise.prototype.then` to force "failed"; that matters only in WebKit,
// where OPFS writes fail anyway. The scan decides the excuse (secret-scan.ts,
// `isExcusedOpfs`): WebKit only, `UnknownError` only, and "failed" only.

/* oxlint-disable unicorn/consistent-function-scoping -- the helpers must live inside the one function Playwright sends to the page */

export type PageChannel =
  | "console"
  | "local-storage"
  | "session-storage"
  | "indexeddb"
  | "cache-storage"
  | "cookie"
  | "service-worker"
  | "history-state"
  | "origin-private-file-system"
  | "unreadable";

export type OpfsWrite = "failed" | "succeeded" | "unknown";

export type PageRecord = {
  readonly channel: PageChannel;
  readonly where: string;
  readonly text: string;
  /** For an unreadable origin private file system: the write probe. */
  readonly opfsWrite?: OpfsWrite;
};

// Playwright serializes this one function into the page, so everything it uses
// is inside it. `mode` "value" serializes `value`; "storage" reads the frame's
// storage (`value` is then the frame's global, unused).
export const inPage = async (
  value: unknown,
  mode: string,
): Promise<readonly PageRecord[]> => {
  const toBytes = (view: ArrayBuffer | ArrayBufferView): Uint8Array =>
    view instanceof ArrayBuffer
      ? new Uint8Array(view)
      : new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  const textOf = (item: unknown, seen: Set<unknown>): string => {
    if (typeof item === "string") return item;
    if (item === null || typeof item !== "object") return String(item);
    if (seen.has(item)) return "[cycle]";
    seen.add(item);
    if (item instanceof ArrayBuffer || ArrayBuffer.isView(item)) {
      const bytes = toBytes(item);
      const hex = Array.from(bytes, byte =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      let binary = "";
      for (const byte of bytes) binary += String.fromCodePoint(byte);
      return `${hex} ${btoa(binary)} ${Array.from(bytes).join(",")}`;
    }
    if (item instanceof Map) return textOf([...item.entries()], seen);
    if (item instanceof Set) return textOf([...item.values()], seen);
    if (item instanceof Error) {
      return `${item.name}: ${item.message} ${item.stack ?? ""}`;
    }
    return Object.entries(item)
      .map(([key, entry]) => `${key}=${textOf(entry, seen)}`)
      .join(" ");
  };
  const text = (item: unknown): string => textOf(item, new Set());
  if (mode === "value") {
    try {
      return [{ channel: "console", where: "argument", text: text(value) }];
    } catch (error: unknown) {
      const name = error instanceof Error ? error.name : typeof error;
      return [{ channel: "unreadable", where: "console argument", text: name }];
    }
  }

  const out: PageRecord[] = [];
  // The write probe, through the OPFS access recorded before any page code ran
  // (origin-capture.ts), never the page's `navigator.storage`.
  const probeOpfsWrite = async (): Promise<OpfsWrite> => {
    const start = (globalThis as Record<string, unknown>)["__seE2eOpfsAtStart"];
    if (typeof start !== "object" || start === null) return "unknown";
    const at = start as Readonly<Record<string, unknown>>;
    const apply = at["apply"];
    if (
      typeof apply !== "function" ||
      typeof at["getDirectory"] !== "function"
    ) {
      return "unknown";
    }
    const call = apply as (
      target: unknown,
      self: unknown,
      args: readonly unknown[],
    ) => unknown;
    let root: unknown;
    try {
      root = await call(at["getDirectory"], at["storage"], []);
    } catch {
      return "failed";
    }
    try {
      const name = "se-e2e-write-probe";
      const file = await call(at["getFileHandle"], root, [
        name,
        { create: true },
      ]);
      const writable = await call(at["createWritable"], file, []);
      await call(at["write"], writable, ["probe"]);
      await call(at["close"], writable, []);
      await call(at["removeEntry"], root, [name]);
      return "succeeded";
    } catch {
      return "unknown";
    }
  };
  const attempt = async (
    channel: PageChannel,
    step: () => Promise<void> | void,
  ): Promise<void> => {
    try {
      await step();
    } catch (error: unknown) {
      const name = error instanceof Error ? error.name : typeof error;
      // An opaque frame may not read this storage, and so holds none of it.
      // The origin recorded before any page code ran (origin-capture.ts),
      // never `self.origin`, which a page can overwrite.
      const origin: unknown = Reflect.get(globalThis, "__seE2eOriginAtStart");
      if (name === "SecurityError" && origin === "null") return;
      out.push(
        channel === "origin-private-file-system" && name === "UnknownError"
          ? {
              channel: "unreadable",
              where: channel,
              text: name,
              opfsWrite: await probeOpfsWrite(),
            }
          : { channel: "unreadable", where: channel, text: name },
      );
    }
  };
  const settle = <T>(request: IDBRequest<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      request.addEventListener("success", () => {
        resolve(request.result);
      });
      request.addEventListener("error", () => {
        reject(request.error ?? new Error("IndexedDB request failed"));
      });
    });
  const webStorage = (
    channel: "local-storage" | "session-storage",
    storage: Storage,
  ): void => {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index) ?? "";
      const entry = `${key}=${storage.getItem(key) ?? ""}`;
      out.push({ channel, where: "entry", text: entry });
    }
  };
  const readStore = async (db: IDBDatabase, store: string): Promise<string> => {
    const objects = db.transaction(store, "readonly").objectStore(store);
    const [keys, values] = await Promise.all([
      settle(objects.getAllKeys()),
      settle(objects.getAll()),
    ]);
    return `${db.name} ${store} ${text(keys)} ${text(values)}`;
  };
  const readDatabase = async (name: string): Promise<readonly string[]> => {
    const db = await settle(indexedDB.open(name));
    const stores = await Promise.all(
      Array.from(db.objectStoreNames, store => readStore(db, store)),
    );
    db.close();
    return stores;
  };
  const readCache = async (name: string): Promise<readonly string[]> => {
    const cache = await caches.open(name);
    return Promise.all(
      (await cache.keys()).map(async request => {
        const response = await cache.match(request);
        const body = response === undefined ? "" : await response.text();
        return `${name} ${request.url} ${body}`;
      }),
    );
  };

  const readDirectory = async (
    directory: FileSystemDirectoryHandle,
    path: string,
  ): Promise<readonly string[]> => {
    const handles: FileSystemHandle[] = [];
    for await (const handle of directory.values()) handles.push(handle);
    const read = await Promise.all(
      handles.map(async handle => {
        const name = `${path}/${handle.name}`;
        if (handle instanceof FileSystemDirectoryHandle) {
          return [[name], await readDirectory(handle, name)].flat();
        }
        const file = await (handle as FileSystemFileHandle).getFile();
        return [`${name} ${await file.text()}`];
      }),
    );
    return read.flat();
  };

  await attempt("local-storage", () => {
    webStorage("local-storage", localStorage);
  });
  await attempt("session-storage", () => {
    webStorage("session-storage", sessionStorage);
  });
  await attempt("history-state", () => {
    out.push({
      channel: "history-state",
      where: "history.state",
      text: text(history.state),
    });
  });
  await attempt("cookie", () => {
    out.push({
      channel: "cookie",
      where: "document.cookie",
      text: document.cookie,
    });
  });
  await attempt("indexeddb", async () => {
    const databases = await indexedDB.databases();
    const stores = await Promise.all(
      databases.map(info => readDatabase(info.name ?? "")),
    );
    for (const store of stores.flat()) {
      out.push({ channel: "indexeddb", where: "store", text: store });
    }
  });
  await attempt("cache-storage", async () => {
    const entries = await Promise.all(
      (await caches.keys()).map(name => readCache(name)),
    );
    for (const entry of entries.flat()) {
      out.push({ channel: "cache-storage", where: "entry", text: entry });
    }
  });
  await attempt("service-worker", async () => {
    for (const registration of await navigator.serviceWorker.getRegistrations()) {
      const workers = [
        registration.active,
        registration.waiting,
        registration.installing,
      ];
      const scripts = workers.map(worker => worker?.scriptURL ?? "").join(" ");
      out.push({
        channel: "service-worker",
        where: "registration",
        text: `${registration.scope} ${scripts}`,
      });
    }
  });
  await attempt("origin-private-file-system", async () => {
    const root = await navigator.storage.getDirectory();
    for (const entry of await readDirectory(root, "")) {
      out.push({
        channel: "origin-private-file-system",
        where: "file",
        text: entry,
      });
    }
  });
  return out;
};
