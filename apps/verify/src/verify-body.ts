// The verify API's `RoundVerification` body: validated against the vendored
// document, then mapped to the evidence the page's checks take
// (`round-evidence.ts`). Pure; `verify-api.ts` fetches.

import type { VerifyApiComponents } from "@intraverse/se-client-contracts";

import type {
  CreateRoundAuthEvidence,
  RandomnessProofEvidence,
  RoundEvidence,
  RoundStatus,
  StepEvidence,
  TermsNodeEvidence,
} from "./round-evidence.ts";
import { amount, payout } from "./verify-amount.ts";
import { newRound } from "./verify-new-round.ts";
import {
  Bad,
  bool,
  int,
  list,
  nested,
  object,
  oneOf,
  optional,
  PATTERN,
  type Read,
  shape,
  text,
} from "./verify-readers.ts";

type Wire = VerifyApiComponents["schemas"];

const STATUSES: ReadonlySet<string> = new Set<
  Wire["RoundVerification"]["status"]
>(["idle", "starting", "active", "won", "lost", "canceled", "resolving"]);
const ACTION_KINDS: ReadonlySet<string> = new Set<Wire["SignedAction"]["kind"]>(
  ["action", "cash_out", "cancel"],
);
const RESULTS: ReadonlySet<string> = new Set<
  NonNullable<Wire["Check"]["result"]>
>(["passed", "failed", "not_applicable"]);
const REPLAY_KINDS: ReadonlySet<string> = new Set<
  Wire["Recomputation"]["kind"]
>(["none", "lost", "won", "cashed_out"]);
const CLOSE_REASONS: ReadonlySet<string> = new Set<
  NonNullable<Wire["RoundVerification"]["closeReason"]>
>(["expired"]);

const termsNode = nested(s =>
  shape(s, {
    options: v => int(v, 1, 25),
    losers: v => int(v, 0, 24),
    next: list(v => int(v, 0)),
  }),
);

const game = nested(s => {
  const read = shape(s, {
    gameCode: v => text(v),
    gameId: v => int(v, 0),
    gameVersion: v => int(v, 0),
    packageHash: v => text(v, PATTERN.hex32),
  });
  const terms = nested(t =>
    shape(t, {
      nodes: list(termsNode),
      houseEdgeWad: v => text(v, PATTERN.amount),
      maxMultiplierMilli: v => int(v, 1),
    }),
  )(s["terms"]);
  return read === Bad || terms === Bad ? Bad : { terms: terms.nodes };
});

const kernel = nested(s =>
  shape(s, {
    name: v => text(v),
    version: v => int(v, 1),
    vectorSets: list(v => text(v)),
  }),
);

const signedAction = nested(s =>
  shape(s, {
    sequence: v => int(v, 1),
    kind: v => oneOf(v, ACTION_KINDS),
    action: v => text(v),
    path: list(v => int(v, 0, 255)),
    previous: v => text(v, PATTERN.hex32),
    signature: v => text(v, PATTERN.signature),
  }),
);

const check = nested(s =>
  shape(s, {
    name: v => text(v),
    result: v => oneOf(v, RESULTS),
    detail: v => optional(v, x => text(x)),
  }),
);

const replayStep = nested(s =>
  shape(s, {
    node: v => int(v, 0),
    option: v => int(v, 0),
    losers: list(v => int(v, 0)),
    survived: bool,
  }),
);

const recomputed = nested(s =>
  shape(s, {
    kind: v => oneOf(v, REPLAY_KINDS),
    payout: v => optional(v, amount),
    steps: list(replayStep),
  }),
);

const entropy = nested(s =>
  shape(s, {
    source: v => optional(v, x => text(x)),
    chainId: v => optional(v, x => int(x, 0)),
    block: v => optional(v, x => int(x, 0)),
    value: v => optional(v, x => text(x, PATTERN.hex32)),
  }),
);

const commitment = nested(s =>
  shape(s, {
    roundSecretHash: v => optional(v, x => text(x, PATTERN.hex32)),
    commitmentRef: v => optional(v, x => text(x)),
    createRoundAuth: v =>
      optional(
        v,
        nested(a =>
          shape(a, {
            newRound,
            prepareWindow: x => int(x, 0),
            expiryUnix: x => int(x, 0),
            signature: x => text(x, PATTERN.signature),
          }),
        ),
      ),
    registryChainId: v => optional(v, x => int(x, 0)),
    registryAddress: v => optional(v, x => text(x, PATTERN.address)),
    adminSigner: v => optional(v, x => text(x, PATTERN.address)),
  }),
);

const reveal = nested(s =>
  shape(s, {
    roundSecret: v => text(v, PATTERN.hex32),
    seed: v => optional(v, x => text(x, PATTERN.hex32)),
    configuration: v => optional(v, x => text(x, PATTERN.hexBytes)),
  }),
);

