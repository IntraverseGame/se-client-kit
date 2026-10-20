// The round id on the page (V-4): its normalization, the Snapshot schema's
// `RoundId` pattern (read from the vendored schema, not retyped), its
// `bytes32` form, and the page's route. The round id is public; it lives only
// in the URL.

import { snapshotPattern } from "./snapshot-patterns.ts";

const ROUND_ID = snapshotPattern("RoundId");
const WORD_HEX_LENGTH = 64;

/**
 * The input trimmed and lower-cased (UUID text is case-insensitive), or
 * `undefined` when the result does not match the schema's `RoundId` (UUIDv7,
 * canonical).
 */
export const normalizeRoundId = (input: string): string | undefined => {
  const roundId = input.trim().toLowerCase();
  return ROUND_ID.test(roundId) ? roundId : undefined;
};

/** The round id as `bytes32`: the 16 bytes, left-aligned, zero-padded. */
export const roundIdBytes32 = (roundId: string): `0x${string}` =>
  `0x${roundId.replaceAll("-", "").padEnd(WORD_HEX_LENGTH, "0")}`;

/** What the address asks for. */
export type Route =
  /** The form; `text` is a path's id that did not match, to show in the field. */
  | { readonly kind: "form"; readonly text?: string }
  | { readonly kind: "round"; readonly roundId: string };

const ROUNDS = "/rounds";

const decode = (text: string): string => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

/**
 * The route of `pathname` under `basePath` (the path of `verifyBaseUrl`, e.g.
 * `/verify`): no id, or a `/rounds/` path with none, is the form; an id that
 * does not match (extra segments, encoded characters included) is the form with
 * the path's text; a match is the round.
 */
export const parseRoute = (pathname: string, basePath: string): Route => {
  const base = basePath.replace(/\/+$/u, "");
  if (!pathname.startsWith(base)) return { kind: "form" };
  const rest = pathname.slice(base.length);
  if (!rest.startsWith(`${ROUNDS}/`)) return { kind: "form" };
  const text = decode(rest.slice(ROUNDS.length + 1));
  if (text === "") return { kind: "form" };
  const roundId = normalizeRoundId(text);
  return roundId === undefined
    ? { kind: "form", text }
    : { kind: "round", roundId };
};

/** The page's address for a round: `<verifyBaseUrl>/rounds/{roundId}`. */
export const roundUrl = (verifyBaseUrl: string, roundId: string): string =>
  `${verifyBaseUrl.replace(/\/+$/u, "")}${ROUNDS}/${roundId}`;
