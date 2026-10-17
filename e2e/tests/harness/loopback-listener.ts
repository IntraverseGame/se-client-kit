// A TCP listener on the loopback interface that only counts connections, for
// the one test that must prove a worker's socket never reaches a host: without
// a listener, "the socket failed" would prove nothing. It answers nothing and
// closes every connection at once. The only listener in the suite.

import { createServer, type Server } from "node:net";

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
