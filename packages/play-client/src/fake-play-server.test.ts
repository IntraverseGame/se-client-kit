// The fake Play API keeps to the vendored document where the operations'
// tests rely on it: the token's form, strict request bodies, and unknown
// paths.

import { beforeEach, describe, expect, it } from "vitest";

import { actionBody, startBody } from "./fixtures/play-bodies.ts";
import {
  createServerHarness,
  type ServerHarness,
} from "./fixtures/server-harness.ts";
import { PLAY_ROUTES } from "./play-api.ts";
import type { PlayRequest } from "./transport.ts";

let h: ServerHarness;

beforeEach(() => {
  h = createServerHarness();
});

const codeOf = async (request: PlayRequest): Promise<unknown> => {
  const { error } = await h.settle(h.transport.send(request));
  return (error as { readonly problem?: { readonly code?: unknown } }).problem
    ?.code;
};

const bearer = (): string => "Bearer fixture-token";

describe("the fake Play API", () => {
  it("refuses a call without the play token, as the document's security says", async () => {
    expect(await codeOf({ ...PLAY_ROUTES.getSnapshot, retry: "never" })).toBe(
      "UNAUTHENTICATED",
    );
  });

  it("refuses a token that is not in the Bearer form", async () => {
    expect(
      await codeOf({
        ...PLAY_ROUTES.getSnapshot,
        authorization: () => "Basic fixture-token",
        retry: "never",
      }),
    ).toBe("UNAUTHENTICATED");
  });

  it("refuses a body with a field the document does not list", async () => {
    expect(
      await codeOf({
        ...PLAY_ROUTES.startRound,
        authorization: bearer,
        body: { ...startBody, extra: 1 },
        retry: "never",
      }),
    ).toBe("INVALID_ARGUMENT");
  });

  it("refuses a body without a required field", async () => {
    const { signature: _dropped, ...partial } = actionBody;
    expect(
      await codeOf({
        ...PLAY_ROUTES.cashOutRound,
        authorization: bearer,
        body: partial,
        retry: "never",
      }),
    ).toBe("INVALID_ARGUMENT");
  });

  it("refuses a body where the operation takes none", async () => {
    expect(
      await codeOf({
        ...PLAY_ROUTES.refreshPlayToken,
        authorization: bearer,
        body: {},
        retry: "never",
      }),
    ).toBe("INVALID_ARGUMENT");
  });

  it("answers a path the document does not have with NOT_FOUND", async () => {
    expect(
      await codeOf({ method: "GET", path: "/rounds", retry: "never" }),
    ).toBe("NOT_FOUND");
  });
});
