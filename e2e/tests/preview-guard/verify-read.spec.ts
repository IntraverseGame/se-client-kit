// The test's own read of the verify API (RFC-002): the URL is built from the
// document's base and the encoded round id; the allow-list is checked before the
// request is sent, naming the origin only; no credentials are sent; a redirect is
// not followed (only the first URL is checked, so a redirect could reach an
// origin the list does not hold); a status other than 200 and a body that is not
// a round are plain errors; and no error holds the URL. Against a local loopback
// test server, in the Chromium project only.

import { expect, test } from "../harness/worker-browser.ts";
import { OriginRefusedError } from "../preview-support/guard-preview.ts";
import { readVerification } from "../preview-support/verify-read.ts";
import { startTestServer, type TestServer } from "./loopback-server.ts";

const ROUND = "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d";
const SENTINEL = "SENTINEL-IN-A-VERIFY-URL";

const BODY = {
  roundId: ROUND,
  status: "won",
  payout: { amount: "194", currency: "EUR", decimals: 2 },
};

const failure = (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    () => "no error",
    (error: unknown) => error,
  );

test.describe("the verify API read", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "loopback is reachable in the Chromium project only",
  );

  let started: TestServer | undefined;
  const server = (): TestServer => {
    if (started === undefined) throw new Error("the server is not started");
    return started;
  };
  test.beforeAll(async () => {
    started = await startTestServer();
  });
  test.afterAll(async () => {
    await started?.close();
  });

  const read = (roundId = ROUND) =>
    readVerification({
      verifyApiBaseUrl: `${server().origin}/verify/v1`,
      allowedOrigins: [server().origin],
      roundId,
    });

  test("reads the round at <base>/rounds/<roundId>, with no credentials", async () => {
    server().serve(`/verify/v1/rounds/${ROUND}`, BODY);
    const facts = await read();
    expect(facts).toEqual({
      roundId: ROUND,
      status: "won",
      payout: { amount: 194n, currency: "EUR" },
    });
    expect(server().requests()).toContain(`GET /verify/v1/rounds/${ROUND}`);
    expect(server().credentialHeaders()).toEqual([]);
  });

  test("encodes the round id in the path", async () => {
    await failure(read("a/b?c"));
    expect(server().requests()).toContain("GET /verify/v1/rounds/a%2Fb%3Fc");
  });

  test("does not follow a redirect, and holds no URL in the error", async () => {
    const path = `/verify/v1/rounds/redirected-${SENTINEL}`;
    server().redirect(path, `${server().origin}/elsewhere/${SENTINEL}`);
    server().serve(`/elsewhere/${SENTINEL}`, BODY);
    const error = await failure(read(`redirected-${SENTINEL}`));
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain(SENTINEL);
    expect((error as Error).cause).toBeUndefined();
    expect(server().requests()).not.toContain(`GET /elsewhere/${SENTINEL}`);
  });

  test("answers a status other than 200 with the status only", async () => {
    server().serve("/verify/v1/rounds/missing", { title: "no" }, 404);
    const error = await failure(read("missing"));
    expect(String(error)).toContain("answered 404");
    expect(String(error)).not.toContain("missing");
  });

  test("refuses a body that is not a round", async () => {
    server().serve("/verify/v1/rounds/odd", { not: "a round" });
    expect(String(await failure(read("odd")))).toContain("not a round");
  });

  test("refuses an origin off the list before sending anything, naming the origin only", async () => {
    const before = server().requests().length;
    const error = await failure(
      readVerification({
        verifyApiBaseUrl: `https://off-list.example.test/${SENTINEL}/verify/v1`,
        allowedOrigins: [server().origin],
        roundId: ROUND,
      }),
    );
    expect(error).toBeInstanceOf(OriginRefusedError);
    expect(error).toMatchObject({ origin: "https://off-list.example.test" });
    expect(String(error)).not.toContain(SENTINEL);
    expect(server().requests()).toHaveLength(before);
  });
});
