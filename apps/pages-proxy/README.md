# `@intraverse/se-client-pages-proxy`

The same-origin API proxy of the SuperEngine Cloudflare Pages sites: a Pages
advanced-mode worker (`_worker.js`) that forwards the Play API and the verify
API to the SuperEngine API, so the Wrapper and the verify page call them on
their own origin.

**Status:** pre-release. It is an application, not an npm package, and is never
published. CI deploys it with each site.

## What it does

- It forwards only requests under `/play/v1/` and `/verify/v1/`. Each site's
  `_routes.json` sends only the paths its pages call to the worker; every other
  path is a static asset of the site.
- The method, the path, the query, and the body pass through unchanged. The body
  is the incoming stream, never read, parsed, or re-encoded, so a signed action
  arrives byte for byte.
- The request headers pass through unchanged, except `Host` (the upstream's),
  `CF-Connecting-IP` (Cloudflare sets its own), and `X-Forwarded-For`, which
  carries the client IP. The hop-by-hop headers (with every name `Connection`
  lists), the `proxy-*` headers, and the forwarding headers a backend could read
  as the client's address, host, scheme, path, or method are dropped.
- The upstream's status and body come back as they are, and its headers too,
  except that `Content-Security-Policy` and `X-Content-Type-Options` are set
  over its own, on every answer the proxy forwards or makes. Nothing is cached,
  and no caching header is added or changed.
- A path with an encoded slash, backslash, or dot, an empty segment (`//`), or,
  under an API prefix, a trailing `/` is refused with a 400 and no body, and
  never forwarded.
- Two environment variables of the Pages project configure it:
  `SE_API_UPSTREAM_ORIGIN` (an `https` origin, no path) and
  `SE_API_PATH_PREFIXES` (the site's API prefixes, whitespace-separated, each
  `/play/v1/` or `/verify/v1/`; an API path outside the site's list is a static
  asset). When either is missing or malformed, an API path answers a 502 with no
  body, and so does a request when the upstream or a static asset cannot be
  reached.

It is one module with no import and no dependency, emitted by `tsc` alone.

## More

- [How the Wrapper reaches the SuperEngine origin](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/client-kit.md#how-the-wrapper-reaches-the-superengine-origin)
  in the kit specification
- [ADR-008](https://github.com/IntraverseGame/se-client-kit/blob/main/decisions/ADR-008-pages-deploy-with-wrangler.md),
  the Pages deploy

Contributing: see
[CONTRIBUTING.md](https://github.com/IntraverseGame/se-client-kit/blob/main/CONTRIBUTING.md).
