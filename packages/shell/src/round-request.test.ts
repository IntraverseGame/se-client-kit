// The body of a signed action fails closed when the message signed is not the
// one its typed data was encoded from (W-16, W-20): the round is failed and
// nothing is returned to send.

import type { TranscriptRequest } from "@intraverse/se-client-signing";
import { describe, expect, it, vi } from "vitest";

import { recordingEncoder } from "./fixtures/flow-stand-ins.ts";
import { openTestSession, openWorkedRound } from "./fixtures/session.ts";
import { ROUND_ID } from "./fixtures/vectors.ts";
import { firstMove } from "./fixtures/worked-round.ts";
import type { RoundSigner } from "./pending-action.ts";
import { signedBody } from "./round-request.ts";

type Message = Parameters<typeof signedBody>[3];

const setUp = async (): Promise<{
  readonly round: RoundSigner;
  readonly encoder: ReturnType<typeof recordingEncoder>;
}> => ({
  round: openWorkedRound(await openTestSession()),
  encoder: recordingEncoder(),
});

/** The message `request` is signed as at sequence 1, with `change` applied. */
const messageOf = (
  round: RoundSigner,
  request: TranscriptRequest,
  change: Partial<Message> = {},
): Message => ({
  action: request.action,
  path: request.path,
  sequence: 1,
  round: round.round,
  previous: round.last(),
  ...change,
});

describe("signedBody", () => {
  it("carries the bytes of the message signed", async () => {
    const { round, encoder } = await setUp();
    const message = messageOf(round, firstMove);
    const fail = vi.fn<() => void>();
    const sent = signedBody(
      encoder,
      ROUND_ID,
      "action",
      message,
      () => round.sign(firstMove),
      fail,
    );
    expect(encoder.calls()).toEqual([{ kind: "action", message }]);
    expect(sent.body.signature).toBe(sent.action.signature);
    expect(sent.body.idempotencyKey).toBe(sent.action.idempotencyKey);
    expect(fail).not.toHaveBeenCalled();
  });

  it.each<[string, Partial<Message>]>([
    ["another previous", { previous: `0x${"11".repeat(32)}` }],
    ["another sequence", { sequence: 2 }],
    ["another path", { path: [1] }],
    ["another text", { action: "pick row 0 tile 0" }],
  ])(
    "refuses %s than the one signed, and fails the round",
    async (_, change) => {
      const { round, encoder } = await setUp();
      const fail = vi.fn<() => void>();
      expect(() =>
        signedBody(
          encoder,
          ROUND_ID,
          "action",
          messageOf(round, firstMove, change),
          () => round.sign(firstMove),
          fail,
        ),
      ).toThrow(expect.objectContaining({ code: "invalid-input" }));
      expect(fail).toHaveBeenCalledOnce();
    },
  );

  // A cash-out's text does not depend on its path, so only the path tells the
  // two messages apart: one path a prefix of the other, either way round.
  it.each<[string, readonly number[], readonly number[]]>([
    ["the encoded path a prefix of the signed one", [0], [0, 1]],
    ["the signed path a prefix of the encoded one", [0, 1], [0]],
  ])("refuses a cash-out with %s", async (_, encoded, signed) => {
    const { round, encoder } = await setUp();
    const request: TranscriptRequest = {
      kind: "cash-out",
      action: "cash out",
      path: signed,
    };
    const fail = vi.fn<() => void>();
    expect(() =>
      signedBody(
        encoder,
        ROUND_ID,
        "cash-out",
        messageOf(round, request, { path: encoded }),
        () => round.sign(request),
        fail,
      ),
    ).toThrow(expect.objectContaining({ code: "invalid-input" }));
    expect(fail).toHaveBeenCalledOnce();
  });

  it("refuses an action of another kind", async () => {
    const { round, encoder } = await setUp();
    const fail = vi.fn<() => void>();
    expect(() =>
      signedBody(
        encoder,
        ROUND_ID,
        "cash-out",
        messageOf(round, firstMove),
        () => round.sign(firstMove),
        fail,
      ),
    ).toThrow(expect.objectContaining({ code: "invalid-input" }));
    expect(fail).toHaveBeenCalledOnce();
  });
});
