// Test-only: what the W-38 hold tests share (T-26): the session round's
// Snapshots at a later `version`, `starting` bound or unbound, re-issued, and
// `resolving`; an RPC transport the test releases, so a tip check can be held
// in flight; a session with the game mounted; and the copies the game was
// sent.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";
import { expect } from "vitest";

import type { RpcTransport } from "../rpc-transport.ts";
import type { PlaySession } from "../session-types.ts";
import { createFakeGame, type FakeGame, HELLO, mountOf } from "./fake-game.ts";
import { type Opened, open, sessionOf } from "./play-session.ts";
import { asStarting } from "./round-auth.ts";
import { reread } from "./round-edits.ts";
import { agreeingRpc, issued } from "./session-round.ts";

export const V: number = issued.snapshot.version;

/** `base` (the session's round by default) with `version` moved on by `by`. */
export const at = (
  by: number,
  base: ValidSnapshot = issued.snapshot,
): ValidSnapshot =>
  reread(base, p => {
    p.input["version"] = base.version + by;
  });

/** The round `starting`, bound (it carries `proofs.randomnessProof`). */
export const startingBound = (): ValidSnapshot =>
  reread(issued.snapshot, asStarting);

/** The round `starting` with no proofs yet: the tip check waits for one. */
export const startingUnbound = (): ValidSnapshot =>
  reread(issued.snapshot, p => {
    asStarting(p);
    p.input["version"] = V - 1;
    delete p.input["proofs"];
  });

/** The round re-issued (a later `CreateRoundAuth`, W-26), still `active`. */
export const reissued = (): ValidSnapshot =>
  reread(issued.snapshot, p => {
    p.input["version"] = V + 1;
    p.auth["expiry"] = "1800000601";
  });

/** The round `resolving`, `by` versions on. */
export const resolving = (by: number): ValidSnapshot =>
  reread(issued.snapshot, p => {
    p.input["version"] = V + by;
    p.input["status"] = "resolving";
  });

/** The round `won`, `by` versions on (its secret and seed shown). */
export const won = (by: number): ValidSnapshot =>
  reread(issued.snapshot, p => {
    p.input["version"] = V + by;
    p.input["status"] = "won";
    p.randomnessProof["roundSecret"] = `0x${"44".repeat(32)}`;
    p.fairnessProof["seed"] = `0x${"55".repeat(32)}`;
  });

/** An RPC transport over `inner` that answers only once `open` is called. */
export const gated = (
  inner: RpcTransport,
): { readonly rpc: RpcTransport; readonly open: () => void } => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  return {
    rpc: async (endpoint, call) => {
      await gate;
      return inner(endpoint, call);
    },
    open: () => release?.(),
  };
};

export type Copy = { readonly status: unknown; readonly version: unknown };

/** The status and version of every Snapshot the game was sent, in order. */
export const copies = (game: FakeGame): Copy[] =>
  game.posted
    .map(entry => entry.message as Record<string, unknown>)
    .filter(message => message["type"] === "snapshot")
    .map(message => {
      const copy = message["snapshot"] as Record<string, unknown>;
      return { status: copy["status"], version: copy["version"] };
    });

/** The `active` copies the game was sent. */
export const activeCopies = (game: FakeGame): Copy[] =>
  copies(game).filter(copy => copy.status === "active");

export type Mounted = Opened & {
  readonly session: PlaySession;
  readonly game: FakeGame;
};

/** A session over `rpc` with the game mounted and its `hello` answered. */
export const mounted = async (
  rpc: RpcTransport = agreeingRpc,
): Promise<Mounted> => {
  const opened = await open({ rpc });
  const session = sessionOf(opened);
  const game = createFakeGame();
  expect(session.mountGame(mountOf(game)).ok).toBe(true);
  game.send(HELLO);
  return { ...opened, session, game };
};
