// W-14: the signer lock, requested once with `ifAvailable`, held for the
// page's life, and failing closed without a Web Locks API.

import { describe, expect, it } from "vitest";

import { createFakeLockManager, flush } from "./fixtures/fake-locks.ts";
import { acquireSignerLock, signerLockName } from "./web-lock.ts";

const NAME = "se:signer:ses_1";

describe("signerLockName", () => {
  it("is se:signer:<sessionId>", () => {
    expect(signerLockName("ses_1")).toBe(NAME);
  });

  it.each(["", "with space", "x".repeat(257), "tab\tinside", "é"])(
    "refuses %j as a session id",
    sessionId => {
      expect(signerLockName(sessionId)).toBeUndefined();
    },
  );
});

describe("acquireSignerLock", () => {
  it("holds a free lock until it is released", async () => {
    const locks = createFakeLockManager();
    const lock = await acquireSignerLock(locks, NAME);
    expect(lock.state()).toBe("held");
    await flush();
    expect(locks.isHeld(NAME)).toBe(true);
    lock.release();
    await flush();
    expect(lock.state()).toBe("released");
    expect(locks.isHeld(NAME)).toBe(false);
  });

  it("requests it exclusively and only if available", async () => {
    const requests: unknown[] = [];
    const locks = {
      request: (
        name: string,
        options: unknown,
        callback: (lock: unknown) => Promise<unknown> | undefined,
      ): Promise<unknown> => {
        requests.push({ name, options });
        return Promise.resolve(callback(null));
      },
    };
    await acquireSignerLock(locks, NAME);
    expect(requests).toEqual([
      { name: NAME, options: { mode: "exclusive", ifAvailable: true } },
    ]);
  });

  it("reports a lock another holder has as held-elsewhere", async () => {
    const locks = createFakeLockManager();
    const first = await acquireSignerLock(locks, NAME);
    const second = await acquireSignerLock(locks, NAME);
    expect(first.state()).toBe("held");
    expect(second.state()).toBe("held-elsewhere");
    second.release();
    await flush();
    expect(locks.isHeld(NAME)).toBe(true);
  });

  it("does not ask again when the holder lets go", async () => {
    const locks = createFakeLockManager();
    const first = await acquireSignerLock(locks, NAME);
    const second = await acquireSignerLock(locks, NAME);
    first.release();
    await flush();
    expect(second.state()).toBe("held-elsewhere");
    expect(locks.requested()).toHaveLength(2);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["an object without request", {}],
    ["a request that is not a function", { request: "no" }],
  ])("fails closed with %s as the lock manager", async (_name, locks) => {
    const lock = await acquireSignerLock(locks, NAME);
    expect(lock.state()).toBe("unsupported");
  });

  it("fails closed when request throws", async () => {
    const lock = await acquireSignerLock(
      {
        request: (): never => {
          throw new Error("SecurityError");
        },
      },
      NAME,
    );
    expect(lock.state()).toBe("unsupported");
  });

  it("fails closed when request rejects before it answers", async () => {
    const lock = await acquireSignerLock(
      { request: (): Promise<never> => Promise.reject(new Error("x")) },
      NAME,
    );
    expect(lock.state()).toBe("unsupported");
  });

  it("fails closed when request settles without answering", async () => {
    const lock = await acquireSignerLock(
      { request: (): Promise<void> => Promise.resolve() },
      NAME,
    );
    expect(lock.state()).toBe("unsupported");
  });

  it("reports a lock the platform took away as lost", async () => {
    const locks = createFakeLockManager();
    const lock = await acquireSignerLock(locks, NAME);
    locks.steal(NAME);
    await flush();
    expect(lock.state()).toBe("lost");
    lock.release();
    expect(lock.state()).toBe("lost");
  });
});
