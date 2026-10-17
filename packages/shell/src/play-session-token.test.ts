// W-14 and W-3: a tab that does not get the signer lock forgets the play
// token it redeemed (another tab holds the lock, or the browser has no Web
// Locks API), and an open session keeps it until the end. The sealing is
// observed through the real `redaction.ts`: the module is wrapped only to keep
// the play tokens the redeem seals, so the test can ask whether each is still
// live. Scripted Play API, manual clock, fake locks.

import { describe, expect, it, vi } from "vitest";

import { createFakeLockManager } from "./fixtures/fake-locks.ts";
import { open } from "./fixtures/play-session.ts";
import type * as Redaction from "./redaction.ts";
import { revealSecret, type Secret, type SecretKind } from "./redaction.ts";

const sealedTokens = vi.hoisted((): unknown[] => []);

vi.mock(import("./redaction.ts"), async importOriginal => {
  const actual: typeof Redaction = await importOriginal();
  return {
    ...actual,
    sealSecret: <K extends SecretKind>(kind: K, value: string): Secret<K> => {
      const secret = actual.sealSecret(kind, value);
      if (kind === "play-token") sealedTokens.push(secret);
      return secret;
    },
  };
});

/** Whether the play token the last redeem sealed can still be read. */
const tokenLive = (): boolean => {
  const token = sealedTokens.at(-1) as Secret<"play-token"> | undefined;
  if (token === undefined) throw new TypeError("fixture: no token sealed");
  try {
    revealSecret(token);
    return true;
  } catch {
    return false;
  }
};

describe("the play token without the signer lock (W-14)", () => {
  it("is forgotten when another tab holds the lock", async () => {
    const locks = createFakeLockManager();
    const first = await open({ locks });
    expect(first.opening.kind).toBe("open");
    expect(tokenLive()).toBe(true);
    const second = await open({ locks });
    expect(second.opening.kind).toBe("other-tab");
    expect(tokenLive()).toBe(false);
  });

  it("is forgotten when the browser has no Web Locks API", async () => {
    const opened = await open({ locks: undefined });
    expect(opened.opening.kind).toBe("unsupported");
    expect(tokenLive()).toBe(false);
  });
});
