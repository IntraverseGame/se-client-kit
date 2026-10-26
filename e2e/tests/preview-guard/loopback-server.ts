// A local test server for the preview-guard tests (RFC-002): an HTTP listener on
// `127.0.0.1` that the test owns. It is not real network and reaches no host; it
// is the only way to prove that an allowed request is continued to a server. It
// records each request's method and URL (the test's own, never a secret), serves
// the documents a test sets, answers a WebSocket upgrade, and sends the headers a
// cross-origin read from a test page needs. Only the Chromium project reaches
// loopback (the others' dead proxy hijacks it), so the tests that use it skip
// elsewhere.

import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { Duplex } from "node:stream";

export type TestServer = {
  /** `http://127.0.0.1:<port>`, a serialized origin. */
  readonly origin: string;
  /** Serves `body` at `path` with `status` (JSON by default). */
  readonly serve: (path: string, body: unknown, status?: number) => void;
  /** Answers `path` with a redirect to `location`. */
  readonly redirect: (path: string, location: string) => void;
  /** `METHOD /path?query` of each HTTP request, and `UPGRADE /path`. */
  readonly requests: () => readonly string[];
  /** The `cookie` and `authorization` headers seen, if any. */
  readonly credentialHeaders: () => readonly string[];
  readonly close: () => Promise<void>;
};

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export const startTestServer = async (): Promise<TestServer> => {
  const documents = new Map<string, { status: number; body: string }>();
  const redirects = new Map<string, string>();
  const seen: string[] = [];
  const credentials: string[] = [];
  const upgraded = new Set<Duplex>();
  const server: Server = createServer((request, response) => {
    seen.push(`${request.method ?? "GET"} ${request.url ?? ""}`);
    for (const name of ["cookie", "authorization"] as const) {
      if (request.headers[name] !== undefined) credentials.push(name);
    }
    const path = (request.url ?? "").split("?")[0] ?? "";
    const target = redirects.get(path);
    if (target !== undefined) {
      response.writeHead(302, { location: target });
      response.end();
      return;
    }
    const document = documents.get(path) ?? { status: 200, body: '"ok"' };
    response.writeHead(document.status, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    });
    response.end(document.body);
  });
  server.on("upgrade", (request, socket) => {
    seen.push(`UPGRADE ${request.url ?? ""}`);
    const key = request.headers["sec-websocket-key"] ?? "";
    const accept = createHash("sha1")
      .update(`${key}${WEBSOCKET_GUID}`)
      .digest("base64");
    upgraded.add(socket);
    socket.on("error", () => {
      socket.destroy();
    });
    socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${accept}`,
        "",
        "",
      ].join("\r\n"),
    );
  });
  await new Promise<void>(resolve => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the test server has no port");
  }
  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    serve: (path, body, status = 200) => {
      documents.set(path, { status, body: JSON.stringify(body) });
    },
    redirect: (path, location) => {
      redirects.set(path, location);
    },
    requests: () => [...seen],
    credentialHeaders: () => [...credentials],
    close: () =>
      new Promise<void>((resolve, reject) => {
        // An upgraded socket is no longer an HTTP connection: close it here.
        for (const socket of upgraded) socket.destroy();
        server.closeAllConnections();
        server.close(error => {
          if (error === undefined) resolve();
          else reject(error);
        });
      }),
  };
};
