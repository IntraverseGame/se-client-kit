// T-7a (W-4, W-41): a log line carries the method, path, status, `requestId`,
// and a code, never a header, a body, a secret, or free text.

import { describe, expect, it } from "vitest";

import { ShellError } from "./errors.ts";
import { createLogger, type LogFields, type LogRecord } from "./logger.ts";
import { REDACTED, sealSecret } from "./redaction.ts";

const TOKEN_TEXT = "fixture-play-token-6f1c2a";

const capture = (): {
  readonly records: LogRecord[];
  readonly sink: (record: LogRecord) => void;
} => {
  const records: LogRecord[] = [];
  return {
    records,
    sink: (record: LogRecord): void => {
      records.push(record);
    },
  };
};

const logOne = (event: string, fields?: unknown): LogRecord => {
  const { records, sink } = capture();
  createLogger(sink).warn(event, fields as LogFields);
  const [record] = records;
  if (record === undefined) throw new Error("no record");
  return record;
};

describe("createLogger", () => {
  it("passes the request fields through", () => {
    const { records, sink } = capture();
    const logger = createLogger(sink);
    logger.warn("play.request-failed", {
      method: "POST",
      path: "/rounds/start",
      status: 503,
      requestId: "req_01J9ZK3M7Q",
      code: "UNAVAILABLE",
    });
    logger.error("play.request-failed", { status: 500 });
    expect(records).toEqual([
      {
        level: "warn",
        event: "play.request-failed",
        method: "POST",
        path: "/rounds/start",
        status: 503,
        requestId: "req_01J9ZK3M7Q",
        code: "UNAVAILABLE",
      },
      { level: "error", event: "play.request-failed", status: 500 },
    ]);
    expect(Object.isFrozen(records[0])).toBe(true);
  });

  it("keeps only the closed set of fields: no header, body, or document", () => {
    const record = logOne("play.request-failed", {
      code: "UNAVAILABLE",
      headers: { authorization: `Bearer ${TOKEN_TEXT}` },
      body: { token: TOKEN_TEXT },
      snapshot: { status: "active" },
      detail: TOKEN_TEXT,
    });
    expect(record).toEqual({
      level: "warn",
      event: "play.request-failed",
      code: "UNAVAILABLE",
    });
  });

  it("prints a sealed secret given as any field as [redacted]", () => {
    const secret = sealSecret("play-token", TOKEN_TEXT);
    const record = logOne("session.refresh", {
      method: secret,
      path: secret,
      status: secret,
      requestId: secret,
      code: secret,
    });
    expect(record).toEqual({
      level: "warn",
      event: "session.refresh",
      method: REDACTED,
      path: REDACTED,
      status: REDACTED,
      requestId: REDACTED,
      code: REDACTED,
    });
  });

  it.each([
    ["a path with a query string", { path: `/session?token=${TOKEN_TEXT}` }],
    ["a path with a fragment", { path: `/launch#${TOKEN_TEXT}` }],
    ["a relative path", { path: "session" }],
    ["a lowercase method", { method: "post" }],
    ["a requestId with spaces", { requestId: `Bearer ${TOKEN_TEXT}` }],
    ["a code with a slash", { code: "a/b" }],
    ["a non-integer status", { status: 200.5 }],
    ["a status out of range", { status: 42 }],
  ])("redacts %s", (_name, fields) => {
    const record = logOne("play.request-failed", fields);
    const [[, value] = []] = Object.entries(fields);
    expect(JSON.stringify(record)).not.toContain(String(value));
    expect(JSON.stringify(record)).toContain(REDACTED);
  });

  it("redacts an event that is not a fixed name", () => {
    expect(logOne(`token ${TOKEN_TEXT}`).event).toBe(REDACTED);
  });

  it("reduces a cause to its name and code", () => {
    const cause = new ShellError("lock-not-held");
    expect(logOne("session.sign-refused", { cause })).toEqual({
      level: "warn",
      event: "session.sign-refused",
      causeName: "ShellError",
      causeCode: "lock-not-held",
    });
  });

  it("drops a cause's message, whatever it holds", () => {
    const record = logOne("session.failed", {
      cause: new Error(`failed with ${TOKEN_TEXT}`),
    });
    expect(record).toEqual({
      level: "warn",
      event: "session.failed",
      causeName: "Error",
    });
  });

  it("survives a hostile cause or fields object", () => {
    const hostile = new Proxy(
      {},
      {
        get: (): never => {
          throw new Error(TOKEN_TEXT);
        },
      },
    );
    expect(logOne("session.failed", { cause: hostile })).toEqual({
      level: "warn",
      event: "session.failed",
      causeName: REDACTED,
    });
    expect(logOne("session.failed", hostile)).toEqual({
      level: "warn",
      event: "session.failed",
    });
  });

  it("ignores a sink that throws", () => {
    const logger = createLogger(() => {
      throw new Error("sink failed");
    });
    expect(() => {
      logger.error("session.failed");
    }).not.toThrow();
  });

  it("has no level below warn", () => {
    expect(Object.keys(createLogger(() => {})).toSorted()).toEqual([
      "error",
      "warn",
    ]);
  });
});
