// Test-only: the re-read after a drop (W-29, W-35) as the Wrapper's tests
// script it: a Snapshot of the round at a given `version`, the UI on the
// `active` round, and the move's answer at a lower `version`.

import type { SessionRead, ValidSnapshot } from "@intraverse/se-client-shell";

import { active } from "./cancel.ts";
import { snapshotRead, validSnapshot } from "./fake-session.ts";
import { ACTIVE, round, type Wired, wired } from "./wired.ts";

/** `name`'s Snapshot as a read of the round, at `version`. */
export const at = (name: string, version: number): SessionRead => ({
  kind: "snapshot",
  snapshot: {
    ...validSnapshot(name),
    roundId: active.roundId,
    bet: active.bet,
    context: active.context,
    version,
  } as ValidSnapshot,
});

/** The UI on the `active` round, ready, read once. */
export const onActive = (): Promise<Wired> =>
  wired(fake => {
    fake.reads.push(snapshotRead(ACTIVE));
    fake.setRound(round());
  });

/** The move's answer, `lost`, from a read whose `version` is lower. */
export const lowerLoss = at("coinflip-lost", active.version - 1);
