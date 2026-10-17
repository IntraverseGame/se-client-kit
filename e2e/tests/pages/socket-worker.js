// A dedicated worker that opens a WebSocket to the host and port in its own
// URL (?url=...) and posts how the attempt ended. For the hermetic guard's
// tests: a worker's socket is not routed, so only the browser-level block
// stops it. Test-only.
/* oxlint-disable unicorn/require-post-message-target-origin -- a dedicated worker's postMessage has no targetOrigin parameter */
const target = new URL(self.location.href).searchParams.get("url") ?? "";
const socket = new WebSocket(target);
socket.addEventListener("open", () => self.postMessage("opened"));
socket.addEventListener("close", event =>
  self.postMessage(`closed ${event.code}`),
);
