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
import { bet, payout } from "./verify-amount.ts";
import {
  book,
  bookOf,
  contradictsBook,
  hasNoRoundKind,
} from "./verify-book.ts";
import { keyDelegation } from "./verify-delegation.ts";
import { game } from "./verify-game.ts";
import {
  check,
  commitment,
  entropy,
  kernel,
  recomputed,
  reveal,
  signedAction,
} from "./verify-parts.ts";
import {
  Bad,
  bool,
  int,
  list,
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
const CLOSE_REASONS: ReadonlySet<string> = new Set<
  NonNullable<Wire["RoundVerification"]["closeReason"]>
>(["expired"]);

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

/**
 * `RoundVerification`'s fields, each with its reader; any other field fails the
 * body. Exported for `tools/verify-api-fields.test.ts`.
 */
export const ROUND_VERIFICATION_FIELDS = {
  roundId: (v: unknown) => text(v, PATTERN.roundId),
  status: (v: unknown) => oneOf(v, STATUSES),
  closeReason: (v: unknown) => optional(v, x => oneOf(x, CLOSE_REASONS)),
  voidReason: (v: unknown) => optional(v, x => text(x)),
  rejectCode: (v: unknown) => optional(v, x => text(x)),
  closed: bool,
  kernel,
  game,
  shape: list(v => int(v, 1, 25)),
  bet,
  payout,
  commitment: (v: unknown) => optional(v, commitment),
  entropy: (v: unknown) => optional(v, entropy),
  seedHash: (v: unknown) => optional(v, x => text(x, PATTERN.hex32)),
  readyHash: (v: unknown) => optional(v, x => text(x, PATTERN.hex32)),
  reveal: (v: unknown) => optional(v, reveal),
  actions: list(signedAction),
  transcriptHash: (v: unknown) => optional(v, x => text(x, PATTERN.hex32)),
  recomputed: (v: unknown) => optional(v, recomputed),
  book: (v: unknown) => optional(v, book),
  keyDelegation: (v: unknown) => optional(v, keyDelegation),
  checks: list(check),
};

/** The body as evidence, or `undefined` when it does not validate. */
export const parseEvidence = (body: unknown): RoundEvidence | undefined => {
  const source = object(body);
  if (source === Bad) return undefined;
  const top = shape(source, ROUND_VERIFICATION_FIELDS);
  if (top === Bad) return undefined;
  if (contradictsBook(top) || hasNoRoundKind(top)) return undefined;
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
    ...(top.game.payoutTerms === undefined
      ? {}
      : { payoutTerms: top.game.payoutTerms }),
    bet: top.bet,
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
    ...(top.book === undefined
      ? {}
      : { book: bookOf(top.book, top.game.packageHash, top) }),
    ...(top.keyDelegation === undefined
      ? {}
      : { keyDelegation: top.keyDelegation }),
  };
};
