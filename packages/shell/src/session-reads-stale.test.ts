// W-29 at an action's answer (#146): `settle` shows the action's own stale
// answer (so the UI drops it and reads again), never a stale read left from an
// earlier action, as when an action is decided only through the cancel's reads,
// which observe nothing. A stand-in round and reader; no Play API.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";
import { describe, expect, it } from "vitest";

import { snapshot } from "./fixtures/vectors.ts";
import { beforeOf, createSessionReads } from "./session-reads.ts";
import type { SessionRound } from "./session-round.ts";
import type { SnapshotReader } from "./snapshot-read.ts";

const latest = snapshot("active");
const staleRead = { ...latest, version: latest.version - 1 } as ValidSnapshot;

/** An absent value, read without writing `undefined` (no-useless-undefined). */
const NONE: { readonly value?: never } = {};

/** A round whose latest is `latest` and whose last read was `stale`. */
const roundWith = (state: { stale: ValidSnapshot | undefined }): SessionRound =>
  ({
    roundId: latest.roundId,
    latest: () => latest,
    staleRead: () => state.stale,
    lastError: () => NONE.value,
    cancel: () => "none",
  }) as unknown as SessionRound;

const reads = (flow: SessionRound) =>
  createSessionReads({
    reader: {
      read: () => Promise.resolve({ kind: "network" }),
      latest: () => NONE.value,
    } as SnapshotReader,
    current: () => flow,
    bridge: () => NONE.value,
    ended: () => false,
    onChange: () => {},
  });

describe("an action's answer and a stale read (W-29)", () => {
  it("shows the action's own stale answer", () => {
    const state: { stale: ValidSnapshot | undefined } = { stale: undefined };
    const flow = roundWith(state);
    const before = beforeOf(flow);
    state.stale = staleRead;
    expect(reads(flow).settle(flow, before)).toEqual({
      kind: "snapshot",
      snapshot: staleRead,
    });
  });

  it("shows the round's latest, not a stale read left from an earlier action", () => {
    const state = { stale: staleRead };
    const flow = roundWith(state);
    const before = beforeOf(flow);
    expect(reads(flow).settle(flow, before)).toEqual({
      kind: "snapshot",
      snapshot: latest,
    });
  });
});
