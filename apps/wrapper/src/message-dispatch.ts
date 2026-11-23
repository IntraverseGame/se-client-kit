// The Wrapper's one `message` listener (W-49b): it routes by `event.source`
// before anything parses: `window.parent` to the operator channel, the game
// frame's `contentWindow` to the controller bridge (W-38), and, while a
// signing window is open, its handle to the shell's delegation use case
// (W-67); anything else is dropped. Each channel then checks the origin and
// its own schema. The channels share no state and no schema: nothing from the
// operator reaches the game, and nothing from the game reaches the operator.
// A message from the page's own window is dropped, framed or not (a wallet
// extension's content script posts to the page's own document); when the
// Wrapper is not framed there is no operator route at all. The game frame is
// never the signing route. It is installed at boot, before the configuration
// is read, so an early `hello` is recorded (W-49c).

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
  /**
   * Routes the signing window's messages (`window.open`'s handle) to `handler`
   * (the session's `receiveDelegation`) until the returned unsubscribe is
   * called (W-67).
   */
  readonly onSigner: (handle: unknown, handler: Handler) => () => void;
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
  let signer:
    | { readonly handle: unknown; readonly handler: Handler }
    | undefined;
  const listener = (event: MessageEvent): void => {
    const { source } = event;
    if (source === null) return;
    const message = { source, origin: event.origin, data: event.data };
    if (parent !== undefined && source === parent) {
      operator?.(message);
    } else if (game !== undefined && source === game.frame) {
      game.handler(message);
    } else if (signer !== undefined && source === signer.handle) {
      signer.handler(message);
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
    onSigner: (handle: unknown, handler: Handler): (() => void) => {
      const route = { handle, handler };
      signer = route;
      return (): void => {
        if (signer === route) signer = undefined;
      };
    },
    close: (): void => {
      target.removeEventListener("message", listener);
      operator = undefined;
      game = undefined;
      signer = undefined;
    },
  });
};
