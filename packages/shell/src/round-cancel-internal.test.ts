// T-4b (W-25): the shell's own defensive reading of a 500 `INTERNAL` marked
// `retryable: false` to the required cancel (decided in human review,
// 2026-10-19): the Play API document does not describe it for the cancel, so
// it is no proof of a refusal and the cancel may be stored. As after a 503
// marked `retryable: false`, the reads decide: a failed read leaves the cancel
// `settling`, which keeps reading and ends in `check-later` while the round
// stays `resolving`. Nothing is resent. A 400 `INVALID_ARGUMENT`, and a 500
// with another code, stay refusals.

import { describe, expect, it } from "vitest";

import { SETTLING_READS } from "./cancel-state.ts";
import {
  cancelRound,
  canceled,
  notOver,
  readUntil,
  resolving,
} from "./fixtures/cancel-settle.ts";
import { lost, ok, problem } from "./fixtures/fake-play.ts";

const INTERNAL = problem(500, "INTERNAL", false);

describe("a 500 INTERNAL to the cancel (W-25)", () => {
  it("with a failed read, keeps reading: settling, then check-later while the round stays resolving", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", INTERNAL);
      s.play.answer("getSnapshot", lost);
    });
    expect(flow.cancel()).toBe("settling");
    notOver(flow);
    await readUntil(setup, flow, SETTLING_READS - 1);
    expect(flow.cancel()).toBe("settling");
    await readUntil(setup, flow, SETTLING_READS);
    expect(flow.cancel()).toBe("check-later");
    notOver(flow);
    expect(setup.play.sent("cancelRound")).toHaveLength(1);
    expect(flow.evidence().cancelRefusals).toEqual([
      { status: 500, code: "INTERNAL" },
    ]);
  });

  it("with a failed read, settles on a later read of the result", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", INTERNAL);
      s.play.answer("getSnapshot", lost);
    });
    setup.play.answer("getSnapshot", ok(resolving(setup)));
    await flow.refresh();
    expect(flow.cancel()).toBe("settling");
    setup.play.answer("getSnapshot", ok(canceled(setup)));
    await flow.refresh();
    expect(flow.cancel()).toBe("sent");
    expect(flow.latest().status).toBe("canceled");
    expect(setup.play.sent("cancelRound")).toHaveLength(1);
  });

  it("with a resolving read, is settling", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", INTERNAL);
      s.play.answer("getSnapshot", ok(resolving(s)));
    });
    expect(flow.cancel()).toBe("settling");
    expect(setup.play.sent("cancelRound")).toHaveLength(1);
  });

  it("with an active read, did not take", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", INTERNAL);
      s.play.answer("getSnapshot", ok(s.at(0)));
    });
    expect(flow.cancel()).toBe("not-taken");
    expect(setup.play.sent("cancelRound")).toHaveLength(1);
  });
});

describe("a 500 with another code to the cancel (W-25)", () => {
  it("stays a refusal: with a failed read, nothing more is read", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", problem(500, "UNAVAILABLE", false));
      s.play.answer("getSnapshot", lost);
    });
    expect(flow.cancel()).toBe("refused");
    expect(setup.play.sent("cancelRound")).toHaveLength(1);
    expect(flow.evidence().cancelRefusals).toEqual([
      { status: 500, code: "UNAVAILABLE" },
    ]);
  });
});

describe("a 400 INVALID_ARGUMENT to the cancel (W-25)", () => {
  it("stays a refusal: with a failed read, nothing more is read", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", problem(400, "INVALID_ARGUMENT"));
      s.play.answer("getSnapshot", lost);
    });
    expect(flow.cancel()).toBe("refused");
    expect(setup.play.sent("cancelRound")).toHaveLength(1);
  });
});
