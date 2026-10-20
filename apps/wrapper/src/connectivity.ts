// The browser's online state, injected so that tests switch it themselves
// (W-43: the connection-problem state, and a read again once back online).

/** The browser's online state and its changes (W-43). */
export type Connectivity = {
  readonly onLine: () => boolean;
  /** Calls back on `online` and `offline`; returns the unsubscribe. */
  readonly subscribe: (onChange: () => void) => () => void;
};
