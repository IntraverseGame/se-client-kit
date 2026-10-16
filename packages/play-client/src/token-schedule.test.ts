import { describe, expect, it } from "vitest";

import { START_MS, longToken, shortToken } from "./fixtures/session.ts";
import {
  DEFAULT_REFRESH_CONFIG,
  isExpired,
  localDeadlineMs,
  parseDeadline,
  refreshAtMs,
  type TokenDeadline,
} from "./token-schedule.ts";

const deadlineOf = (
  token: { readonly tokenExpiresAt: string },
  clockOffsetMs = 0,
): TokenDeadline => {
  const expiresAtMs = parseDeadline(token.tokenExpiresAt);
  if (expiresAtMs === undefined) {
    throw new Error("bad fixture");
  }
  return { expiresAtMs, receivedAtMs: START_MS, clockOffsetMs };
};

describe("the refresh point (W-5, W-6)", () => {
  it("is at the fraction of a long lifetime, read from the response", () => {
    const deadline = deadlineOf(longToken);
    const lifetime = deadline.expiresAtMs - START_MS;
    expect(lifetime * DEFAULT_REFRESH_CONFIG.fraction).toBeGreaterThan(
      DEFAULT_REFRESH_CONFIG.marginMs,
    );
    expect(refreshAtMs(deadline)).toBe(
      Math.floor(
        deadline.expiresAtMs - lifetime * DEFAULT_REFRESH_CONFIG.fraction,
      ),
    );
  });

  it("is at the margin when the fraction of a short lifetime is smaller", () => {
    const deadline = deadlineOf(shortToken);
    const lifetime = deadline.expiresAtMs - START_MS;
    expect(lifetime * DEFAULT_REFRESH_CONFIG.fraction).toBeLessThan(
      DEFAULT_REFRESH_CONFIG.marginMs,
    );
    expect(refreshAtMs(deadline)).toBe(
      deadline.expiresAtMs - DEFAULT_REFRESH_CONFIG.marginMs,
    );
  });

  it("follows the configured fraction and margin", () => {
    const deadline = deadlineOf(longToken);
    const lifetime = deadline.expiresAtMs - START_MS;
    expect(refreshAtMs(deadline, { fraction: 0.5, marginMs: 0 })).toBe(
      deadline.expiresAtMs - lifetime / 2,
    );
    expect(
      refreshAtMs(deadline, { fraction: 0.01, marginMs: lifetime / 4 }),
    ).toBe(deadline.expiresAtMs - lifetime / 4);
  });

  it("is corrected by the clock offset", () => {
    const behind = deadlineOf(longToken, -30_000);
    const ahead = deadlineOf(longToken, 30_000);
    expect(localDeadlineMs(behind)).toBe(behind.expiresAtMs + 30_000);
    expect(localDeadlineMs(ahead)).toBe(ahead.expiresAtMs - 30_000);
    expect(refreshAtMs(ahead)).toBeLessThan(refreshAtMs(deadlineOf(longToken)));
    expect(refreshAtMs(behind)).toBeGreaterThan(
      refreshAtMs(deadlineOf(longToken)),
    );
  });

  it("is now when the token is already due", () => {
    const deadline: TokenDeadline = {
      expiresAtMs: START_MS - 1,
      receivedAtMs: START_MS,
      clockOffsetMs: 0,
    };
    expect(refreshAtMs(deadline)).toBe(START_MS);
  });

  it("refuses a fraction outside (0, 1) or a negative margin", () => {
    const deadline = deadlineOf(longToken);
    expect(() => refreshAtMs(deadline, { fraction: 0, marginMs: 0 })).toThrow(
      RangeError,
    );
    expect(() => refreshAtMs(deadline, { fraction: 1, marginMs: 0 })).toThrow(
      RangeError,
    );
    expect(() =>
      refreshAtMs(deadline, { fraction: 0.5, marginMs: -1 }),
    ).toThrow(RangeError);
  });
});

describe("expiry (W-7)", () => {
  it("is reached at the local deadline", () => {
    const deadline = deadlineOf(shortToken, 10_000);
    expect(isExpired(deadline, localDeadlineMs(deadline) - 1)).toBe(false);
    expect(isExpired(deadline, localDeadlineMs(deadline))).toBe(true);
  });
});

describe("parseDeadline", () => {
  it("reads an RFC 3339 timestamp and refuses anything else", () => {
    expect(parseDeadline(longToken.tokenExpiresAt)).toBe(
      Date.parse(longToken.tokenExpiresAt),
    );
    expect(parseDeadline("2026-10-16T14:15:00+02:00")).toBe(
      Date.parse(longToken.tokenExpiresAt),
    );
    for (const value of [
      undefined,
      null,
      1_760_000_000_000,
      "",
      "tomorrow",
      "Fri, 16 Oct 2026 12:00:00 GMT",
      "2026-13-45T99:00:00Z",
      "2026-10-16T12:00:00",
      "2026-10-16T12:00Z",
      "2026-10-16T12:00:00+0200",
    ]) {
      expect(parseDeadline(value)).toBeUndefined();
    }
  });
});
