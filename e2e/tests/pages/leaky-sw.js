// The service worker the leaking test page registers with a secret in its URL.
// It only takes over at once; its registration is the leak.
globalThis.addEventListener("install", () => globalThis.skipWaiting());
