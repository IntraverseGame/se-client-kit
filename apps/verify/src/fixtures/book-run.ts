// Test-only: a book round's checks run end to end as the page runs them
// (`verifyRound` over the body the page's verify API module reads), with a
// fake JSON-RPC endpoint set for the chain read (check 6) that agrees on the
// book vector's block N by default.

import type { CheckId, CheckResult } from "../check-result.ts";
import type { RoundReport } from "../round-report.ts";
import { verifyRound } from "../verify-round.ts";
import { type BookEnding, bookBlockValue, bookBody } from "./book-body.ts";
import {
  chainDeps,
  configFor,
  type EndpointReply,
  evidenceOfBody,
  RPC_URLS,
  signatureVector,
} from "./rounds.ts";

export type Json = Record<string, unknown>;

export const config = configFor(
  signatureVector("create-round-auth-accept").pinned,
);
export const BOOK_ROUND_ID = "01927c61-4d5e-7f6a-9b7c-8d9e0f1a2b3c";
export const OTHER_HASH = `0x${"cd".repeat(32)}`;

export const agreeing = (hash: string): Record<string, EndpointReply> =>
  Object.fromEntries(RPC_URLS.map(url => [url, { hash }]));

export const run = async (
  body: unknown,
  replies: Record<string, EndpointReply> = agreeing(bookBlockValue()),
  runConfig = config,
): Promise<RoundReport> =>
  verifyRound(
    chainDeps(replies),
    runConfig,
    await evidenceOfBody(body),
    BOOK_ROUND_ID,
  );

export const checkOf = (report: RoundReport, id: CheckId): CheckResult => {
  const found = report.checks.find(c => c.id === id);
  if (found === undefined) throw new TypeError(`no check ${String(id)}`);
  return found;
};

export const statuses = (report: RoundReport): string[] =>
  report.checks.map(c => `${String(c.id)} ${c.status}`);

/** The won book body with `change` applied to a deep copy. */
export const changed = async (
  change: (body: Json) => void,
  ending: BookEnding = "book-lifecycle-won",
): Promise<Json> => {
  const body = await bookBody(ending);
  change(body);
  return body;
};
