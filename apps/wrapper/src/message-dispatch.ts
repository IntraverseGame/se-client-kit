// The Wrapper's one `message` listener (W-49b): it routes by `event.source`
// before anything parses: `window.parent` to the operator channel, the game
// frame's `contentWindow` to the controller bridge (W-38), anything else
// dropped. Each channel then checks the origin and its own schema. The two
// share no state and no schema: nothing from the operator reaches the game,
// and nothing from the game reaches the operator. When the Wrapper is not
// framed there is no operator route, so a message from its own window is
// dropped. It is installed at boot, before the configuration is read, so an
// early `hello` is recorded (W-49c).

/** The parts of a `MessageEvent` a channel reads. */
export type RoutedMessage = {
  readonly source: unknown;
  readonly origin: string;
  readonly data: unknown;
};

/** The page's `message` events (the platform `window`). */
export type MessageTarget = {
  readonly addEventListener: (
    type: "message",
    listener: (event: MessageEvent) => void,
  ) => void;
  readonly removeEventListener: (
    type: "message",
    listener: (event: MessageEvent) => void,
  ) => void;
};

type Handler = (message: RoutedMessage) => void;

export type MessageDispatch = {
  /** Routes the parent's messages to `handler` (framed pages only). */
  readonly onOperator: (handler: Handler) => void;
  /**
   * Routes `frame`'s messages to `handler` (the controller bridge's `listen`)
   * until the returned unsubscribe is called.
   */
  readonly onGame: (frame: unknown, handler: Handler) => () => void;
  /** Removes the listener: nothing more is routed. */
  readonly close: () => void;
};

/**
 * Installs the listener on `target`. `parent` is `window.parent` when the page
 * is framed, and `undefined` when it is not (no operator route).
 */
export const createMessageDispatch = (
  target: MessageTarget,
  parent?: unknown,
): MessageDispatch => {
  let operator: Handler | undefined;
  let game: { readonly frame: unknown; readonly handler: Handler } | undefined;
  const listener = (event: MessageEvent): void => {
    const { source } = event;
    if (source === null) return;
    const message = { source, origin: event.origin, data: event.data };
    if (parent !== undefined && source === parent) {
      operator?.(message);
    } else if (game !== undefined && source === game.frame) {
      game.handler(message);
    }
  };
  target.addEventListener("message", listener);
  return Object.freeze({
    onOperator: (handler: Handler): void => {
      if (parent !== undefined) operator = handler;
    },
    onGame: (frame: unknown, handler: Handler): (() => void) => {
      const route = { frame, handler };
      game = route;
      return (): void => {
        if (game === route) game = undefined;
      };
    },
    close: (): void => {
      target.removeEventListener("message", listener);
      operator = undefined;
      game = undefined;
    },
  });
};
