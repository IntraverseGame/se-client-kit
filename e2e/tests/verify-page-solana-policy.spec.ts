import { recordViolations, sourcesOf } from "./harness/csp-violations.ts";
import { SOLANA_RPC_ENDPOINTS } from "./harness/environment-config.ts";
import { WRAPPER_ORIGIN } from "./harness/origins.ts";
import {
  verifyPageBuilt,
  VERIFY_PAGE_NOT_BUILT,
} from "./harness/verify-page.ts";
import {
  expect,
  SOLANA_ROUND_ID,
  solanaBookRound,
  test,
} from "./harness/verify-solana-page.ts";

const MATCHES_BOOK = "This round's draw was not recomputed";

test.beforeAll(() => {
  if (!verifyPageBuilt()) throw new Error(VERIFY_PAGE_NOT_BUILT);
});

test.describe("VT-15: the verify page's policy with the Solana endpoints", () => {
  test.use({ verifyPolicy: true });

  test("the policy allows the fake endpoints' origins only, and the page reads them with no violation", async ({
    page,
    fakeVerifyApi,
    solanaVerifyPage,
    solanaRpc,
  }) => {
    fakeVerifyApi.answerEvery(SOLANA_ROUND_ID, {
      kind: "round",
      body: solanaBookRound("book-lifecycle-won", "produced-slot"),
    });
    const violations = await recordViolations(page);
    const origins = new Set<string>();
    page.context().on("request", request => {
      origins.add(new URL(request.url()).origin);
    });
    const documentResponse = page.waitForResponse(
      `${WRAPPER_ORIGIN}/verify/rounds/${SOLANA_ROUND_ID}`,
    );
    await solanaVerifyPage.open(page, SOLANA_ROUND_ID);
    await expect(
      page.getByRole("heading", { level: 1, name: MATCHES_BOOK }),
    ).toBeVisible();
    const policy = (await documentResponse).headers()[
      "content-security-policy"
    ];
    const allowed = [
      WRAPPER_ORIGIN,
      ...SOLANA_RPC_ENDPOINTS.map(endpoint => new URL(endpoint.url).origin),
    ];
    expect(sourcesOf(policy, "connect-src")).toEqual(
      ["'self'", ...allowed].toSorted(),
    );
    expect(solanaRpc.calls().length).toBeGreaterThan(0);
    expect(await violations.read()).toEqual([]);
    for (const origin of origins) expect(allowed).toContain(origin);
  });
});
