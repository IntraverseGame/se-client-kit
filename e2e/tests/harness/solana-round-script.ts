import type { FrameLocator, Page } from "@playwright/test";

import type { FakePlayApi } from "./fake-play-types.ts";
import type { Answer } from "./fake-play-wire.ts";
import {
  advanceUntil,
  documentAnswer,
  gameFrame,
  snapshotAnswer,
} from "./round-play.ts";
import { startCheck } from "./round-vector.ts";
import {
  solanaCancelCheck,
  solanaRound,
  type SolanaRoundCase,
} from "./solana-round.ts";
import { isPlayable, launchAndStart } from "./wrapper-page.ts";

const ACTIVE = "coinflip-active-ready-hash";
const RESOLVING = "coinflip-resolving-cancel";

export const scriptSolanaRound = (
  fake: FakePlayApi,
  round: SolanaRoundCase = "produced-slot",
): void => {
  fake.answer("getSnapshot", snapshotAnswer("coinflip-idle"));
  fake.answer(
    "startRound",
    documentAnswer(solanaRound(round, ACTIVE), startCheck),
  );
  fake.answerEvery("getSnapshot", documentAnswer(solanaRound(round, ACTIVE)));
};

export const scriptSolanaCancel = (
  fake: FakePlayApi,
  reads: readonly Answer<"getSnapshot">[],
  round: SolanaRoundCase = "produced-slot",
): void => {
  fake.answer("getSnapshot", snapshotAnswer("coinflip-idle"), ...reads);
  fake.answer(
    "startRound",
    documentAnswer(solanaRound(round, ACTIVE), startCheck),
  );
  fake.answer(
    "cancelRound",
    documentAnswer(solanaRound(round, RESOLVING), solanaCancelCheck(round)),
  );
};

export const solanaToReady = async (
  page: Page,
  fake: FakePlayApi,
  round: SolanaRoundCase = "produced-slot",
): Promise<FrameLocator> => {
  scriptSolanaRound(fake, round);
  await launchAndStart(page, fake);
  await advanceUntil(page, () => isPlayable(page));
  return gameFrame(page);
};
