// The browser-level blocks behind the hermetic routes, one per engine. Traffic
// that no Playwright route intercepts (a WebSocket opened by a dedicated or
// service worker, WebRTC's STUN and TURN servers, a prefetch) must reach no
// host. Every request the suite expects is fulfilled or aborted by a route
// (none is continued to the network), and a route intercepts before any of
// these blocks applies, so the fake origins still answer.

// Chromium: every host name resolves to "not found", so nothing outside a route
// reaches a host by name. An address written as an IP literal is not a name,
// and this flag is not relied on to stop it.
export const BLOCK_HOST_RESOLUTION = "--host-resolver-rules=MAP * ~NOTFOUND";

/**
 * Firefox and WebKit: every request outside a route goes to a proxy that is not
 * there, so it fails. Port 9 (discard) on loopback: on the Linux CI runners a
 * privileged port, so no unprivileged process of the run can open it (the
 * suite's own loopback listener binds an ephemeral port), and no service
 * listens on it by default there or on a developer machine; the release dry run
 * aims its publish at the same address for the same reason
 * (tools/release-dry-run.ts). No bypass is given, so no host is exempt.
 */
export const DEAD_PROXY = { server: "http://127.0.0.1:9" } as const;

/**
 * Firefox's half of the block, as preferences. WebRTC is off (its STUN and TURN
 * traffic is UDP, which no HTTP proxy carries), and the proxy covers localhost
 * and loopback addresses too: Firefox sends them direct by default
 * (`network.proxy.allow_hijacking_localhost` is false), which would let a
 * socket to `localhost` past the dead proxy.
 */
export const FIREFOX_BLOCK_PREFS = {
  "media.peerconnection.enabled": false,
  "network.proxy.allow_hijacking_localhost": true,
} as const;
