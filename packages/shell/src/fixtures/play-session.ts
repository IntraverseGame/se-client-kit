// Test-only: a session opened over the scripted Play API, with a manual wall
// clock, fake locks, a seeded key source, and a round issued for the session's
// own key (so W-26 passes) with every RPC endpoint agreeing on its chain
// (session-round.ts).

import {
  type PlayRequest,
  type PlayResponse,
  ProblemError,
} from "@intraverse/se-client-play-client";

import { takeLaunchCode } from "../launch-code.ts";
import { openSessionOver } from "../play-session.ts";
import type { SessionParts } from "../session-options.ts";
import type { PlaySession, SessionOpening } from "../session-types.ts";
import { createFakeLockManager } from "./fake-locks.ts";
import { createFakePlay, type FakePlay, type Responder } from "./fake-play.ts";
import { recordingRandom, seededUuids } from "./seeded.ts";
import { agreeingRpc, issued } from "./session-round.ts";
import { createWallClock } from "./wall-clock.ts";

export const NOW: number = Date.parse("2026-10-16T12:00:00.000Z");
export const LAUNCH = "https://play.example.com/l";
export const CODE = "lc_e2eFixtureCodeOfNoValue";
const SESSION_ID = `ses_${"ab".repeat(16)}`;
export const TOKEN = "pt_fixtureTokenOfNoValue";
export const GAME = "https://game.example.net";
/** The Wrapper's own origin, the SE origin. */
export const SE_ORIGIN = "https://play.example.com";

/**
 * The redeem answer, with `gameOrigin` as D (the session's only source) and,
 * when given, `gamePath` as the path of the game's page on D.
 */
export const redeemed =
  (
    now: () => number,
    gameOrigin: string = GAME,
    gamePath?: string,
  ): Responder =>
  (): PlayResponse => ({
    status: 200,
    body: {
      sessionId: SESSION_ID,
      playToken: TOKEN,
      tokenExpiresAt: "2026-10-16T12:15:00.000Z",
      sessionExpiresAt: "2026-10-16T14:00:00.000Z",
      gameOrigin,
      ...(gamePath === undefined ? {} : { gamePath }),
    },
    receivedAtMs: now(),
    clockOffsetMs: 0,
  });

export type Opened = {
  readonly opening: SessionOpening;
  readonly play: FakePlay;
  readonly events: readonly string[];
  readonly clock: ReturnType<typeof createWallClock>;
};

export type Overrides = Partial<SessionParts> & {
  readonly href?: string;
  readonly play?: FakePlay;
  readonly redeem?: Responder;
  /** D, as the redeem answers it (`GAME` by default). */
  readonly gameOrigin?: string;
};

export const open = async (overrides: Overrides = {}): Promise<Opened> => {
  const { gameOrigin: _answered, ...parts } = overrides;
  const events: string[] = [];
  const clock = createWallClock(NOW);
  const play = overrides.play ?? createFakePlay();
  play.answer(
    "redeemLaunchCode",
    overrides.redeem ?? redeemed(clock.now, overrides.gameOrigin),
  );
  const href = overrides.href ?? `${LAUNCH}#${CODE}`;
  const url = new URL(href);
  const transport = {
    send: (request: Parameters<FakePlay["transport"]["send"]>[0]) => {
      events.push(`send ${request.path}`);
      return play.transport.send(request);
    },
  };
  const launchCode = takeLaunchCode(
    { href: url.href, hash: url.hash },
    {
      replaceState: (_data, _unused, next) => {
        events.push(`replace ${next}`);
      },
    },
  );
  const opening = await openSessionOver({
    launchCode,
    transport,
    clock,
    config: issued.config,
    locks: createFakeLockManager(),
    randomUuid: seededUuids(3),
    random: recordingRandom(1),
    rpc: agreeingRpc,
    bindMode: "tip",
    gameOrigins: [GAME],
    ownOrigin: SE_ORIGIN,
    ...parts,
  });
  return { opening, play, events, clock };
};

export const sessionOf = (opened: Opened): PlaySession => {
  if (opened.opening.kind !== "open") {
    throw new TypeError(`fixture: ${opened.opening.kind}`);
  }
  return opened.opening.session;
};

/** The `actionKey` a request's body sent, lowercase. */
export const actionKeyOf = (request: PlayRequest | undefined): string => {
  const body = request?.body as { readonly actionKey?: unknown } | undefined;
  return typeof body?.actionKey === "string"
    ? body.actionKey.toLowerCase()
    : "";
};

/** A `ROUND_ACTIVE` problem with the vendored body, embedded Snapshot included. */
export const problem409 =
  (body: unknown): Responder =>
  request => {
    throw new ProblemError(
      request,
      { status: 409, code: "ROUND_ACTIVE", retryable: false },
      body,
    );
  };

export const settleMany = async (): Promise<void> => {
  for (let turn = 0; turn < 20; turn += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each turn is one more microtask
    await Promise.resolve();
  }
};
