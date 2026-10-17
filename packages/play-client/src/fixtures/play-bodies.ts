// Request and answer bodies for the operations' tests, typed by the Play API
// document's generated types: a change of the document breaks them at compile
// time. The values are placeholders, not credentials: the token and the launch
// code are markers a test searches for.

import type { PlayApiComponents } from "@intraverse/se-client-contracts";

import type {
  RedeemLaunchCodeResponse,
  RefreshPlayTokenResponse,
  RoundActionRequest,
  StartRoundRequest,
} from "../play-api.ts";
import { FIXTURE_TOKEN, longToken, shortToken } from "./session.ts";

type Snapshot = PlayApiComponents["schemas"]["Snapshot"];

/** A placeholder launch code: only a marker to search for. */
export const FIXTURE_LAUNCH_CODE = "fixture-launch-code-9d4e7b";

/** The refreshed token, another marker. */
export const FIXTURE_NEW_TOKEN = "fixture-play-token-new-31c8d0";

export const redeemAnswer: RedeemLaunchCodeResponse = {
  sessionId: `ses_${"0123456789abcdef".repeat(2)}`,
  playToken: FIXTURE_TOKEN,
  tokenExpiresAt: shortToken.tokenExpiresAt,
  sessionExpiresAt: longToken.tokenExpiresAt,
  gameOrigin: "https://game.example",
};

export const refreshAnswer: RefreshPlayTokenResponse = {
  playToken: FIXTURE_NEW_TOKEN,
  tokenExpiresAt: longToken.tokenExpiresAt,
};

const amount = (value: string): PlayApiComponents["schemas"]["Amount"] => ({
  value,
  decimals: 2,
  unit: "EUR",
  normalized: 0,
  formatted: "display only",
});

/** An `idle` Snapshot. Its amounts are strings of base units. */
export const idleSnapshot: Snapshot = {
  schema: "se.snapshot/1",
  version: 1,
  presentation: "steps",
  model: "config",
  context: {
    sessionId: "ses_fixture",
    language: "en",
    device: "desktop",
    theme: {},
  },
  status: "idle",
  bet: {
    balance: amount("100000"),
    minBet: amount("10"),
    maxBet: amount("10000"),
    suggestedBets: [amount("100")],
    defaultBet: amount("100"),
  },
  config: {
    kind: "steps",
    steps: [{ index: 0, optionCount: 2, multiplier: 1.98 }],
  },
};

const ROUND_ID = "01928f6e-7b1a-7c3d-8e4f-0a1b2c3d4e5f";

/** A `starting` Snapshot of the round the start opened. */
export const startingSnapshot: Snapshot = {
  ...idleSnapshot,
  version: 2,
  status: "starting",
  roundId: ROUND_ID,
};

export const startBody: StartRoundRequest = {
  idempotencyKey: "0f8fad5b-d9cb-469f-a165-70867728950e",
  bet: { value: "100", unit: "EUR" },
  actionKey: `0x${"ab".repeat(20)}`,
};

export const actionBody: RoundActionRequest = {
  idempotencyKey: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  roundId: ROUND_ID,
  typedData: "AAECAw==",
  signature: `0x${"11".repeat(64)}1b`,
};
