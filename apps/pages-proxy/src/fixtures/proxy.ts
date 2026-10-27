// Test helpers of the Pages API proxy: an injected `fetch` that records what
// it was sent, and a fake asset binding. No network, no clock.

import type { ProxyEnv, Send } from "../worker.ts";

export const SITE = "https://site.example.test";
export const UPSTREAM = "https://api.example.test";

export type Sent = { readonly url: string; readonly init: RequestInit };

export const recorder = (
  answer: () => Response = () => new Response("{}", { status: 200 }),
): { readonly send: Send; readonly sent: Sent[] } => {
  const sent: Sent[] = [];
  return {
    sent,
    send: (url, init) => {
      sent.push({ url, init });
      return Promise.resolve(answer());
    },
  };
};

/** The Wrapper site's prefixes; the verifier's is `VERIFIER_PREFIXES`. */
export const WRAPPER_PREFIXES = "/play/v1/ /verify/v1/";
export const VERIFIER_PREFIXES = "/verify/v1/";

/** The security headers every answer of the proxy carries. */
export const PROXY_CSP = "default-src 'none'; frame-ancestors 'none'; sandbox";

/**
 * The proxy's environment; `null` leaves a variable unset. The assets answer
 * "asset", or reject when `assetsFail`.
 */
export const environment = (
  upstream: string | null = UPSTREAM,
  prefixes: string | null = WRAPPER_PREFIXES,
  { assetsFail = false }: { readonly assetsFail?: boolean } = {},
): ProxyEnv => ({
  ASSETS: {
    fetch: () =>
      assetsFail
        ? Promise.reject(new Error("assets unavailable"))
        : Promise.resolve(new Response("asset", { status: 200 })),
  },
  ...(upstream === null ? {} : { SE_API_UPSTREAM_ORIGIN: upstream }),
  ...(prefixes === null ? {} : { SE_API_PATH_PREFIXES: prefixes }),
});

/** Whether `response` carries the proxy's two security headers. */
export const hasProxyHeaders = (response: Response): boolean =>
  response.headers.get("Content-Security-Policy") === PROXY_CSP &&
  response.headers.get("X-Content-Type-Options") === "nosniff";

export const onlySent = (sent: readonly Sent[]): Sent => {
  const [first] = sent;
  if (sent.length !== 1 || first === undefined) {
    throw new Error(`expected one forwarded request, got ${sent.length}`);
  }
  return first;
};

/** The bytes of a forwarded body (a stream, a buffer, or nothing). */
export const bytesOf = async (body: RequestInit["body"]): Promise<Uint8Array> =>
  new Uint8Array(await new Response(body).arrayBuffer());
