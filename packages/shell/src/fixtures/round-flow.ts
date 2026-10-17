// Test-only: a round flow against the scripted Play API. The round is the
// vendored `active` round issued again by a seeded registry key with the
// session's own action key (so W-26 passes), optionally with more steps (the
// config is not signed). The tip check is a stand-in decision, and the
// typedData encoder is the canonical one, wrapped to record what it got.

import type { PlayRequest } from "@intraverse/se-client-play-client";
import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import type { RoundFlow } from "../round-flow.ts";
import { startRoundFlow, type StartRoundFlowOptions } from "../round-start.ts";
import { createFakePlay, type FakePlay, ok } from "./fake-play.ts";
import {
  type ChainDecision,
  recordingEncoder,
  TIP_PASSED,
} from "./flow-stand-ins.ts";
import {
  issueRound,
  type IssuedRound,
  type RoundParts,
  ROUND_REQUEST,
} from "./round-auth.ts";
import { reread } from "./round-edits.ts";
import { seededUuids } from "./seeded.ts";
import { openTestSession, type TestSessionOverrides } from "./session.ts";

/** Three steps of three options: a round that can cash out. */
export const THREE_STEPS: readonly {
  readonly index: number;
  readonly optionCount: number;
  readonly multiplier: number;
}[] = [0, 1, 2].map(index => ({ index, optionCount: 3, multiplier: 1.4 }));

export type FlowSetup = {
  readonly session: Awaited<ReturnType<typeof openTestSession>>;
  /** The action key the round was issued for (the session's address). */
  readonly actionKey: StartRoundFlowOptions["config"]["runtimeSigner"];
  readonly issued: IssuedRound;
  readonly play: FakePlay;
  readonly encoder: ReturnType<typeof recordingEncoder>;
  readonly options: StartRoundFlowOptions;
  /** The flow's test hooks: the recording encoder. */
  readonly hooks: NonNullable<Parameters<typeof startRoundFlow>[1]>;
  /** A later read of the round: same proofs, with `edit` applied. */
  readonly read: (edit: (parts: RoundParts) => void) => ValidSnapshot;
  /** The round `active` at `step`. */
  readonly at: (step: number) => ValidSnapshot;
  /** The round closed with `status` after `step` moves. */
  readonly closed: (
    status: "won" | "lost" | "canceled",
    step: number,
    closeReason?: "expired",
  ) => ValidSnapshot;
  /** The round with its `CreateRoundAuth` re-issued (another `expiry`). */
  readonly reissued: () => ValidSnapshot;
};

export type FlowSetupOptions = {
  readonly session?: TestSessionOverrides;
  readonly steps?: typeof THREE_STEPS;
  readonly tip?: ChainDecision;
  /** Edits applied after the round is signed (to make a check fail). */
  readonly after?: (parts: RoundParts) => void;
};

const HEX32 = (byte: string): string => `0x${byte.repeat(32)}`;

export const setUpFlow = async (
  setup: FlowSetupOptions = {},
): Promise<FlowSetup> => {
  const session = await openTestSession(setup.session);
  const actionKey =
    session.state() === "signing" ? session.address() : ROUND_REQUEST.actionKey;
  const issued = issueRound({
    before: p => {
      p.newRound["actionKey"] = actionKey.toLowerCase();
      if (setup.steps !== undefined) {
        (p.input["config"] as Record<string, unknown>)["steps"] =
          structuredClone(setup.steps);
      }
    },
    ...(setup.after === undefined ? {} : { after: setup.after }),
  });
  const play = createFakePlay();
  const encoder = recordingEncoder();
  const tip = setup.tip ?? TIP_PASSED;
  const options: StartRoundFlowOptions = {
    session,
    transport: play.transport,
    authorization: () => "Bearer placeholder",
    config: issued.config,
    tipCheck: () => Promise.resolve(tip),
    randomUuid: seededUuids(7),
    bet: ROUND_REQUEST.bet,
  };
  const read = (edit: (parts: RoundParts) => void): ValidSnapshot =>
    reread(issued.snapshot, edit);
  return {
    session,
    actionKey,
    issued,
    play,
    encoder,
    options,
    hooks: { encodeTypedData: encoder },
    read,
    at: step => read(p => (p.input["step"] = step)),
    closed: (status, step, closeReason) =>
      read(p => {
        p.input["status"] = status;
        p.input["step"] = step;
        if (closeReason !== undefined) p.input["closeReason"] = closeReason;
        if (status !== "canceled") {
          p.randomnessProof["roundSecret"] = HEX32("44");
          p.fairnessProof["seed"] = HEX32("55");
        }
      }),
    reissued: () => read(p => (p.auth["expiry"] = "1800000601")),
  };
};

/** Starts the set-up round: `start` answers its `active` Snapshot. */
export const startFlow = (setup: FlowSetup): Promise<RoundFlow> => {
  setup.play.answer("startRound", ok(setup.issued.snapshot));
  return startRoundFlow(setup.options, setup.hooks);
};

/** A request's JSON body, for a test to read. */
export const bodyOf = (
  request: PlayRequest | undefined,
): Readonly<Record<string, unknown>> => {
  if (request === undefined) throw new TypeError("fixture: no request");
  return request.body as Readonly<Record<string, unknown>>;
};

export const ACCEPTED = { accepted: true } as const;
export const NOT_ACTIVE = { accepted: false, reason: "not_active" } as const;
export const NOT_LEGAL = { accepted: false, reason: "not_legal" } as const;
export const BUSY = { accepted: false, reason: "busy" } as const;

/** A set-up round, started. */
export const started = async (
  options: FlowSetupOptions = {},
): Promise<{ readonly setup: FlowSetup; readonly flow: RoundFlow }> => {
  const setup = await setUpFlow(options);
  return { setup, flow: await startFlow(setup) };
};

/** `list[index]`, or a thrown error: a test reads no absent entry. */
export const nth = <T>(list: readonly T[], index: number): T => {
  const value = list[index];
  if (value === undefined) throw new TypeError(`fixture: no entry ${index}`);
  return value;
};
