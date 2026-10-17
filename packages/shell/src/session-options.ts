// What the Wrapper's composition root gives the session (play-session.ts):
// platform pieces and validated configuration only. None of it is a secret
// the UI can read: the launch code is sealed, and the key is drawn later,
// inside the shell. No option carries a typedData encoder: the round flows'
// test hooks are reachable only through internal constructors (typed-data.ts).

import type {
  Clock,
  FetchLike,
  RandomUuid,
  RefreshConfig,
  Transport,
} from "@intraverse/se-client-play-client";
import type { RandomSource } from "@intraverse/se-client-signing";

import type { ChainConfig } from "./chain-config.ts";
import type { BindMode } from "./chain-decision.ts";
import type { LaunchCode } from "./redaction.ts";
import type { RpcTransport } from "./rpc-transport.ts";

/** What the session needs besides its Play API transport. */
export type SessionParts = {
  /**
   * The launch code `takeLaunchCode` took out of the URL, sealed, or
   * `undefined` when the fragment held none (W-1a). The session disposes it
   * after the one redeem.
   */
  readonly launchCode: LaunchCode | undefined;
  /** A wall clock (milliseconds since the epoch) and its timers. */
  readonly clock: Clock;
  /** The validated chain configuration: W-26's only trust anchor. */
  readonly config: ChainConfig;
  /** The platform `navigator.locks` (W-14); anything else signs nothing. */
  readonly locks: unknown;
  /** `crypto.randomUUID`: one idempotency key per intent (W-36). */
  readonly randomUuid: RandomUuid;
  /** The key's random source (W-9); the platform's by default. */
  readonly random?: RandomSource;
  /** The JSON-RPC transport of the tip check (W-26b), owned by the Wrapper. */
  readonly rpc: RpcTransport;
  /**
   * PROVISIONAL: how the round's block was bound (W-26b's bind rule). No
   * contract the kit has vendored carries it yet.
   */
  readonly bindMode: BindMode;
  /** The refresh fraction and margin (W-6); play-client's defaults otherwise. */
  readonly refresh?: RefreshConfig;
  /**
   * The configuration's allow-list of game origins (`gameOrigins`), copied at
   * open: `mountGame` checks D, the `sessions:redeem` answer's `gameOrigin`,
   * against it, and the UI can give it neither another D nor another list
   * (W-37).
   */
  readonly gameOrigins: readonly string[];
  /** The Wrapper's own origin, the SE origin, fixed at open (W-37). */
  readonly ownOrigin: string;
};

export type PlaySessionOptions = SessionParts & {
  /**
   * The Play API base, the configuration's `playApiBaseUrl` (`https:`, or
   * `http:` on a loopback host only, W-3).
   */
  readonly playApiBaseUrl: string;
  /** The platform `fetch`; every request follows W-3's rules (play-client). */
  readonly fetch: FetchLike;
  /** Each request's timeout (W-43); play-client's 15 s by default. */
  readonly requestTimeoutMs?: number;
};

/** The session over a given Play API transport (the tests' scripted one). */
export type SessionOverOptions = SessionParts & {
  readonly transport: Transport;
};
