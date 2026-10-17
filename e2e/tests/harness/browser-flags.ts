// The browser-level block behind the hermetic routes (Chromium only). Every
// host name resolves to "not found", so traffic that no Playwright route
// intercepts (a WebSocket opened by a dedicated or service worker, WebRTC's
// STUN and TURN servers named by host, a prefetch) cannot reach any host by
// name. Routed requests never resolve a name, so the fake origins still
// answer. An address written as an IP literal is not a name, and this flag
// is not relied on to stop it. Firefox and WebKit need their own equivalent
// when their projects are added (T-9a).
export const BLOCK_HOST_RESOLUTION = "--host-resolver-rules=MAP * ~NOTFOUND";
