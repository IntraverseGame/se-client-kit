// W-29 in the shell (human decision, 2026-10-28, #146): a Snapshot of the round
// whose `version` is lower than the round's latest is stale and ignored before
// the round's tracking, its W-26 verification, and its transcript state see
// it, for a config round as for a book round. An equal `version` is still
// read, and the W-16 resend keeps its own rule (round-resend-lost.test.ts).

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";
import { describe, expect, it } from "vitest";

import { ok } from "./fixtures/fake-play.ts";
import { ACCEPTED, started, THREE_STEPS } from "./fixtures/round-flow.ts";
import { OTHER_ROUND_ID, snapshot } from "./fixtures/vectors.ts";

/** `snapshot` read again with `version` set (and `edit` applied). */
const at = (
  read: (
    edit: (parts: { readonly input: Record<string, unknown> }) => void,
  ) => ValidSnapshot,
  version: number,
  edit: (input: Record<string, unknown>) => void = () => {},
): ValidSnapshot =>
  read(p => {
    p.input["version"] = version;
    edit(p.input);
  });

describe("a stale read of a config round (W-29)", () => {
  it("a stale starting read without proofs, once the round is ready, fails nothing and signs no cancel", async () => {
    const { setup, flow } = await started();
    expect(flow.verdict().state).toBe("ready");
    const v = flow.latest().version;
    const stale = at(setup.read, v - 1, input => {
      input["status"] = "starting";
      delete input["proofs"];
      delete input["step"];
      delete input["currentMultiplier"];
    });
    await flow.observe(stale);
    expect(flow.verdict().state).toBe("ready");
    expect(flow.latest().version).toBe(v);
    expect(flow.cancel()).toBe("none");
    expect(flow.evidence().signed).toEqual([]);
    expect(setup.play.sent("cancelRound")).toEqual([]);
  });

  it("a stale active read at an earlier step moves nothing back: the next move is still legal and signed in order", async () => {
    const { setup, flow } = await started({ steps: THREE_STEPS });
    const v = flow.latest().version;
    setup.play.answer(
      "continueRound",
      ok(at(setup.read, v + 1, i => (i["step"] = 1))),
    );
    expect(await flow.pick({ step: 0, option: 0 })).toEqual(ACCEPTED);
    expect(flow.latest().step).toBe(1);
    // The round's `active` read at step 0, from before the move: stale.
    await flow.observe(at(setup.read, v, i => (i["step"] = 0)));
    expect(flow.latest().step).toBe(1);
    expect(flow.phase()).toBe("open");
    setup.play.answer(
      "continueRound",
      ok(at(setup.read, v + 2, i => (i["step"] = 2))),
    );
    expect(await flow.pick({ step: 1, option: 1 })).toEqual(ACCEPTED);
    expect(flow.evidence().signed.map(a => a.message.sequence)).toEqual([1, 2]);
  });

  it("a stale active read after the round closed leaves it over, and nothing unconfirmed", async () => {
    const { setup, flow } = await started({ steps: THREE_STEPS });
    const v = flow.latest().version;
    await flow.observe(
      setup.read(p => {
        p.input["version"] = v + 1;
        p.input["status"] = "won";
        p.input["step"] = 1;
        p.randomnessProof["roundSecret"] = `0x${"44".repeat(32)}`;
        p.fairnessProof["seed"] = `0x${"55".repeat(32)}`;
      }),
    );
    expect(flow.over()).toBe(true);
    await flow.observe(at(setup.read, v));
    expect(flow.over()).toBe(true);
    expect(flow.latest().status).toBe("won");
    expect(flow.unconfirmed()).toBeUndefined();
  });

  it("an equal version is still read", async () => {
    const { setup, flow } = await started({ steps: THREE_STEPS });
    const v = flow.latest().version;
    await flow.observe(at(setup.read, v, i => (i["step"] = 1)));
    expect(flow.latest().step).toBe(1);
  });

  it("names only the last Snapshot observed as stale: an idle or another round's clears it", async () => {
    const { setup, flow } = await started({ steps: THREE_STEPS });
    const v = flow.latest().version;
    const stale = at(setup.read, v - 1);
    await flow.observe(stale);
    expect(flow.staleRead()).toBe(stale);
    await flow.observe(snapshot("idle"));
    expect(flow.staleRead()).toBeUndefined();
    await flow.observe(stale);
    await flow.observe(snapshot("won", { roundId: OTHER_ROUND_ID }));
    expect(flow.staleRead()).toBeUndefined();
    await flow.observe(stale);
    await flow.observe(at(setup.read, v));
    expect(flow.staleRead()).toBeUndefined();
  });
});
