// Test-only: the game's copies of the Coin Flip Snapshots, as the bridge builds
// them from the `snapshot/valid/coinflip-*` vectors (only W-38's allow-listed
// fields), and the messages that carry them. Written out by hand: the game's
// tests take nothing of the kit at run time.

import type {
  GameSnapshot,
  GameStep,
  RejectReason,
  RoundStatus,
} from "@intraverse/se-client-shell/controller";

const ROUND_ID = "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d";

const coin = (fields: Partial<GameStep> = {}): GameStep => ({
  index: 0,
  optionCount: 2,
  multiplier: 1.94,
  ...fields,
});

const base = (
  version: number,
  status: RoundStatus,
  step: GameStep,
  extra: Partial<GameSnapshot> = {},
): GameSnapshot => ({
  version,
  presentation: "steps",
  status,
  context: { language: "de", device: "desktop", theme: {} },
  config: { kind: "steps", steps: [step] },
  ...extra,
});

/** One copy per status, with the vectors' versions and reveals. */
export const SNAPSHOTS = {
  idle: base(1, "idle", coin()),
  starting: base(2, "starting", coin(), { roundId: ROUND_ID }),
  active: base(3, "active", coin(), {
    roundId: ROUND_ID,
    step: 0,
    currentMultiplier: 1,
  }),
  resolving: base(4, "resolving", coin({ selectedIndex: 1 }), {
    roundId: ROUND_ID,
    step: 0,
    currentMultiplier: 1,
  }),
  won: base(5, "won", coin({ selectedIndex: 1, losingIndex: 0 }), {
    roundId: ROUND_ID,
    step: 1,
    currentMultiplier: 1.94,
  }),
  lost: base(5, "lost", coin({ selectedIndex: 0, losingIndex: 0 }), {
    roundId: ROUND_ID,
    step: 1,
    currentMultiplier: 0,
  }),
  canceled: base(5, "canceled", coin({ losingIndex: 0 }), {
    roundId: ROUND_ID,
    step: 0,
  }),
  canceledExpired: base(5, "canceled", coin({ losingIndex: 1 }), {
    roundId: ROUND_ID,
    step: 0,
    closeReason: "expired",
  }),
} as const satisfies Readonly<Record<string, GameSnapshot>>;

/** A copy of `snapshot` with `fields` replaced, for one test's variation. */
export const withFields = (
  snapshot: GameSnapshot,
  fields: Readonly<Record<string, unknown>>,
): Record<string, unknown> => ({ ...snapshot, ...fields });

/** A `snapshot` message as the bridge sends it. */
export const snapshotMessage = (
  snapshot: unknown,
): Record<string, unknown> => ({
  schema: "se.controller/1",
  type: "snapshot",
  snapshot,
});

/** A `reject` message as the bridge sends it. */
export const rejectMessage = (
  id: string,
  reason: RejectReason,
): Record<string, unknown> => ({
  schema: "se.controller/1",
  type: "reject",
  id,
  reason,
});
