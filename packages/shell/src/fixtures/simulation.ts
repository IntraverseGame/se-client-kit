// Test-only: a seeded simulation of a round against a network that fails,
// loses responses, and answers `STALE_ACTION`, with retries, cancels against
// moves, and a second tab of the same session. It records every signature the
// shell hands out, so the test can check that no sequence ever has two.

import { provisionalGrammar } from "@intraverse/se-client-signing";

import { ShellError } from "../errors.ts";
import type { PendingAction } from "../pending-action.ts";
import type { RoundSigner } from "../round-signer.ts";
import type { SigningSession } from "../signing-session.ts";
import { seededInts } from "./seeded.ts";
import { snapshot } from "./vectors.ts";

/** The steps of the active Snapshot fixture's round. */
const STEPS = 3;

type Backend = {
  applied: number;
  status: "active" | "won" | "lost" | "canceled";
};

export type SimulationLog = {
  /** Every distinct signed action, in the order it was first handed out. */
  readonly signed: readonly PendingAction[];
  /** The error codes the shell refused with, by count. */
  readonly refusals: ReadonlyMap<string, number>;
  /** How often a tab without the lock got to use the key: must be 0. */
  readonly keyUsesWithoutLock: number;
};

type Tab = {
  readonly session: SigningSession;
  readonly round: RoundSigner | undefined;
};

const current = (backend: Backend): ReturnType<typeof snapshot> =>
  backend.status === "active"
    ? snapshot("active", { step: backend.applied })
    : snapshot(backend.status);

/** The backend's answer to a sent action: it applies only the next one. */
const apply = (
  backend: Backend,
  action: PendingAction,
  lose: boolean,
): boolean => {
  if (backend.status !== "active") return false;
  if (action.kind === "cancel") {
    if (backend.applied !== 0) return false;
    backend.status = "canceled";
    return true;
  }
  if (action.message.sequence !== backend.applied + 1) return false;
  if (action.kind === "cash-out") {
    backend.status = "won";
    return true;
  }
  backend.applied += 1;
  if (lose) backend.status = "lost";
  return true;
};

type Run = {
  readonly next: (bound: number) => number;
  readonly backend: Backend;
  readonly signed: PendingAction[];
  readonly seen: Set<PendingAction>;
  readonly refusals: Map<string, number>;
  keyUsesWithoutLock: number;
};

const attempt = (
  run: Run,
  sign: () => PendingAction,
): PendingAction | undefined => {
  try {
    const action = sign();
    if (!run.seen.has(action)) {
      run.seen.add(action);
      run.signed.push(action);
    }
    return action;
  } catch (error) {
    refuse(run, error);
    return undefined;
  }
};

const refuse = (run: Run, error: unknown): void => {
  if (!(error instanceof ShellError)) throw error;
  run.refusals.set(error.code, (run.refusals.get(error.code) ?? 0) + 1);
};

/** A tab without the lock asks for the key: it must be refused. */
const useWithoutLock = (run: Run, session: SigningSession): void => {
  try {
    session.address();
    run.keyUsesWithoutLock += 1;
  } catch (error) {
    refuse(run, error);
  }
};

const nextRequest = (
  run: Run,
  round: RoundSigner,
): Parameters<RoundSigner["sign"]>[0] => {
  const done = round.nextSequence() - 1;
  if (done >= 1 && run.next(4) === 0) {
    return { kind: "cash-out", action: provisionalGrammar.cashOut(), path: [] };
  }
  const row = Math.min(done, STEPS - 1);
  return {
    kind: "action",
    action: provisionalGrammar.pick(row, run.next(3)),
    path: [row],
  };
};

/** Sends `action` over the simulated network and reads what comes back. */
const send = (run: Run, round: RoundSigner, action: PendingAction): void => {
  const outcome = run.next(5);
  // No response, nothing applied.
  if (outcome === 0) return;
  if (outcome === 4) {
    // `STALE_ACTION`: stop, then read the Snapshot (W-19).
    round.stale();
    round.observe(current(run.backend));
    return;
  }
  apply(run.backend, action, run.next(6) === 0);
  // Applied, but the response was lost.
  if (outcome === 1) return;
  round.observe(current(run.backend));
};

const step = (run: Run, tab: Tab): void => {
  const { round } = tab;
  if (round === undefined) return;
  const op = run.next(5);
  if (op === 0) {
    const action = attempt(run, () => round.signCancel());
    if (action !== undefined) send(run, round, action);
  } else if (op === 1) {
    const pending = round.pending();
    if (pending !== undefined) send(run, round, pending);
  } else if (op === 2) {
    round.observe(current(run.backend));
  } else {
    const request = nextRequest(run, round);
    const action = attempt(run, () => round.sign(request));
    if (action !== undefined) send(run, round, action);
  }
};

/**
 * Runs `steps` seeded operations, each on one of `tabs` at random. A tab
 * without a round (it never got the lock) tries to sign and is refused.
 */
export const simulate = (
  seed: number,
  steps: number,
  tabs: readonly Tab[],
): SimulationLog => {
  const run: Run = {
    next: seededInts(seed),
    backend: { applied: 0, status: "active" },
    signed: [],
    seen: new Set(),
    refusals: new Map(),
    keyUsesWithoutLock: 0,
  };
  for (let i = 0; i < steps; i += 1) {
    const tab = tabs[run.next(tabs.length)];
    if (tab === undefined) throw new RangeError("no tab");
    if (tab.round === undefined) useWithoutLock(run, tab.session);
    else step(run, tab);
  }
  return {
    signed: run.signed,
    refusals: run.refusals,
    keyUsesWithoutLock: run.keyUsesWithoutLock,
  };
};

/** The sequences that have more than one distinct signature. */
export const forkedSequences = (
  signed: readonly PendingAction[],
): readonly number[] => {
  const bySequence = new Map<number, Set<string>>();
  for (const action of signed) {
    const set = bySequence.get(action.message.sequence) ?? new Set<string>();
    set.add(action.signature);
    bySequence.set(action.message.sequence, set);
  }
  return [...bySequence]
    .filter(([, signatures]) => signatures.size > 1)
    .map(([sequence]) => sequence);
};

/**
 * The actions whose `previous` is not the `T` of the action signed at the
 * sequence before (or `T_0` at sequence 1).
 */
export const brokenLinks = (
  signed: readonly PendingAction[],
  initial: string,
): readonly PendingAction[] => {
  const tBySequence = new Map<number, string>([[0, initial]]);
  for (const action of signed) {
    tBySequence.set(action.message.sequence, action.structHash);
  }
  return signed.filter(
    action =>
      action.message.previous !== tBySequence.get(action.message.sequence - 1),
  );
};
