// Test-only: the game's copies of the Cash or Crash `[3,3,4]` Snapshots, as the
// bridge builds them from the `snapshot/valid/cashorcrash-*` vectors (only
// W-38's allow-listed fields): the states of row 2 (an index of 1 here, the
// second row), the loss, the win by cash-out, and the win by the time limit.
// Written out by hand: the game's tests take nothing of the kit at run time.

import type {
  GameSnapshot,
  GameStep,
  RoundStatus,
} from "@intraverse/se-client-shell/controller";

const ROUND_ID = "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d";

const rows = (
  first: Partial<GameStep>,
  second: Partial<GameStep>,
  third: Partial<GameStep>,
): readonly GameStep[] => [
  { index: 0, optionCount: 3, multiplier: 1.455, ...first },
  { index: 1, optionCount: 3, multiplier: 2.182, ...second },
  { index: 2, optionCount: 4, multiplier: 2.909, ...third },
];

const base = (
  version: number,
  status: RoundStatus,
  steps: readonly GameStep[],
  extra: Partial<GameSnapshot> = {},
): GameSnapshot => ({
  version,
  presentation: "steps",
  status,
  context: { language: "de", device: "desktop", theme: {} },
  config: { kind: "steps", steps },
  ...extra,
});

/** The first row survived (tile 2 picked, tile 1 was the crash); row 1 is next. */
const SURVIVED_FIRST = { selectedIndex: 2, losingIndex: 1 } as const;

export const CASH_OR_CRASH = {
  idle: base(1, "idle", rows({}, {}, {})),
  active: base(3, "active", rows(SURVIVED_FIRST, {}, {}), {
    roundId: ROUND_ID,
    step: 1,
    currentMultiplier: 1.455,
  }),
  resolving: base(
    4,
    "resolving",
    rows(SURVIVED_FIRST, { selectedIndex: 0 }, {}),
    { roundId: ROUND_ID, step: 1, currentMultiplier: 1.455 },
  ),
  lost: base(
    5,
    "lost",
    rows(
      SURVIVED_FIRST,
      { selectedIndex: 1, losingIndex: 1 },
      { losingIndex: 0 },
    ),
    { roundId: ROUND_ID, step: 2, currentMultiplier: 0 },
  ),
  wonByCashOut: base(
    6,
    "won",
    rows(
      SURVIVED_FIRST,
      { selectedIndex: 0, losingIndex: 2 },
      { losingIndex: 3 },
    ),
    { roundId: ROUND_ID, step: 2, currentMultiplier: 2.182 },
  ),
  wonExpired: base(
    5,
    "won",
    rows(SURVIVED_FIRST, { losingIndex: 0 }, { losingIndex: 3 }),
    {
      roundId: ROUND_ID,
      step: 1,
      currentMultiplier: 1.455,
      closeReason: "expired",
    },
  ),
} as const satisfies Readonly<Record<string, GameSnapshot>>;
