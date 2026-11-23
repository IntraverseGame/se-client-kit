// W-9 to W-14: the key is generated in the shell at the open, once the page
// holds the lock (since #220's slice S5), from the injected random source; it
// is used only while this page holds the lock; the session's end destroys it.

import { recoverAddress } from "@intraverse/se-client-signing";
import { describe, expect, it } from "vitest";

import { createFakeLockManager, flush } from "./fixtures/fake-locks.ts";
import { recordingRandom, scriptedRandom } from "./fixtures/seeded.ts";
import {
  openTestSession,
  openWorkedRound,
  SESSION_ID,
  settledForTest,
  shellCodeOf,
} from "./fixtures/session.ts";
import { domain, ROUND_ID, workedActions } from "./fixtures/vectors.ts";

// secp256k1's group order n.
const ORDER = Uint8Array.from(
  Buffer.from(
    "fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141",
    "hex",
  ),
);
const ZERO = new Uint8Array(32);
const VALID = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

const firstMove = workedActions[0];
if (firstMove === undefined) throw new TypeError("no worked action");
const pick = {
  kind: firstMove.kind,
  action: firstMove.action,
  path: firstMove.path,
};

describe("the action key (W-9, W-10)", () => {
  it("is generated at the open, once the lock is held, and only once", async () => {
    const random = recordingRandom(7);
    const session = await openTestSession({ random });
    // Drawn before any address is asked for: a delegation names it (W-9).
    expect(random.draws()).toHaveLength(1);
    const address = session.address();
    expect(session.address()).toBe(address);
    expect(random.draws()).toHaveLength(1);
  });

  it("takes 32 bytes, redrawn while zero or not below the curve order", async () => {
    const random = scriptedRandom(ZERO, ORDER, VALID);
    const session = await openTestSession({ random });
    session.address();
    expect(random.draws().map(draw => draw.length)).toEqual([32, 32, 32]);
  });

  it("refuses a random source that never yields a valid key, at the open", async () => {
    const locks = createFakeLockManager();
    let draws = 0;
    const zeros = (length: number): Uint8Array => {
      draws += 1;
      return new Uint8Array(length);
    };
    const opening = openTestSession({ locks, random: zeros });
    await expect(opening).rejects.toMatchObject({ code: "key-generation" });
    expect(draws).toBe(16);
    // The lock is released: the next page takes it.
    const next = await openTestSession({ locks });
    expect(next.state()).toBe("signing");
  });

  it("signs with the key whose address it reports", async () => {
    const session = await openTestSession();
    const action = openWorkedRound(session).sign(pick);
    expect(recoverAddress(action.digest, action.signature)).toBe(
      session.address(),
    );
  });

  it("differs per session", async () => {
    const first = await openTestSession({ random: recordingRandom(1) });
    const second = await openTestSession({ random: recordingRandom(2) });
    expect(first.address()).not.toBe(second.address());
  });

  it("exposes no member that returns the key", async () => {
    const session = await openTestSession();
    expect(Object.keys(session).toSorted()).toEqual([
      "address",
      "end",
      "openRound",
      "round",
      "state",
    ]);
  });
});

describe("the lock gates every use of the key (W-13, W-14)", () => {
  it("names the lock after the session", async () => {
    const locks = createFakeLockManager();
    await openTestSession({ locks });
    expect(locks.requested()).toEqual([`se:signer:${SESSION_ID}`]);
  });

  it("signs while it holds the lock", async () => {
    const session = await openTestSession();
    expect(session.state()).toBe("signing");
  });

  it("does not generate a key or sign in a tab without the lock", async () => {
    const locks = createFakeLockManager();
    await openTestSession({ locks });
    const random = recordingRandom(3);
    const second = await openTestSession({ locks, random });
    expect(second.state()).toBe("held-elsewhere");
    expect(shellCodeOf(() => second.address())).toBe("lock-not-held");
    expect(
      shellCodeOf(() =>
        second.openRound({
          roundId: ROUND_ID,
          round: `0x${"11".repeat(32)}`,
          initial: settledForTest(`0x${"22".repeat(32)}`),
        }),
      ),
    ).toBe("lock-not-held");
    expect(random.draws()).toHaveLength(0);
  });

  it.each([
    ["no Web Locks API", undefined],
    ["a broken one", { request: "no" }],
  ])("signs nothing with %s (fail closed)", async (_name, locks) => {
    const session = await openTestSession({ locks });
    expect(session.state()).toBe("unsupported");
    expect(shellCodeOf(() => session.address())).toBe("lock-not-held");
  });

  it("stops signing when the lock is taken away", async () => {
    const locks = createFakeLockManager();
    const session = await openTestSession({ locks });
    const round = openWorkedRound(session);
    locks.steal(`se:signer:${SESSION_ID}`);
    await flush();
    expect(session.state()).toBe("lost");
    expect(shellCodeOf(() => round.sign(pick))).toBe("lock-not-held");
  });
});

describe("the session's end (W-7, W-11)", () => {
  it("destroys the key, releases the lock, and refuses to sign", async () => {
    const locks = createFakeLockManager();
    const session = await openTestSession({ locks });
    const round = openWorkedRound(session);
    const signed = round.sign(pick);
    session.end();
    await flush();
    expect(session.state()).toBe("ended");
    expect(round.phase()).toBe("ended");
    expect(locks.isHeld(`se:signer:${SESSION_ID}`)).toBe(false);
    expect(shellCodeOf(() => session.address())).toBe("session-ended");
    expect(shellCodeOf(() => round.sign(pick))).toBe("session-ended");
    expect(round.pending()).toBe(signed);
  });

  it("lets a new session take the lock", async () => {
    const locks = createFakeLockManager();
    const first = await openTestSession({ locks });
    first.end();
    await flush();
    const second = await openTestSession({ locks });
    expect(second.state()).toBe("signing");
  });
});

describe("its inputs", () => {
  it.each(["", "with space"])("refuses the session id %j", async sessionId => {
    await expect(openTestSession({ sessionId })).rejects.toMatchObject({
      code: "invalid-input",
    });
  });

  it("refuses a domain signing cannot encode", async () => {
    await expect(
      openTestSession({ domain: { ...domain, verifyingContract: "0x12" } }),
    ).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("refuses a round id that is not a UUIDv7", async () => {
    const session = await openTestSession();
    expect(
      shellCodeOf(() =>
        session.openRound({
          roundId: "not-a-round",
          round: `0x${"11".repeat(32)}`,
          initial: settledForTest(`0x${"22".repeat(32)}`),
        }),
      ),
    ).toBe("invalid-input");
  });

  it("refuses a round or T_0 that is not 32 bytes", async () => {
    const session = await openTestSession();
    expect(
      shellCodeOf(() =>
        session.openRound({
          roundId: ROUND_ID,
          round: "0x11",
          initial: settledForTest(`0x${"22".repeat(32)}`),
        }),
      ),
    ).toBe("invalid-input");
    expect(
      shellCodeOf(() =>
        session.openRound({
          roundId: ROUND_ID,
          round: `0x${"11".repeat(32)}`,
          initial: settledForTest("0x22"),
        }),
      ),
    ).toBe("invalid-input");
  });

  it("opens one transcript state per round (W-15, W-42)", async () => {
    const session = await openTestSession();
    const round = openWorkedRound(session);
    expect(session.round(ROUND_ID)).toBe(round);
    expect(session.round("01927c5e-8b3a-7f21-9c4d-000000000001")).toBe(
      undefined,
    );
    expect(shellCodeOf(() => openWorkedRound(session))).toBe("round-exists");
  });
});
