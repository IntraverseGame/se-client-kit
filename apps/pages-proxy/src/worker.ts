// The same-origin API proxy of the Cloudflare Pages sites (specs/client-kit.md,
// The Pages API proxy; ADR-008). Deployed as each Pages project's `_worker.js`
// (advanced mode), next to a `_routes.json` that sends only the site's API
// paths to it; every other path is a static asset.
//
// It forwards a request under one of the site's API prefixes (the project's
// `SE_API_PATH_PREFIXES`, each one of `/play/v1/` and `/verify/v1/`) to the
// origin in the project's `SE_API_UPSTREAM_ORIGIN`, and returns the upstream's
// answer with two security headers set. The method, the path, the query, and
// the body pass through unchanged: the body is the incoming stream, never
// read, parsed, or re-encoded, so a signed action arrives byte for byte. The
// request headers pass through except `Host`, the incoming
// `CF-Connecting-IP`, the hop-by-hop headers, and the headers a backend could
// read as the client's address, host, scheme, path, or method; the client IP
// goes in `X-Forwarded-For`. A path with an encoded slash, backslash, or dot,
// or an empty segment, is refused (400) and never forwarded. Nothing is cached.
// A missing or malformed setting, an upstream that cannot be reached, or an
// asset read that fails is a 502 with no body. Every answer the proxy makes or
// forwards carries `PROXY_RESPONSE_HEADERS`. It never throws.
//
// One self-contained module (no import), so `tsc` emits it as the deployable
// file with nothing to bundle. The Pages runtime reads every named export of
// this module as an entry point, so it exports only functions (and types);
// constants stay private.

/** The Pages project's binding to its static assets. */
export type Assets = {
  readonly fetch: (request: Request) => Promise<Response>;
};

/** What the Pages runtime passes to the worker: the project's variables. */
export type ProxyEnv = {
  readonly ASSETS: Assets;
  /** `https://host[:port]`, no path; set in the Pages project, never here. */
  readonly SE_API_UPSTREAM_ORIGIN?: string;
  /** The site's API prefixes, whitespace-separated, from `KNOWN_PREFIXES`. */
  readonly SE_API_PATH_PREFIXES?: string;
};

/** The `fetch` the proxy forwards with (the runtime's; a fake in tests). */
export type Send = (url: string, init: RequestInit) => Promise<Response>;

/** Every prefix a site may forward; a project's list can only narrow it. */
const KNOWN_PREFIXES: ReadonlySet<string> = new Set([
  "/play/v1/",
  "/verify/v1/",
]);

/** Set on every answer the proxy forwards or makes, replacing the upstream's. */
const PROXY_RESPONSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Content-Security-Policy":
    "default-src 'none'; frame-ancestors 'none'; sandbox",
  "X-Content-Type-Options": "nosniff",
});

/**
 * Request headers never forwarded: the hop-by-hop headers (and every name
 * `Connection` lists, removed separately), and the headers a backend could read
 * as the client's address, host, scheme, path, or method.
 */
const DROPPED_REQUEST_HEADERS: readonly string[] = Object.freeze([
  "host",
  "cf-connecting-ip",
  "connection",
  "keep-alive",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-real-ip",
  "true-client-ip",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-original-url",
  "x-rewrite-url",
  "x-http-method-override",
]);

/** An HTTP header name (RFC 9110 `token`). */
const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;

/**
 * The site's prefixes from `SE_API_PATH_PREFIXES`, or `null` unless it is a
 * non-empty list of known prefixes.
 */
export const pathPrefixesOf = (value: unknown): readonly string[] | null => {
  if (typeof value !== "string") return null;
  const prefixes = value.split(/\s+/u).filter(entry => entry !== "");
  return prefixes.length > 0 &&
    prefixes.every(entry => KNOWN_PREFIXES.has(entry))
    ? prefixes
    : null;
};

/** Whether `pathname` (as `URL` normalizes it) starts with a known prefix. */
export const isApiPath = (pathname: string): boolean =>
  [...KNOWN_PREFIXES].some(prefix => pathname.startsWith(prefix));

