// Opening the session the Wrapper UI plays through (W-1 to W-14): it redeems
// the launch code `takeLaunchCode` took out of the URL (before any other
// request, launch-code.ts) once, takes the signer lock, holds the play token
// and runs its refresh (token-keeper.ts), and hands the UI the session's use
// cases and read-only state (session-play.ts). Nothing it returns holds or
// reveals the key, the token, the launch code, a signature, the transcript,
// or a signing capability: the session object is frozen and prints
// `[redacted]`.
//
// It logs nothing and emits nothing but its change and end notices to the
// listeners the composition root registers.

import {
  createTransport,
  endsSession,
  ProblemError,
  redeemLaunchCode,
  type Transport,
} from "@intraverse/se-client-play-client";

import {
  REGISTRY_DOMAIN_NAME,
  REGISTRY_DOMAIN_VERSION,
} from "./create-round-auth.ts";
import {
  disposeSecret,
  type PlayToken,
  revealSecret,
  sealSecret,
} from "./redaction.ts";
import type { RoundFlowOptions } from "./round-flow.ts";
import type {
  PlaySessionOptions,
  SessionOverOptions,
} from "./session-options.ts";
import { createPlaySession } from "./session-play.ts";
import { sessionTipCheck } from "./session-tip.ts";
import type { SessionOpening } from "./session-types.ts";
import { openSigningSession } from "./signing-session.ts";
import { createTokenKeeper } from "./token-keeper.ts";

/** The path of a game at its origin's root, when the redeem answer has none. */
const ROOT_GAME_PATH = "/";

const opening = (
  kind: Exclude<SessionOpening["kind"], "open">,
): SessionOpening => Object.freeze({ kind });

/**
 * Opens the session (W-1, W-2, W-14). With no launch code, nothing is sent. The
 * redeem is sent once and never repeated, and its token is sealed at once. A
 * tab that does not get the signer lock forgets the token and opens nothing: it
 * does not sign, refresh, or poll. A Play API base the request rules refuse
 * throws before anything is sent.
 */
export const openPlaySession = (
  options: PlaySessionOptions,
): Promise<SessionOpening> => {
  const { playApiBaseUrl, fetch, requestTimeoutMs, ...parts } = options;
  const transport = createTransport({
    baseUrl: playApiBaseUrl,
    fetch,
    clock: options.clock,
    ...(requestTimeoutMs === undefined ? {} : { timeoutMs: requestTimeoutMs }),
  });
  return openSessionOver({ ...parts, transport });
};

/**
 * `openPlaySession` over a given transport: the shell's own entry for it, and
 * the tests' (a scripted Play API).
 */
export const openSessionOver = async (
  options: SessionOverOptions,
): Promise<SessionOpening> => {
  const code = options.launchCode;
  if (code === undefined) return opening("no-launch-code");

  let redeemed;
  try {
    redeemed = await redeemLaunchCode(
      options.transport,
      { launchCode: revealSecret(code) },
      { seal: (token: string): PlayToken => sealSecret("play-token", token) },
    );
  } catch {
    // Refused, lost, or unreadable: a code cannot be redeemed twice (W-2).
    return opening("redeem-failed");
  } finally {
    disposeSecret(code);
  }
  // D, the launched game's origin, comes from this answer only (W-37);
  // play-client refused an answer without one of the document's bounds. So
  // does the path of the game's page on D: none is D's root.
  const { sessionId, playToken, tokenExpiresAt, gameOrigin } = redeemed.body;
  const gamePath = redeemed.body.gamePath ?? ROOT_GAME_PATH;

  const { registryDomain } = options.config;
  const signing = await openSigningSession({
    sessionId,
    locks: options.locks,
    randomUuid: options.randomUuid,
    ...(options.random === undefined ? {} : { random: options.random }),
    domain: {
      name: REGISTRY_DOMAIN_NAME,
      version: REGISTRY_DOMAIN_VERSION,
      chainId: registryDomain.chainId,
      verifyingContract: registryDomain.verifyingContract,
    },
  });
  const lock = signing.state();
  if (lock !== "signing") {
    disposeSecret(playToken);
    signing.end();
    return opening(lock === "held-elsewhere" ? "other-tab" : "unsupported");
  }

  // Set once the session exists; the keeper calls it when the session ends.
  const ending: { notify?: () => void } = {};
  const keeper = createTokenKeeper(
    {
      transport: options.transport,
      clock: options.clock,
      ...(options.refresh === undefined ? {} : { refresh: options.refresh }),
      onEnd: () => {
        signing.end();
        ending.notify?.();
      },
    },
    {
      playToken,
      tokenExpiresAt,
      receivedAtMs: redeemed.receivedAtMs,
      clockOffsetMs: redeemed.clockOffsetMs,
    },
  );

  // Every call but the redeem: an answer that ends the session ends it here,
  // whichever call got it (W-7, W-42).
  const transport: Transport = Object.freeze({
    send: async (request: Parameters<Transport["send"]>[0]) => {
      try {
        return await options.transport.send(request);
      } catch (error) {
        if (error instanceof ProblemError && endsSession(error.problem)) {
          keeper.end();
        }
        throw error;
      }
    },
  });

  const flow: RoundFlowOptions = {
    session: signing,
    transport,
    authorization: keeper.authorization,
    config: options.config,
    tipCheck: sessionTipCheck(options),
  };
  const handle = createPlaySession({
    flow,
    randomUuid: options.randomUuid,
    gameOrigin,
    gamePath,
    gameOrigins: options.gameOrigins,
    ownOrigin: options.ownOrigin,
    // The accepted configuration's, never the UI's (W-37's loopback exemption).
    environment: options.config.environment,
    ended: keeper.ended,
    end: keeper.end,
  });
  ending.notify = handle.notifyEnd;
  return Object.freeze({ kind: "open", session: handle.session });
};
