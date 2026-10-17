// Boot (specs/wrapper.md, Configuration): the document is fetched once, with no
// credentials and no cache; an invalid one refuses the start (the
// configuration-error state) with each issue's code logged and no value; the
// boot rules refuse production with a quorum of 1 and a source short of the
// quorum, and accept their counterparts; a document that cannot be reached is
// read again at the slow rate and when the browser comes back online.

import { createLogger, type LogRecord } from "@intraverse/se-client-shell";
import { describe, expect, it } from "vitest";

import { boot, type BootResult } from "./boot.ts";
import {
  endpoints,
  environmentDocument,
  localDocument,
  SOURCE,
} from "./fixtures/environment.ts";
import { flush } from "./fixtures/flush.ts";
import { manualTimers } from "./fixtures/manual-timers.ts";
import {
  type ConfigFetch,
  ENVIRONMENT_CONFIG_PATH,
  loadEnvironmentConfig,
} from "./load-environment-config.ts";
import { messagesFor } from "./messages.ts";

const m = messagesFor("en").messages;
const URL_OF_DOCUMENT = "https://se.example/wrapper/environment-config.json";

type Answer = { readonly status: number; readonly body: unknown } | "network";

const scriptedFetch = (answers: Answer[]) => {
  const calls: { url: string; init: Parameters<ConfigFetch>[1] }[] = [];
  const fetch: ConfigFetch = (url, init) => {
    calls.push({ url, init });
    const answer = answers.length > 1 ? answers.shift() : answers[0];
    if (answer === undefined || answer === "network") {
      return Promise.reject(new TypeError("Failed to fetch"));
    }
    return Promise.resolve({
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: () =>
        typeof answer.body === "string"
          ? Promise.reject(new SyntaxError("not JSON"))
          : Promise.resolve(answer.body),
    });
  };
  return { fetch, calls };
};

const booted = (answers: Answer[], online = true) => {
  document.body.replaceChildren();
  const host = document.createElement("div");
  document.body.append(host);
  const timers = manualTimers();
  const records: LogRecord[] = [];
  const listeners = new Set<() => void>();
  let isOnline = online;
  const { fetch, calls } = scriptedFetch(answers);
  const result = boot({
    doc: document,
    host,
    timers,
    fetch,
    configUrl: URL_OF_DOCUMENT,
    logger: createLogger(record => records.push(record)),
    connectivity: {
      onLine: () => isOnline,
      subscribe: listener => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  });
  return {
    host,
    timers,
    records,
    calls,
    result,
    goOnline: () => {
      isOnline = true;
      for (const listener of listeners) listener();
    },
  };
};

const ok = (body: unknown): Answer => ({ status: 200, body });

const heading = (host: HTMLElement): string =>
  host.querySelector("h1, h2")?.textContent ?? "";

const kindOf = async (result: Promise<BootResult>): Promise<string> =>
  (await result).kind;

describe("boot", () => {
  it("shows loading until the document is read", () => {
    const b = booted([ok(environmentDocument())]);
    expect(heading(b.host)).toBe(m["status.loading"]);
  });

  it("fetches the document without credentials or cache", async () => {
    const b = booted([ok(environmentDocument())]);
    await b.result;
    expect(b.calls).toHaveLength(1);
    expect(b.calls[0]?.url).toBe(URL_OF_DOCUMENT);
    expect(b.calls[0]?.init).toMatchObject({
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
    });
  });

  it("reads the document relative to the page by default (provisional)", () => {
    expect(ENVIRONMENT_CONFIG_PATH).toBe("./environment-config.json");
  });

  it("configures the Wrapper on a valid document", async () => {
    const b = booted([ok(environmentDocument())]);
    const result = await b.result;
    expect(result.kind).toBe("configured");
    expect(b.records).toEqual([]);
    expect(b.host.textContent).not.toContain(m["state.configuration"]);
  });

  it("refuses production with minRpcQuorum 1 (W-26a)", async () => {
    const b = booted([
      ok(
        environmentDocument({
          minRpcQuorum: 1,
          rpcEndpoints: { [SOURCE]: endpoints(1) },
        }),
      ),
    ]);
    expect(await kindOf(b.result)).toBe("refused");
    expect(heading(b.host)).toBe(m["state.configuration"]);
    expect(b.records.map(record => record.code)).toEqual(["production-quorum"]);
  });

  it.each(["local", "preview"])(
    "starts %s with minRpcQuorum 1 and the degraded indicator",
    async environment => {
      const b = booted([ok(localDocument({ environment }))]);
      expect(await kindOf(b.result)).toBe("configured");
      expect(b.host.textContent).toContain(m["notice.chainNotIndependent"]);
    },
  );

  it("refuses a source with fewer endpoints than minRpcQuorum (W-26b)", async () => {
    const b = booted([
      ok(
        environmentDocument({
          minRpcQuorum: 3,
          rpcEndpoints: { [SOURCE]: endpoints(2) },
        }),
      ),
    ]);
    expect(await kindOf(b.result)).toBe("refused");
    expect(b.records.map(record => record.code)).toEqual([
      "quorum-unreachable",
    ]);
  });

  it("starts with a source that has exactly minRpcQuorum endpoints", async () => {
    const b = booted([
      ok(
        environmentDocument({
          minRpcQuorum: 3,
          rpcEndpoints: { [SOURCE]: endpoints(3) },
        }),
      ),
    ]);
    expect(await kindOf(b.result)).toBe("configured");
  });

  it("logs issue codes only, never a value of the document", async () => {
    const b = booted([
      ok(environmentDocument({ verifyBaseUrl: "javascript:alert(1)" })),
    ]);
    await b.result;
    expect(b.records).toEqual([
      { level: "warn", event: "config.refused", code: "invalid-verify-base" },
    ]);
  });

  it.each<[string, Answer]>([
    ["an error status", { status: 404, body: {} }],
    ["a body that is not JSON", { status: 200, body: "<html>" }],
  ])("refuses to start on %s", async (_, answer) => {
    const b = booted([answer]);
    expect(await kindOf(b.result)).toBe("refused");
    expect(heading(b.host)).toBe(m["state.configuration"]);
    expect(b.records[0]?.event).toBe("config.unreadable");
  });

  it("shows the connection problem and reads again at the slow rate", async () => {
    const b = booted(["network", "network", ok(environmentDocument())]);
    await flush();
    expect(b.host.textContent).toContain(m["state.connection"]);
    expect(b.calls).toHaveLength(1);
    b.timers.advance(2_000);
    await flush();
    expect(b.calls).toHaveLength(2);
    b.timers.advance(2_000);
    expect(await kindOf(b.result)).toBe("configured");
    expect(b.host.textContent).not.toContain(m["state.connection"]);
  });

  it("reads again at once when the browser comes back online", async () => {
    const b = booted(["network", ok(environmentDocument())], false);
    await flush();
    b.goOnline();
    expect(await kindOf(b.result)).toBe("configured");
    expect(b.calls).toHaveLength(2);
  });
});

describe("loadEnvironmentConfig", () => {
  it("times out a request with no answer (W-43)", async () => {
    const timers = manualTimers();
    const pending = loadEnvironmentConfig({
      url: URL_OF_DOCUMENT,
      timers,
      timeoutMs: 15_000,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    });
    timers.advance(15_000);
    expect(await pending).toEqual({ kind: "network" });
    expect(timers.pendingDelays()).toEqual([]);
  });
});
