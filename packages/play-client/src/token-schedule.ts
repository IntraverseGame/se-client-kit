// The play token's refresh schedule (W-5 to W-7). The deadline always comes
// from the response (`tokenExpiresAt`), never from a constant; the fraction and
// the margin are the Wrapper's configuration. The functions here only compute
// times and order calls: they never see the token.

/**
 * The offset of the server's clock from the local one, measured from the HTTP
 * `Date` header of a response (W-6): `server time = local time + offset`. The
 * header has one-second resolution, so the offset is exact to about a second.
 * Returns `undefined` when the header is absent or not a valid HTTP date.
 *
 * `receivedAtMs` is the local clock when the response arrived.
 */
export const clockOffsetMs = (
  dateHeader: string | null | undefined,
  receivedAtMs: number,
): number | undefined => {
  if (
    dateHeader === null ||
    dateHeader === undefined ||
    dateHeader.trim() === ""
  ) {
    return undefined;
  }
  const serverMs = Date.parse(dateHeader);
  return Number.isFinite(serverMs) ? serverMs - receivedAtMs : undefined;
};

/**
 * Wraps an async task so that at most one run is in flight: a call while a run
 * is pending gets that run's promise (W-6: at most one refresh in flight). The
 * next call after it settles starts a new run.
 */
export const singleFlight = <T>(task: () => Promise<T>): (() => Promise<T>) => {
  let pending: Promise<T> | undefined;
  return () => {
    if (pending === undefined) {
      const run = task();
      pending = run;
      const clear = (): void => {
        if (pending === run) {
          pending = undefined;
        }
      };
      run.then(clear, clear);
    }
    return pending;
  };
};

/** Default fraction of the token's lifetime at which it is refreshed (W-6). */
export const DEFAULT_REFRESH_FRACTION: number = 1 / 3;

/** Default minimum time before the deadline at which it is refreshed (W-6). */
export const DEFAULT_REFRESH_MARGIN_MS = 60_000;

export type RefreshConfig = {
  /** Refresh when the remaining time falls to this fraction of the lifetime. */
  readonly fraction: number;
  /** Refresh at least this long before the deadline. */
  readonly marginMs: number;
};

export const DEFAULT_REFRESH_CONFIG: RefreshConfig = {
  fraction: DEFAULT_REFRESH_FRACTION,
  marginMs: DEFAULT_REFRESH_MARGIN_MS,
};

/** A token deadline, in the server's clock, with the local receive time. */
export type TokenDeadline = {
  /** `tokenExpiresAt`, in milliseconds since the epoch, server clock. */
  readonly expiresAtMs: number;
  /** The local clock when the response that carried it arrived. */
  readonly receivedAtMs: number;
  /** `server time - local time`, from the `Date` header (W-6); 0 if unknown. */
  readonly clockOffsetMs: number;
};

const assertConfig = (config: RefreshConfig): void => {
  if (!(config.fraction > 0 && config.fraction < 1)) {
    throw new RangeError("refresh fraction must be between 0 and 1");
  }
  if (!(Number.isFinite(config.marginMs) && config.marginMs >= 0)) {
    throw new RangeError(
      "refresh margin must be a finite, non-negative duration",
    );
  }
};

/** The deadline in the local clock. */
export const localDeadlineMs = (deadline: TokenDeadline): number =>
  deadline.expiresAtMs - deadline.clockOffsetMs;

/**
 * When to refresh, in the local clock: when the remaining time falls to
 * `fraction` of the token's lifetime, or to `marginMs`, whichever comes first
 * (W-6). The lifetime runs from the server time at which the token arrived to
 * its deadline. Never earlier than `receivedAtMs`: a token that is already due
 * is refreshed at once.
 */
export const refreshAtMs = (
  deadline: TokenDeadline,
  config: RefreshConfig = DEFAULT_REFRESH_CONFIG,
): number => {
  assertConfig(config);
  const issuedAtServerMs = deadline.receivedAtMs + deadline.clockOffsetMs;
  const lifetimeMs = Math.max(0, deadline.expiresAtMs - issuedAtServerMs);
  const leadMs = Math.max(config.fraction * lifetimeMs, config.marginMs);
  return Math.max(
    deadline.receivedAtMs,
    Math.floor(localDeadlineMs(deadline) - leadMs),
  );
};

/** Whether the token reached its deadline at local time `nowMs` (W-7). */
export const isExpired = (deadline: TokenDeadline, nowMs: number): boolean =>
  nowMs >= localDeadlineMs(deadline);

const RFC_3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

/**
 * Reads a deadline field of a response as milliseconds since the epoch.
 * Provisional: the format of `tokenExpiresAt` is not fixed by a published Play
 * API document (W-2, marked in specs/wrapper.md); a full RFC 3339 timestamp
 * with seconds and a zone (`Z` or `+hh:mm`) is assumed, and this is the one
 * place to change. A timestamp without a zone is refused: it would be read in
 * the device's local time.
 */
export const parseDeadline = (value: unknown): number | undefined => {
  if (typeof value !== "string" || !RFC_3339.test(value)) {
    return undefined;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
};
