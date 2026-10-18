// A TCP listener on the loopback interface that only counts connections, for
// the tests that must prove a socket or a request outside the routes never
// reaches a host (hermetic-workers.spec.ts, hermetic-proxy.spec.ts): without a
// listener, "the socket failed" would prove nothing. It answers nothing and
// closes every connection at once. The suite's only open sockets are three:
// this listener, the UDP datagram counter (loopback-datagrams.ts), and the
// stand-in proxy below (`listenAsProxy`), which reads one request line from
// each connection and answers nothing.

import { connect, createServer, type Server } from "node:net";

export type LoopbackListener = {
  readonly port: number;
  readonly connections: () => number;
  /** Whether it still listens: false once `close` has finished. */
  readonly listening: () => boolean;
  readonly close: () => Promise<void>;
};

export const listenOnLoopback = async (): Promise<LoopbackListener> => {
  let connections = 0;
  const server: Server = createServer(socket => {
    connections += 1;
    // Destroyed before any read can complete, so no reset can surface as an
    // `error` here (unlike `listenAsProxy`, which waits for data).
    socket.destroy();
  });
  await new Promise<void>(resolve => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the loopback listener has no port");
  }
  return {
    port: address.port,
    connections: () => connections,
    listening: () => server.listening,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error === undefined) resolve();
          else reject(error);
        });
      }),
  };
};

/**
 * Fails, saying why, if anything accepts a TCP connection at `url` (an
 * `http://host:port` address such as the dead proxy's): a listener there would
 * turn the dead proxy into a live one. A refused or timed-out connection
 * passes; the wait is at most 1 s.
 */
export const expectNothingAccepts = (url: string): Promise<void> => {
  const { hostname, port } = new URL(url);
  return new Promise<void>((resolve, reject) => {
    const socket = connect({ host: hostname, port: Number(port) });
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.destroy();
      reject(
        new Error(
          `Something accepts connections at ${url}, the dead proxy of the Firefox and WebKit block: stop it before running the suite.`,
        ),
      );
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve();
    });
    socket.once("error", () => {
      socket.destroy();
      resolve();
    });
  });
};

export type ProxyListener = {
  readonly server: string;
  /** The request line of each connection, as received (`CONNECT host:443 …`). */
  readonly requests: () => readonly string[];
  readonly close: () => Promise<void>;
};

/**
 * A TCP listener on loopback to stand in for a proxy, for a control that must
 * show where a request outside the routes goes: it records the first line of
 * what each connection sends (an HTTPS request through a proxy opens with
 * `CONNECT <host>:<port> HTTP/1.1`) and closes it, answering nothing.
 */
export const listenAsProxy = async (): Promise<ProxyListener> => {
  const requests: string[] = [];
  const server: Server = createServer(socket => {
    // A browser may reset a connection before it sends anything (at
    // `browser.close()`, say); unheard, that `error` would crash the worker.
    // The reset is ignored: the socket is closed, and nothing is recorded.
    socket.on("error", () => {
      socket.destroy();
    });
    socket.once("data", (chunk: Buffer) => {
      requests.push(chunk.toString("latin1").split("\r\n")[0] ?? "");
      socket.destroy();
    });
  });
  await new Promise<void>(resolve => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the proxy listener has no port");
  }
  return {
    server: `http://127.0.0.1:${String(address.port)}`,
    requests: () => [...requests],
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error === undefined) resolve();
          else reject(error);
        });
      }),
  };
};
