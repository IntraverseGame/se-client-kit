// The public types are listed by name: a new definition in the schema becomes
// public API only when it is added here. `Snapshot1` is left out on purpose: it
// is the generator's structural copy of `Snapshot` (the schema refers to its
// own root from `PlayProblem.snapshot`), and so is `Amount1`, its structural
// copy of `Amount` for `payout` (a `$ref` with a description of its own). The
// Play API document's types keep the generator's three roots, renamed:
// `PlayApiPaths` (by path and method), `PlayApiOperations` (by `operationId`),
// and `PlayApiComponents` (its schemas and responses), plus
// `PlayApiOperationRoutes`, each operation's literal path and method, which the
// generator reads from `paths`. Its empty `webhooks`, `$defs`, and `external`
// are left out.
export type {
  components as PlayApiComponents,
  operationRoutes as PlayApiOperationRoutes,
  operations as PlayApiOperations,
  paths as PlayApiPaths,
} from "./generated/play.ts";
// The verify API document's types (/verify/v1) are named the same way:
// `VerifyApiPaths`, `VerifyApiOperations`, `VerifyApiComponents`, and
// `VerifyApiOperationRoutes`.
export type {
  components as VerifyApiComponents,
  operationRoutes as VerifyApiOperationRoutes,
  operations as VerifyApiOperations,
  paths as VerifyApiPaths,
} from "./generated/verify.ts";
export type {
  Address,
  Amount,
  AmountRequest,
  BaseUnits,
  BetContext,
  BookConfig,
  BookDraw,
  BookEvent,
  BookRtp,
  CreateRoundAuth,
  ErrorCode,
  FairnessContext,
  FairnessProof,
  GameConfig,
  Hash32,
  HttpsUrl,
  Multiplier,
  NewRound,
  OnChainRecord,
  PlayProblem,
  RandomnessProof,
  RegistryDomain,
  RoundId,
  RoundIdBytes32,
  RoundStatus,
  SessionContext,
  Signature65,
  Snapshot,
  Step,
  StepConfig,
  Theme,
  Uint128,
  Uint256,
  Unit,
  ZKProofRef,
} from "./generated/snapshot.ts";
export { snapshotSchema } from "./schemas/snapshot.ts";
