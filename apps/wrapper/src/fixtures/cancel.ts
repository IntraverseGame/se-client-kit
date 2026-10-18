// Test-only: the shell's required cancel as the Wrapper's tests script it
// (W-25, W-33, W-35): a failed round whose cancel is in a given state, later
// Snapshots of the round, and how many reads the session served over time.

import type {
  CancelState,
  RoundState,
  SessionRead,
  ValidSnapshot,
} from "@intraverse/se-client-shell";

import { snapshotRead, validSnapshot } from "./fake-session.ts";
import { ACTIVE, activeId, round, type Wired, wired } from "./wired.ts";

export const active: ValidSnapshot = validSnapshot(ACTIVE);

/** A later Snapshot of the round, with `fields`. */
export const roundRead = (
  fields: Partial<ValidSnapshot>,
  later = 1,
): SessionRead => ({
  kind: "snapshot",
  snapshot: {
    ...active,
    ...fields,
    roundId: activeId,
    version: active.version + later,
  } as ValidSnapshot,
});

export const canceledRead = (later = 2): SessionRead =>
  roundRead(
    {
      ...validSnapshot("coinflip-canceled"),
      bet: active.bet,
      context: active.context,
    },
    later,
  );

/** A round the shell failed (only its tip check), with its cancel `cancel`. */
export const failedWith = (cancel: CancelState): RoundState =>
  round({ verdict: "failed", shown: "verification-failed", cancel });

/** The UI on a failed round whose cancel is `cancel`, read once. */
export const onCancel = (
  cancel: CancelState,
  first: SessionRead = snapshotRead(ACTIVE),
): Promise<Wired> =>
  wired(fake => {
    fake.reads.push(first);
    fake.setRound(failedWith(cancel));
  });

/** The reads the session served while the clock moved `ms`. */
export const readsOver = async (ui: Wired, ms: number): Promise<number> => {
  const before = ui.fake.served();
  await ui.step(ms);
  return ui.fake.served() - before;
};
