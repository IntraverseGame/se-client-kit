// W-27 (W-25): a problem that answers a cancel call is kept in the round's
// evidence as its status, code, and `requestId` only: never the problem's
// body, its `detail`, or any other field.

import { ProblemError } from "@intraverse/se-client-play-client";
import { describe, expect, it } from "vitest";

import { cancelRound } from "./fixtures/cancel-settle.ts";
import { ok, type Responder } from "./fixtures/fake-play.ts";

const DETAIL = "the signed cancel recovers to another signer";
const REQUEST_ID = "req_01J9ZK3M7Q2W5X8Y4T6R1V0B9N";

/** A 400 whose body carries a `detail`, an `instance`, and a `requestId`. */
const refusedWithBody: Responder = request => {
  throw new ProblemError(
    request,
    {
      status: 400,
      code: "INVALID_ARGUMENT",
      retryable: false,
      requestId: REQUEST_ID,
    },
    {
      type: "about:blank",
      title: "INVALID_ARGUMENT",
      status: 400,
      code: "INVALID_ARGUMENT",
      retryable: false,
      requestId: REQUEST_ID,
      detail: DETAIL,
      instance: "/play/v1/rounds:cancel",
    },
  );
};

/** The evidence as JSON; its `bigint` block numbers print as text. */
const printedOf = (evidence: unknown): string =>
  JSON.stringify(evidence, (_, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value,
  );

describe("a refused cancel in the round's evidence (W-27)", () => {
  it("keeps exactly the status, the code, and the request id", async () => {
    const { flow } = await cancelRound(s => {
      s.play.answer("cancelRound", refusedWithBody);
      s.play.answer("getSnapshot", ok(s.at(0)));
    });
    expect(flow.evidence().cancelRefusals).toEqual([
      { status: 400, code: "INVALID_ARGUMENT", requestId: REQUEST_ID },
    ]);
    const printed = printedOf(flow.evidence());
    expect(printed).not.toContain(DETAIL);
    expect(printed).not.toContain("about:blank");
    expect(printed).not.toContain("/play/v1/rounds:cancel");
    expect(printed).not.toContain('"detail"');
    expect(printed).not.toContain('"body"');
  });
});
