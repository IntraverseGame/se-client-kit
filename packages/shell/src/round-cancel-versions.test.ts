// T-4 (W-25, W-29, #163): the required cancel's own decision compares
// versions. An answer or a read of the round whose `version` is lower than the
// newest the cancel knows (the round's latest Snapshot, or the cancel's own
// answers and reads) is stale and decides nothing: a stale answer tells
// nothing (the read decides, with no resend), and a stale read is as if no
// Snapshot was read. Neither settles the cancel's state nor allows
// its one resend. An equal `version` is read.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";
import { describe, expect, it } from "vitest";

import { cancelRound } from "./fixtures/cancel-settle.ts";
import { lost, ok, problem } from "./fixtures/fake-play.ts";
import type { RoundParts } from "./fixtures/round-auth.ts";
import type { FlowSetup } from "./fixtures/round-flow.ts";

/** The round's Snapshot at `version`, with `edit` applied. */
const at = (
  s: FlowSetup,
  version: number,
  edit: (parts: RoundParts) => void = () => {},
): ValidSnapshot =>
  s.read(p => {
    edit(p);
    p.input["version"] = version;
  });

const active = (s: FlowSetup, version: number): ValidSnapshot =>
  at(s, version, p => (p.input["step"] = 0));
const resolving = (s: FlowSetup, version: number): ValidSnapshot =>
  at(s, version, p => (p.input["status"] = "resolving"));
const canceled = (s: FlowSetup, version: number): ValidSnapshot =>
  at(s, version, p => {
    p.input["status"] = "canceled";
    p.input["step"] = 0;
  });

/** The version of the round's Snapshot before the cancel. */
const base = (s: FlowSetup): number => s.issued.snapshot.version;

const READS: readonly [
  string,
  (s: FlowSetup, version: number) => ValidSnapshot,
  string,
][] = [
  ["active", active, "not-taken"],
  ["canceled (a result)", canceled, "sent"],
];

describe("after a resolving answer to the cancel (W-25, W-29)", () => {
  it.each(READS)(
    "a stale %s read settles nothing; an equal version decides",
    async (_, read, decided) => {
      const { setup, flow } = await cancelRound(s => {
        s.play.answer("cancelRound", ok(resolving(s, base(s) + 1)));
        s.play.answer("getSnapshot", ok(read(s, base(s))));
      });
      expect(flow.cancel()).toBe("settling");
      expect(flow.latest().version).toBe(base(setup));
      setup.play.answer("getSnapshot", ok(read(setup, base(setup) + 1)));
      await flow.refresh();
      expect(flow.cancel()).toBe(decided);
      expect(setup.play.sent("cancelRound")).toHaveLength(1);
      expect(flow.evidence().signed).toHaveLength(1);
    },
  );

  it("a stale resolving read settles nothing and is not read into the round", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", ok(resolving(s, base(s) + 2)));
      s.play.answer("getSnapshot", ok(resolving(s, base(s) + 1)));
    });
    expect(flow.cancel()).toBe("settling");
    expect(flow.latest().status).toBe("active");
    expect(setup.play.sent("cancelRound")).toHaveLength(1);
  });
});

describe("after a lost cancel (W-16, W-25, W-29)", () => {
  it("a stale active read with no move allows no resend; the cancel is settling", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", lost, ok(canceled(s, base(s) + 1)));
      s.play.answer("getSnapshot", ok(active(s, base(s) - 1)));
    });
    expect(setup.play.sent("cancelRound")).toHaveLength(1);
    expect(flow.cancel()).toBe("settling");
    expect(flow.evidence().signed).toHaveLength(1);
  });

  it("an active read with no move at an equal version allows the one resend", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", lost, ok(canceled(s, base(s) + 1)));
      s.play.answer("getSnapshot", ok(active(s, base(s))));
    });
    expect(setup.play.sent("cancelRound")).toHaveLength(2);
    expect(flow.cancel()).toBe("sent");
    expect(flow.evidence().signed).toHaveLength(1);
  });

  it("a stale result read is not final; the cancel is settling", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", lost);
      s.play.answer("getSnapshot", ok(canceled(s, base(s) - 1)));
    });
    expect(flow.cancel()).toBe("settling");
    expect(flow.phase()).not.toBe("closed");
    expect(setup.play.sent("cancelRound")).toHaveLength(1);
  });
});

describe("after a 400 to the cancel (W-25, W-29)", () => {
  it("a stale resolving read leaves it refused, not settling", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", problem(400, "INVALID_ARGUMENT"));
      s.play.answer("getSnapshot", ok(resolving(s, base(s) - 1)));
    });
    expect(flow.cancel()).toBe("refused");
    expect(flow.latest().status).toBe("active");
    expect(setup.play.sent("cancelRound")).toHaveLength(1);
  });

  it("a resolving read at an equal version is settling", async () => {
    const { flow } = await cancelRound(s => {
      s.play.answer("cancelRound", problem(400, "INVALID_ARGUMENT"));
      s.play.answer("getSnapshot", ok(resolving(s, base(s))));
    });
    expect(flow.cancel()).toBe("settling");
  });
});

describe("a stale answer to the cancel (W-25, W-29)", () => {
  it.each<
    [
      string,
      (s: FlowSetup, version: number) => ValidSnapshot,
      (s: FlowSetup) => ValidSnapshot,
      string,
    ]
  >([
    ["active", active, s => canceled(s, base(s) + 1), "sent"],
    ["canceled", canceled, s => active(s, base(s)), "not-taken"],
    ["resolving", resolving, s => active(s, base(s)), "not-taken"],
  ])(
    "a stale %s answer tells nothing: the Snapshot is read and decides, with no resend",
    async (_, answer, read, decided) => {
      const { setup, flow } = await cancelRound(s => {
        s.play.answer("cancelRound", ok(answer(s, base(s) - 1)));
        s.play.answer("getSnapshot", ok(read(s)));
      });
      expect(setup.play.sent("getSnapshot")).toHaveLength(1);
      expect(flow.cancel()).toBe(decided);
      expect(setup.play.sent("cancelRound")).toHaveLength(1);
      expect(flow.evidence().signed).toHaveLength(1);
    },
  );

  it("an active answer at an equal version decides not-taken, with no read", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", ok(active(s, base(s))));
    });
    expect(flow.cancel()).toBe("not-taken");
    expect(setup.play.sent("getSnapshot")).toHaveLength(0);
  });

  it("a stale active answer to the resend, below the cancel's own newer read, does not set not-taken", async () => {
    const { setup, flow } = await cancelRound(s => {
      s.play.answer("cancelRound", lost, ok(active(s, base(s))));
      s.play.answer("getSnapshot", ok(active(s, base(s) + 1)), lost);
    });
    expect(setup.play.sent("cancelRound")).toHaveLength(2);
    expect(setup.play.sent("getSnapshot")).toHaveLength(2);
    // The cancel may be stored: the counted reads decide.
    expect(flow.cancel()).toBe("settling");
    expect(flow.evidence().signed).toHaveLength(1);
  });
});
