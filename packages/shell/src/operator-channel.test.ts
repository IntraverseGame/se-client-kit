// T-9a, the operator channel (W-49b, W-49c): source and origin, the first
// valid `hello` counts and a repeat is welcomed again, record-then-check, the
// proven parent origin that needs no `hello` (ADR-011), and the 10 s timeout on
// an injected clock. The closed schema and `resize` are in
// operator-protocol.test.ts. A fake parent window, no DOM.

import { describe, expect, it } from "vitest";

import {
  createFakeOperator,
  HELLO,
  OPERATOR,
  OTHER,
  WELCOME_POST,
} from "./fixtures/fake-operator.ts";
import {
  createOperatorChannel,
  HANDSHAKE_TIMEOUT_MS,
} from "./operator-channel.ts";

const SECOND = "https://lobby.casino.example.org";

describe("source and origin (T-9a, 1)", () => {
  it("accepts a valid hello from the parent and a listed origin", async () => {
    const op = createFakeOperator();
    const outcome = op.check();
    op.send(HELLO);
    expect(await outcome).toEqual({ ok: true });
    expect(op.channel.state()).toBe("open");
    expect(op.posted).toEqual([WELCOME_POST]);
  });

  it.each<[string, { readonly source?: unknown; readonly origin?: string }]>([
    ["a sibling frame", { source: {} }],
    ["no source", { source: null }],
    ["the game frame", { source: { postMessage: () => {} } }],
    ["an unlisted origin from the parent", { origin: OTHER }],
    ["an opaque origin", { origin: "null" }],
    ["a listed origin with a trailing slash", { origin: `${OPERATOR}/` }],
  ])("ignores %s, and the timer keeps running", (_what, from) => {
    const op = createFakeOperator();
    void op.check();
    op.send(HELLO, from);
    expect(op.channel.state()).toBe("waiting");
    expect(op.posted).toEqual([]);
    expect(op.clock.dueTimes()).toEqual([HANDSHAKE_TIMEOUT_MS]);
  });

  it("ignores a listed origin that differs from location.ancestorOrigins[0]", () => {
    const op = createFakeOperator();
    // Two entries prove no single parent, so the handshake decides.
    void op.check([OPERATOR, SECOND], [OPERATOR, SECOND]);
    op.send(HELLO, { origin: SECOND });
    expect(op.channel.state()).toBe("waiting");
    op.send(HELLO);
    expect(op.channel.state()).toBe("open");
    expect(op.posted).toEqual([WELCOME_POST]);
  });

  it("refuses everything when no operator is listed", () => {
    const op = createFakeOperator();
    void op.check(undefined, []);
    op.send(HELLO);
    expect(op.channel.state()).toBe("waiting");
    expect(op.posted).toEqual([]);
  });
});

describe("the first valid hello counts (T-9a, 3)", () => {
  it("posts welcome to that origin only, never '*' or '/'", async () => {
    const op = createFakeOperator();
    const outcome = op.check(undefined, [OPERATOR, SECOND]);
    op.send(HELLO, { origin: SECOND });
    expect(await outcome).toEqual({ ok: true });
    op.send(HELLO, { origin: SECOND });
    op.send(HELLO);
    op.send(HELLO, { origin: SECOND, source: {} });
    expect(op.posted.map(post => post.targetOrigin)).toEqual([SECOND, SECOND]);
  });

  it("welcomes a repeat from the fixed origin and the parent again, and changes nothing else", async () => {
    const op = createFakeOperator();
    const outcome = op.check();
    op.send(HELLO);
    op.send(HELLO);
    op.send(HELLO);
    expect(await outcome).toEqual({ ok: true });
    expect(op.channel.state()).toBe("open");
    expect(op.posted).toEqual([WELCOME_POST, WELCOME_POST, WELCOME_POST]);
    // A second check answers the first outcome and starts no timer.
    expect(await op.check(undefined, [])).toEqual({ ok: true });
    expect(op.clock.dueTimes()).toEqual([]);
  });

  it("stops the timer once accepted", () => {
    const op = createFakeOperator();
    void op.check();
    op.clock.advance(HANDSHAKE_TIMEOUT_MS - 1);
    op.send(HELLO);
    op.clock.advance(1);
    expect(op.channel.state()).toBe("open");
  });

  it("drops a post the parent throws on", async () => {
    const op = createFakeOperator();
    const parent = {
      postMessage: (): void => {
        throw new Error("navigated away");
      },
    };
    const channel = createOperatorChannel({ parent });
    const outcome = channel.check({
      operatorOrigins: [OPERATOR],
      ancestorOrigins: undefined,
      clock: op.clock,
    });
    channel.receive({ source: parent, origin: OPERATOR, data: HELLO });
    expect(await outcome).toEqual({ ok: true });
  });
});

