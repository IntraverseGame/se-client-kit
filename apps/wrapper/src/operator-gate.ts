// The operator gate (W-49a to W-49d, ADR-006): what must hold before the
// session opens. At boot, before the configuration is read, it installs the
// page's one `message` listener (message-dispatch.ts) and, on a framed page,
// the shell's operator channel, which records an early `hello`. Once the
// configuration is validated, `open` decides the framing (embedding.ts) and,
// on a framed page, runs the shell's `check`: where `location.ancestorOrigins`
// proves the one listed parent, the channel opens to it at once (ADR-011);
// where the list is missing, it awaits the `se.operator/1` handshake, with the
// handshake timer on the injected clock. Until it resolves open, nothing is
// redeemed, started, signed, mounted, or offered. Once open and framed, the
// content's height is sent to the operator page (`resize`).

import {
  createOperatorChannel,
  type HandshakeRefusal,
  type OperatorWindow,
} from "@intraverse/se-client-shell";

import {
  checkEmbedding,
  type EmbeddingContext,
  type EmbeddingRefusal,
} from "./embedding.ts";
import type { EnvironmentConfig } from "./environment-config.ts";
import {
  createMessageDispatch,
  type MessageDispatch,
  type MessageTarget,
} from "./message-dispatch.ts";
import type { LinkRules } from "./operator-links.ts";
import type { Timers } from "./timers.ts";

export type OperatorGateOptions = {
  /** The page's `message` events. */
  readonly window: MessageTarget;
  /**
   * The page's framing (W-49a). Without it, the framing is unknown, and the
   * gate never opens a session (fail closed).
   */
  readonly embedding?: EmbeddingContext;
  /** `window.parent`, when the page is framed: the operator page. */
  readonly parent?: OperatorWindow;
  /** The handshake timer's clock (W-49c). */
  readonly timers: Timers;
  /** The handshake timeout; the shell's 10 s unless given. */
  readonly handshakeTimeoutMs?: number;
  /** Observes the content's height once the handshake is accepted (W-49d). */
  readonly observeHeight?: (onHeight: (height: number) => void) => void;
};

/** Why the gate stays shut; logged as `embedding.refused`. */
export type GateRefusal = EmbeddingRefusal | HandshakeRefusal;

export type GateOutcome =
  /** Open: the lobby and deposit rules for the UI (W-49e). */
  | { readonly ok: true; readonly links: LinkRules }
  | { readonly ok: false; readonly reason: GateRefusal };

export type OperatorGate = {
  /** The page's one `message` listener, for the game frame's route. */
  readonly messages: MessageDispatch;
  /**
   * Decides the framing; on a framed page, opens to a proven parent origin or
   * awaits the handshake.
   */
  readonly open: (config: EnvironmentConfig) => Promise<GateOutcome>;
};

/**
 * A parent the platform did not give: no event has it as its source, so the
 * handshake can only time out (fail closed).
 */
const UNREACHABLE: OperatorWindow = Object.freeze({ postMessage: () => {} });

export const createOperatorGate = (
  options: OperatorGateOptions,
): OperatorGate => {
  const { embedding } = options;
  const framed = embedding?.framed === true;
  const parent = framed ? (options.parent ?? UNREACHABLE) : undefined;
  const messages = createMessageDispatch(options.window, parent);
  const channel =
    parent === undefined ? undefined : createOperatorChannel({ parent });
  if (channel !== undefined) messages.onOperator(channel.receive);

  const open = async (config: EnvironmentConfig): Promise<GateOutcome> => {
    if (embedding === undefined) {
      return { ok: false, reason: "ancestors-unknown" };
    }
    const verdict = checkEmbedding(embedding, config.operatorOrigins);
    if (!verdict.ok) return verdict;
    const links: LinkRules = Object.freeze({
      framed,
      operatorOrigins: config.operatorOrigins,
    });
    if (verdict.framing === "standalone") return { ok: true, links };
    // A page the verdict holds framed but with no channel to check, or a
    // proven parent origin the platform gave no window for: nothing could be
    // posted to the operator, so the framing stays unknown (fail closed).
    if (
      channel === undefined ||
      (verdict.framing === "proven" && options.parent === undefined)
    ) {
      return { ok: false, reason: "ancestors-unknown" };
    }
    const outcome = await channel.check({
      operatorOrigins: config.operatorOrigins,
      // The proven path gives the channel the one entry it opens to; the
      // handshake path has no list.
      ancestorOrigins:
        verdict.framing === "proven" ? [verdict.operatorOrigin] : undefined,
      clock: options.timers,
      ...(options.handshakeTimeoutMs === undefined
        ? {}
        : { timeoutMs: options.handshakeTimeoutMs }),
    });
    if (!outcome.ok) return outcome;
    options.observeHeight?.(height => {
      channel.resize(height);
    });
    return { ok: true, links };
  };

  return Object.freeze({ messages, open });
};
