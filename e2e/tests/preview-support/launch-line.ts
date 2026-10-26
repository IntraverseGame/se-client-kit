// The launch hook's one line of output, validated exactly (RFC-002, "The launch
// hook"): one line (one trailing line feed allowed, no carriage return, no other
// line break), an absolute URL whose origin is the preview origin, with no
// credentials, no query, the path `/` only (the Wrapper's page is served at the
// origin root), and a fragment of 1 to 128 characters (the launch code is the
// whole fragment, W-1). Anything else is a `LaunchHookError` of reason `line`,
// which holds no part of the line.

import { LaunchHookError } from "./launch-hook-error.ts";

/** The longest launch code the Wrapper reads (W-1). */
export const MAX_LAUNCH_CODE_LENGTH = 128;

/** Printable ASCII without a space: no control character, no whitespace. */
const PRINTABLE = /^[!-~]+$/u;

export type LaunchLine = {
  /** The whole launch URL, to navigate to. */
  readonly url: string;
  /** The launch code (the fragment), a secret to register before navigating. */
  readonly code: string;
};

/** The launch URL and code of the hook's standard output, or a `line` error. */
export const parseLaunchLine = (
  output: string,
  previewOrigin: string,
): LaunchLine => {
  const line = output.endsWith("\n") ? output.slice(0, -1) : output;
  // A carriage return or another line feed means more than one line.
  if (line === "" || line.includes("\n") || line.includes("\r")) {
    throw new LaunchHookError("line");
  }
  if (!PRINTABLE.test(line)) throw new LaunchHookError("line");
  const prefix = `${previewOrigin}/#`;
  if (!line.startsWith(prefix)) throw new LaunchHookError("line");
  const code = line.slice(prefix.length);
  if (code.length === 0 || code.length > MAX_LAUNCH_CODE_LENGTH) {
    throw new LaunchHookError("line");
  }
  // The prefix fixes the origin, the path, and the absence of credentials;
  // anything after the first `#` is the fragment, the whole of the code.
  let url: URL;
  try {
    url = new URL(line);
  } catch {
    throw new LaunchHookError("line");
  }
  const clean =
    url.origin === previewOrigin &&
    url.pathname === "/" &&
    url.search === "" &&
    url.username === "" &&
    url.password === "";
  if (!clean) throw new LaunchHookError("line");
  return Object.freeze({ url: line, code });
};
