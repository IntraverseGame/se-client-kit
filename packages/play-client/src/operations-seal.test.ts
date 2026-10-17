// The token answers are sealed (W-3, W-4): the redeem and the refresh hand the
// new play token to the caller's seal at once and return only what the seal
// made, so the plain token never leaves play-client. Typed and at run time.

import { beforeEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  FIXTURE_LAUNCH_CODE,
  FIXTURE_NEW_TOKEN,
  redeemAnswer,
  refreshAnswer,
} from "./fixtures/play-bodies.ts";
import {
  createServerHarness,
  SEALED,
  type ServerHarness,
  type TestSealed,
} from "./fixtures/server-harness.ts";
import { FIXTURE_TOKEN, START_MS } from "./fixtures/session.ts";
import {
  type PlayResult,
  redeemLaunchCode,
  refreshPlayToken,
  type Sealed,
} from "./operations.ts";
import type {
  RedeemLaunchCodeResponse,
  RefreshPlayTokenResponse,
} from "./play-api.ts";
import { DEFAULT_RETRY_CONFIG } from "./retry.ts";

let h: ServerHarness;

beforeEach(() => {
  h = createServerHarness();
});

/** The keys of `T` whose value is a plain string. */
type StringKeys<T> = {
  [K in keyof T]-?: T[K] extends string ? K : never;
}[keyof T];

const redeem = (): Promise<
  PlayResult<Sealed<RedeemLaunchCodeResponse, TestSealed>>
> => {
  h.server.answer("redeemLaunchCode", { kind: "success", body: redeemAnswer });
  return redeemLaunchCode(
    h.transport,
    { launchCode: FIXTURE_LAUNCH_CODE },
    { seal: h.seal },
  );
};

const refresh = (): Promise<
  PlayResult<Sealed<RefreshPlayTokenResponse, TestSealed>>
> => {
  h.server.answer("refreshPlayToken", { kind: "success", body: refreshAnswer });
  return refreshPlayToken(h.transport, {
    ...h.auth,
    seal: h.seal,
    notAfterMs: START_MS + 60_000,
  });
};

describe("the sealed token answers", () => {
  it("hand the redeem's token to the seal, once", async () => {
    await redeem();
    expect(h.sealedTokens()).toEqual([FIXTURE_TOKEN]);
  });

  it("hand the refresh's new token to the seal, once", async () => {
    await refresh();
    expect(h.sealedTokens()).toEqual([FIXTURE_NEW_TOKEN]);
  });

  it("hold no token in a redeem result, printed as JSON", async () => {
    const result = await redeem();
    expect(JSON.stringify(result)).not.toContain(FIXTURE_TOKEN);
    expect(String(Object.values(result.body))).not.toContain(FIXTURE_TOKEN);
  });

  it("hold no token in a refresh result, printed as JSON", async () => {
    const result = await refresh();
    expect(JSON.stringify(result)).not.toContain(FIXTURE_NEW_TOKEN);
  });

  it("type the token as the sealed value, with no plain string field for it", () => {
    type Redeemed = Sealed<RedeemLaunchCodeResponse, TestSealed>;
    type Refreshed = Sealed<RefreshPlayTokenResponse, TestSealed>;
    expectTypeOf<Redeemed["playToken"]>().toEqualTypeOf<TestSealed>();
    expectTypeOf<Refreshed["playToken"]>().toEqualTypeOf<TestSealed>();
    expectTypeOf<StringKeys<Redeemed>>().toEqualTypeOf<
      "sessionId" | "tokenExpiresAt" | "sessionExpiresAt" | "gameOrigin"
    >();
    expectTypeOf<StringKeys<Refreshed>>().toEqualTypeOf<"tokenExpiresAt">();
  });

  it("never call the seal for an answer that does not match the document", async () => {
    h.server.answer("redeemLaunchCode", {
      kind: "success",
      body: { ...redeemAnswer, sessionId: "ses_X" },
    });
    const { error } = await h.settle(
      redeemLaunchCode(
        h.transport,
        { launchCode: FIXTURE_LAUNCH_CODE },
        { seal: h.seal },
      ),
    );
    expect(error).toBeDefined();
    expect(h.sealedTokens()).toEqual([]);
  });

  it("never call the seal for a refresh answer that does not match the document", async () => {
    h.server.answer("refreshPlayToken", {
      kind: "success",
      body: { ...refreshAnswer, playToken: "" },
    });
    const { error } = await h.settle(
      refreshPlayToken(h.transport, {
        ...h.auth,
        seal: h.seal,
        notAfterMs: START_MS + 60_000,
      }),
    );
    expect(error).toBeDefined();
    expect(h.sealedTokens()).toEqual([]);
  });

  it("call the seal once for a refresh resent after a lost response", async () => {
    h.server.answer(
      "refreshPlayToken",
      { kind: "network-failure" },
      { kind: "success", body: refreshAnswer },
    );
    const { value } = await h.settle(
      refreshPlayToken(h.transport, {
        ...h.auth,
        seal: h.seal,
        notAfterMs: START_MS + 60_000,
      }),
      DEFAULT_RETRY_CONFIG.initialDelayMs,
    );
    expect(h.server.served).toHaveLength(2);
    expect(value?.body.playToken).toBe(SEALED);
    expect(h.sealedTokens()).toEqual([FIXTURE_NEW_TOKEN]);
  });
});
