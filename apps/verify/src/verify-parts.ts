// The verify API body's smaller objects (`Kernel`, `SignedAction`, `Check`,
// `Recomputation` and its steps, `Entropy`, `Commitment` and its
// `CreateRoundAuth`, `Reveal` of the vendored document), each read by the
// closed `shape` of `verify-readers.ts` over the fields its `*_FIELDS` object
// names. The field objects are exported so `tools/verify-api-fields.test.ts`
// can hold them to the document. Pure; `verify-body.ts` reads the rest.

import type { VerifyApiComponents } from "@intraverse/se-client-contracts";

import { amount } from "./verify-amount.ts";
import { drawnRow } from "./verify-book.ts";
import { newRound } from "./verify-new-round.ts";
import {
  bool,
  CHECK_NAMES,
  int,
  list,
  nested,
  oneOf,
  optional,
  PATTERN,
  shape,
  text,
} from "./verify-readers.ts";

type Wire = VerifyApiComponents["schemas"];

const ACTION_KINDS: ReadonlySet<string> = new Set<Wire["SignedAction"]["kind"]>(
  ["action", "cash_out", "cancel"],
);
const NAMES: ReadonlySet<string> = new Set(CHECK_NAMES);
const RESULTS: ReadonlySet<string> = new Set<
  NonNullable<Wire["Check"]["result"]>
>(["passed", "failed", "not_applicable"]);
const REPLAY_KINDS: ReadonlySet<string> = new Set<
  Wire["Recomputation"]["kind"]
>(["none", "lost", "won", "cashed_out"]);

export const KERNEL_FIELDS = {
  name: (v: unknown) => text(v),
  version: (v: unknown) => int(v, 1),
  vectorSets: list(v => text(v)),
};
export const kernel = nested(s => shape(s, KERNEL_FIELDS));

export const SIGNED_ACTION_FIELDS = {
  sequence: (v: unknown) => int(v, 1),
  kind: (v: unknown) => oneOf(v, ACTION_KINDS),
  action: (v: unknown) => text(v),
  path: list(v => int(v, 0, 255)),
  previous: (v: unknown) => text(v, PATTERN.hex32),
  signature: (v: unknown) => text(v, PATTERN.signature),
};
export const signedAction = nested(s => shape(s, SIGNED_ACTION_FIELDS));

export const CHECK_FIELDS = {
  name: (v: unknown) => oneOf(v, NAMES),
  result: (v: unknown) => oneOf(v, RESULTS),
  detail: (v: unknown) => optional(v, x => text(x)),
};
export const check = nested(s => shape(s, CHECK_FIELDS));

export const RECOMPUTED_STEP_FIELDS = {
  node: (v: unknown) => int(v, 0),
  option: (v: unknown) => int(v, 0),
  losers: list(v => int(v, 0)),
  survived: bool,
};
const replayStep = nested(s => shape(s, RECOMPUTED_STEP_FIELDS));

export const RECOMPUTATION_FIELDS = {
  kind: (v: unknown) => oneOf(v, REPLAY_KINDS),
  payout: (v: unknown) => optional(v, amount),
  steps: list(replayStep),
  draw: (v: unknown) => optional(v, drawnRow),
};
export const recomputed = nested(s => shape(s, RECOMPUTATION_FIELDS));

export const ENTROPY_FIELDS = {
  source: (v: unknown) => optional(v, x => text(x)),
  chainId: (v: unknown) => optional(v, x => int(x, 0)),
  block: (v: unknown) => optional(v, x => int(x, 0)),
  value: (v: unknown) => optional(v, x => text(x, PATTERN.hex32)),
};
export const entropy = nested(s => shape(s, ENTROPY_FIELDS));

export const CREATE_ROUND_AUTH_FIELDS = {
  newRound,
  prepareWindow: (v: unknown) => int(v, 0),
  expiryUnix: (v: unknown) => int(v, 0),
  signature: (v: unknown) => text(v, PATTERN.signature),
};

export const COMMITMENT_FIELDS = {
  roundSecretHash: (v: unknown) => optional(v, x => text(x, PATTERN.hex32)),
  commitmentRef: (v: unknown) => optional(v, x => text(x)),
  createRoundAuth: (v: unknown) =>
    optional(
      v,
      nested(a => shape(a, CREATE_ROUND_AUTH_FIELDS)),
    ),
  registryChainId: (v: unknown) => optional(v, x => int(x, 0)),
  registryAddress: (v: unknown) => optional(v, x => text(x, PATTERN.address)),
  adminSigner: (v: unknown) => optional(v, x => text(x, PATTERN.address)),
};
export const commitment = nested(s => shape(s, COMMITMENT_FIELDS));

export const REVEAL_FIELDS = {
  roundSecret: (v: unknown) => text(v, PATTERN.hex32),
  seed: (v: unknown) => optional(v, x => text(x, PATTERN.hex32)),
  configuration: (v: unknown) => optional(v, x => text(x, PATTERN.hexBytes)),
};
export const reveal = nested(s => shape(s, REVEAL_FIELDS));