/**
 * The steps the replay played, each with its node's option count: a step whose
 * node the terms do not have is a malformed body.
 */
const playedSteps = (
  terms: readonly TermsNodeEvidence[],
  steps: readonly { node: number; option: number; losers: readonly number[] }[],
): Read<readonly StepEvidence[]> => {
  const out: StepEvidence[] = [];
  for (const step of steps) {
    const node = terms[step.node];
    if (node === undefined) return Bad;
    out.push({
      optionCount: node.options,
      selectedIndex: step.option,
      ...(step.losers.length === 1 && step.losers[0] !== undefined
        ? { losingIndex: step.losers[0] }
        : {}),
    });
  }
  return out;
};

/** An `idle` round with a void reason or a reject code will not be played. */
const closureOf = (
  status: string,
  voidReason: string | undefined,
  rejectCode: string | undefined,
): { closure?: "voided" | "refused" } => {
  if (status !== "idle") return {};
  if (voidReason !== undefined) return { closure: "voided" };
  return rejectCode === undefined ? {} : { closure: "refused" };
};

/** The body as evidence, or `undefined` when it does not validate. */
export const parseEvidence = (body: unknown): RoundEvidence | undefined => {
  const source = object(body);
  if (source === Bad) return undefined;
  const top = shape(source, {
    roundId: v => text(v, PATTERN.roundId),
    status: v => oneOf(v, STATUSES),
    closeReason: v => optional(v, x => oneOf(x, CLOSE_REASONS)),
    voidReason: v => optional(v, x => text(x)),
    rejectCode: v => optional(v, x => text(x)),
    closed: bool,
    kernel,
    game,
    shape: list(v => int(v, 1, 25)),
    bet: amount,
    payout,
    commitment: v => optional(v, commitment),
    entropy: v => optional(v, entropy),
    seedHash: v => optional(v, x => text(x, PATTERN.hex32)),
    readyHash: v => optional(v, x => text(x, PATTERN.hex32)),
    reveal: v => optional(v, reveal),
    actions: list(signedAction),
    transcriptHash: v => optional(v, x => text(x, PATTERN.hex32)),
    recomputed: v => optional(v, recomputed),
    checks: list(check),
  });
  if (top === Bad) return undefined;
  const steps = playedSteps(top.game.terms, top.recomputed?.steps ?? []);
  if (steps === Bad) return undefined;

  const { commitment: bound, entropy: block } = top;
  const randomnessProof: RandomnessProofEvidence | undefined =
    block?.source === undefined ||
    block.block === undefined ||
    bound?.roundSecretHash === undefined
      ? undefined
      : {
          source: block.source,
          blockNumber: BigInt(block.block),
          ...(block.value === undefined ? {} : { blockValue: block.value }),
          roundSecretHash: bound.roundSecretHash,
          ...(top.reveal === undefined
            ? {}
            : { roundSecret: top.reveal.roundSecret }),
        };

  const auth = bound?.createRoundAuth;
  if (
    auth !== undefined &&
    (bound?.registryChainId === undefined ||
      bound.registryAddress === undefined ||
      bound.adminSigner === undefined ||
      block?.chainId === undefined)
  ) {
    return undefined;
  }
  const createRoundAuth: CreateRoundAuthEvidence | undefined =
    auth === undefined
      ? undefined
      : {
          newRound: auth.newRound,
          entropyChainId: block?.chainId ?? 0,
          prepareWindow: auth.prepareWindow,
          expiry: String(auth.expiryUnix),
          domain: {
            chainId: bound?.registryChainId ?? 0,
            verifyingContract: bound?.registryAddress ?? "",
          },
          signer: bound?.adminSigner ?? "",
          signature: auth.signature,
        };

  return {
    roundId: top.roundId,
    kernelVersion: top.kernel.version,
    status: top.status as RoundStatus,
    ...(top.closeReason === undefined ? {} : { closeReason: top.closeReason }),
    ...closureOf(top.status, top.voidReason, top.rejectCode),
    ...(top.payout === undefined ? {} : { payout: top.payout }),
    shape: top.shape,
    terms: top.game.terms,
    steps,
    ...(randomnessProof === undefined ? {} : { randomnessProof }),
    ...(top.seedHash === undefined
      ? {}
      : {
          fairnessProof: {
            seedHash: top.seedHash,
            ...(top.readyHash === undefined
              ? {}
              : { readyHash: top.readyHash }),
            ...(top.reveal?.seed === undefined
              ? {}
              : { seed: top.reveal.seed }),
          },
        }),
    ...(createRoundAuth === undefined ? {} : { createRoundAuth }),
  };
};
