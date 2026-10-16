// The session's signer lock (W-14): an exclusive Web Lock named
// `se:signer:<sessionId>`, requested with `ifAvailable: true` and held for the
// page's life. A page that does not get it signs nothing; a browser without the
// Web Locks API signs nothing (fail closed).

/** The options the shell passes to `request`. */
export type LockRequestOptions = {
  readonly mode: "exclusive";
  readonly ifAvailable: true;
};

/**
 * The part of the platform `LockManager` (`navigator.locks`) the shell calls.
 * The callback gets a lock, or `null` when another holder has it; the lock is
 * held until the promise the callback returns settles.
 */
export type LockManagerLike = {
  readonly request: (
    name: string,
    options: LockRequestOptions,
    callback: (lock: unknown) => Promise<unknown> | undefined,
  ) => Promise<unknown>;
};

/** The state of this page's hold on the lock. */
export type LockState =
  /** Held: this page may sign. */
  | "held"
  /** Another holder has it: the "open in another tab" state (W-14, W-44). */
  | "held-elsewhere"
  /** The browser has no usable Web Locks API (W-14: fail closed). */
  | "unsupported"
  /** It was held and the platform took it away (a steal, or a failure). */
  | "lost"
  /** This page released it when the session ended. */
  | "released";

export type SignerLock = {
  readonly state: () => LockState;
  /** Releases a held lock; a no-op in every other state. */
  readonly release: () => void;
};

const SESSION_ID = /^[!-~]{1,256}$/u;

/** The lock name of W-14; `undefined` for a session id that cannot be one. */
export const signerLockName = (sessionId: string): string | undefined =>
  SESSION_ID.test(sessionId) ? `se:signer:${sessionId}` : undefined;

const fixed = (state: LockState): SignerLock =>
  Object.freeze({ state: (): LockState => state, release: (): void => {} });

const isLockManager = (value: unknown): value is LockManagerLike =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { readonly request?: unknown }).request === "function";

/**
 * Requests the signer lock of `name` once. It resolves when the platform
 * answers: `held`, `held-elsewhere`, or `unsupported` (no lock manager, or a
 * `request` that throws, rejects, or settles before it answers). A lock manager
 * whose `request` never settles and never calls back leaves the returned
 * promise, and so the session's opening, pending for good; the platform's API
 * with `ifAvailable: true` always answers at once.
 */
export const acquireSignerLock = (
  locks: unknown,
  name: string,
): Promise<SignerLock> => {
  if (!isLockManager(locks)) {
    return Promise.resolve(fixed("unsupported"));
  }
  return new Promise<SignerLock>(resolve => {
    let state: LockState | undefined;
    let endHold: (() => void) | undefined;
    const hold = new Promise<void>(done => {
      endHold = done;
    });
    const lock: SignerLock = Object.freeze({
      state: (): LockState => state ?? "unsupported",
      release: (): void => {
        if (state === "held") {
          state = "released";
          endHold?.();
        }
      },
    });
    const callback = (granted: unknown): Promise<unknown> | undefined => {
      if (state !== undefined) {
        // A second call of the callback is not the platform's behavior.
        return undefined;
      }
      if (granted === null || granted === undefined) {
        state = "held-elsewhere";
        resolve(lock);
        return undefined;
      }
      state = "held";
      resolve(lock);
      return hold;
    };
    const fail = (): void => {
      if (state === undefined) {
        state = "unsupported";
        resolve(lock);
      } else if (state === "held") {
        state = "lost";
      }
    };
    const watch = async (): Promise<void> => {
      try {
        await locks.request(
          name,
          { mode: "exclusive", ifAvailable: true },
          callback,
        );
      } catch {
        // A `request` that throws or rejects: no lock before an answer, a
        // lost lock after one.
        fail();
        return;
      }
      // The request settles once the hold ends: anything still `held` here was
      // ended by the platform, not by `release`. One that settles without
      // ever answering is treated as no lock manager.
      if (state === "held") state = "lost";
      else fail();
    };
    void watch();
  });
};
