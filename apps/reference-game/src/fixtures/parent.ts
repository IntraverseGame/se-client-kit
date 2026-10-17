// Test-only: a fake parent window that records what the game posts, and a fake
// `message` listener that delivers what a test sends, from the parent (by
// default) or from anywhere else.

import type { IncomingMessage, ListenForMessages } from "../game.ts";

export const PARENT_ORIGIN = "https://wrapper.example.test";

export type Posted = {
  readonly message: unknown;
  readonly targetOrigin: string;
};

export type FakeParent = {
  readonly window: {
    readonly postMessage: (message: unknown, targetOrigin: string) => void;
  };
  readonly posted: Posted[];
  readonly listen: ListenForMessages;
  /** How many handlers are subscribed now. */
  readonly listeners: () => number;
  /**
   * Delivers `data` as a `message` event, from the parent unless told
   * otherwise.
   */
  readonly send: (
    data: unknown,
    from?: Partial<Omit<IncomingMessage, "data">>,
  ) => void;
};

export const fakeParent = (): FakeParent => {
  const posted: Posted[] = [];
  const handlers = new Set<(event: IncomingMessage) => void>();
  const window = {
    postMessage: (message: unknown, targetOrigin: string): void => {
      posted.push({ message, targetOrigin });
    },
  };
  return {
    window,
    posted,
    listen: handler => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    listeners: () => handlers.size,
    send: (data, from = {}) => {
      const event: IncomingMessage = {
        source: "source" in from ? from.source : window,
        origin: from.origin ?? PARENT_ORIGIN,
        data,
      };
      for (const handler of handlers) handler(event);
    },
  };
};
