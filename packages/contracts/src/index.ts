// The public types are listed by name: a new definition in the schema becomes
// public API only when it is added here. `Snapshot1` is left out on purpose: it
// is the generator's structural copy of `Snapshot` (the schema refers to its
// own root from `PlayProblem.snapshot`).
export type {
  Amount,
  AmountRequest,
  BaseUnits,
  BetContext,
  BookConfig,
  BookDraw,
  BookEvent,
  ErrorCode,
  FairnessContext,
  FairnessProof,
  GameConfig,
  Hash32,
  HttpsUrl,
  Multiplier,
  OnChainRecord,
  PlayProblem,
  RandomnessProof,
  RoundId,
  RoundIdBytes32,
  RoundStatus,
  SessionContext,
  Snapshot,
  Step,
  StepConfig,
  Theme,
  Unit,
  ZKProofRef,
} from "./generated/snapshot.ts";
export { snapshotSchema } from "./schemas/snapshot.ts";
