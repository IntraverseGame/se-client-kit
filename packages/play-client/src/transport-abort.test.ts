import { beforeEach, describe, expect, it } from "vitest";

import { createCancel } from "./fixtures/cancel.ts";
import { json } from "./fixtures/fake-play-api.ts";
import { createHarness, type Harness } from "./fixtures/harness.ts";
import { FIXTURE_TOKEN } from "./fixtures/session.ts";
import { NetworkError } from "./network-error.ts";
import type { CancelSignal } from "./platform.ts";
import { DEFAULT_RETRY_CONFIG } from "./retry.ts";
import { bearerAuthorization, type PlayRequest } from "./transport.ts";

let h: Harness;
let reads: number;

beforeEach(() => {
  h = createHarness();
  reads = 0;
});

const request = (signal: CancelSignal): PlayRequest => ({
  method: "GET",
  path: "/snapshot",
  retry: "idempotent",
  signal,
  authorization: () => {
    reads += 1;
    return bearerAuthorization(FIXTURE_TOKEN);
  },
});

describe("the caller's signal", () => {
  it("aborts the in-flight fetch and rejects with an aborted NetworkError", async () => {
    const cancel = createCancel();
    h.api.reply({ kind: "hang" }, json(200, {}));
    const pending = h.settle(h.transport.send(request(cancel.signal)));
    cancel.abort();
    const { error } = await pending;
    expect(error).toBeInstanceOf(NetworkError);
    expect(error).toMatchObject({ reason: "aborted" });
    expect(h.aborts()).toBe(1);
    expect(h.clock.pending()).toBe(0);
    await h.clock.advance(DEFAULT_RETRY_CONFIG.maxDelayMs * 10);
    expect(h.api.requests).toHaveLength(1);
  });

  it("clears the backoff wait and sends nothing more", async () => {
    const cancel = createCancel();
    h.api.reply({ kind: "network-failure" }, json(200, {}));
    const pending = h.transport.send(request(cancel.signal));
    await h.clock.advance(DEFAULT_RETRY_CONFIG.initialDelayMs - 1);
    expect(h.api.requests).toHaveLength(1);
    expect(h.clock.pending()).toBe(1);
    cancel.abort();
    const { error } = await h.settle(pending, DEFAULT_RETRY_CONFIG.maxDelayMs);
    expect(error).toMatchObject({ reason: "aborted" });
    expect(h.clock.pending()).toBe(0);
    expect(h.api.requests).toHaveLength(1);
    expect(reads).toBe(1);
  });

  it("sends nothing when it is already aborted", async () => {
    const cancel = createCancel();
    cancel.abort();
    h.api.reply(json(200, {}));
    const { error } = await h.settle(h.transport.send(request(cancel.signal)));
    expect(error).toMatchObject({ reason: "aborted" });
    expect(h.api.requests).toHaveLength(0);
    expect(reads).toBe(0);
  });
});
