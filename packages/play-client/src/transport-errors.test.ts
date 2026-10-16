import { beforeEach, describe, expect, it } from "vitest";

import { json } from "./fixtures/fake-play-api.ts";
import {
  authorized,
  createHarness,
  shownForms,
  statusOf,
  type Harness,
} from "./fixtures/harness.ts";
import { problems } from "./fixtures/problems.ts";
import { BASE_URL, FIXTURE_TOKEN } from "./fixtures/session.ts";
import { NetworkError } from "./network-error.ts";
import { ProblemError } from "./problem-error.ts";
import { ProtocolError } from "./protocol-error.ts";
import { DEFAULT_REQUEST_TIMEOUT_MS } from "./transport.ts";

let h: Harness;

beforeEach(() => {
  h = createHarness();
});

describe("problems (W-42)", () => {
  it.each(Object.entries(problems))(
    "maps the %s problem",
    async (_name, body) => {
      h.api.reply(json(statusOf(body), body));
      const { error } = await h.settle(
        h.transport.send(
          authorized({ method: "POST", path: "/x", retry: "never" }),
        ),
      );
      expect(error).toBeInstanceOf(ProblemError);
      expect(error).toMatchObject({
        method: "POST",
        path: "/x",
        problem: {
          status: body.status,
          code: body.code,
          retryable: body.retryable,
          requestId: body.requestId,
        },
        body,
      });
    },
  );

  it.each(Object.entries(problems))(
    "keeps the token and the server's message out of the %s error",
    async (_name, body) => {
      h.api.reply(json(statusOf(body), body));
      const { error } = await h.settle(
        h.transport.send(
          authorized({ method: "POST", path: "/x", retry: "never" }),
        ),
      );
      for (const shown of shownForms(error)) {
        expect(shown).not.toContain(FIXTURE_TOKEN);
        expect(shown).not.toContain(String(body.detail));
      }
    },
  );

  it("leaves the body out of the JSON form", async () => {
    const body = {
      ...problems["unavailable"],
      snapshot: { schema: "se.snapshot/1" },
    };
    h.api.reply(json(503, body));
    const { error } = await h.settle(
      h.transport.send({ method: "GET", path: "/x", retry: "never" }),
    );
    expect(JSON.stringify(error)).not.toContain("se.snapshot/1");
    expect((error as ProblemError).body).toEqual(body);
  });

  it("rejects an error status without a problem body with a ProtocolError", async () => {
    h.api.reply({ kind: "response", status: 502, body: "Bad gateway" });
    const { error } = await h.settle(
      h.transport.send(
        authorized({ method: "GET", path: "/x", retry: "never" }),
      ),
    );
    expect(error).toBeInstanceOf(ProtocolError);
    expect(error).toMatchObject({ status: 502 });
    for (const shown of shownForms(error)) {
      expect(shown).not.toContain(FIXTURE_TOKEN);
    }
  });
});

describe("network failure and timeout (W-43)", () => {
  it("maps a fetch rejection to a NetworkError that carries no URL or token", async () => {
    h.api.reply({ kind: "network-failure" });
    const { error } = await h.settle(
      h.transport.send(
        authorized({ method: "GET", path: "/snapshot", retry: "never" }),
      ),
    );
    expect(error).toBeInstanceOf(NetworkError);
    expect(error).toMatchObject({
      reason: "network",
      method: "GET",
      path: "/snapshot",
    });
    for (const shown of shownForms(error)) {
      expect(shown).not.toContain(FIXTURE_TOKEN);
      expect(shown).not.toContain(BASE_URL);
    }
  });

  it("times out after the configured timeout and aborts the request", async () => {
    h.api.reply({ kind: "hang" });
    const state = { settled: false };
    const pending = h.transport.send(
      authorized({ method: "GET", path: "/snapshot", retry: "never" }),
    );
    const mark = (): boolean => (state.settled = true);
    pending.then(mark, mark);
    await h.clock.advance(DEFAULT_REQUEST_TIMEOUT_MS - 1);
    expect(state.settled).toBe(false);
    const { error } = await h.settle(pending, 1);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error).toMatchObject({ reason: "timeout" });
    expect(h.aborts()).toBe(1);
    for (const shown of shownForms(error)) {
      expect(shown).not.toContain(FIXTURE_TOKEN);
    }
  });

  it("clears the timer when the response arrives", async () => {
    h.api.reply(json(200, {}));
    await h.transport.send({
      method: "GET",
      path: "/snapshot",
      retry: "never",
    });
    expect(h.clock.pending()).toBe(0);
    expect(h.aborts()).toBe(0);
  });
});
