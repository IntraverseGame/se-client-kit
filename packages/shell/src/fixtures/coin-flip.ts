// Test-only: the vendored Coin Flip round (`valid/coinflip-active-ready-hash`)
// as the shell would hold it after its start, with no typedData encoder passed
// (the production default), against the scripted Play API.

import type { ChainDecision } from "../chain-decision.ts";
import { createRoundFlow, type RoundFlow } from "../round-flow.ts";
import type { SigningSession } from "../signing-session.ts";
import { createFakePlay, type FakePlay } from "./fake-play.ts";
import { ROUND_REQUEST, roundConfig, vendoredRound } from "./round-auth.ts";
import { openTestSession } from "./session.ts";
import { ROUND_ID } from "./vectors.ts";

export const coinFlip = async (
  tip: ChainDecision,
): Promise<{
  readonly flow: RoundFlow;
  readonly play: FakePlay;
  readonly session: SigningSession;
}> => {
  const play = createFakePlay();
  const session = await openTestSession();
  const flow = createRoundFlow(
    {
      session,
      transport: play.transport,
      authorization: (): string => "Bearer placeholder",
      config: roundConfig(),
      tipCheck: () => Promise.resolve(tip),
    },
    { roundId: ROUND_ID, request: ROUND_REQUEST },
    vendoredRound(),
  );
  return { flow, play, session };
};
