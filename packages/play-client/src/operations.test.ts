// The operations against the fake Play API built from the vendored document:
// what each one sends, and what it answers.

import { beforeEach, describe, expect, it } from "vitest";

import {
  actionBody,
  FIXTURE_LAUNCH_CODE,
  idleSnapshot,
  redeemAnswer,
  refreshAnswer,
  startBody,
  startingSnapshot,
} from "./fixtures/play-bodies.ts";
import {
  createServerHarness,
  SEALED,
  type ServerHarness,
} from "./fixtures/server-harness.ts";
import {
  BASE_URL,
  FIXTURE_TOKEN,
  SERVER_AHEAD_DATE,
  START_MS,
} from "./fixtures/session.ts";
import {
  cancelRound,
  cashOutRound,
  continueRound,
  getSnapshot,
  type PlayResult,
  redeemLaunchCode,
  refreshPlayToken,
  startRound,
} from "./operations.ts";
import { PLAY_ROUTES, type PlayOperationId } from "./play-api.ts";
import { parseDeadline } from "./token-schedule.ts";

let h: ServerHarness;

beforeEach(() => {
  h = createServerHarness();
});

const ACCEPT = "application/json, application/problem+json";
const BEARER = `Bearer ${FIXTURE_TOKEN}`;

/** A Snapshot-answering call, as the table below runs it. */
type SnapshotCall = {
  readonly id: Extract<
    PlayOperationId,
    | "startRound"
    | "continueRound"
    | "cashOutRound"
    | "cancelRound"
    | "getSnapshot"
  >;
  readonly sent: unknown;
  readonly headers: Readonly<Record<string, string>>;
  readonly call: (h: ServerHarness) => Promise<PlayResult<unknown>>;
};

const SNAPSHOT_CALLS: readonly SnapshotCall[] = [
  {
    id: "startRound",
    sent: startBody,
    headers: { "content-type": "application/json" },
    call: x => startRound(x.transport, startBody, x.auth),
  },
  {
    id: "continueRound",
    sent: actionBody,
    headers: { "content-type": "application/json" },
    call: x => continueRound(x.transport, actionBody, x.auth),
  },
  {
    id: "cashOutRound",
    sent: actionBody,
    headers: { "content-type": "application/json" },
    call: x => cashOutRound(x.transport, actionBody, x.auth),
  },
  {
    id: "cancelRound",
    sent: actionBody,
    headers: { "content-type": "application/json" },
    call: x => cancelRound(x.transport, actionBody, x.auth),
  },
  {
    id: "getSnapshot",
    sent: undefined,
    headers: {},
    call: x => getSnapshot(x.transport, x.auth),
  },
];

describe("the routes", () => {
  it("are the document's paths below the configured base", () => {
    expect(PLAY_ROUTES).toEqual({
      redeemLaunchCode: { method: "POST", path: "/sessions:redeem" },
      refreshPlayToken: { method: "POST", path: "/sessions:refresh" },
      startRound: { method: "POST", path: "/rounds:start" },
      continueRound: { method: "POST", path: "/rounds:continue" },
      cashOutRound: { method: "POST", path: "/rounds:cashOut" },
      cancelRound: { method: "POST", path: "/rounds:cancel" },
      getSnapshot: { method: "GET", path: "/snapshot" },
      listGrants: { method: "GET", path: "/grants" },
    });
  });
});

