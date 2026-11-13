// The Wrapper app's types (wrapper-app.ts): its options, the intents the
// session wires in, and what the app gives the session's wiring and boot.

import type { Connectivity } from "./connectivity.ts";
import type { EnvironmentConfig } from "./environment-config.ts";
import type { SnapshotRead } from "./round-input.ts";
import type { PollConfig } from "./snapshot-poller.ts";
import type { Timers } from "./timers.ts";
import type { ChangeCause, Intents, ViewOptions } from "./view-options.ts";
import type { BlockingState, WrapperState } from "./wrapper-state.ts";

export type WrapperAppOptions = {
  readonly doc: Document;
  readonly host: HTMLElement;
  readonly timers: Timers;
  readonly connectivity?: Connectivity;
  /** The platform clipboard, for the round id's copy control (W-39). */
  readonly copyText?: (text: string) => Promise<void>;
  readonly pollConfig?: PollConfig;
};

/**
 * The player intents the session wires in (start, cash-out, "check again", and
 * autoplay's begin and stop, W-61).
 */
export type RoundIntents = Pick<
  Intents,
  "start" | "cashOut" | "checkAgain" | "autoplay" | "stopAutoplay"
>;

export type WrapperApp = {
  /** Applies a validated environment configuration (W-26a, W-39). */
  readonly configure: (config: EnvironmentConfig) => void;
  /** Offers the lobby and deposit controls, once the gate opened (W-49e). */
  readonly allowLinks: (rules: NonNullable<ViewOptions["links"]>) => void;
  /** A start or cash-out call is in flight: no lobby or deposit (W-49f). */
  readonly callInFlight: (inFlight: boolean) => void;
  /** Connects the session's Snapshot read and the round flows' intents. */
  readonly connect: (session: {
    readonly readSnapshot: () => Promise<SnapshotRead>;
    readonly intents?: RoundIntents;
  }) => void;
  /** A read the Wrapper did not poll for, such as the answer to an action. */
  readonly accept: (read: SnapshotRead, cause: ChangeCause) => void;
  /** Shows a blocking state (W-44). */
  readonly block: (state: BlockingState, cause?: ChangeCause) => void;
  /** The game's `hello` did not declare what the Wrapper sends (W-38). */
  readonly gameIncompatible: () => void;
  /** Whether the latest game copy was built (W-38, W-55; `onCopy`). */
  readonly gameCopied: (copied: boolean) => void;
  /** Where the game iframe is mounted (W-37); see `View.gameHost`. */
  readonly gameHost: () => HTMLElement;
  readonly state: () => WrapperState;
  /** A start or cash-out call, or a run of autoplay, is in flight (W-49f). */
  readonly calling: () => boolean;
  /** The shell's run of autoplay: `left` starts to come, or none (W-61). */
  readonly autoplayRun: (run: { readonly left: number } | undefined) => void;
  /** The configured autoplay interval, for a configured count only (W-61). */
  readonly autoplayInterval: (count: number) => number | undefined;
  /** The game's accepted `hello` declared `inset`, or not (RFC-005). */
  readonly gameCapable: (inset: boolean) => void;
  /** One quiet read of the session's Snapshot (RFC-001 Q16); see `readQuiet`. */
  readonly readQuiet: () => Promise<void>;
  readonly dispose: () => void;
};