/**
 * Whether the request's path, as received, holds an encoded slash, backslash,
 * or dot (`%2f`, `%5c`, `%2e`, any case) or an empty segment: `//` anywhere, or
 * a trailing `/` on an API path (a static path such as `/verify/` keeps its
 * trailing slash).
 */
export const isRefusedPath = (url: string): boolean => {
  const authority = url.indexOf("//");
  const pathStart = url.indexOf("/", authority === -1 ? 0 : authority + 2);
  if (pathStart === -1) return false;
  const path = url.slice(pathStart).split(/[?#]/u)[0] ?? "";
  return (
    /%(?:2f|5c|2e)/iu.test(path) ||
    path.includes("//") ||
    (isApiPath(path) && path.endsWith("/"))
  );
};

/**
 * The upstream origin, or `null` unless `value` is exactly an `https` origin
 * (no path, query, fragment, credentials, or trailing slash).
 */
export const upstreamOriginOf = (value: unknown): string | null => {
  if (typeof value !== "string" || value === "") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return url.protocol === "https:" && url.origin === value ? value : null;
};

/** The forwarded request's headers. */
export const forwardedHeaders = (incoming: Headers): Headers => {
  const headers = new Headers(incoming);
  for (const name of (incoming.get("Connection") ?? "").split(",")) {
    // A listed token that is not a header name (`a b`) names no header;
    // `Headers.delete` would throw on it, so it is skipped.
    const listed = name.trim();
    if (HEADER_NAME.test(listed)) headers.delete(listed);
  }
  for (const name of DROPPED_REQUEST_HEADERS) headers.delete(name);
  for (const name of Array.from(headers.keys())) {
    if (name.startsWith("proxy-")) headers.delete(name);
  }
  const client = incoming.get("CF-Connecting-IP");
  if (client === null) {
    headers.delete("X-Forwarded-For");
  } else {
    headers.set("X-Forwarded-For", client);
  }
  return headers;
};

/** `response` with the proxy's security headers set over its own. */
export const withProxyHeaders = (response: Response): Response => {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(PROXY_RESPONSE_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

/** An answer the proxy makes itself: no body, no detail. */
const bare = (status: 400 | 502): Response =>
  withProxyHeaders(new Response(null, { status }));

/** The static asset, or a bare 502 when reading it fails. */
const asset = async (request: Request, env: ProxyEnv): Promise<Response> => {
  try {
    return await env.ASSETS.fetch(request);
  } catch {
    return bare(502);
  }
};

/** `RequestInit` with the streaming-body flag Node's `fetch` requires. */
type StreamingInit = RequestInit & { readonly duplex?: "half" };

/**
 * Forwards an API request of the site to the upstream, or hands any other
 * request to the static assets. Never throws.
 */
export const proxyRequest = async (
  request: Request,
  env: ProxyEnv,
  send: Send,
): Promise<Response> => {
  if (isRefusedPath(request.url)) return bare(400);
  const url = new URL(request.url);
  if (!isApiPath(url.pathname)) return asset(request, env);
  const prefixes = pathPrefixesOf(env.SE_API_PATH_PREFIXES);
  const origin = upstreamOriginOf(env.SE_API_UPSTREAM_ORIGIN);
  if (prefixes === null || origin === null) return bare(502);
  if (!prefixes.some(prefix => url.pathname.startsWith(prefix))) {
    return asset(request, env);
  }
  try {
    const init: StreamingInit = {
      method: request.method,
      headers: forwardedHeaders(request.headers),
      body: request.body,
      redirect: "manual",
      cache: "no-store",
      ...(request.body === null ? {} : { duplex: "half" }),
    };
    return withProxyHeaders(
      await send(`${origin}${url.pathname}${url.search}`, init),
    );
  } catch {
    return bare(502);
  }
};

/**
 * The Pages advanced-mode entry, which Pages loads as the module's default
 * export: the runtime's own `fetch` forwards.
 */
export default {
  fetch: (request: Request, env: ProxyEnv): Promise<Response> =>
    proxyRequest(request, env, (url, init) => fetch(url, init)),
};
