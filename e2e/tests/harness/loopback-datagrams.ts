// UDP sockets on both loopback addresses, 127.0.0.1 and ::1, on one port, that
// only count datagrams, for the test that must prove WebRTC's STUN traffic
// never reaches a host (hermetic-proxy.spec.ts): STUN is UDP, which no HTTP
// proxy carries, so without a socket to count it, "nothing arrived" would
// prove nothing. Both families share the port, so `localhost` resolved either
// way lands on a counted socket. They answer nothing. With the TCP listener
// and the stand-in proxy (loopback-listener.ts), the suite's only open
// sockets.

import { createSocket, type Socket } from "node:dgram";

export type LoopbackDatagrams = {
  readonly port: number;
  /** Datagrams received on 127.0.0.1 and on ::1, together. */
  readonly datagrams: () => number;
  readonly close: () => Promise<void>;
};

const bind = (socket: Socket, port: number, address: string): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(port, address, () => {
      socket.off("error", reject);
      resolve();
    });
  });

const close = (socket: Socket): Promise<void> =>
  new Promise<void>(resolve => {
    socket.close(() => {
      resolve();
    });
  });

/** How many ports to try before giving up when ::1 has the port taken. */
const ATTEMPTS = 5;

const open = async (attemptsLeft: number): Promise<LoopbackDatagrams> => {
  let datagrams = 0;
  const count = (): void => {
    datagrams += 1;
  };
  const v4 = createSocket("udp4").on("message", count);
  await bind(v4, 0, "127.0.0.1");
  const { port } = v4.address();
  const v6 = createSocket({ type: "udp6", ipv6Only: true }).on(
    "message",
    count,
  );
  try {
    await bind(v6, port, "::1");
  } catch (error: unknown) {
    try {
      v6.close();
    } catch {
      // It never bound, so it is not running: nothing to close.
    }
    await close(v4);
    if (attemptsLeft <= 1) throw error;
    return open(attemptsLeft - 1);
  }
  return {
    port,
    datagrams: () => datagrams,
    close: async () => {
      await Promise.all([close(v4), close(v6)]);
    },
  };
};

export const countDatagramsOnLoopback = (): Promise<LoopbackDatagrams> =>
  open(ATTEMPTS);
