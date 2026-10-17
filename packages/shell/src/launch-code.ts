// Reading the launch code (W-1, W-1a): only from the URL fragment, exactly
// once, and removed from the URL with `history.replaceState` before anything
// else happens (no request, no log line). The code is the whole fragment, with
// no parameter name; its length is the raw `location.hash` without its `#`,
// with no decoding, and 1 to 128 characters is a code. The prefix (`lc_`
// today) is not checked: the backend may change it. The query string is never
// read. The code is returned sealed (it prints `[redacted]`), never as text.
// A code that will not be redeemed (the Wrapper refused to start) is
// discarded: its text is forgotten.

import { disposeSecret, type LaunchCode, sealSecret } from "./redaction.ts";

/** The redeem's limit on the launch code, in characters (W-1). */
export const MAX_LAUNCH_CODE_LENGTH = 128;

/** The parts of the platform `location` read: once each. */
export type LaunchLocation = {
  readonly hash: string;
  readonly href: string;
};

/** The part of the platform `history` called. */
export type LaunchHistory = {
  readonly replaceState: (data: null, unused: string, url: string) => void;
};

/**
 * Takes the launch code out of the URL: removes the fragment with
 * `replaceState` (keeping no history state) whenever the URL has one, then
 * returns the code, sealed, or `undefined` when there is none (W-1a: absent,
 * empty, or more than 128 characters). When the fragment cannot be removed (a
 * `replaceState` that throws), the code is not returned either: it would
 * otherwise be redeemed while still in the URL.
 */
export const takeLaunchCode = (
  location: LaunchLocation,
  history: LaunchHistory,
): LaunchCode | undefined => {
  const { hash, href } = location;
  const cut = href.indexOf("#");
  if (cut !== -1) {
    try {
      history.replaceState(null, "", href.slice(0, cut));
    } catch {
      return undefined;
    }
  }
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (cut === -1 || raw.length === 0 || raw.length > MAX_LAUNCH_CODE_LENGTH) {
    return undefined;
  }
  return sealSecret("launch-code", raw);
};

/**
 * Forgets a launch code that will not be redeemed (the configuration or the
 * framing was refused, so no session opens): its text can no longer be read,
 * and a session given it redeems nothing. `undefined` is a no-op.
 */
export const discardLaunchCode = (code: LaunchCode | undefined): void => {
  if (code !== undefined) disposeSecret(code);
};
