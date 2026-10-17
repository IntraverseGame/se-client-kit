// The origin of the page that embeds the game (the Wrapper's, the SE origin).
// The game accepts a message only from `window.parent` at this origin, and
// posts only to it (`targetOrigin`), so a page at another origin can neither
// talk to the game nor read what it sends.
//
// The game learns it from its own URL: the `parentOrigin` query parameter. Where
// the browser reports the embedding origin (`location.ancestorOrigins`, not in
// every browser), that report is used when the parameter is absent and MUST
// agree with it when both are there. A masked report (`"null"`) counts as no
// report; any other report that is not an origin leaves the game talking to
// nobody. A page that frames the game with a
// parameter naming another origin gains nothing: the browser drops what the
// game posts to an origin the parent does not have, and the parent's own
// messages arrive with its real origin, which then does not match.

/** The query parameter that names the embedding page's origin. */
export const PARENT_ORIGIN_PARAMETER = "parentOrigin";

/** What a browser reports for an ancestor origin it masks. */
const MASKED = "null";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Whether `value` is a serialized origin as `event.origin` gives it:
 * `https://host[:port]`, or `http:` on a loopback host only. `null`, `*`, and
 * anything with a path, a query, or credentials are not.
 */
export const isSerializedOrigin = (value: string): boolean => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.origin !== value) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOOPBACK.has(url.hostname);
};

/**
 * The embedding page's origin, from the game's query string and the browser's
 * `ancestorOrigins` (its first entry is the parent), or `undefined` when there
 * is none or the two disagree: the game then talks to nobody.
 */
export const parentOriginOf = (
  search: string,
  ancestorOrigins: readonly string[] = [],
): string | undefined => {
  const [first] = ancestorOrigins;
  // A browser that masks the report (for example under a `no-referrer`
  // policy) gives exactly "null": that is no report. Any other value that is
  // not an origin is refused, so the game talks to nobody.
  const reported = first === MASKED ? undefined : first;
  if (reported !== undefined && !isSerializedOrigin(reported)) return undefined;
  const known = reported;
  const named = new URLSearchParams(search).getAll(PARENT_ORIGIN_PARAMETER);
  if (named.length > 1) return undefined;
  const [parameter] = named;
  if (parameter === undefined) return known;
  if (!isSerializedOrigin(parameter)) return undefined;
  if (known !== undefined && known !== parameter) return undefined;
  return parameter;
};