describe("record, then check (T-9a, 5)", () => {
  it("records a hello before the check and answers nothing", () => {
    const op = createFakeOperator();
    op.send(HELLO);
    op.send(HELLO);
    expect(op.channel.state()).toBe("recording");
    expect(op.posted).toEqual([]);
  });

  it("completes the handshake from a listed recorded origin, with no other hello", async () => {
    const op = createFakeOperator();
    op.send(HELLO);
    // A configuration read far longer than any repeat window.
    op.clock.advance(60_000);
    expect(await op.check([OPERATOR])).toEqual({ ok: true });
    expect(op.posted).toEqual([WELCOME_POST]);
    expect(op.clock.dueTimes()).toEqual([]);
  });

  it("refuses an unlisted recorded origin at once, finally", async () => {
    const op = createFakeOperator();
    op.send(HELLO, { origin: OTHER });
    expect(await op.check()).toEqual({
      ok: false,
      reason: "operator-not-allowed",
    });
    op.send(HELLO);
    expect(op.channel.state()).toBe("refused");
    expect(op.posted).toEqual([]);
    expect(op.clock.dueTimes()).toEqual([]);
  });

  it("refuses a recorded origin that differs from location.ancestorOrigins[0]", async () => {
    const op = createFakeOperator();
    op.send(HELLO, { origin: SECOND });
    expect(await op.check([OPERATOR], [OPERATOR, SECOND])).toEqual({
      ok: false,
      reason: "operator-not-allowed",
    });
  });

  it("records only the first, and nothing from another source or of another shape", async () => {
    const op = createFakeOperator();
    op.send(HELLO, { source: {}, origin: OTHER });
    op.send({ ...HELLO, extra: 1 }, { origin: OTHER });
    op.send(HELLO);
    op.send(HELLO, { origin: OTHER });
    expect(await op.check()).toEqual({ ok: true });
  });
});

describe("a proven parent origin (T-9a, 4; ADR-011)", () => {
  it("opens to the one listed ancestor with no hello, posts welcome once, and starts no timer", async () => {
    const op = createFakeOperator();
    expect(await op.check([OPERATOR])).toEqual({ ok: true });
    expect(op.channel.state()).toBe("open");
    expect(op.posted).toEqual([WELCOME_POST]);
    expect(op.clock.dueTimes()).toEqual([]);
  });

  it("answers a later hello from the parent and that origin, and ignores any other", async () => {
    const op = createFakeOperator();
    await op.check([OPERATOR], [OPERATOR, SECOND]);
    op.send(HELLO);
    op.send(HELLO, { origin: SECOND });
    op.send(HELLO, { source: {} });
    op.send(HELLO, { origin: OTHER });
    expect(op.posted).toEqual([WELCOME_POST, WELCOME_POST]);
  });

  it("sends resize to that origin once open", async () => {
    const op = createFakeOperator();
    await op.check([OPERATOR]);
    op.channel.resize(480);
    expect(op.posted.map(post => post.targetOrigin)).toEqual([
      OPERATOR,
      OPERATOR,
    ]);
  });

  it.each<[string, readonly string[], readonly string[]]>([
    ["an unlisted ancestor", [OTHER], [OPERATOR]],
    ["two ancestors", [OPERATOR, SECOND], [OPERATOR, SECOND]],
    ["a masked ancestor", ["null"], [OPERATOR]],
    ["an empty list", [], [OPERATOR]],
  ])(
    "proves nothing with %s: it waits for a hello",
    (_what, ancestors, listed) => {
      const op = createFakeOperator();
      void op.check(ancestors, listed);
      expect(op.channel.state()).toBe("waiting");
      expect(op.posted).toEqual([]);
      expect(op.clock.dueTimes()).toEqual([HANDSHAKE_TIMEOUT_MS]);
    },
  );
});

describe("the timeout (T-9a, 4)", () => {
  it("counts 10 s from the check, not from boot", async () => {
    const op = createFakeOperator();
    op.clock.advance(30_000);
    const outcome = op.check();
    expect(op.clock.dueTimes()).toEqual([30_000 + HANDSHAKE_TIMEOUT_MS]);
    op.clock.advance(HANDSHAKE_TIMEOUT_MS - 1);
    expect(op.channel.state()).toBe("waiting");
    op.clock.advance(1);
    expect(await outcome).toEqual({ ok: false, reason: "handshake-timeout" });
    expect(HANDSHAKE_TIMEOUT_MS).toBe(10_000);
  });

  it("ignores a late hello: the refusal is final", async () => {
    const op = createFakeOperator();
    const outcome = op.check();
    op.clock.advance(HANDSHAKE_TIMEOUT_MS);
    op.send(HELLO);
    expect(await outcome).toEqual({ ok: false, reason: "handshake-timeout" });
    expect(op.channel.state()).toBe("refused");
    expect(op.posted).toEqual([]);
  });

  it("takes another timeout when given", async () => {
    const op = createFakeOperator();
    const outcome = op.channel.check({
      operatorOrigins: [OPERATOR],
      ancestorOrigins: undefined,
      clock: op.clock,
      timeoutMs: 500,
    });
    op.clock.advance(500);
    expect(await outcome).toEqual({ ok: false, reason: "handshake-timeout" });
  });
});
