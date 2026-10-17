// A service worker that opens a WebSocket from its install handler, to the URL
// in its own script URL (?url=...), and broadcasts how the attempt ended. For
// the hermetic guard's tests. Test-only.
const target = new URL(self.location.href).searchParams.get("url") ?? "";
self.addEventListener("install", event => {
  event.waitUntil(
    new Promise(resolve => {
      const channel = new BroadcastChannel("socket-result");
      /* oxlint-disable unicorn/require-post-message-target-origin -- BroadcastChannel.postMessage has no targetOrigin parameter */
      const socket = new WebSocket(target);
      socket.addEventListener("open", () => {
        channel.postMessage("opened");
        resolve();
      });
      socket.addEventListener("close", closed => {
        channel.postMessage(`closed ${closed.code}`);
        resolve();
      });
    }),
  );
});
