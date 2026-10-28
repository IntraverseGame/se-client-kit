// The game's copy of a Snapshot (W-38's allow-list), checked field by field
// before the game renders it. It is a fresh, frozen copy with exactly the
// allow-listed fields: a missing required field, a field outside the list, or a
// bad value refuses the whole Snapshot.

import type {
  GameSnapshot,
  GameStep,
  RoundStatus,
} from "@intraverse/se-client-shell/controller";

import {
  arrayItems,
  hasFields,
  isIndex,
  isMultiplier,
  oneOf,
  optionalIndexBelow,
  plainFields,
} from "./plain-data.ts";

/** Every status, in the schema's order: the game handles all seven. */
export const STATUSES: readonly RoundStatus[] = Object.freeze([
  "idle",
  "starting",
  "active",
  "resolving",
  "won",
  "lost",
  "canceled",
]);

const parseStep = (value: unknown): GameStep | undefined => {
  const fields = plainFields(value);
  if (
    fields === undefined ||
    !hasFields(
      fields,
      ["index", "optionCount", "multiplier"],
      ["selectedIndex", "losingIndex"],
    )
  ) {
    return undefined;
  }
  const index = fields.get("index");
  const optionCount = fields.get("optionCount");
  const multiplier = fields.get("multiplier");
  const selectedIndex = fields.get("selectedIndex");
  const losingIndex = fields.get("losingIndex");
  if (
    !isIndex(index) ||
    !isIndex(optionCount) ||
    optionCount < 1 ||
    !isMultiplier(multiplier) ||
    !optionalIndexBelow(selectedIndex, optionCount) ||
    !optionalIndexBelow(losingIndex, optionCount)
  ) {
    return undefined;
  }
  return Object.freeze({
    index,
    optionCount,
    multiplier,
    ...(selectedIndex === undefined ? {} : { selectedIndex }),
    ...(losingIndex === undefined ? {} : { losingIndex }),
  });
};

/** The copy's `context`, the same for both presentations. */
export const parseContext = (
  value: unknown,
): GameSnapshot["context"] | undefined => {
  const fields = plainFields(value);
  if (
    fields === undefined ||
    !hasFields(fields, ["language", "device", "theme"])
  ) {
    return undefined;
  }
  const language = fields.get("language");
  const device = fields.get("device");
  const theme = plainFields(fields.get("theme"));
  if (
    typeof language !== "string" ||
    !oneOf(device, ["desktop", "mobile"] as const) ||
    theme === undefined ||
    !hasFields(theme, [], ["appearance"])
  ) {
    return undefined;
  }
  const appearance = theme.get("appearance");
  if (
    appearance !== undefined &&
    !oneOf(appearance, ["dark", "light"] as const)
  ) {
    return undefined;
  }
  return Object.freeze({
    language,
    device,
    theme: Object.freeze(appearance === undefined ? {} : { appearance }),
  });
};

const parseConfig = (value: unknown): GameSnapshot["config"] | undefined => {
  const fields = plainFields(value);
  if (fields === undefined || !hasFields(fields, ["kind", "steps"])) {
    return undefined;
  }
  const items = arrayItems(fields.get("steps"));
  if (fields.get("kind") !== "steps" || items === undefined) return undefined;
  const steps: GameStep[] = [];
  for (const item of items) {
    const step = parseStep(item);
    if (step === undefined) return undefined;
    steps.push(step);
  }
  return Object.freeze({ kind: "steps", steps: Object.freeze(steps) });
};

const SNAPSHOT_REQUIRED = [
  "version",
  "presentation",
  "status",
  "context",
  "config",
] as const;
const SNAPSHOT_OPTIONAL = [
  "closeReason",
  "roundId",
  "step",
  "currentMultiplier",
] as const;

/** The game's copy of a Snapshot, checked field by field. */
export const parseGameSnapshot = (value: unknown): GameSnapshot | undefined => {
  const fields = plainFields(value);
  if (
    fields === undefined ||
    !hasFields(fields, SNAPSHOT_REQUIRED, SNAPSHOT_OPTIONAL)
  ) {
    return undefined;
  }
  const version = fields.get("version");
  const status = fields.get("status");
  const closeReason = fields.get("closeReason");
  const roundId = fields.get("roundId");
  const step = fields.get("step");
  const currentMultiplier = fields.get("currentMultiplier");
  const context = parseContext(fields.get("context"));
  const config = parseConfig(fields.get("config"));
  if (
    !isIndex(version) ||
    fields.get("presentation") !== "steps" ||
    !oneOf(status, STATUSES) ||
    (closeReason !== undefined && closeReason !== "expired") ||
    (roundId !== undefined && typeof roundId !== "string") ||
    (step !== undefined && !isIndex(step)) ||
    (currentMultiplier !== undefined && !isMultiplier(currentMultiplier)) ||
    context === undefined ||
    config === undefined
  ) {
    return undefined;
  }
  return Object.freeze({
    version,
    presentation: "steps",
    status,
    ...(closeReason === undefined ? {} : { closeReason }),
    ...(roundId === undefined ? {} : { roundId }),
    ...(step === undefined ? {} : { step }),
    ...(currentMultiplier === undefined ? {} : { currentMultiplier }),
    context,
    config,
  });
};