describe("redeemLaunchCode", () => {
  it("sends the launch code in the body, with no credential", async () => {
    h.server.answer("redeemLaunchCode", {
      kind: "success",
      body: redeemAnswer,
    });
    await redeemLaunchCode(
      h.transport,
      { launchCode: FIXTURE_LAUNCH_CODE },
      { seal: h.seal },
    );
    expect(h.server.served).toEqual([
      {
        operationId: "redeemLaunchCode",
        url: `${BASE_URL}/sessions:redeem`,
        method: "POST",
        headers: { accept: ACCEPT, "content-type": "application/json" },
        body: { launchCode: FIXTURE_LAUNCH_CODE },
      },
    ]);
    expect(h.server.served[0]?.url).not.toContain(FIXTURE_LAUNCH_CODE);
  });

  it("answers the session, the sealed token, both deadlines, and the game origin", async () => {
    h.server.answer("redeemLaunchCode", {
      kind: "success",
      body: redeemAnswer,
      date: SERVER_AHEAD_DATE,
    });
    const result = await redeemLaunchCode(
      h.transport,
      { launchCode: FIXTURE_LAUNCH_CODE },
      { seal: h.seal },
    );
    expect(result).toEqual({
      body: { ...redeemAnswer, playToken: SEALED },
      receivedAtMs: START_MS,
      clockOffsetMs: 90_000,
    });
    expect(parseDeadline(result.body.tokenExpiresAt)).toBeDefined();
  });

  it.each([
    ["one character", "x"],
    ["267 characters", `https://${"a".repeat(259)}`],
    // JSON Schema counts code points: 267 of them, 534 UTF-16 code units.
    ["267 code points outside the BMP", "\u{1F3B2}".repeat(267)],
  ])(
    "accepts a gameOrigin of %s, as the document bounds it",
    async (_name, gameOrigin) => {
      h.server.answer("redeemLaunchCode", {
        kind: "success",
        body: { ...redeemAnswer, gameOrigin },
      });
      const { body } = await redeemLaunchCode(
        h.transport,
        { launchCode: FIXTURE_LAUNCH_CODE },
        { seal: h.seal },
      );
      expect(body.gameOrigin).toBe(gameOrigin);
    },
  );

  it("drops a field the document does not list", async () => {
    h.server.answer("redeemLaunchCode", {
      kind: "success",
      body: { ...redeemAnswer, extra: "x" } as typeof redeemAnswer,
    });
    const { body } = await redeemLaunchCode(
      h.transport,
      { launchCode: FIXTURE_LAUNCH_CODE },
      { seal: h.seal },
    );
    expect(body).toEqual({ ...redeemAnswer, playToken: SEALED });
    expect(Object.isFrozen(body)).toBe(true);
  });
});

describe("refreshPlayToken", () => {
  it("presents the token and sends no body", async () => {
    h.server.answer("refreshPlayToken", {
      kind: "success",
      body: refreshAnswer,
    });
    const result = await refreshPlayToken(h.transport, {
      ...h.auth,
      seal: h.seal,
      notAfterMs: START_MS + 60_000,
    });
    expect(h.server.served).toEqual([
      {
        operationId: "refreshPlayToken",
        url: `${BASE_URL}/sessions:refresh`,
        method: "POST",
        headers: { accept: ACCEPT, authorization: BEARER },
        body: undefined,
      },
    ]);
    expect(result.body).toEqual({ ...refreshAnswer, playToken: SEALED });
  });
});

describe.each(SNAPSHOT_CALLS)("$id", ({ id, sent, headers, call }) => {
  it("presents the token and sends its body as JSON", async () => {
    h.server.answer(id, { kind: "success", body: startingSnapshot });
    await call(h);
    expect(h.server.served).toEqual([
      {
        operationId: id,
        url: `${BASE_URL}${PLAY_ROUTES[id].path}`,
        method: PLAY_ROUTES[id].method,
        headers: { accept: ACCEPT, authorization: BEARER, ...headers },
        body: sent,
      },
    ]);
  });

  it("answers the Snapshot unread, as unknown", async () => {
    h.server.answer(id, { kind: "success", body: idleSnapshot });
    const result = await call(h);
    expect(result.body).toEqual(idleSnapshot);
    expect(result.receivedAtMs).toBe(START_MS);
  });

  it("never puts the token in its URL", async () => {
    h.server.answer(id, { kind: "success", body: idleSnapshot });
    await call(h);
    expect(h.server.served.map(s => s.url).join(" ")).not.toContain(
      FIXTURE_TOKEN,
    );
  });
});
